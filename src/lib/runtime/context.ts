import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/api/tenant-context";
import type { RuntimeContext, OutputMessage } from "./types";
import { parseFlowContent } from "@/lib/validators/flow-content";

export async function loadContext(
  agentId: string,
  conversationId?: string,
  orgId?: string | null,
): Promise<RuntimeContext> {
  const agent = await withTenant(
    (tx) =>
      tx.agent.findUniqueOrThrow({
        where: { id: agentId },
        include: {
          flow: true,
        },
      }),
    orgId,
  );

  if (!agent.flow) throw new Error("Agent has no flow");

  const flowContent = parseFlowContent(agent.flow.content);

  if (conversationId) {
    // Load the 50 MOST RECENT messages (desc + take), then restore chronological
    // order for messageHistory. Previously this used `asc` which loaded the
    // OLDEST 50 messages — silently dropping recent context when resuming a
    // conversation longer than 50 messages.
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId, agentId },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    const orderedMessages = [...conversation.messages].reverse();

    return {
      conversationId: conversation.id,
      agentId,
      orgId,
      flowContent,
      currentNodeId: conversation.currentNodeId,
      variables: (conversation.variables as Record<string, unknown>) ?? {},
      messageHistory: orderedMessages.map((m) => ({
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
    orgId,
    flowContent,
    currentNodeId: null,
    variables: {},
    messageHistory: [],
    isNewConversation: true,
  };
}

export async function saveContext(
  context: RuntimeContext,
  options?: { forceStatus?: "COMPLETED" | "ACTIVE" | "ABANDONED" }
): Promise<void> {
  const status = options?.forceStatus
    ?? (context.currentNodeId ? "ACTIVE" : "COMPLETED");
  await prisma.conversation.update({
    where: { id: context.conversationId },
    data: {
      currentNodeId: context.currentNodeId,
      variables: context.variables as object,
      status,
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
