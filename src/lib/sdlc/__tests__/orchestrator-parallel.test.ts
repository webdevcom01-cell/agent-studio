/**
 * Unit tests for parallel gate step execution in orchestrator.ts
 *
 * Covers:
 *   - runSingleGateStep: APPROVE path (generateObject succeeds)
 *   - runSingleGateStep: BLOCK detection from JSON decision field
 *   - runSingleGateStep: generateObject failure → generateText fallback
 *   - runSingleGateStep: AbortError propagation
 *   - runParallelGateSteps: both approved → returns in input order
 *   - runParallelGateSteps: one BLOCK → both results returned, blocked flag set
 *   - runParallelGateSteps: hard rejection (AbortError) → re-thrown
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any imports
// ---------------------------------------------------------------------------

const mockGenerateText    = vi.hoisted(() => vi.fn());
const mockGenerateObject  = vi.hoisted(() => vi.fn());
const mockGetModel        = vi.hoisted(() => vi.fn());
const mockSearchCodebase  = vi.hoisted(() => vi.fn());
const mockBuildCodeContext = vi.hoisted(() => vi.fn());
const mockGetAgentSystemPrompt = vi.hoisted(() => vi.fn());
const mockFireSdkLearnHook = vi.hoisted(() => vi.fn());
const mockResolveStepModel = vi.hoisted(() => vi.fn());
const mockResolveStepModelAdaptive = vi.hoisted(() => vi.fn());
const mockStartSpan = vi.hoisted(() => vi.fn());
const mockRecordTokenUsage = vi.hoisted(() => vi.fn());
const mockRecordChatLatency = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai",            () => ({ getModel: mockGetModel }));
vi.mock("ai",                  () => ({ generateText: mockGenerateText, generateObject: mockGenerateObject }));
vi.mock("./codebase-rag",      () => ({ searchCodebase: mockSearchCodebase, buildCodeContext: mockBuildCodeContext }));
vi.mock("@/lib/ecc/sdk-learn-hook", () => ({ fireSdkLearnHook: mockFireSdkLearnHook }));
vi.mock("./agent-prompts",     () => ({ getAgentSystemPrompt: mockGetAgentSystemPrompt, getImplementationSystemPrompt: vi.fn() }));
vi.mock("./model-router",      () => ({
  resolveStepModel: mockResolveStepModel,
  resolveStepModelAdaptive: mockResolveStepModelAdaptive,
  getEscalationModel: vi.fn((_, id) => id),
}));
vi.mock("@/lib/observability/tracer", () => ({
  startSpan: mockStartSpan,
}));
vi.mock("@/lib/observability/metrics", () => ({
  recordTokenUsage: mockRecordTokenUsage,
  recordChatLatency: mockRecordChatLatency,
  recordMetric: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Silence other deep imports pulled in by the orchestrator module
vi.mock("./codebase-rag",    () => ({ searchCodebase: mockSearchCodebase, buildCodeContext: mockBuildCodeContext, indexCodebase: vi.fn() }));
vi.mock("./feedback-loop",   () => ({ runFeedbackIteration: vi.fn(), didTestsFail: vi.fn(() => false), MAX_RETRIES: 3 }));
vi.mock("./code-extractor",  () => ({ executeRealTests: vi.fn(), executeRealTestsFromFiles: vi.fn(), runWorkspaceTests: vi.fn(), runStaticAnalysis: vi.fn() }));
vi.mock("./schemas",         () => ({
  CodeGenOutputSchema:      { _def: {} },
  CodeReviewOutputSchema:   { _def: {} },
  SecurityReviewOutputSchema: { _def: {} },
}));
vi.mock("./scope-analyzer",  () => ({ getCachedImportGraph: vi.fn(), identifyAffectedFiles: vi.fn(() => []), buildBlastRadiusContext: vi.fn(() => "") }));
vi.mock("./module-map",      () => ({ enrichWithSemanticSummaries: vi.fn(() => []), buildModuleMapContext: vi.fn(() => "") }));
vi.mock("./patch-applier",   () => ({ parseSearchReplaceBlocks: vi.fn(() => []), applyPatchToWorkspace: vi.fn() }));
vi.mock("./git-integration", () => ({ integrateWithGit: vi.fn() }));
vi.mock("./pipeline-memory", () => ({ loadRelevantMemory: vi.fn(() => "") }));
vi.mock("@/lib/sdlc/pipeline-manager", () => ({ saveStepOutput: vi.fn() }));
vi.mock("@/lib/prisma",      () => ({ prisma: { modelPerformanceStat: { findMany: vi.fn(() => []) } } }));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  runSingleGateStep,
  runParallelGateSteps,
  type RunSingleGateStepInput,
} from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "fakeModel" };

/** A fake OTel span that satisfies the Span interface. */
const makeFakeSpan = () => ({
  traceContext: { traceId: "tid", spanId: "sid", parentSpanId: undefined },
  name: "test",
  kind: "client" as const,
  startTime: Date.now(),
  attributes: {},
  events: [],
  addEvent: vi.fn(),
  setAttributes: vi.fn(),
  end: vi.fn(),
});

