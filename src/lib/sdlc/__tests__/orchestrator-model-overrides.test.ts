/**
 * Unit tests for per-step model overrides (P2) in sdlc/orchestrator.ts
 *
 * Tests that stepModelOverrides routes each step to the correct model,
 * logs isOverride correctly, and passes the step model through to the
 * feedback loop and test re-runs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockGetModel = vi.hoisted(() => vi.fn());
const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockFireSdkLearnHook = vi.hoisted(() => vi.fn());
const mockGetAgentSystemPrompt = vi.hoisted(() => vi.fn());
const mockRunFeedbackIteration = vi.hoisted(() => vi.fn());
const mockDidTestsFail = vi.hoisted(() => vi.fn());
const mockIndexCodebase = vi.hoisted(() => vi.fn());
const mockSearchCodebase = vi.hoisted(() => vi.fn());
const mockBuildCodeContext = vi.hoisted(() => vi.fn());
const mockExecuteRealTests = vi.hoisted(() => vi.fn());
const mockExecuteRealTestsFromFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  generateObject: mockGenerateObject,
}));

vi.mock("../codebase-rag", () => ({
  indexCodebase: mockIndexCodebase,
  searchCodebase: mockSearchCodebase,
  buildCodeContext: mockBuildCodeContext,
}));

vi.mock("../feedback-loop", () => ({
  runFeedbackIteration: mockRunFeedbackIteration,
  didTestsFail: mockDidTestsFail,
  MAX_RETRIES: 3,
}));

vi.mock("../code-extractor", () => ({
  executeRealTests: mockExecuteRealTests,
  executeRealTestsFromFiles: mockExecuteRealTestsFromFiles,
}));

vi.mock("../agent-prompts", () => ({
  getAgentSystemPrompt: mockGetAgentSystemPrompt,
}));

vi.mock("@/lib/ecc/sdk-learn-hook", () => ({
  fireSdkLearnHook: mockFireSdkLearnHook,
}));

vi.mock("../schemas", () => ({ CodeGenOutputSchema: {} }));

vi.mock("../pipeline-memory", () => ({
  loadRelevantMemory: vi.fn().mockResolvedValue(""),
  extractAndSaveMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../ast-analyzer", () => ({
  extractCodeSignatures: vi.fn().mockResolvedValue([]),
  formatSignaturesForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("../module-map", () => ({
  enrichWithSemanticSummaries: vi.fn().mockResolvedValue([]),
  buildModuleMapContext: vi.fn().mockReturnValue(""),
}));

vi.mock("../scope-analyzer", () => ({
  getCachedImportGraph: vi.fn().mockResolvedValue({ adjacency: new Map(), builtAt: 0 }),
  identifyAffectedFiles: vi.fn().mockReturnValue([]),
  buildBlastRadiusContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("../patch-applier", () => ({
  parseSearchReplaceBlocks: vi.fn().mockReturnValue([]),
  applyPatchToWorkspace: vi.fn().mockResolvedValue({ applied: 0, failed: 0, errors: [] }),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

const mkWorkDir = () => `/tmp/test-sdlc/${randomUUID()}`;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseInput = {
  runId: "run-1",
  agentId: "agent-1",
  taskDescription: "Build a feature",
  pipeline: [] as string[],
  modelId: "deepseek-chat",
};

const callbacks = {
  onStepComplete: vi.fn().mockResolvedValue(undefined),
  isCancelled: vi.fn().mockResolvedValue(false),
  onProgress: vi.fn().mockResolvedValue(undefined),
};

const NO_FILES_RESULT = {
  filesWritten: 0,
  writtenPaths: [],
  testOutput: "",
  typecheckPassed: true,
  testsPassed: true,
};

beforeEach(() => {
  vi.clearAllMocks();

  mockGetModel.mockReturnValue({ id: "mock-model" });
  mockGetAgentSystemPrompt.mockReturnValue("system prompt");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
  mockIndexCodebase.mockResolvedValue({ filesIndexed: 0 });
  mockSearchCodebase.mockResolvedValue([]);
  mockBuildCodeContext.mockReturnValue("");
  mockExecuteRealTests.mockResolvedValue(NO_FILES_RESULT);
  mockExecuteRealTestsFromFiles.mockResolvedValue(NO_FILES_RESULT);
  mockDidTestsFail.mockReturnValue(false);

  mockGenerateText.mockResolvedValue({
    text: "step output",
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  mockGenerateObject.mockResolvedValue({
    object: { files: [], summary: "done", description: "desc", dependencies: [], envVariables: [], prismaSchemaChanges: undefined },
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  mockRunFeedbackIteration.mockResolvedValue({
    success: true,
    revisedImplementation: "fixed impl",
    inputTokens: 5,
    outputTokens: 5,
  });

  callbacks.onStepComplete.mockResolvedValue(undefined);
  callbacks.isCancelled.mockResolvedValue(false);
  callbacks.onProgress.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stepModelOverrides", () => {
  it("uses default model for all steps when no overrides provided", async () => {
    await runPipeline(
      { ...baseInput, pipeline: ["discovery", "codegen"], workspaceDir: mkWorkDir() },
      callbacks,
    );

    const calls = mockGetModel.mock.calls.map((c) => c[0] as string);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe("deepseek-chat");
    expect(calls[1]).toBe("deepseek-chat");
  });

  it("uses override model for the specified step", async () => {
    await runPipeline(
      {
        ...baseInput,
        pipeline: ["discovery", "codegen"],
        stepModelOverrides: { codegen: "claude-sonnet-4-6" },
        workspaceDir: mkWorkDir(),
      },
      callbacks,
    );

    const calls = mockGetModel.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain("deepseek-chat");
    expect(calls).toContain("claude-sonnet-4-6");

    // discovery → default, codegen → override
    expect(calls[0]).toBe("deepseek-chat");
    expect(calls[1]).toBe("claude-sonnet-4-6");
  });

  it("falls back to default model for steps not in overrides", async () => {
    await runPipeline(
      {
        ...baseInput,
        pipeline: ["discovery", "codegen", "sandbox"],
        stepModelOverrides: { codegen: "gpt-4o" },
        workspaceDir: mkWorkDir(),
      },
      callbacks,
    );

    const calls = mockGetModel.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toBe("deepseek-chat"); // discovery
    expect(calls[1]).toBe("gpt-4o");        // codegen (override)
    expect(calls[2]).toBe("deepseek-chat"); // sandbox
  });

  it("passes stepModelId (not resolvedModelId) to runFeedbackIteration when override is set", async () => {
    // codegen is an IMPLEMENTATION_STEP — after generateText, real-exec runs.
    // Real-exec returns failures → feedback loop fires → runFeedbackIteration receives stepModelId.
    mockExecuteRealTests.mockResolvedValue({
      filesWritten: 1,
      writtenPaths: ["/tmp/sdlc/workspace/src/lib/foo.ts"],
      testOutput: "tsc error TS2339",
      typecheckPassed: false,
      testsPassed: true,
    });
    // generateObject fails so generateText fallback is used (implFiles=null → executeRealTests)
    mockGenerateObject.mockRejectedValueOnce(new Error("model does not support structured output"));

    mockDidTestsFail.mockReturnValue(false); // TEST_STEP feedback loop won't fire

    await runPipeline(
      {
        ...baseInput,
        pipeline: ["codegen", "sandbox"],
        stepModelOverrides: { codegen: "claude-sonnet-4-6" },
        workspaceDir: mkWorkDir(),
      },
      callbacks,
    );

    expect(mockRunFeedbackIteration).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "claude-sonnet-4-6" }),
      expect.any(String),
    );
  });

  it("passes stepModelId to testModel re-run inside TEST_STEP feedback loop", async () => {
    // sandbox is a TEST_STEP — when tests fail AND implResolution !== "passing",
    // the feedback loop fires: runFeedbackIteration (Step A) then getModel(stepModelId)
    // for the test re-run (Step B, line 651). This test verifies that Step B uses the
    // sandbox override model, NOT the default resolvedModelId.
    //
    // Expected getModel call sequence:
    //   1. codegen step           → "deepseek-chat"  (no override for codegen)
    //   2. sandbox initial call   → "gpt-4o"         (override)
    //   3. sandbox re-run Step B  → "gpt-4o"         (override — this is what we're testing)
    //
    // If line 651 still uses resolvedModelId, call 3 would be "deepseek-chat" and the
    // assertion below (exactly 2 calls with "gpt-4o") would fail — catching the regression.
    mockExecuteRealTests.mockResolvedValue(NO_FILES_RESULT);

    mockGenerateText
      .mockResolvedValueOnce({ text: "// codegen output", usage: { inputTokens: 10, outputTokens: 10 } })
      .mockResolvedValueOnce({ text: "FAIL: tests failed", usage: { inputTokens: 10, outputTokens: 10 } })
      .mockResolvedValue({ text: "tests now pass", usage: { inputTokens: 5, outputTokens: 5 } });

    // generateObject fails for codegen → fallback to generateText (implFiles=null)
    mockGenerateObject.mockRejectedValueOnce(new Error("no structured output"));

    mockRunFeedbackIteration.mockResolvedValue({
      success: true,
      revisedImplementation: "fixed impl",
      inputTokens: 5,
      outputTokens: 5,
    });
    mockDidTestsFail
      .mockReturnValueOnce(true)  // initial sandbox output → triggers feedback loop
      .mockReturnValue(false);    // after Step B re-run → loop exits

    await runPipeline(
      {
        ...baseInput,
        pipeline: ["codegen", "sandbox"],
        stepModelOverrides: { sandbox: "gpt-4o" },
        workspaceDir: mkWorkDir(),
      },
      callbacks,
    );

    // "gpt-4o" must appear exactly twice: sandbox initial call + sandbox re-run Step B.
    // If line 651 regresses to resolvedModelId, the re-run uses "deepseek-chat" and
    // this count drops to 1, failing the assertion.
    const gpt4oCalls = mockGetModel.mock.calls.filter((c) => c[0] === "gpt-4o");
    expect(gpt4oCalls).toHaveLength(2);
  });

  it("logs isOverride: true when override is used, false when not", async () => {
    await runPipeline(
      {
        ...baseInput,
        pipeline: ["discovery", "codegen"],
        stepModelOverrides: { codegen: "claude-opus-4-6" },
        workspaceDir: mkWorkDir(),
      },
      callbacks,
    );

    const infoCalls = mockLogger.info.mock.calls;

    const discoveryLog = infoCalls.find(
      (c) =>
        c[0] === "Pipeline: model resolved for step" &&
        (c[1] as Record<string, unknown>).stepId === "discovery",
    );
    const codegenLog = infoCalls.find(
      (c) =>
        c[0] === "Pipeline: model resolved for step" &&
        (c[1] as Record<string, unknown>).stepId === "codegen",
    );

    expect(discoveryLog).toBeDefined();
    expect(discoveryLog![1]).toMatchObject({ stepId: "discovery", isOverride: false });

    expect(codegenLog).toBeDefined();
    expect(codegenLog![1]).toMatchObject({ stepId: "codegen", isOverride: true });
  });
});
