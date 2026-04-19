/**
 * Fix 1: Zero-files bug
 *
 * Verifies that when an implementation step produces zero files,
 * the pipeline throws a descriptive error instead of silently continuing.
 *
 * Before fix: pipeline returns COMPLETED with empty workspace.
 * After fix:  pipeline throws — caller marks run as FAILED with clear message.
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

/** Result that simulates the AI generating no parseable files */
const ZERO_FILES_RESULT = {
  filesWritten: 0,
  writtenPaths: [],
  testOutput: "No files extracted from AI output.",
  typecheckPassed: false,
  testsPassed: false,
};

function makeCallbacks() {
  return {
    onStepComplete: vi.fn().mockResolvedValue(undefined),
    isCancelled: vi.fn().mockResolvedValue(false),
    onProgress: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue(FAKE_MODEL);
  mockGetAgentSystemPrompt.mockReturnValue("You are an expert developer.");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fix 1 — zero-files bug", () => {
  it("throws when generateObject returns empty files array and fallback also produces zero files", async () => {
    // generateObject returns valid schema but empty files — triggers fallback
    mockGenerateObject.mockResolvedValue({
      object: {
        files: [],
        dependencies: [],
        envVariables: [],
        prismaSchemaChanges: undefined,
        summary: "Done",
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    // Fallback generateText returns text with no valid code blocks
    mockGenerateText.mockResolvedValue({
      text: "I would implement this feature by creating several files...",
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    // Real execution finds nothing to write
    mockExecuteRealTests.mockResolvedValue(ZERO_FILES_RESULT);
    mockExecuteRealTestsFromFiles.mockResolvedValue(ZERO_FILES_RESULT);

    await expect(
      runPipeline(
        {
          runId: "run-zero-files",
          agentId: "agent-1",
          taskDescription: "Add property listing API",
          pipeline: ["codegen"],
          workspaceDir: "/tmp/test-zero-files",
        },
        makeCallbacks(),
      ),
    ).rejects.toThrow(/zero files|no files|produced no files/i);
  });

  it("throws when generateObject itself throws and fallback generateText also yields zero files", async () => {
    // generateObject throws (model capability gap)
    mockGenerateObject.mockRejectedValue(new Error("Model does not support structured output"));

    // Fallback generateText returns prose without code blocks
    mockGenerateText.mockResolvedValue({
      text: "The implementation should follow SOLID principles...",
      usage: { inputTokens: 60, outputTokens: 30 },
    });

    mockExecuteRealTests.mockResolvedValue(ZERO_FILES_RESULT);

    await expect(
      runPipeline(
        {
          runId: "run-zero-files-2",
          agentId: "agent-1",
          taskDescription: "Add property listing API",
          pipeline: ["developer"],
          workspaceDir: "/tmp/test-zero-files-2",
        },
        makeCallbacks(),
      ),
    ).rejects.toThrow(/zero files|no files|produced no files/i);
  });

  it("does NOT throw when implementation step produces files normally", async () => {
    // generateObject succeeds with actual files
    mockGenerateObject.mockResolvedValue({
      object: {
        files: [
          { path: "src/api/properties/route.ts", content: "export async function GET() {}", language: "typescript", isNew: true },
        ],
        dependencies: [],
        envVariables: [],
        prismaSchemaChanges: undefined,
        summary: "Added property listing route",
      },
      usage: { inputTokens: 200, outputTokens: 150 },
    });

    mockExecuteRealTestsFromFiles.mockResolvedValue({
      filesWritten: 1,
      writtenPaths: ["src/api/properties/route.ts"],
      testOutput: "All tests passed.",
      typecheckPassed: true,
      testsPassed: true,
    });

    const result = await runPipeline(
      {
        runId: "run-with-files",
        agentId: "agent-1",
        taskDescription: "Add property listing API",
        pipeline: ["codegen"],
        workspaceDir: "/tmp/test-with-files",
      },
      makeCallbacks(),
    );

    expect(result.stepCount).toBe(1);
    expect(result.cancelled).toBeUndefined();
  });
});
