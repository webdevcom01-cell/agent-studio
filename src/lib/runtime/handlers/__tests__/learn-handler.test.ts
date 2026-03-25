import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instinct: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    agentExecution: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { learnHandler } from "../learn-handler";

const mockPrisma = vi.mocked(prisma);

function makeContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    agentId: "test-agent",
    conversationId: "test-conv",
    currentNodeId: "learn1",
    variables: { user_input: "test" },
    messageHistory: [],
    flowContent: {
      nodes: [
        { id: "learn1", type: "learn", position: { x: 0, y: 0 }, data: {} },
        { id: "next1", type: "message", position: { x: 0, y: 100 }, data: {} },
      ],
      edges: [{ id: "e1", source: "learn1", target: "next1" }],
      variables: [],
    } as FlowContent,
    ...overrides,
  };
}

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "learn1",
    type: "learn",
    position: { x: 0, y: 0 },
    data: { label: "Learn", ...data },
  };
}

describe("learnHandler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new instinct when pattern does not exist", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue(null);
    mockPrisma.instinct.create.mockResolvedValue({} as never);
    mockPrisma.agentExecution.findMany.mockResolvedValue([]);

    const result = await learnHandler(
      makeNode({ patternName: "error-handling", patternDescription: "Handle errors" }),
      makeContext()
    );

    expect(result.messages[0].content).toContain("Created new instinct");
    expect(result.updatedVariables?.learn_result).toMatchObject({
      action: "created",
      name: "error-handling",
    });
    expect(result.nextNodeId).toBe("next1");
    expect(mockPrisma.instinct.create).toHaveBeenCalledOnce();
  });

  it("reinforces existing instinct", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "existing",
      confidence: 0.5,
      frequency: 3,
      description: "old",
      examples: null,
    } as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    const result = await learnHandler(
      makeNode({ patternName: "error-handling" }),
      makeContext()
    );

    expect(result.messages[0].content).toContain("Reinforced instinct");
    expect(result.updatedVariables?.learn_result).toMatchObject({
      action: "reinforced",
      confidence: 0.6,
      frequency: 4,
    });
  });

  it("returns error message when patternName is empty", async () => {
    const result = await learnHandler(
      makeNode({ patternName: "" }),
      makeContext()
    );

    expect(result.messages[0].content).toContain("requires a pattern name");
    expect(result.nextNodeId).toBeNull();
  });

  it("handles database errors gracefully", async () => {
    mockPrisma.instinct.findFirst.mockRejectedValue(new Error("DB down"));

    const result = await learnHandler(
      makeNode({ patternName: "test" }),
      makeContext()
    );

    expect(result.messages[0].content).toContain("Failed to learn");
    expect(result.nextNodeId).toBe("next1");
  });

  it("caps confidence at 1.0", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue({
      id: "high",
      confidence: 0.95,
      frequency: 50,
      description: "desc",
      examples: null,
    } as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    const result = await learnHandler(
      makeNode({ patternName: "maxed" }),
      makeContext()
    );

    expect(result.updatedVariables?.learn_result).toMatchObject({
      confidence: 1.0,
    });
  });

  it("uses custom outputVariable", async () => {
    mockPrisma.instinct.findFirst.mockResolvedValue(null);
    mockPrisma.instinct.create.mockResolvedValue({} as never);
    mockPrisma.agentExecution.findMany.mockResolvedValue([]);

    const result = await learnHandler(
      makeNode({ patternName: "test", outputVariable: "custom_var" }),
      makeContext()
    );

    expect(result.updatedVariables).toHaveProperty("custom_var");
  });
});
