import { describe, it, expect, vi, beforeEach } from "vitest";
import { swarmHandler } from "../swarm-handler";
import type { RuntimeContext } from "../../types";

// Mock the logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock AI SDK generateText
vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "Task completed successfully." }),
}));

// Mock model functions
vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
  getModelByTier: vi.fn().mockReturnValue("mock-tier-model"),
  DEFAULT_MODEL: "deepseek-chat",
}));

// Mock template resolution
vi.mock("../../template", () => ({
  resolveTemplate: (tpl: string) => tpl,
}));

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: {
      nodes: [
        { id: "swarm-1", type: "swarm", position: { x: 0, y: 0 }, data: {} },
        { id: "next-1", type: "message", position: { x: 0, y: 200 }, data: {} },
        { id: "fail-1", type: "message", position: { x: 200, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e-done", source: "swarm-1", target: "next-1", sourceHandle: "done" },
        { id: "e-fail", source: "swarm-1", target: "fail-1", sourceHandle: "failed" },
      ],
      variables: [],
    },
    currentNodeId: "swarm-1",
    variables: {},
    messageHistory: [],
    ...overrides,
  };
}

function makeNode(data: Record<string, unknown> = {}) {
  return {
    id: "swarm-1",
    type: "swarm" as const,
    position: { x: 0, y: 0 },
    data,
  };
}

describe("swarm-handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no tasks provided", async () => {
    const node = makeNode({ tasks: [] });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("requires at least one task");
    expect(result.nextNodeId).toBeNull();
  });

  it("processes tasks from string array", async () => {
    const node = makeNode({
      tasks: ["Task 1", "Task 2", "Task 3"],
      workerCount: 2,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    // Should have per-task messages + summary
    expect(result.messages.length).toBeGreaterThanOrEqual(4); // 3 task + 1 summary
    expect(result.messages[result.messages.length - 1].content).toContain("3/3 tasks done");
    expect(result.nextNodeId).toBe("next-1"); // routes to done
  });

  it("processes tasks from newline-separated string", async () => {
    const node = makeNode({
      tasks: "Line one\nLine two\n\nLine three",
      workerCount: 1,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    // 3 non-empty lines parsed
    expect(result.messages[result.messages.length - 1].content).toContain("3/3 tasks done");
  });

  it("reads tasks from variable", async () => {
    const node = makeNode({
      tasksVariable: "my_tasks",
      workerCount: 1,
    });
    const ctx = makeContext({
      variables: { my_tasks: ["Alpha", "Beta"] },
    });

    const result = await swarmHandler(node, ctx);

    expect(result.messages[result.messages.length - 1].content).toContain("2/2 tasks done");
  });

  it("reads tasks from variable as string", async () => {
    const node = makeNode({
      tasksVariable: "my_tasks",
    });
    const ctx = makeContext({
      variables: { my_tasks: "First\nSecond" },
    });

    const result = await swarmHandler(node, ctx);

    expect(result.messages[result.messages.length - 1].content).toContain("2/2 tasks done");
  });

  it("caps workers at task count", async () => {
    const node = makeNode({
      tasks: ["Only task"],
      workerCount: 5,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.messages[result.messages.length - 1].content).toContain("Workers: 1");
  });

  it("caps workers at MAX_WORKERS (10)", async () => {
    const tasks = Array.from({ length: 15 }, (_, i) => `Task ${i + 1}`);
    const node = makeNode({
      tasks,
      workerCount: 20,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.messages[result.messages.length - 1].content).toContain("Workers: 10");
  });

  it("truncates tasks at MAX_TASKS (50)", async () => {
    const tasks = Array.from({ length: 60 }, (_, i) => `Task ${i + 1}`);
    const node = makeNode({
      tasks,
      workerCount: 5,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    // Should process max 50 tasks
    expect(result.messages[result.messages.length - 1].content).toContain("50/50 tasks done");
  });

  it("sets output variables", async () => {
    const node = makeNode({
      tasks: ["Do something"],
      outputVariable: "my_output",
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.updatedVariables).toBeDefined();
    expect(result.updatedVariables!.my_output).toBeDefined();
    const output = result.updatedVariables!.my_output as Record<string, unknown>;
    expect(output.totalTasks).toBe(1);
    expect(output.completed).toBe(1);
    expect(output.failed).toBe(0);
    expect(result.updatedVariables!.__swarm_merged).toBeDefined();
  });

  it("routes to done when all succeed", async () => {
    const node = makeNode({
      tasks: ["Task A"],
      workerCount: 1,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.nextNodeId).toBe("next-1");
  });

  it("routes to failed when tasks fail", async () => {
    const { generateText } = await import("ai");
    (generateText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("API down"));

    const node = makeNode({
      tasks: ["Will fail"],
      workerCount: 1,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.nextNodeId).toBe("fail-1");
    const output = result.updatedVariables!.swarm_result as Record<string, unknown>;
    expect(output.failed).toBe(1);
  });

  it("uses default merge strategy (concat)", async () => {
    const node = makeNode({
      tasks: ["Task 1", "Task 2"],
      mergeStrategy: "concat",
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    const output = result.updatedVariables!.swarm_result as Record<string, unknown>;
    expect(output.mergeStrategy).toBe("concat");
    expect(typeof output.mergedOutput).toBe("string");
    expect((output.mergedOutput as string)).toContain("Task 1");
  });

  it("respects __model_tier_override", async () => {
    const { getModelByTier } = await import("@/lib/ai");

    const node = makeNode({
      tasks: ["Task 1"],
      workerCount: 1,
    });
    const ctx = makeContext({
      variables: { __model_tier_override: "fast" },
    });

    await swarmHandler(node, ctx);

    expect(getModelByTier).toHaveBeenCalledWith("fast");
  });

  it("uses explicit workerModel over tier override", async () => {
    const { getModel } = await import("@/lib/ai");

    const node = makeNode({
      tasks: ["Task 1"],
      workerCount: 1,
      workerModel: "gpt-4.1-mini",
    });
    const ctx = makeContext({
      variables: { __model_tier_override: "powerful" },
    });

    await swarmHandler(node, ctx);

    expect(getModel).toHaveBeenCalledWith("gpt-4.1-mini");
  });

  it("does not throw on handler error", async () => {
    // Force an error inside the handler by providing invalid data types
    const { generateText } = await import("ai");
    (generateText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));

    const node = makeNode({
      tasks: ["Fail task"],
      workerCount: 1,
    });
    const ctx = makeContext();

    // Should not throw
    const result = await swarmHandler(node, ctx);

    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("filters empty tasks from string array", async () => {
    const node = makeNode({
      tasks: ["Valid task", "", "  ", "Another valid"],
      workerCount: 1,
    });
    const ctx = makeContext();

    const result = await swarmHandler(node, ctx);

    expect(result.messages[result.messages.length - 1].content).toContain("2/2 tasks done");
  });
});
