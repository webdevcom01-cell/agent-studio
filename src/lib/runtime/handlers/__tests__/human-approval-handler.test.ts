import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  humanApprovalRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { humanApprovalHandler } from "../human-approval-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "n1",
    type: "human_approval",
    position: { x: 0, y: 0 },
    data,
  };
}

function makeContext(overrides: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables: {},
    messageHistory: [],
    isNewConversation: false,
    userId: "user-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("humanApprovalHandler", () => {
  it("creates request and returns waitForInput on first call", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });

    const node = makeNode({
      prompt: "Review this",
      outputVariable: "result",
      timeoutMinutes: 30,
    });

    const result = await humanApprovalHandler(node, makeContext());

    expect(result.waitForInput).toBe(true);
    expect(result.nextNodeId).toBe("n1");
    expect(result.updatedVariables?._approval_request_id).toBe("req-1");
    expect(result.messages[0].content).toContain("Awaiting human approval");

    expect(mockPrisma.humanApprovalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentId: "agent-1",
          userId: "user-1",
          prompt: "Review this",
          status: "pending",
        }),
      }),
    );
  });

  it("returns approved result on resume when status is approved", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "approved",
      response: "looks good",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await humanApprovalHandler(
      makeNode({ outputVariable: "result" }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.waitForInput).toBe(false);
    expect(result.updatedVariables?.result).toBe("looks good");
    expect(result.updatedVariables?._approval_request_id).toBeNull();
    expect(result.messages[0].content).toContain("approved");
  });

  it("returns rejected result on resume when status is rejected", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "rejected",
      response: "not good",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await humanApprovalHandler(
      makeNode({ outputVariable: "result" }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.waitForInput).toBe(false);
    expect(result.updatedVariables?.result).toBe("not good");
    expect(result.messages[0].content).toContain("rejected");
  });

  it("returns waitForInput when still pending and not expired", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await humanApprovalHandler(
      makeNode({ outputVariable: "result" }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.waitForInput).toBe(true);
    expect(result.nextNodeId).toBe("n1");
  });

  it("handles timeout with onTimeout=continue", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.humanApprovalRequest.update.mockResolvedValue({});

    const result = await humanApprovalHandler(
      makeNode({
        outputVariable: "result",
        timeoutMinutes: 1,
        onTimeout: "continue",
      }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.messages[0].content).toContain("timed out");
    expect(result.updatedVariables?.result).toBeNull();
    expect(result.updatedVariables?._approval_request_id).toBeNull();
  });

  it("handles timeout with onTimeout=use_default", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.humanApprovalRequest.update.mockResolvedValue({});

    const result = await humanApprovalHandler(
      makeNode({
        outputVariable: "result",
        timeoutMinutes: 1,
        onTimeout: "use_default",
        defaultValue: "fallback",
      }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.updatedVariables?.result).toBe("fallback");
    expect(result.messages[0].content).toContain("default value");
  });

  it("handles timeout with onTimeout=stop", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.humanApprovalRequest.update.mockResolvedValue({});

    const result = await humanApprovalHandler(
      makeNode({
        outputVariable: "result",
        timeoutMinutes: 1,
        onTimeout: "stop",
      }),
      makeContext({ variables: { _approval_request_id: "req-1" } }),
    );

    expect(result.messages[0].content).toContain("timed out");
    expect(result.nextNodeId).toBeNull();
  });

  it("returns error when no userId in context", async () => {
    const result = await humanApprovalHandler(
      makeNode({
        prompt: "Approve?",
        outputVariable: "result",
      }),
      makeContext({ userId: undefined }),
    );

    expect(result.messages[0].content).toContain("authenticated user");
    expect(result.updatedVariables?.result).toBeNull();
  });

  it("handles missing request on resume", async () => {
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue(null);

    const result = await humanApprovalHandler(
      makeNode({ outputVariable: "result" }),
      makeContext({ variables: { _approval_request_id: "req-gone" } }),
    );

    expect(result.messages[0].content).toContain("not found");
    expect(result.waitForInput).toBe(false);
  });

  it("sets correct expiry based on timeoutMinutes", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });

    await humanApprovalHandler(
      makeNode({ prompt: "Review", timeoutMinutes: 30 }),
      makeContext(),
    );

    const createCall = mockPrisma.humanApprovalRequest.create.mock.calls[0][0];
    const expiresAt = new Date(createCall.data.expiresAt);
    const now = new Date();
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / 60000;
    expect(diffMinutes).toBeGreaterThan(29);
    expect(diffMinutes).toBeLessThan(31);
  });
});
