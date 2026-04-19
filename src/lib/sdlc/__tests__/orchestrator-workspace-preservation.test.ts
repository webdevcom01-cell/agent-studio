/**
 * Fix 2: Workspace preservation on failure
 *
 * Verifies that the pipeline workspace is NOT deleted when an error occurs,
 * so developers can inspect the failed state for debugging.
 *
 * Before fix: finally block always deleted workspace regardless of outcome.
 * After fix:  workspace is preserved on failure; only deleted on success.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, rmSync: mockRmSync };
});

vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  generateObject: mockGenerateObject,
}));

vi.mock("../code-extractor", () => ({
  executeRealTests: mockExecuteRealTests,
  executeRealTestsFromFiles: mockExecuteRealTestsFromFiles,
  runWorkspaceTests: vi.fn(),
}));

vi.mock("@/lib/ecc/sdk-learn-hook", () => ({
  fireSdkLearnHook: mockFireSdkLearnHook,
}));

vi.mock("../agent-prompts", () => ({
  getAgentSystemPrompt: mockGetAgentSystemPrompt,
}));

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

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

vi.mock("../codebase-rag", () => ({
  indexCodebase: vi.fn().mockResolvedValue({ filesIndexed: 0 }),
  searchCodebase: vi.fn().mockResolvedValue([]),
  buildCodeContext: vi.fn().mockReturnValue(""),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "model" } as unknown as ReturnType<typeof mockGetModel>;

function makeCallbacks(overrides: { isCancelled?: () => Promise<boolean> } = {}) {
  return {
    onStepComplete: vi.fn().mockResolvedValue(undefined),
    isCancelled: overrides.isCancelled ?? vi.fn().mockResolvedValue(false),
    onProgress: vi.fn().mockResolvedValue(undefined),
  };
}

const SUCCESS_TEXT = { text: "Planning done.", usage: { inputTokens: 50, outputTokens: 30 } };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue(FAKE_MODEL);
  mockGetAgentSystemPrompt.mockReturnValue("You are an expert.");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
  mockExecuteRealTests.mockResolvedValue({
    filesWritten: 0,
    writtenPaths: [],
    testOutput: "",
    typecheckPassed: true,
    testsPassed: true,
  });
  mockExecuteRealTestsFromFiles.mockResolvedValue({
    filesWritten: 0,
    writtenPaths: [],
    testOutput: "",
    typecheckPassed: true,
    testsPassed: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fix 2 — workspace preservation on failure", () => {
  it("does NOT delete workspace when pipeline throws (uses managed workDir)", async () => {
    // Pipeline fails because AI throws
    mockGenerateText.mockRejectedValue(new Error("OpenAI rate limit exceeded"));

    // Run WITHOUT workspaceDir so cleanupWorkspace = true (managed workspace)
    await expect(
      runPipeline(
        {
          runId: "run-fail-1",
          agentId: "agent-1",
          taskDescription: "Build auth module",
          pipeline: ["ecc-planner"],
          // No workspaceDir — pipeline manages /tmp/sdlc/run-fail-1
        },
        makeCallbacks(),
      ),
    ).rejects.toThrow("OpenAI rate limit exceeded");

    // rmSync must NOT have been called — workspace preserved for inspection
    expect(mockRmSync).not.toHaveBeenCalled();

    // logger.error must be called with the workspace path so developer can find it
    const errorCalls = mockLogger.error.mock.calls;
    const workspaceLog = errorCalls.find((call: unknown[]) =>
      typeof call[0] === "string" && call[0].includes("workspace preserved"),
    );
    expect(workspaceLog).toBeDefined();
    // The log must include the actual workDir path
    expect(JSON.stringify(workspaceLog)).toContain("run-fail-1");
  });

  it("DOES delete workspace when pipeline succeeds (managed workDir)", async () => {
    mockGenerateText.mockResolvedValue(SUCCESS_TEXT);

    await runPipeline(
      {
        runId: "run-success-1",
        agentId: "agent-1",
        taskDescription: "Build auth module",
        pipeline: ["ecc-planner"],
        // No workspaceDir — managed workspace should be cleaned up on success
      },
      makeCallbacks(),
    );

    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("run-success-1"),
      { recursive: true, force: true },
    );
  });

  it("DOES delete workspace when pipeline is cancelled (clean exit)", async () => {
    // Cancel immediately on first check
    const isCancelled = vi.fn().mockResolvedValue(true);

    await runPipeline(
      {
        runId: "run-cancelled-1",
        agentId: "agent-1",
        taskDescription: "Build auth module",
        pipeline: ["ecc-planner"],
      },
      makeCallbacks({ isCancelled }),
    );

    // Cancelled is a clean exit — workspace can be removed
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("run-cancelled-1"),
      { recursive: true, force: true },
    );
  });

  it("does NOT call rmSync when workspaceDir is explicitly provided (caller manages cleanup)", async () => {
    mockGenerateText.mockRejectedValue(new Error("AI failed"));

    await expect(
      runPipeline(
        {
          runId: "run-explicit-dir",
          agentId: "agent-1",
          taskDescription: "Build auth module",
          pipeline: ["ecc-planner"],
          workspaceDir: "/tmp/my-custom-dir", // caller manages this
        },
        makeCallbacks(),
      ),
    ).rejects.toThrow("AI failed");

    // cleanupWorkspace = false when workspaceDir is provided — rmSync never called
    expect(mockRmSync).not.toHaveBeenCalled();
  });
});
