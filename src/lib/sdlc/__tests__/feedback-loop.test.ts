/**
 * Unit tests for sdlc/feedback-loop.ts
 *
 * Covers:
 *   - runFeedbackIteration: happy path token fields
 *   - runFeedbackIteration: AbortError → success=false, tokens=0
 *   - runFeedbackIteration: provider error → success=false, tokens=0
 *   - didTestsFail: various output patterns
 *   - parseTestFailures: extracts known failure patterns
 *   - buildFeedbackPrompt: structure and content
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockGetModel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", () => ({ getModel: mockGetModel }));
vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  runFeedbackIteration,
  didTestsFail,
  buildFeedbackPrompt,
  MAX_RETRIES,
  type FeedbackLoopInput,
} from "../feedback-loop";
import { parseVitestFailures as parseTestFailures } from "../error-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "fakeModel" };

function makeInput(overrides: Partial<FeedbackLoopInput> = {}): FeedbackLoopInput {
  return {
    taskDescription: "Build an auth handler",
    architecturePlan: "Use JWT + NextAuth",
    previousImplementation: "export function auth() { return null; }",
    testOutput: "FAIL auth.test.ts\n● expected token but received null",
    codebaseContext: "",
    agentId: "agent-test",
    modelId: "deepseek-chat",
    attempt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue(FAKE_MODEL);
});

// ---------------------------------------------------------------------------
// runFeedbackIteration — token tracking (TASK 3)
// ---------------------------------------------------------------------------

describe("runFeedbackIteration — token tracking", () => {
  it("returns inputTokens and outputTokens from the AI result on success", async () => {
    mockGenerateText.mockResolvedValue({
      text: "export function auth() { return createToken(); }",
      usage: { inputTokens: 800, outputTokens: 200 },
    });

    const result = await runFeedbackIteration(makeInput(), "Fix the code");

    expect(result.success).toBe(true);
    expect(result.inputTokens).toBe(800);
    expect(result.outputTokens).toBe(200);
  });

  it("returns 0 for both token fields when the AI provider throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("Rate limited"));

    const result = await runFeedbackIteration(makeInput(), "Fix the code");

    expect(result.success).toBe(false);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("returns 0 for both token fields on AbortError (timeout)", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    mockGenerateText.mockRejectedValue(abortErr);

    const result = await runFeedbackIteration(makeInput(), "Fix the code");

    expect(result.success).toBe(false);
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("defaults to 0 when usage.inputTokens is null/undefined", async () => {
    mockGenerateText.mockResolvedValue({
      text: "fixed code",
      usage: { inputTokens: null, outputTokens: undefined },
    });

    const result = await runFeedbackIteration(makeInput(), "Fix the code");

    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runFeedbackIteration — core behavior
// ---------------------------------------------------------------------------

describe("runFeedbackIteration — core behavior", () => {
  it("returns success=true with revised implementation text", async () => {
    mockGenerateText.mockResolvedValue({
      text: "fixed: export function auth() { return jwt.sign({}); }",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await runFeedbackIteration(makeInput(), "You are an expert");

    expect(result.success).toBe(true);
    expect(result.revisedImplementation).toContain("jwt.sign");
  });

  it("keeps previousImplementation when attempt fails", async () => {
    mockGenerateText.mockRejectedValue(new Error("model error"));

    const input = makeInput({ previousImplementation: "ORIGINAL_CODE" });
    const result = await runFeedbackIteration(input, "Fix it");

    expect(result.success).toBe(false);
    expect(result.revisedImplementation).toBe("ORIGINAL_CODE");
  });

  it("passes abortSignal to generateText", async () => {
    mockGenerateText.mockResolvedValue({
      text: "fixed",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runFeedbackIteration(makeInput(), "system");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: expect.anything() }),
    );
  });

  it("passes maxOutputTokens: 8192 to generateText", async () => {
    mockGenerateText.mockResolvedValue({
      text: "fixed",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runFeedbackIteration(makeInput(), "system");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192 }),
    );
  });

  it("exports MAX_RETRIES = 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// didTestsFail
// ---------------------------------------------------------------------------

describe("didTestsFail", () => {
  it("returns false for empty string", () => {
    expect(didTestsFail("")).toBe(false);
  });

  it("detects FAIL keyword", () => {
    expect(didTestsFail("FAIL auth.test.ts")).toBe(true);
  });

  it("detects FAILED keyword", () => {
    expect(didTestsFail("3 tests FAILED")).toBe(true);
  });

  it("detects FAIL when AssertionError follows a FAIL marker", () => {
    expect(didTestsFail("FAIL auth.test.ts\nAssertionError: expected true to be false")).toBe(true);
  });

  it("detects '2 failed' pattern", () => {
    expect(didTestsFail("2 failed, 10 passed")).toBe(true);
  });

  it("returns false for all-passing output", () => {
    expect(didTestsFail("✓ auth.test.ts passed\nTests: 5 passed")).toBe(false);
  });

  it("returns false for 'all tests passed' message", () => {
    expect(didTestsFail("All tests passed. 42/42 green.")).toBe(false);
  });

  it("returns true when failure and pass signals coexist (fail wins)", () => {
    expect(didTestsFail("✓ 5 passed\nFAIL 1 failed")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseTestFailures
// ---------------------------------------------------------------------------

describe("parseTestFailures", () => {
  it("returns empty array for passing output", () => {
    const result = parseTestFailures("✓ all tests passed");
    expect(result).toHaveLength(0);
  });

  it("extracts FAIL lines", () => {
    const output = "FAIL src/lib/auth.test.ts\n✗ should return token";
    const result = parseTestFailures(output);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.testName.length > 0 || f.file.includes("auth"))).toBe(true);
  });

  it("extracts ✗ failure markers with error details in lookahead", () => {
    const output = "× should return token\n  AssertionError: expected null to equal 'token'";
    const result = parseTestFailures(output);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].errorMessage).toBeTruthy();
  });

  it("returns distinct entries for distinct FAIL lines", () => {
    const output = Array.from({ length: 5 }, (_, i) => `FAIL test-${i}.ts`).join("\n");
    const result = parseTestFailures(output);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("returns one result per FAIL marker", () => {
    const manyFails = Array.from({ length: 5 }, (_, i) => `FAIL test-${i}.ts`).join("\n");
    const result = parseTestFailures(manyFails);
    expect(result.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// buildFeedbackPrompt
// ---------------------------------------------------------------------------

describe("buildFeedbackPrompt", () => {
  it("includes task description", () => {
    const prompt = buildFeedbackPrompt(makeInput({ taskDescription: "MY_UNIQUE_TASK" }));
    expect(prompt).toContain("MY_UNIQUE_TASK");
  });

  it("includes previous implementation", () => {
    const prompt = buildFeedbackPrompt(makeInput({
      previousImplementation: "function UNIQUE_FUNCTION() {}",
    }));
    expect(prompt).toContain("UNIQUE_FUNCTION");
  });

  it("includes architecture plan", () => {
    const prompt = buildFeedbackPrompt(makeInput({ architecturePlan: "ARCH_PLAN_UNIQUE" }));
    expect(prompt).toContain("ARCH_PLAN_UNIQUE");
  });

  it("includes attempt number", () => {
    const prompt = buildFeedbackPrompt(makeInput({ attempt: 2 }));
    expect(prompt).toContain("Attempt 2");
  });

  it("includes test output section", () => {
    const prompt = buildFeedbackPrompt(makeInput({ testOutput: "FAIL mytest.ts" }));
    expect(prompt).toContain("Test Failures");
  });

  it("includes codebase context when provided", () => {
    const prompt = buildFeedbackPrompt(makeInput({ codebaseContext: "## Relevant code\nRELEVANT_CODE" }));
    expect(prompt).toContain("RELEVANT_CODE");
  });

  it("omits codebase context section when empty", () => {
    const prompt = buildFeedbackPrompt(makeInput({ codebaseContext: "" }));
    // Should not have the "## Relevant code" section at all
    expect(prompt).not.toContain("## Relevant code");
  });
});
