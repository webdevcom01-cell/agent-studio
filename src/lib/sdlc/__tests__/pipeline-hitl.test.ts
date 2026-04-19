/**
 * Unit tests for HITL (Human-in-the-Loop) approval checkpoint in orchestrator.ts.
 *
 * Verifies:
 *  - requireApproval=true pauses after last planning step before implementation
 *  - requireApproval=false (default) runs all steps without pause
 *  - Pause does NOT fire when planning step is NOT followed by implementation step
 *  - planningStepsCompleted reflects steps completed before pause
 *  - approvalFeedback is injected into the first implementation step prompt
 *  - Phase 2 resume: startFromStep skips planning steps and pre-seeds context
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockFireSdkLearnHook = vi.hoisted(() => vi.fn());
const mockGetModel = vi.hoisted(() => vi.fn());
const mockGetAgentSystemPrompt = vi.hoisted(() => vi.fn());
const mockExecuteRealTests = vi.hoisted(() => vi.fn());
const mockExecuteRealTestsFromFiles = vi.hoisted(() => vi.fn());
const mockRmSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, rmSync: mockRmSync };
});

vi.mock("@/lib/ai", () => ({
  getModel: mockGetModel,
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  generateObject: mockGenerateObject,
}));

vi.mock("../code-extractor", () => ({
  executeRealTests: mockExecuteRealTests,
  executeRealTestsFromFiles: mockExecuteRealTestsFromFiles,
}));

vi.mock("@/lib/ecc/sdk-learn-hook", () => ({
  fireSdkLearnHook: mockFireSdkLearnHook,
}));

vi.mock("../agent-prompts", () => ({
  getAgentSystemPrompt: mockGetAgentSystemPrompt,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
// Imports
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "model" };
const mkWorkDir = () => `/tmp/test-sdlc-hitl/${randomUUID()}`;

const NO_FILES_RESULT = {
  filesWritten: 0,
  writtenPaths: [],
  testOutput: "No files provided — skipping real execution.",
  typecheckPassed: true,
  testsPassed: true,
};

function makeCallbacks() {
  return {
    onStepComplete: vi.fn().mockResolvedValue(undefined),
    isCancelled: vi.fn().mockResolvedValue(false),
    onProgress: vi.fn().mockResolvedValue(undefined),
  };
}

const SUCCESS_RESPONSE = {
  text: "Step output",
  usage: { inputTokens: 100, outputTokens: 50 },
};

/** Default successful extractor result — 1 file written so the zero-files guard passes. */
const FILES_RESULT = {
  filesWritten: 1,
  writtenPaths: ["src/lib/auth.ts"],
  testOutput: "Tests passed.",
  typecheckPassed: true,
  testsPassed: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue(FAKE_MODEL);
  mockGetAgentSystemPrompt.mockReturnValue("System prompt for step.");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
  // Return 1 file so IMPLEMENTATION_STEP zero-files guard passes.
  mockExecuteRealTests.mockResolvedValue(FILES_RESULT);
  mockExecuteRealTestsFromFiles.mockResolvedValue(FILES_RESULT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HITL — requireApproval=true pauses at planning→implementation boundary", () => {
  it("returns awaitingApproval=true when last planning step is followed by implementation step", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await runPipeline(
      {
        runId: "hitl-run-1",
        agentId: "agent-hitl",
        taskDescription: "Build auth module",
        // "architect" is a PLANNING_STEP; "codegen" is an IMPLEMENTATION_STEP
        pipeline: ["architect", "codegen"],
        requireApproval: true,
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    expect(result.awaitingApproval).toBe(true);
    // Only the planning step ran — implementation step was NOT executed
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("returns planningStepsCompleted equal to number of steps run before pause", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await runPipeline(
      {
        runId: "hitl-run-2",
        agentId: "agent-hitl",
        taskDescription: "Build auth module",
        pipeline: ["architect", "codegen"],
        requireApproval: true,
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    // One planning step completed before pause
    expect(result.planningStepsCompleted).toBe(1);
  });
});

describe("HITL — requireApproval=false (default) does not pause", () => {
  it("runs all steps to completion when requireApproval is false", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await runPipeline(
      {
        runId: "hitl-run-3",
        agentId: "agent-hitl",
        taskDescription: "Build auth module",
        pipeline: ["architect", "codegen"],
        requireApproval: false,
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    expect(result.awaitingApproval).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
    // Both steps ran
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("does not pause when requireApproval is omitted (backward-compatible default)", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await runPipeline(
      {
        runId: "hitl-run-4",
        agentId: "agent-hitl",
        taskDescription: "Build auth module",
        pipeline: ["architect", "codegen"],
        // requireApproval intentionally omitted
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    expect(result.awaitingApproval).toBeUndefined();
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });
});

describe("HITL — checkpoint only fires at planning→implementation boundary", () => {
  it("does NOT pause when planning step is followed by another planning step (not an implementation step)", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);

    const result = await runPipeline(
      {
        runId: "hitl-run-5",
        agentId: "agent-hitl",
        taskDescription: "Design system",
        // Both are PLANNING_STEPS — no implementation step follows
        pipeline: ["architect", "ecc-planner"],
        requireApproval: true,
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    // No pause — both planning steps run to completion
    expect(result.awaitingApproval).toBeUndefined();
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });
});

describe("HITL — approvalFeedback injection", () => {
  it("injects approvalFeedback into the prompt of the first implementation step", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);
    const FEEDBACK = "Use TypeScript strict mode and repository pattern";

    await runPipeline(
      {
        runId: "hitl-run-6",
        agentId: "agent-hitl",
        taskDescription: "Build service",
        // Single implementation step — no prior implementation steps so
        // approvalFeedback injection applies (alreadyHasImpl=false)
        pipeline: ["codegen"],
        approvalFeedback: FEEDBACK,
        workspaceDir: mkWorkDir(),
      },
      makeCallbacks(),
    );

    // The prompt passed to generateText should contain the feedback
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain(FEEDBACK);
  });
});

describe("HITL — Phase 2 resume via startFromStep", () => {
  it("skips planning steps when startFromStep points to implementation, pre-seeding context", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_RESPONSE);
    const PLANNING_OUTPUT = "Architecture: use hexagonal architecture, ports and adapters";

    const cbs = makeCallbacks();
    await runPipeline(
      {
        runId: "hitl-run-7",
        agentId: "agent-hitl",
        taskDescription: "Build service",
        pipeline: ["architect", "codegen"],
        // Phase 2: skip the planning step, start directly at implementation
        startFromStep: 1,
        existingStepResults: { "0": PLANNING_OUTPUT },
        workspaceDir: mkWorkDir(),
      },
      cbs,
    );

    // Only the implementation step (codegen at index 1) ran — ONE AI call
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    // The implementation step's prompt should include the pre-seeded planning output
    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    expect(callArgs.prompt).toContain(PLANNING_OUTPUT.slice(0, 50));
  });
});
