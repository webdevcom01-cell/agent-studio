import { prisma } from "@/lib/prisma";
import type { RuntimeContext, OutputMessage } from "./types";
import { parseFlowContent } from "@/lib/validators/flow-content";

export async function loadContext(
  agentId: string,
  conversationId?: string
): Promise<RuntimeContext> {
  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id: agentId },
    include: {
      flow: true,
    },
  });

  if (!agent.flow) throw new Error("Agent has no flow");

  const flowContent = parseFlowContent(agent.flow.content);

  if (conversationId) {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId, agentId },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 50 },
      },
    });

    return {
      conversationId: conversation.id,
      agentId,
      flowContent,
      currentNodeId: conversation.currentNodeId,
      variables: (conversation.variables as Record<string, unknown>) ?? {},
      messageHistory: conversation.messages.map((m) => ({
        role: m.role.toLowerCase() as "user" | "assistant" | "system",
        content: m.content,
      })),
      isNewConversation: false,
    };
  }

  const conversation = await prisma.conversation.create({
    data: {
      agentId,
      status: "ACTIVE",
      variables: {},
      flowVersionId: agent.flow.activeVersionId ?? undefined,
    },
  });

  return {
    conversationId: conversation.id,
    agentId,
    flowContent,
    currentNodeId: null,
    variables: {},
    messageHistory: [],
    isNewConversation: true,
  };
}

export async function saveContext(context: RuntimeContext): Promise<void> {
  await prisma.conversation.update({
    where: { id: context.conversationId },
    data: {
      currentNodeId: context.currentNodeId,
      variables: context.variables as object,
      status: context.currentNodeId ? "ACTIVE" : "COMPLETED",
    },
  });
}

export async function saveMessages(
  conversationId: string,
  messages: OutputMessage[]
): Promise<void> {
  if (messages.length === 0) return;
  await prisma.message.createMany({
    data: messages.map((m) => ({
      conversationId,
      role: m.role === "assistant" ? "ASSISTANT" as const : "SYSTEM" as const,
      content: m.content,
      ...(m.metadata ? { metadata: m.metadata as object } : {}),
    })),
  });
}