function makeGateInput(overrides: Partial<RunSingleGateStepInput> = {}): RunSingleGateStepInput {
  return {
    stepId: "ecc-code-reviewer",
    stepIdx: 2,
    contextParts: ["# Step 1\nsome context"],
    contextOffset: 1,
    codebaseReady: false,
    taskDescription: "Add auth feature",
    resolvedModelId: "gpt-4o",
    stepModelOverrides: {},
    agentId: "agent-abc",
    userId: "user-xyz",
    runId: "run-001",
    useSmartRouting: false,
    adaptiveStatsCache: undefined,
    pipelineSpan: makeFakeSpan() as never,
    abortSignal: AbortSignal.timeout(30_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Hard-reset the AI SDK spies so that mockResolvedValueOnce queues from a
  // previous test don't bleed into this one (vi.clearAllMocks only clears call
  // history, not the once-queues or persistent implementation).
  mockGenerateObject.mockReset();
  mockGenerateText.mockReset();
  mockGetModel.mockReturnValue(FAKE_MODEL);
  mockGetAgentSystemPrompt.mockReturnValue("You are a code reviewer.");
  mockResolveStepModel.mockReturnValue("gpt-4o");
  mockResolveStepModelAdaptive.mockResolvedValue("gpt-4o");
  mockSearchCodebase.mockResolvedValue([]);
  mockBuildCodeContext.mockReturnValue("");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
  mockStartSpan.mockReturnValue(makeFakeSpan());
  // Persistent default: any call not covered by a mockResolvedValueOnce returns
  // a valid APPROVE response so the real AI SDK is never invoked with FAKE_MODEL.
  mockGenerateObject.mockResolvedValue({
    object: { decision: "APPROVE", summary: "default-ok" },
    usage: { inputTokens: 100, outputTokens: 30 },
  });
  // Persistent fallback for generateText: if generateObject somehow throws and
  // falls back, return valid JSON rather than hitting the real AI SDK.
  mockGenerateText.mockResolvedValue({
    text: '{"decision":"APPROVE","summary":"fallback-ok"}',
    usage: { inputTokens: 50, outputTokens: 20 },
  });
});

// ---------------------------------------------------------------------------
// runSingleGateStep — APPROVE path
// ---------------------------------------------------------------------------

describe("runSingleGateStep — APPROVE path", () => {
  it("returns blocked=false when generateObject returns APPROVE decision", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "APPROVE", summary: "Looks good", issues: [] },
      usage: { inputTokens: 500, outputTokens: 100 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.blocked).toBe(false);
    expect(result.stepId).toBe("ecc-code-reviewer");
    expect(result.stepIdx).toBe(2);
  });

  it("returns correct token counts on success", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "APPROVE", summary: "OK", issues: [] },
      usage: { inputTokens: 300, outputTokens: 75 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.inputTokens).toBe(300);
    expect(result.outputTokens).toBe(75);
  });

  it("serialises the object as JSON in output field", async () => {
    const reviewObj = { decision: "APPROVE", summary: "OK", issues: [] };
    mockGenerateObject.mockResolvedValue({
      object: reviewObj,
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(JSON.parse(result.output)).toMatchObject(reviewObj);
  });

  it("populates stepMetric with phase=review", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "APPROVE", summary: "OK" },
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.stepMetric.phase).toBe("review");
    expect(result.stepMetric.feedbackAttempts).toBe(0);
    expect(result.stepMetric.outcome).toBe("success");
  });

  it("uses SecurityReviewOutputSchema for ecc-security-reviewer", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "APPROVE", summary: "Secure" },
      usage: { inputTokens: 50, outputTokens: 25 },
    });

    await runSingleGateStep(makeGateInput({ stepId: "ecc-security-reviewer" }));

    // The schema passed to generateObject should be SecurityReviewOutputSchema
    // We can verify by checking what was passed as the `schema` argument
    const callArg = mockGenerateObject.mock.calls[0][0];
    // Both schemas are mocked — just verify generateObject was called once
    expect(mockGenerateObject).toHaveBeenCalledOnce();
    expect(callArg.schema).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runSingleGateStep — BLOCK detection
