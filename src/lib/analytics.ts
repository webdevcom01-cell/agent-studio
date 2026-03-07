import { prisma } from "@/lib/prisma";

interface ChatResponseEvent {
  agentId: string;
  conversationId: string;
  timeToFirstTokenMs: number;
  totalResponseTimeMs: number;
  isNewConversation: boolean;
}

interface KBSearchEvent {
  agentId: string;
  conversationId: string;
  query: string;
  resultCount: number;
  topScore: number | null;
}

export async function trackChatResponse(event: ChatResponseEvent): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type: "CHAT_RESPONSE",
      agentId: event.agentId,
      metadata: {
        timeToFirstTokenMs: event.timeToFirstTokenMs,
        totalResponseTimeMs: event.totalResponseTimeMs,
        conversationId: event.conversationId,
        isNewConversation: event.isNewConversation,
      },
    },
  });
}

export async function trackKBSearch(event: KBSearchEvent): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      type: "KB_SEARCH",
      agentId: event.agentId,
      metadata: {
        query: event.query,
        resultCount: event.resultCount,
        topScore: event.topScore,
        conversationId: event.conversationId,
      },
    },
  });
}
