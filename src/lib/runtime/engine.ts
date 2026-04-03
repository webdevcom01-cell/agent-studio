import type { RuntimeContext, ExecutionResult, OutputMessage } from "./types";
import { getHandler } from "./handlers";
import { saveContext, saveMessages } from "./context";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/safety/audit-logger";
import { shouldCompact, compactContext } from "./context-compaction";
import type { FlowNode } from "@/types";

/**
 * Nodes that manage their own output routing via sourceHandles.
 * When these return nextNodeId: null, the engine should NOT follow
 * default edges — null means "stop" not "continue to default".
 */
/**
 * These node types return sourceHandle strings (not node IDs) as nextNodeId.
 * When they return null, it means no matching handle/edge — engine should stop,
 * NOT fall through to a default edge (which would cause double execution).
 * Note: parallel is NOT here — it resolves edges internally and returns node IDs.
 */
/**
 * Multi-output nodes that return sourceHandle strings (not node IDs) as nextNodeId.
 * When they return null, engine stops — null means "no route matched".
 * Note: parallel and condition are NOT here — they resolve edges internally.
 */
export const SELF_ROUTING_NODES = new Set([
  "switch",
  "guardrails",
  "ab_test",
  "semantic_router",
  "cache",
]);

/**
 * Legacy helper — finds the next node ID given a source node and optional handle.
 */
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

/**
 * Resolves the next node ID from a handler result using explicit routing rules:
 *  1. Handler returned a known node ID → direct routing (goto, loop, condition)
 *  2. Handler returned a sourceHandle string → find edge by sourceHandle
 *  3. Self-routing node returned null → stop (no default fallthrough)
 *  4. Regular node returned null → follow first default edge
 */
export function resolveNextNodeId(
  result: { nextNodeId: string | null },
  currentNodeId: string,
  nodeType: string,
  edges: import("@/types").FlowEdge[],
  nodeMap: Map<string, unknown>,
): string | null {
  const { nextNodeId } = result;

  if (nextNodeId && nodeMap.has(nextNodeId)) {
    return nextNodeId;
  }

  if (nextNodeId) {
    const edge = edges.find(
      (e) => e.source === currentNodeId && e.sourceHandle === nextNodeId,
    );
    if (edge) return edge.target;
    logger.warn("No edge found for sourceHandle", {
      nodeId: currentNodeId,
      nodeType,
      sourceHandle: nextNodeId,
    });
    return null;
  }

  if (SELF_ROUTING_NODES.has(nodeType)) {
    return null;
  }

  const defaultEdge = edges.find(
    (e) => e.source === currentNodeId && !e.sourceHandle,
  );
  return defaultEdge?.target ?? null;
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
  const nodeMap = new Map(context.flowContent.nodes.map((n) => [n.id, n]));

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
  // Smart compaction: summarize context before truncating so the AI retains
  // key facts, decisions, and state from earlier in the conversation.
  // The summary is stored in context.variables['__context_summary'] which
  // ai-response handlers inject into the system prompt.
  if (shouldCompact(context)) {
    await compactContext(context);
  }
  if (context.messageHistory.length > MAX_HISTORY) {
    context.messageHistory = context.messageHistory.slice(-MAX_HISTORY);
  }

  // Audit: flow execution start
  writeAuditLog({
    userId: context.userId,
    action: "FLOW_EXECUTION_START",
    resourceType: "Agent",
    resourceId: context.agentId,
    after: { conversationId: context.conversationId, hasUserMessage: !!userMessage },
  }).catch(() => {});

  while (context.currentNodeId && iterations < MAX_ITERATIONS) {
    iterations++;

    const node = nodeMap.get(context.currentNodeId);

    if (!node) {
      allMessages.push({
        role: "assistant",
        content: "I encountered an error in the flow. Please try again.",
      });
      context.currentNodeId = null;
      break;
    }

    const visitCount = visitedNodes.get(node.id) ?? 0;
    // Loop nodes need higher visit threshold since they intentionally revisit
    const maxVisits = node.type === "loop" ? 110 : 5;
    if (visitCount > maxVisits) {
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
      logger.error("Node handler error", error, { agentId: context.agentId, nodeType: node.type, nodeId: node.id });
      allMessages.push({
        role: "assistant",
        content: "Something went wrong. Let me try to continue.",
      });
      context.currentNodeId = resolveNextNodeId(
        { nextNodeId: null }, node.id, node.type,
        context.flowContent.edges, nodeMap,
      );
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

    context.currentNodeId = resolveNextNodeId(
      result, node.id, node.type,
      context.flowContent.edges, nodeMap,
    );
  }

  if (iterations >= MAX_ITERATIONS && context.currentNodeId) {
    logger.warn("Flow reached max iterations", { agentId: context.agentId, iterations });
    allMessages.push({
      role: "assistant",
      content: "This conversation has reached its processing limit. Please start a new conversation.",
    });
    context.currentNodeId = null;
  }

  await saveMessages(context.conversationId, allMessages);
  await saveContext(context);

  // Audit: flow execution end
  writeAuditLog({
    userId: context.userId,
    action: "FLOW_EXECUTION_END",
    resourceType: "Agent",
    resourceId: context.agentId,
    after: {
      conversationId: context.conversationId,
      iterations,
      messageCount: allMessages.length,
    },
  }).catch(() => {});

  return { messages: allMessages, waitingForInput: false };
}