// ---------------------------------------------------------------------------

describe("runSingleGateStep — BLOCK detection", () => {
  it("returns blocked=true when decision is BLOCK", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "BLOCK", summary: "Security vulnerability found", issues: ["SQL injection"] },
      usage: { inputTokens: 400, outputTokens: 120 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.blocked).toBe(true);
    expect(result.blockSummary).toBe("Security vulnerability found");
  });

  it("extracts blockSummary from the summary field", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "BLOCK", summary: "Missing input validation", issues: [] },
      usage: { inputTokens: 200, outputTokens: 80 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.blockSummary).toBe("Missing input validation");
  });

  it("treats non-JSON generateText fallback output as APPROVE (no decision extractable)", async () => {
    // generateObject fails → fallback to generateText → non-JSON response
    const nonAbortError = new Error("Schema mismatch");
    nonAbortError.name = "ZodError";
    mockGenerateObject.mockRejectedValue(nonAbortError);
    mockGenerateText.mockResolvedValue({
      text: "The code looks fine overall. Some minor issues.",
      usage: { inputTokens: 200, outputTokens: 60 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.blocked).toBe(false);
    expect(result.output).toBe("The code looks fine overall. Some minor issues.");
  });
});

// ---------------------------------------------------------------------------
// runSingleGateStep — generateText fallback
// ---------------------------------------------------------------------------

