import type { RuntimeContext, ExecutionResult, OutputMessage } from "./types";
import { getHandler } from "./handlers";
import { saveContext, saveMessages } from "./context";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { FlowNode } from "@/types";

export function findNextNode(
  context: RuntimeContext,
  sourceNodeId: string,
  sourceHandle?: string
): string | null {
  const edge = context.flowContent.edges.find(
    (e) =>
      e.source === sourceNodeId &&
      (sourceHandle ? e.sourceHandle === sourceHandle : true)
  );
  return edge?.target ?? null;
}

export function findStartNode(context: RuntimeContext): FlowNode | null {
  const { nodes, edges } = context.flowContent;
  if (nodes.length === 0) return null;

  const targetIds = new Set(edges.map((e) => e.target));
  const startNode = nodes.find((n) => !targetIds.has(n.id));
  return startNode ?? nodes[0];
}

export async function executeFlow(
  context: RuntimeContext,
  userMessage?: string
): Promise<{ messages: OutputMessage[]; waitingForInput: boolean }> {
  const allMessages: OutputMessage[] = [];
  const MAX_ITERATIONS = 50;
  let iterations = 0;
  const visitedNodes = new Map<string, number>();

  const isResuming = !!context.currentNodeId && !!userMessage;
  context.isResuming = isResuming;

  if (!context.currentNodeId) {
    const startNode = findStartNode(context);
    if (!startNode) {
      return { messages: [{ role: "assistant", content: "This flow is empty." }], waitingForInput: false };
    }
    context.currentNodeId = startNode.id;
  }

  if (userMessage) {
    await prisma.message.create({
      data: {
        conversationId: context.conversationId,
        role: "USER",
        content: userMessage,
      },
    });
    context.messageHistory.push({ role: "user", content: userMessage });
    context.variables["last_message"] = userMessage;
  }

  const MAX_HISTORY = 100;
  if (context.messageHistory.length > MAX_HISTORY) {
    context.messageHistory = context.messageHistory.slice(-MAX_HISTORY);
  }

  while (context.currentNodeId && iterations < MAX_ITERATIONS) {
    iterations++;

    const node = context.flowContent.nodes.find(
      (n) => n.id === context.currentNodeId
    );

    if (!node) {
      allMessages.push({
        role: "assistant",
        content: "I encountered an error in the flow. Please try again.",
      });
      context.currentNodeId = null;
      break;
    }

    const visitCount = visitedNodes.get(node.id) ?? 0;
    if (visitCount > 5) {
      logger.warn("Circular flow detected", { nodeId: node.id, agentId: context.agentId, visitCount });
      allMessages.push({
        role: "assistant",
        content: "I seem to be stuck in a loop. Let me end this conversation.",
      });
      context.currentNodeId = null;
      break;
    }
    visitedNodes.set(node.id, visitCount + 1);

    const handler = getHandler(node.type);
    if (!handler) {
      allMessages.push({
        role: "assistant",
        content: `Unsupported node type: ${node.type}`,
      });
      context.currentNodeId = findNextNode(context, node.id);
      continue;
    }

    let result: ExecutionResult;
    try {
      result = await handler(node, context);
    } catch (error) {
      logger.error("Node handler error", error, { agentId: context.agentId, nodeType: node.type });
      allMessages.push({
        role: "assistant",
        content: "Something went wrong. Let me try to continue.",
      });
      context.currentNodeId = findNextNode(context, node.id);
      continue;
    }

    if (context.isResuming) {
      context.isResuming = false;
    }

    allMessages.push(...result.messages);

    if (result.updatedVariables) {
      context.variables = { ...context.variables, ...result.updatedVariables };
    }

    for (const msg of result.messages) {
      context.messageHistory.push({ role: msg.role, content: msg.content });
    }

    if (result.waitForInput) {
      if (result.nextNodeId) {
        context.currentNodeId = result.nextNodeId;
      }
      await saveMessages(context.conversationId, allMessages);
      await saveContext(context);
      return { messages: allMessages, waitingForInput: true };
    }

    context.currentNodeId = result.nextNodeId ?? findNextNode(context, node.id);
  }

  await saveMessages(context.conversationId, allMessages);
  await saveContext(context);

  return { messages: allMessages, waitingForInput: false };
}
