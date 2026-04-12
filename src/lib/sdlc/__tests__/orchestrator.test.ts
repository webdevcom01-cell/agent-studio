/**
 * Unit tests for sdlc/orchestrator.ts
 *
 * Key scenarios:
 *  - Happy path: all steps complete, final output built, learn hook fires
 *  - Infrastructure nodes: run inline, no AI call, no learn hook
 *  - Cancellation: mid-pipeline cancel check short-circuits execution
 *  - AI failure: generateText throws → propagates out of runPipeline
 *  - Learn hook failure: error in hook is swallowed (fire-and-forget)
 *  - Context accumulation: each step receives previous step outputs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockGenerateText = vi.hoisted(() => vi.fn());
const mockFireSdkLearnHook = vi.hoisted(() => vi.fn());
const mockGetModel = vi.hoisted(() => vi.fn());
const mockGetAgentSystemPrompt = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", () => ({
  getModel: mockGetModel,
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { runPipeline } from "../orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_MODEL = { __brand: "model" };

function flush(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function makeCallbacks(overrides: {
  isCancelled?: () => Promise<boolean>;
} = {}) {
  return {
    onStepComplete: vi.fn().mockResolvedValue(undefined),
    isCancelled: overrides.isCancelled ?? vi.fn().mockResolvedValue(false),
    onProgress: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModel.mockReturnValue(FAKE_MODEL);
  mockGetAgentSystemPrompt.mockReturnValue("You are an expert agent.");
  mockFireSdkLearnHook.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("runPipeline — happy path", () => {
  it("runs all agent steps and returns a summary", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: "Planner output: phase 1, phase 2",
        usage: { inputTokens: 100, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        text: "Code reviewer output: LGTM",
        usage: { inputTokens: 200, outputTokens: 80 },
      });

    const cbs = makeCallbacks();

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "Add login feature",
        pipeline: ["ecc-planner", "ecc-code-reviewer"],
      },
      cbs,
    );

    expect(result.cancelled).toBeUndefined();
    expect(result.stepCount).toBe(2);
    expect(result.totalInputTokens).toBe(300);
    expect(result.totalOutputTokens).toBe(130);
    expect(result.finalOutput).toContain("ecc-planner");
    expect(result.finalOutput).toContain("ecc-code-reviewer");
    expect(cbs.onStepComplete).toHaveBeenCalledTimes(2);
    expect(cbs.onStepComplete).toHaveBeenNthCalledWith(1, 0, "Planner output: phase 1, phase 2");
    expect(cbs.onStepComplete).toHaveBeenNthCalledWith(2, 1, "Code reviewer output: LGTM");
  });

  it("calls onProgress between steps", async () => {
    mockGenerateText.mockResolvedValue({
      text: "output",
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const cbs = makeCallbacks();

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["ecc-planner"],
      },
      cbs,
    );

    // onProgress should be called at least twice (before step, after final)
    expect(cbs.onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Final call should be 100%
    const lastCall = cbs.onProgress.mock.calls[cbs.onProgress.mock.calls.length - 1];
    expect(lastCall[0]).toBe(100);
  });

  it("fires learn hook for each agent step (fire-and-forget)", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "step 1 out", usage: { inputTokens: 50, outputTokens: 25 } })
      .mockResolvedValueOnce({ text: "step 2 out", usage: { inputTokens: 60, outputTokens: 30 } });

    const cbs = makeCallbacks();

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        userId: "user-1",
        taskDescription: "build auth",
        pipeline: ["ecc-planner", "ecc-tdd-guide"],
      },
      cbs,
    );

    await flush(); // settle fire-and-forget promises

    expect(mockFireSdkLearnHook).toHaveBeenCalledTimes(2);
    expect(mockFireSdkLearnHook).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        userId: "user-1",
        task: expect.stringContaining("ecc-planner"),
      }),
    );
  });

  it("uses the provided modelId", async () => {
    mockGenerateText.mockResolvedValue({
      text: "out",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "task",
        pipeline: ["ecc-architect"],
        modelId: "claude-opus-4-6",
      },
      makeCallbacks(),
    );

    expect(mockGetModel).toHaveBeenCalledWith("claude-opus-4-6");
  });

  it("defaults to deepseek-chat when modelId is omitted", async () => {
    mockGenerateText.mockResolvedValue({
      text: "out",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "task",
        pipeline: ["ecc-planner"],
      },
      makeCallbacks(),
    );

    expect(mockGetModel).toHaveBeenCalledWith("deepseek-chat");
  });
});

// ---------------------------------------------------------------------------
// Infrastructure nodes
// ---------------------------------------------------------------------------

describe("runPipeline — infrastructure nodes", () => {
  it("skips AI call for project_context node", async () => {
    mockGenerateText.mockResolvedValue({
      text: "agent output",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const cbs = makeCallbacks();

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["project_context", "ecc-planner"],
      },
      cbs,
    );

    // generateText should only be called once (for ecc-planner, not project_context)
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(result.stepCount).toBe(2);
    expect(cbs.onStepComplete).toHaveBeenCalledTimes(2);
  });

  it("skips AI call for sandbox_verify node", async () => {
    const cbs = makeCallbacks();

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["sandbox_verify"],
      },
      cbs,
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(cbs.onStepComplete).toHaveBeenCalledWith(0, expect.stringContaining("sandbox"));
  });

  it("does NOT fire learn hook for infrastructure nodes", async () => {
    const cbs = makeCallbacks();

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["project_context", "sandbox_verify"],
      },
      cbs,
    );

    await flush();
    expect(mockFireSdkLearnHook).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

describe("runPipeline — cancellation", () => {
  it("returns cancelled=true when cancelled before first step", async () => {
    const cbs = makeCallbacks({
      isCancelled: vi.fn().mockResolvedValue(true),
    });

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["ecc-planner", "ecc-code-reviewer"],
      },
      cbs,
    );

    expect(result.cancelled).toBe(true);
    expect(result.stepCount).toBe(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns cancelled=true when cancelled between steps", async () => {
    let callCount = 0;
    const isCancelled = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount > 1; // false on first check, true after
    });

    mockGenerateText.mockResolvedValue({
      text: "planner done",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const cbs = makeCallbacks({ isCancelled });

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["ecc-planner", "ecc-code-reviewer"],
      },
      cbs,
    );

    expect(result.cancelled).toBe(true);
    // First step (ecc-planner) completed before cancel was detected
    expect(result.stepCount).toBe(1);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("includes partial step outputs in final output when cancelled", async () => {
    let callCount = 0;
    const isCancelled = vi.fn().mockImplementation(async () => {
      callCount++;
      return callCount > 1;
    });

    mockGenerateText.mockResolvedValue({
      text: "partial output from planner",
      usage: { inputTokens: 50, outputTokens: 20 },
    });

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: ["ecc-planner", "ecc-code-reviewer"],
      },
      makeCallbacks({ isCancelled }),
    );

    expect(result.finalOutput).toContain("ecc-planner");
    expect(result.finalOutput).toContain("partial output from planner");
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("runPipeline — error handling", () => {
  it("propagates generateText errors out of runPipeline", async () => {
    mockGenerateText.mockRejectedValue(new Error("AI provider unavailable"));

    const cbs = makeCallbacks();

    await expect(
      runPipeline(
        {
          runId: "run-1",
          agentId: "agent-1",
          taskDescription: "test",
          pipeline: ["ecc-planner"],
        },
        cbs,
      ),
    ).rejects.toThrow("AI provider unavailable");
  });

  it("does NOT propagate learn hook errors (fire-and-forget)", async () => {
    mockGenerateText.mockResolvedValue({
      text: "output",
      usage: { inputTokens: 50, outputTokens: 20 },
    });
    mockFireSdkLearnHook.mockRejectedValue(new Error("hook failed"));

    const cbs = makeCallbacks();

    // Should NOT throw even though the hook fails
    await expect(
      runPipeline(
        {
          runId: "run-1",
          agentId: "agent-1",
          taskDescription: "test",
          pipeline: ["ecc-planner"],
        },
        cbs,
      ),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Context accumulation
// ---------------------------------------------------------------------------

describe("runPipeline — context accumulation", () => {
  it("passes original task to each step prompt", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "step 1 out", usage: { inputTokens: 10, outputTokens: 5 } })
      .mockResolvedValueOnce({ text: "step 2 out", usage: { inputTokens: 10, outputTokens: 5 } });

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "Build a GraphQL API",
        pipeline: ["ecc-architect", "ecc-code-reviewer"],
      },
      makeCallbacks(),
    );

    // Both calls should have the task in their prompt
    const firstPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    const secondPrompt = mockGenerateText.mock.calls[1][0].prompt as string;

    expect(firstPrompt).toContain("Build a GraphQL API");
    expect(secondPrompt).toContain("Build a GraphQL API");
  });

  it("includes previous step output in subsequent step prompts", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "Architect decided: use PostgreSQL", usage: { inputTokens: 10, outputTokens: 5 } })
      .mockResolvedValueOnce({ text: "Review done", usage: { inputTokens: 10, outputTokens: 5 } });

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "Design the database layer",
        pipeline: ["ecc-architect", "ecc-code-reviewer"],
      },
      makeCallbacks(),
    );

    // Second step's prompt should contain first step's output
    const secondPrompt = mockGenerateText.mock.calls[1][0].prompt as string;
    expect(secondPrompt).toContain("Architect decided: use PostgreSQL");
  });

  it("uses system prompt from getAgentSystemPrompt for each step", async () => {
    mockGetAgentSystemPrompt.mockReturnValue("Custom system prompt for test");
    mockGenerateText.mockResolvedValue({
      text: "output",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "task",
        pipeline: ["ecc-planner"],
      },
      makeCallbacks(),
    );

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "Custom system prompt for test",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Empty pipeline edge case
// ---------------------------------------------------------------------------

describe("runPipeline — edge cases", () => {
  it("handles empty pipeline gracefully", async () => {
    const cbs = makeCallbacks();

    const result = await runPipeline(
      {
        runId: "run-1",
        agentId: "agent-1",
        taskDescription: "test",
        pipeline: [],
      },
      cbs,
    );

    expect(result.stepCount).toBe(0);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(cbs.onStepComplete).not.toHaveBeenCalled();
  });
});