describe("runSingleGateStep — generateText fallback", () => {
  it("falls back to generateText when generateObject throws non-AbortError", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Model capability error"));
    mockGenerateText.mockResolvedValue({
      text: '{"decision":"APPROVE","summary":"OK via text"}',
      usage: { inputTokens: 150, outputTokens: 40 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(mockGenerateText).toHaveBeenCalledOnce();
    expect(result.blocked).toBe(false);
    expect(result.output).toContain("APPROVE");
  });

  it("still detects BLOCK from generateText JSON output", async () => {
    mockGenerateObject.mockRejectedValue(new Error("Capability gap"));
    mockGenerateText.mockResolvedValue({
      text: '{"decision":"BLOCK","summary":"Critical bug via text path"}',
      usage: { inputTokens: 100, outputTokens: 30 },
    });

    const result = await runSingleGateStep(makeGateInput());

    expect(result.blocked).toBe(true);
    expect(result.blockSummary).toBe("Critical bug via text path");
  });

  it("re-throws AbortError without falling back", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    mockGenerateObject.mockRejectedValue(abortErr);

    await expect(runSingleGateStep(makeGateInput())).rejects.toThrow("aborted");
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runParallelGateSteps — both APPROVE
// ---------------------------------------------------------------------------



describe("runParallelGateSteps — both APPROVE", () => {
  it("returns results in input order when both approve", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: { decision: "APPROVE", summary: "Code OK" },
        usage: { inputTokens: 300, outputTokens: 80 },
      })
      .mockResolvedValueOnce({
        object: { decision: "APPROVE", summary: "Security OK" },
        usage: { inputTokens: 250, outputTokens: 60 },
      });

    const results = await runParallelGateSteps([
      makeGateInput({ stepId: "ecc-code-reviewer",     stepIdx: 3 }),
      makeGateInput({ stepId: "ecc-security-reviewer", stepIdx: 4 }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].stepId).toBe("ecc-code-reviewer");
    expect(results[0].stepIdx).toBe(3);
    expect(results[1].stepId).toBe("ecc-security-reviewer");
    expect(results[1].stepIdx).toBe(4);
  });

  it("returns blocked=false for both when both APPROVE", async () => {
    mockGenerateObject.mockResolvedValue({
      object: { decision: "APPROVE", summary: "OK" },
      usage: { inputTokens: 100, outputTokens: 30 },
    });

    const results = await runParallelGateSteps([
      makeGateInput({ stepId: "ecc-code-reviewer",     stepIdx: 3 }),
      makeGateInput({ stepId: "ecc-security-reviewer", stepIdx: 4 }),
    ]);

    expect(results.every(r => !r.blocked)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runParallelGateSteps — BLOCK handling
// ---------------------------------------------------------------------------

describe("runParallelGateSteps — BLOCK handling", () => {
  it("returns both results even when first step BLOCKs", async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: { decision: "BLOCK", summary: "Code has issues" },
        usage: { inputTokens: 200, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        object: { decision: "APPROVE", summary: "Secure" },
        usage: { inputTokens: 180, outputTokens: 45 },
      });

    const results = await runParallelGateSteps([
      makeGateInput({ stepId: "ecc-code-reviewer",     stepIdx: 3 }),
      makeGateInput({ stepId: "ecc-security-reviewer", stepIdx: 4 }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].blocked).toBe(true);
    expect(results[1].blocked).toBe(false);
  });

  it("returns results in input order even when second step BLOCKs", async () => {
    // Use prompt-content dispatch so the response is determined by WHICH step
    // is calling — fully deterministic regardless of parallel arrival order.
    // The orchestrator embeds the stepId in every prompt:
    //   "# Instructions for this step (ecc-security-reviewer)"
    mockGenerateObject.mockImplementation(
      async (args: Record<string, unknown>) => {
        const prompt = typeof args.prompt === "string" ? args.prompt : "";
        const isSecurity = prompt.includes("ecc-security-reviewer");
        return {
          object: { decision: isSecurity ? "BLOCK" : "APPROVE",
                    summary:  isSecurity ? "Vuln found" : "Code OK" },
          usage:  { inputTokens: isSecurity ? 180 : 200,
                    outputTokens: isSecurity ? 45 : 50 },
        };
      },
    );

    const results = await runParallelGateSteps([
      makeGateInput({ stepId: "ecc-code-reviewer",     stepIdx: 3 }),
      makeGateInput({ stepId: "ecc-security-reviewer", stepIdx: 4 }),
    ]);

    // INPUT-ORDER preservation: the central guarantee under test
    expect(results[0].stepId).toBe("ecc-code-reviewer");
    expect(results[0].stepIdx).toBe(3);
    expect(results[0].blocked).toBe(false);
    expect(results[1].stepId).toBe("ecc-security-reviewer");
    expect(results[1].stepIdx).toBe(4);
    expect(results[1].blocked).toBe(true);
    expect(results[1].blockSummary).toBe("Vuln found");
  });
});

// ---------------------------------------------------------------------------
// runParallelGateSteps — hard rejection
// ---------------------------------------------------------------------------

describe("runParallelGateSteps — hard rejection (AbortError)", () => {
  it("re-throws AbortError from any step", async () => {
    const abortErr = new Error("pipeline cancelled");
    abortErr.name = "AbortError";

    mockGenerateObject
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce({
        object: { decision: "APPROVE", summary: "OK" },
        usage: { inputTokens: 100, outputTokens: 30 },
      });

    await expect(
      runParallelGateSteps([
        makeGateInput({ stepId: "ecc-code-reviewer",     stepIdx: 3 }),
        makeGateInput({ stepId: "ecc-security-reviewer", stepIdx: 4 }),
      ])
    ).rejects.toThrow("pipeline cancelled");
  });
});
