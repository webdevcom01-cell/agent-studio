/**
 * Unit tests for phase-aware RAG top-K (P3) in sdlc/orchestrator.ts
 *
 * IMPLEMENTATION_STEPS use RAG_TOP_K_IMPLEMENTATION (12).
 * All other steps use RAG_TOP_K_DEFAULT (5).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

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
  // CRITICAL: filesIndexed must be > 0 so codebaseReady = true and searchCodebase is called
  mockIndexCodebase.mockResolvedValue({ filesIndexed: 3 });
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

describe("RAG top-K per phase", () => {
  it("calls searchCodebase with RAG_TOP_K_IMPLEMENTATION (12) for IMPLEMENTATION_STEPS", async () => {
    await runPipeline(
      { ...baseInput, pipeline: ["codegen"] },
      callbacks,
    );

    expect(mockSearchCodebase).toHaveBeenCalledOnce();
    expect(mockSearchCodebase.mock.calls[0][2]).toBe(12);
  });

  it("calls searchCodebase with RAG_TOP_K_DEFAULT (5) for PLANNING_STEPS", async () => {
    await runPipeline(
      { ...baseInput, pipeline: ["discovery"] },
      callbacks,
    );

    expect(mockSearchCodebase).toHaveBeenCalledOnce();
    expect(mockSearchCodebase.mock.calls[0][2]).toBe(5);
  });

  it("calls searchCodebase with RAG_TOP_K_DEFAULT (5) for TEST_STEPS", async () => {
    await runPipeline(
      { ...baseInput, pipeline: ["sandbox"] },
      callbacks,
    );

    expect(mockSearchCodebase).toHaveBeenCalledOnce();
    expect(mockSearchCodebase.mock.calls[0][2]).toBe(5);
  });

  it("uses correct topK for each step in a mixed pipeline", async () => {
    await runPipeline(
      { ...baseInput, pipeline: ["discovery", "codegen", "sandbox"] },
      callbacks,
    );

    expect(mockSearchCodebase).toHaveBeenCalledTimes(3);
    expect(mockSearchCodebase.mock.calls[0][2]).toBe(5);  // discovery
    expect(mockSearchCodebase.mock.calls[1][2]).toBe(12); // codegen
    expect(mockSearchCodebase.mock.calls[2][2]).toBe(5);  // sandbox
  });

  it("logs ragTopK and resultsReturned for each step", async () => {
    mockSearchCodebase
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          chunkId: "chunk-1",
          content: "export const handler = ...",
          similarity: 0.91,
          sourceId: "src-1",
          relevanceScore: 0.91,
          sourceDocument: "src/lib/foo.ts",
        },
      ]);

    await runPipeline(
      { ...baseInput, pipeline: ["discovery", "codegen"] },
      callbacks,
    );

    const infoCalls = mockLogger.info.mock.calls;

    const discoveryRagLog = infoCalls.find(
      (c) =>
        c[0] === "Pipeline: RAG search complete" &&
        (c[1] as Record<string, unknown>).stepId === "discovery",
    );
    expect(discoveryRagLog).toBeDefined();
    expect(discoveryRagLog![1]).toMatchObject({ ragTopK: 5, resultsReturned: 0 });

    const codegenRagLog = infoCalls.find(
      (c) =>
        c[0] === "Pipeline: RAG search complete" &&
        (c[1] as Record<string, unknown>).stepId === "codegen",
    );
    expect(codegenRagLog).toBeDefined();
    expect(codegenRagLog![1]).toMatchObject({ ragTopK: 12, resultsReturned: 1 });
  });
});
