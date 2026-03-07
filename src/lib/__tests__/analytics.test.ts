import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    analyticsEvent: {
      create: vi.fn(),
    },
  },
}));

import { trackChatResponse, trackKBSearch } from "../analytics";
import { prisma } from "@/lib/prisma";

const mockCreate = vi.mocked(prisma.analyticsEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({
    id: "evt-1",
    type: "CHAT_RESPONSE",
    agentId: "agent-1",
    metadata: {},
    createdAt: new Date(),
  });
});

describe("trackChatResponse", () => {
  it("creates a CHAT_RESPONSE analytics event", async () => {
    await trackChatResponse({
      agentId: "agent-1",
      conversationId: "conv-1",
      timeToFirstTokenMs: 150,
      totalResponseTimeMs: 800,
      isNewConversation: true,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        type: "CHAT_RESPONSE",
        agentId: "agent-1",
        metadata: {
          timeToFirstTokenMs: 150,
          totalResponseTimeMs: 800,
          conversationId: "conv-1",
          isNewConversation: true,
        },
      },
    });
  });

  it("stores correct timing for existing conversations", async () => {
    await trackChatResponse({
      agentId: "agent-2",
      conversationId: "conv-2",
      timeToFirstTokenMs: 50,
      totalResponseTimeMs: 2000,
      isNewConversation: false,
    });

    const call = mockCreate.mock.calls[0][0];
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.isNewConversation).toBe(false);
    expect(metadata.timeToFirstTokenMs).toBe(50);
    expect(metadata.totalResponseTimeMs).toBe(2000);
  });
});

describe("trackKBSearch", () => {
  it("creates a KB_SEARCH analytics event with results", async () => {
    mockCreate.mockResolvedValue({
      id: "evt-2",
      type: "KB_SEARCH",
      agentId: "agent-1",
      metadata: {},
      createdAt: new Date(),
    });

    await trackKBSearch({
      agentId: "agent-1",
      conversationId: "conv-1",
      query: "how to setup",
      resultCount: 3,
      topScore: 0.85,
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        type: "KB_SEARCH",
        agentId: "agent-1",
        metadata: {
          query: "how to setup",
          resultCount: 3,
          topScore: 0.85,
          conversationId: "conv-1",
        },
      },
    });
  });

  it("creates event with null topScore when no results", async () => {
    mockCreate.mockResolvedValue({
      id: "evt-3",
      type: "KB_SEARCH",
      agentId: "agent-1",
      metadata: {},
      createdAt: new Date(),
    });

    await trackKBSearch({
      agentId: "agent-1",
      conversationId: "conv-1",
      query: "unknown topic",
      resultCount: 0,
      topScore: null,
    });

    const call = mockCreate.mock.calls[0][0];
    const metadata = call.data.metadata as Record<string, unknown>;
    expect(metadata.resultCount).toBe(0);
    expect(metadata.topScore).toBeNull();
  });
});
