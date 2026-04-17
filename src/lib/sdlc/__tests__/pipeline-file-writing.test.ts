/**
 * Integration tests for pipeline file writing.
 *
 * The real code-extractor runs (real fs I/O).
 * Only AI calls, verification commands, and infrastructure modules are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
const mockGetModel               = vi.hoisted(() => vi.fn());
const mockGenerateText           = vi.hoisted(() => vi.fn());
const mockGenerateObject         = vi.hoisted(() => vi.fn());
const mockFireSdkLearnHook       = vi.hoisted(() => vi.fn());
const mockGetAgentSystemPrompt   = vi.hoisted(() => vi.fn());
const mockRunFeedbackIteration   = vi.hoisted(() => vi.fn());
const mockDidTestsFail           = vi.hoisted(() => vi.fn());
const mockIndexCodebase          = vi.hoisted(() => vi.fn());
const mockSearchCodebase         = vi.hoisted(() => vi.fn());
const mockBuildCodeContext       = vi.hoisted(() => vi.fn());
const mockRunVerificationCommands = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({ logger: mockLogger }));
vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));
vi.mock("ai", () => ({ generateText: mockGenerateText, generateObject: mockGenerateObject }));
vi.mock("../agent-prompts", () => ({ getAgentSystemPrompt: mockGetAgentSystemPrompt }));
vi.mock("../feedback-loop", () => ({
  runFeedbackIteration: mockRunFeedbackIteration,
  didTestsFail: mockDidTestsFail,
  MAX_RETRIES: 3,
}));
vi.mock("../codebase-rag", () => ({
  indexCodebase: mockIndexCodebase,
  searchCodebase: mockSearchCodebase,
  buildCodeContext: mockBuildCodeContext,
}));
vi.mock("@/lib/ecc/sdk-learn-hook", () => ({ fireSdkLearnHook: mockFireSdkLearnHook }));
vi.mock("../schemas", () => ({ CodeGenOutputSchema: {} }));
vi.mock("@/lib/runtime/verification-commands", () => ({
  runVerificationCommands: mockRunVerificationCommands,
}));

// DO NOT mock ../code-extractor — real fs I/O is the point of this test.

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let workDir: string;

const callbacks = {
  onStepComplete: vi.fn().mockResolvedValue(undefined),
  isCancelled:    vi.fn().mockResolvedValue(false),
  onProgress:     vi.fn().mockResolvedValue(undefined),
};

const BASE_OBJECT = {
  summary: "done",
  description: "greeting module",
  dependencies: [],
  envVariables: [],
  prismaSchemaChanges: undefined,
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  workDir = join(tmpdir(), randomUUID());
  vi.clearAllMocks();

  callbacks.onStepComplete.mockResolvedValue(undefined);
  callbacks.isCancelled.mockResolvedValue(false);
  callbacks.onProgress.mockResolvedValue(undefined);

  mockGetModel.mockReturnValue({ id: "mock-model" });
  mockGetAgentSystemPrompt.mockReturnValue("system prompt");
  mockFireSdkLearnHook.mockResolvedValue(undefined);

  // filesIndexed: 0 → codebaseReady = false → RAG search skipped
  mockIndexCodebase.mockResolvedValue({ filesIndexed: 0 });
  mockBuildCodeContext.mockReturnValue("");
  mockDidTestsFail.mockReturnValue(false);
  mockRunFeedbackIteration.mockResolvedValue({
    success: true,
    revisedImplementation: "",
    inputTokens: 0,
    outputTokens: 0,
  });

  mockGenerateText.mockResolvedValue({
    text: "step output",
    usage: { inputTokens: 10, outputTokens: 20 },
  });

  // tsc / vitest — return passing so file write assertions are never blocked
  mockRunVerificationCommands.mockResolvedValue({
    results: [{ output: "", passed: true }],
  });
});

afterEach(() => {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Pipeline: file writing integration", () => {
  it("writes AI-generated file to disk via generateObject path", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        ...BASE_OBJECT,
        files: [
          {
            path: "src/lib/greeting.ts",
            content: "export const greet = () => \"hello\";",
            language: "typescript",
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await runPipeline(
      {
        runId: "integration-run-1",
        agentId: "agent-1",
        taskDescription: "Build a greeting module",
        pipeline: ["codegen"],
        modelId: "deepseek-chat",
        workspaceDir: workDir,
      },
      callbacks,
    );

    // code-extractor writes under {workDir}/workspace/ (GENERATED_SUBDIR)
    const filePath = join(workDir, "workspace", "src/lib/greeting.ts");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("export const greet = () => \"hello\";");
  });

  it("writes multiple AI-generated files to disk", async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        ...BASE_OBJECT,
        files: [
          {
            path: "src/lib/greeting.ts",
            content: "export const greet = () => \"hello\";",
            language: "typescript",
          },
          {
            path: "src/lib/farewell.ts",
            content: "export const farewell = () => \"goodbye\";",
            language: "typescript",
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await runPipeline(
      {
        runId: "integration-run-2",
        agentId: "agent-1",
        taskDescription: "Build a greeting module",
        pipeline: ["codegen"],
        modelId: "deepseek-chat",
        workspaceDir: workDir,
      },
      callbacks,
    );

    // code-extractor writes under {workDir}/workspace/ (GENERATED_SUBDIR)
    expect(existsSync(join(workDir, "workspace", "src/lib/greeting.ts"))).toBe(true);
    expect(existsSync(join(workDir, "workspace", "src/lib/farewell.ts"))).toBe(true);
    expect(readFileSync(join(workDir, "workspace", "src/lib/greeting.ts"), "utf-8"))
      .toBe("export const greet = () => \"hello\";");
    expect(readFileSync(join(workDir, "workspace", "src/lib/farewell.ts"), "utf-8"))
      .toBe("export const farewell = () => \"goodbye\";");
  });

  it("writes file to disk via generateText fallback when generateObject fails", async () => {
    mockGenerateObject.mockRejectedValue(
      new Error("model does not support structured output"),
    );
    mockGenerateText.mockResolvedValue({
      text: "```typescript\n// filepath: src/lib/greeting.ts\nexport const greet = () => \"hello\";\n```",
      usage: { inputTokens: 10, outputTokens: 20 },
    });

    await runPipeline(
      {
        runId: "integration-run-3",
        agentId: "agent-1",
        taskDescription: "Build a greeting module",
        pipeline: ["codegen"],
        modelId: "deepseek-chat",
        workspaceDir: workDir,
      },
      callbacks,
    );

    // code-extractor writes under {workDir}/workspace/ (GENERATED_SUBDIR)
    const filePath = join(workDir, "workspace", "src/lib/greeting.ts");
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("export const greet = () => \"hello\";");
  });
});
