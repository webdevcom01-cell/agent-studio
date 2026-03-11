import type { RuntimeContext, ExecutionResult, OutputMessage } from "./types";
import { getHandler } from "./handlers";
import { saveContext, saveMessages } from "./context";
import { findNextNode, findStartNode } from "./engine";
import { createStreamWriter } from "./stream-protocol";
import { aiResponseStreamingHandler } from "./handlers/ai-response-streaming-handler";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_ITERATIONS = 50;
const MAX_HISTORY = 100;
const MAX_NODE_VISITS = 5;

export function executeFlowStreaming(
  context: RuntimeContext,
  userMessage?: string
): ReadableStream<Uint8Array> {
  let aborted = false;

  return new ReadableStream<Uint8Array>({
    cancel() {
      aborted = true;
      logger.info("Stream cancelled by client", { conversationId: context.conversationId });
    },
    async start(controller) {
      const writer = createStreamWriter(controller);
      const allMessages: OutputMessage[] = [];
      let iterations = 0;
      const visitedNodes = new Map<string, number>();
      const nodeMap = new Map(context.flowContent.nodes.map((n) => [n.id, n]));

      try {
        const isResuming = !!context.currentNodeId && !!userMessage;
        context.isResuming = isResuming;

        if (!context.currentNodeId) {
          const startNode = findStartNode(context);
          if (!startNode) {
            const msg: OutputMessage = {
              role: "assistant",
              content: "This flow is empty.",
            };
            allMessages.push(msg);
            writer.write({
              type: "message",
              role: msg.role,
              content: msg.content,
            });
            writer.write({
              type: "done",
              conversationId: context.conversationId,
              waitForInput: false,
            });
            writer.close();
            await saveMessages(context.conversationId, allMessages);
            await saveContext(context);
            return;
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

        if (context.messageHistory.length > MAX_HISTORY) {
          context.messageHistory = context.messageHistory.slice(-MAX_HISTORY);
        }

        let waitingForInput = false;

        while (context.currentNodeId && iterations < MAX_ITERATIONS && !aborted) {
          iterations++;

          const node = nodeMap.get(context.currentNodeId!);

          if (!node) {
            const msg: OutputMessage = {
              role: "assistant",
              content:
                "I encountered an error in the flow. Please try again.",
            };
            allMessages.push(msg);
            writer.write({
              type: "message",
              role: msg.role,
              content: msg.content,
            });
            context.currentNodeId = null;
            break;
          }

          const visitCount = visitedNodes.get(node.id) ?? 0;
          // Loop nodes need higher visit threshold since they intentionally revisit
          const maxVisitsForNode = node.type === "loop" ? 110 : MAX_NODE_VISITS;
          if (visitCount > maxVisitsForNode) {
            const msg: OutputMessage = {
              role: "assistant",
              content:
                "I seem to be stuck in a loop. Let me end this conversation.",
            };
            allMessages.push(msg);
            writer.write({
              type: "message",
              role: msg.role,
              content: msg.content,
            });
            context.currentNodeId = null;
            break;
          }
          visitedNodes.set(node.id, visitCount + 1);

          let result: ExecutionResult;

          if (node.type === "ai_response") {
            try {
              result = await aiResponseStreamingHandler(
                node,
                context,
                writer
              );
            } catch (error) {
              logger.error("AI streaming handler error", error, { agentId: context.agentId, nodeId: node.id });
              const msg: OutputMessage = {
                role: "assistant",
                content: "Something went wrong. Let me try to continue.",
              };
              allMessages.push(msg);
              writer.write({ type: "error", content: msg.content });
              context.currentNodeId = findNextNode(context, node.id);
              continue;
            }
          } else {
            const handler = getHandler(node.type);
            if (!handler) {
              const msg: OutputMessage = {
                role: "assistant",
                content: `Unsupported node type: ${node.type}`,
              };
              allMessages.push(msg);
              writer.write({
                type: "message",
                role: msg.role,
                content: msg.content,
              });
              context.currentNodeId = findNextNode(context, node.id);
              continue;
            }

            try {
              // For long-running nodes (e.g. MCP tools), send heartbeats
              // to keep the Vercel streaming connection alive
              const isLongRunning = node.type === "mcp_tool" || node.type === "parallel";
              let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

              if (isLongRunning) {
                writer.write({ type: "heartbeat" });
                heartbeatTimer = setInterval(() => {
                  try {
                    writer.write({ type: "heartbeat" });
                  } catch {
                    // stream already closed
                  }
                }, 5000);
              }

              try {
                result = await handler(node, context);
              } finally {
                if (heartbeatTimer) clearInterval(heartbeatTimer);
              }
            } catch (error) {
              logger.error("Node handler error", error, { agentId: context.agentId, nodeType: node.type, nodeId: node.id });
              const msg: OutputMessage = {
                role: "assistant",
                content: "Something went wrong. Let me try to continue.",
              };
              allMessages.push(msg);
              writer.write({
                type: "message",
                role: msg.role,
                content: msg.content,
              });
              context.currentNodeId = findNextNode(context, node.id);
              continue;
            }

            for (const msg of result.messages) {
              writer.write({
                type: "message",
                role: msg.role,
                content: msg.content,
              });
            }
          }

          if (context.isResuming) {
            context.isResuming = false;
          }

          allMessages.push(...result.messages);

          if (result.updatedVariables) {
            context.variables = {
              ...context.variables,
              ...result.updatedVariables,
            };
          }

          for (const msg of result.messages) {
            context.messageHistory.push({
              role: msg.role,
              content: msg.content,
            });
          }

          if (result.waitForInput) {
            if (result.nextNodeId) {
              context.currentNodeId = result.nextNodeId;
            }
            waitingForInput = true;
            break;
          }

          if (result.nextNodeId && nodeMap.has(result.nextNodeId)) {
            // Direct node ID (e.g., goto, loop back)
            context.currentNodeId = result.nextNodeId;
          } else if (result.nextNodeId) {
            // Treat as sourceHandle (e.g., switch "case_0", evaluator "passed"/"failed")
            context.currentNodeId = findNextNode(context, node.id, result.nextNodeId);
          } else {
            // Default: follow the first unfiltered edge
            context.currentNodeId = findNextNode(context, node.id);
          }
        }

        if (iterations >= MAX_ITERATIONS && context.currentNodeId) {
          logger.warn("Flow reached max iterations", { agentId: context.agentId, iterations });
          const msg: OutputMessage = {
            role: "assistant",
            content: "This conversation has reached its processing limit. Please start a new conversation.",
          };
          allMessages.push(msg);
          writer.write({ type: "message", role: msg.role, content: msg.content });
          context.currentNodeId = null;
        }

        writer.write({
          type: "done",
          conversationId: context.conversationId,
          waitForInput: waitingForInput,
        });
      } finally {
        try { await saveMessages(context.conversationId, allMessages); } catch (err) { logger.error("Failed to save messages", err, { conversationId: context.conversationId }); }
        try { await saveContext(context); } catch (err) { logger.error("Failed to save context", err, { conversationId: context.conversationId }); }
        try { writer.close(); } catch { /* stream already closed */ }
      }
    },
  });
}
