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
    const conversation = await withTenant(
      (tx) =>
        tx.conversation.findUniqueOrThrow({
          where: { id: conversationId, agentId },
          include: {
            messages: { orderBy: { createdAt: "desc" }, take: 50 },
          },
        }),
      orgId,
    );

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

  // Hoist before the closure: TS drops the `agent.flow` non-null narrowing
  // (from the guard above) across the withTenant callback boundary.
  const activeVersionId = agent.flow.activeVersionId ?? undefined;
  const conversation = await withTenant(
    (tx) =>
      tx.conversation.create({
        data: {
          agentId,
          status: "ACTIVE",
          variables: {},
          flowVersionId: activeVersionId,
        },
      }),
    orgId,
  );

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
  await withTenant(
    (tx) =>
      tx.conversation.update({
        where: { id: context.conversationId },
        data: {
          currentNodeId: context.currentNodeId,
          variables: context.variables as object,
          status,
        },
      }),
    context.orgId,
  );
}

export async function saveMessages(
  conversationId: string,
  messages: OutputMessage[],
  orgId?: string | null,
): Promise<void> {
  if (messages.length === 0) return;
  await withTenant(
    (tx) =>
      tx.message.createMany({
        data: messages.map((m) => ({
          conversationId,
          role: m.role === "assistant" ? "ASSISTANT" as const : "SYSTEM" as const,
          content: m.content,
          ...(m.metadata ? { metadata: m.metadata as object } : {}),
        })),
      }),
    orgId,
  );
}
