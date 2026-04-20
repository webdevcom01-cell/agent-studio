/**
 * Fix 4: Git error surfaced in pipeline result
 *
 * Verifies that when git/PR integration fails, the error message is returned
 * in PipelineResult.gitError so callers (worker, API) can surface it to users
 * instead of silently swallowing it.
 *
 * Before fix: git failures only logged a warn — result had no gitError field.
 * After fix:  result.gitError contains the failure message; pipeline still
 *             COMPLETES (git is best-effort, never blocks COMPLETED status).
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
const mockIntegrateWithGit = vi.hoisted(() => vi.fn());
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));
vi.mock("ai", () => ({ generateText: mockGenerateText, generateObject: mockGenerateObject }));

vi.mock("../code-extractor", () => ({
  executeRealTests: mockExecuteRealTests,
  executeRealTestsFromFiles: mockExecuteRealTestsFromFiles,
  runWorkspaceTests: vi.fn(),
}));

vi.mock("../git-integration", () => ({
  integrateWithGit: mockIntegrateWithGit,
}));

vi.mock("@/lib/ecc/sdk-learn-hook", () => ({
  fireSdkLearnHook: mockFireSdkLearnHook,
}));

vi.mock("../agent-prompts", () => ({
  getAgentSystemPrompt: mockGetAgentSystemPrompt,
  getImplementationSystemPrompt: mockGetAgentSystemPrompt,
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

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, rmSync: vi.fn() };
});

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "model" } as unknown as ReturnType<typeof mockGetModel>;
const SUCCESS_TEXT = { text: "Planning done.", usage: { inputTokens: 50, outputTokens: 30 } };

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
  mockGetAgentSystemPrompt.mockReturnValue("You are an expert.");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
  mockGenerateText.mockResolvedValue(SUCCESS_TEXT);
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

describe("Fix 4 — git error surfaced in pipeline result", () => {
  it("returns gitError when git integration fails, pipeline still completes", async () => {
    mockIntegrateWithGit.mockResolvedValue({
      success: false,
      error: "GITHUB_TOKEN env var not set",
    });

    const result = await runPipeline(
      {
        runId: "run-git-fail-1",
        agentId: "agent-1",
        taskDescription: "Build auth module",
        pipeline: ["ecc-planner"],
        repoUrl: "https://github.com/owner/repo",
      },
      makeCallbacks(),
    );

    // Pipeline COMPLETES — git is best-effort and never blocks
    expect(result.gitError).toBe("GITHUB_TOKEN env var not set");
    expect(result.prUrl).toBeUndefined();
    expect(result.finalOutput).toBeDefined();
  });

  it("gitError is undefined when git integration succeeds", async () => {
    mockIntegrateWithGit.mockResolvedValue({
      success: true,
      prUrl: "https://github.com/owner/repo/pull/42",
      branchName: "sdlc/abc123-build-auth",
      commitHash: "abc123",
    });

    const result = await runPipeline(
      {
        runId: "run-git-ok-1",
        agentId: "agent-1",
        taskDescription: "Build auth module",
        pipeline: ["ecc-planner"],
        repoUrl: "https://github.com/owner/repo",
      },
      makeCallbacks(),
    );

    expect(result.gitError).toBeUndefined();
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/42");
  });

  it("gitError is undefined and git integration is skipped when no repoUrl provided", async () => {
    const result = await runPipeline(
      {
        runId: "run-no-git-1",
        agentId: "agent-1",
        taskDescription: "Build auth module",
        pipeline: ["ecc-planner"],
        // No repoUrl
      },
      makeCallbacks(),
    );

    expect(result.gitError).toBeUndefined();
    expect(mockIntegrateWithGit).not.toHaveBeenCalled();
  });
});
