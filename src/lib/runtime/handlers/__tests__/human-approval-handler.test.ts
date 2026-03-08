import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    _userId: "user-1",
    ...overrides,
  } as RuntimeContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("humanApprovalHandler", () => {
  it("creates HumanApprovalRequest with correct expiry", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "approved",
      response: "looks good",
    });

    const promise = humanApprovalHandler(
      makeNode({
        prompt: "Review this",
        outputVariable: "result",
        timeoutMinutes: 30,
      }),
      makeContext(),
    );

    await vi.advanceTimersByTimeAsync(5100);

    const result = await promise;

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

    const createCall = mockPrisma.humanApprovalRequest.create.mock.calls[0][0];
    const expiresAt = new Date(createCall.data.expiresAt);
    const now = new Date();
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / 60000;
    expect(diffMinutes).toBeGreaterThan(29);
    expect(diffMinutes).toBeLessThan(31);

    expect(result.updatedVariables?.result).toBe("looks good");
  });

  it("stores response in outputVariable when approved", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "approved",
      response: "approved text",
    });

    const promise = humanApprovalHandler(
      makeNode({
        prompt: "Approve?",
        outputVariable: "approval",
      }),
      makeContext(),
    );

    await vi.advanceTimersByTimeAsync(5100);
    const result = await promise;

    expect(result.updatedVariables?.approval).toBe("approved text");
    expect(result.messages[0].content).toContain("approved");
  });

  it("handles timeout with onTimeout=continue", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
    });
    mockPrisma.humanApprovalRequest.update.mockResolvedValue({});

    const promise = humanApprovalHandler(
      makeNode({
        prompt: "Approve?",
        outputVariable: "result",
        timeoutMinutes: 1,
        onTimeout: "continue",
      }),
      makeContext(),
    );

    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(5100);
    }

    const result = await promise;

    expect(result.messages[0].content).toContain("timed out");
    expect(result.updatedVariables?.result).toBeNull();
  });

  it("handles timeout with onTimeout=use_default", async () => {
    mockPrisma.humanApprovalRequest.create.mockResolvedValue({ id: "req-1" });
    mockPrisma.humanApprovalRequest.findUnique.mockResolvedValue({
      id: "req-1",
      status: "pending",
    });
    mockPrisma.humanApprovalRequest.update.mockResolvedValue({});

    const promise = humanApprovalHandler(
      makeNode({
        prompt: "Approve?",
        outputVariable: "result",
        timeoutMinutes: 1,
        onTimeout: "use_default",
        defaultValue: "fallback",
      }),
      makeContext(),
    );

    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(5100);
    }

    const result = await promise;

    expect(result.updatedVariables?.result).toBe("fallback");
    expect(result.messages[0].content).toContain("default value");
  });

  it("returns error when no userId in context", async () => {
    const result = await humanApprovalHandler(
      makeNode({
        prompt: "Approve?",
        outputVariable: "result",
      }),
      makeContext({ _userId: undefined }),
    );

    expect(result.messages[0].content).toContain("authenticated user");
    expect(result.updatedVariables?.result).toBeNull();
  });
});
