import type { RuntimeContext, ExecutionResult, OutputMessage } from "./types";
import { getHandler } from "./handlers";
import { saveContext, saveMessages } from "./context";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { emitHook } from "./hooks";
import { emitSessionEvent } from "./session-events";
import { writeAuditLog } from "@/lib/safety/audit-logger";
import { prepareContextForExecution } from "./execution-prelude";
import type { FlowNode } from "@/types";
import type { Prisma } from '@/generated/prisma';

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
  "verification",
  "sandbox_verify",
  "process_runner",
  "deploy_trigger",
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

  await prepareContextForExecution(context, userMessage ?? null, { streaming: false });

  const flowStartMs = Date.now();

  let __exec: { id: string } | null = null;
  try {
    __exec = await prisma.agentExecution.create({
      data: {
        agentId: context.agentId,
        status: 'RUNNING',
        ...(Object.keys(context.variables).length > 0 && {
          inputParams: context.variables as unknown as Prisma.InputJsonObject,
        }),
        ...(context._a2aTraceId && { traceId: context._a2aTraceId }),
        ...(context._parentExecutionId && { parentExecutionId: context._parentExecutionId }),
      },
    });
    context._currentExecutionId = __exec.id;
  } catch (e) {
    logger.warn('AgentExecution create failed (non-fatal)', { error: e });
  }

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
    // Loop and reflexive_loop nodes need higher visit threshold since they intentionally revisit.
    // In persistent mode, end nodes also get a higher threshold to allow re-routing.
    const isPersistent = context.variables.__persistent_mode === true;
    const maxVisits =
      node.type === "loop" || node.type === "reflexive_loop"
        ? 110
        : node.type === "end" && isPersistent
          ? 25
          : 5;
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
    const nodeStartMs = Date.now();
    emitHook(context, "beforeNodeExecute", {
      nodeId: node.id,
      nodeType: node.type,
    });
    try {
      result = await handler(node, context);
    } catch (error) {
      const durationMs = Date.now() - nodeStartMs;
      const errorMsg = error instanceof Error ? error.message : String(error);
      emitHook(context, "afterNodeExecute", {
        nodeId: node.id,
        nodeType: node.type,
        durationMs,
        error: errorMsg,
      });
      emitHook(context, "onFlowError", {
        nodeId: node.id,
        nodeType: node.type,
        error: errorMsg,
      });
      emitSessionEvent(context, "session.failed", {
        durationMs: Date.now() - flowStartMs,
        iterations,
        error: errorMsg,
        meta: { nodeId: node.id, nodeType: node.type },
      });
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
    emitHook(context, "afterNodeExecute", {
      nodeId: node.id,
      nodeType: node.type,
      durationMs: Date.now() - nodeStartMs,
    });

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
      emitSessionEvent(context, "session.blocked", {
        durationMs: Date.now() - flowStartMs,
        iterations,
        meta: { nodeId: node.id, nodeType: node.type },
      });
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
    emitSessionEvent(context, "session.timeout", {
      durationMs: Date.now() - flowStartMs,
      iterations,
    });
  }

  await saveMessages(context.conversationId, allMessages);
  await saveContext(context);

  // Emit session.finished (timeout already emitted above when applicable)
  if (!(iterations >= MAX_ITERATIONS)) {
    emitSessionEvent(context, "session.finished", {
      durationMs: Date.now() - flowStartMs,
      iterations,
      meta: { messageCount: allMessages.length },
    });
  }

  emitHook(context, "onFlowComplete", {
    meta: { iterations, messageCount: allMessages.length, streaming: false },
  });

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

  if (__exec?.id) {
    try {
      await prisma.agentExecution.update({
        where: { id: __exec.id },
        data: {
          status: iterations >= MAX_ITERATIONS ? 'TIMEOUT' : 'SUCCESS',
          ...(allMessages.length > 0 && {
            outputResult: { messages: allMessages } as unknown as Prisma.InputJsonObject,
          }),
          completedAt: new Date(),
          durationMs: Date.now() - flowStartMs,
        },
      });
    } catch (e) {
      logger.warn('AgentExecution update failed (non-fatal)', { error: e });
    }
  }

  return { messages: allMessages, waitingForInput: false };
}
