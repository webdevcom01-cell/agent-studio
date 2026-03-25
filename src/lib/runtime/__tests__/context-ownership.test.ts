import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findUniqueOrThrow: vi.fn(),
  },
  conversation: {
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { loadContext } from "../context";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadContext ownership", () => {
  it("loads conversation that belongs to the agent", async () => {
    mockPrisma.agent.findUniqueOrThrow.mockResolvedValue({
      id: "agent-1",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
        activeVersionId: null,
      },
    });
    mockPrisma.conversation.findUniqueOrThrow.mockResolvedValue({
      id: "conv-1",
      agentId: "agent-1",
      currentNodeId: null,
      variables: {},
      messages: [],
    });

    const ctx = await loadContext("agent-1", "conv-1");
    expect(ctx.conversationId).toBe("conv-1");
    expect(ctx.agentId).toBe("agent-1");

    expect(mockPrisma.conversation.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-1", agentId: "agent-1" },
      }),
    );
  });

  it("throws when conversation belongs to a different agent", async () => {
    mockPrisma.agent.findUniqueOrThrow.mockResolvedValue({
      id: "agent-1",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
        activeVersionId: null,
      },
    });
    mockPrisma.conversation.findUniqueOrThrow.mockRejectedValue(
      new Error("No Conversation found"),
    );

    await expect(loadContext("agent-1", "conv-other-agent")).rejects.toThrow(
      "No Conversation found",
    );
  });

  it("creates new conversation when no conversationId provided", async () => {
    mockPrisma.agent.findUniqueOrThrow.mockResolvedValue({
      id: "agent-1",
      flow: {
        content: { nodes: [], edges: [], variables: [] },
        activeVersionId: null,
      },
    });
    mockPrisma.conversation.create.mockResolvedValue({
      id: "new-conv",
      agentId: "agent-1",
    });

    const ctx = await loadContext("agent-1");
    expect(ctx.conversationId).toBe("new-conv");
    expect(ctx.isNewConversation).toBe(true);
  });
});
