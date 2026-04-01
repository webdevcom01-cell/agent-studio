import type { RuntimeContext, ExecutionResult, OutputMessage } from "./types";
import {
  debugEmitNodeStart,
  debugEmitNodeEnd,
  debugEmitEdge,
  debugEmit,
  sanitizeVariables,
} from "./types";
import { getHandler } from "./handlers";
import { saveContext, saveMessages } from "./context";
import { findNextNode, findStartNode, SELF_ROUTING_NODES, resolveNextNodeId } from "./engine";
import { createStreamWriter } from "./stream-protocol";
import { aiResponseStreamingHandler } from "./handlers/ai-response-streaming-handler";
import { parallelStreamingHandler } from "./handlers/parallel-streaming-handler";
import {
  initDebugSession,
  waitForDebugResume,
  cleanupDebugSession,
  getAndClearVariableOverrides,
} from "./debug-controller";
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
  // Shared AbortController so cancel() can unblock waitForDebugResume()
  const streamAbortController = new AbortController();

  return new ReadableStream<Uint8Array>({
    cancel() {
      aborted = true;
      streamAbortController.abort();
      logger.info("Stream cancelled by client", { conversationId: context.conversationId });
    },
    async start(controller) {
      const writer = createStreamWriter(controller);
      const allMessages: OutputMessage[] = [];
      let iterations = 0;
      const visitedNodes = new Map<string, number>();
      const nodeMap = new Map(context.flowContent.nodes.map((n) => [n.id, n]));

      // Debug: track execution path and stats
      const executionPath: string[] = [];
      let nodesFailed = 0;
      const flowStartMs = Date.now();
      // Step mode: when true, pause at the NEXT node regardless of breakpoints
      let stepMode = false;

      // Propagate abort signal so sub-agent tool calls can be cancelled on Stop
      context.abortSignal = streamAbortController.signal;

      try {
        // Init debug session in Redis if breakpoints are configured
        if (context.debugMode && context.debugSessionId && (context.breakpoints?.size ?? 0) > 0) {
          await initDebugSession(context.debugSessionId);
        }

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

          const nodeName = (node.data?.label as string) || node.data?.name as string || node.type;
          const iteration = visitCount + 1;

          // ── Breakpoint check (Phase 6) ───────────────────────────────────
          const isBreakpoint = context.debugMode &&
            context.debugSessionId &&
            (context.breakpoints?.has(node.id) || stepMode);

          if (isBreakpoint) {
            stepMode = false; // reset; will be re-enabled if user sends "step"

            // Emit the pause event so the client can show the paused state
            writer.write({
              type: "debug_breakpoint_hit",
              nodeId: node.id,
              nodeType: node.type,
              nodeName,
              variables: sanitizeVariables(context.variables),
              debugSessionId: context.debugSessionId!,
            });

            // Block until Continue / Step / Stop (or 60s timeout)
            const command = await waitForDebugResume(
              context.debugSessionId!,
              streamAbortController.signal
            );

            if (command === "stop" || aborted) {
              aborted = true;
              break;
            }

            if (command === "step") {
              stepMode = true; // pause at the next node after this one
            }

            // Apply any variable overrides the user set while paused (Phase 7)
            const overrides = await getAndClearVariableOverrides(context.debugSessionId!);
            if (overrides && Object.keys(overrides).length > 0) {
              Object.assign(context.variables, overrides);
              // Emit updated variables so client Watch panel refreshes
              writer.write({
                type: "debug_variables_updated",
                variables: sanitizeVariables(context.variables),
              });
            }

            writer.write({
              type: "debug_resumed",
              nodeId: node.id,
              action: command,
            });
          }

          // ── Debug: node start ────────────────────────────────────────────
          const nodeStartMs = Date.now();
          debugEmitNodeStart(writer, context, node.id, node.type, nodeName, iteration);
          executionPath.push(node.id);

          let result: ExecutionResult;

          // ── Codepath 1: ai_response ──────────────────────────────────────
          // NOTE: all writer.write() calls are wrapped in try/catch so a cancelled
          // stream (client disconnect) never prevents allMessages from being populated
          // and saved to the DB in the finally block.
          if (node.type === "ai_response") {
            try {
              result = await aiResponseStreamingHandler(
                node,
                context,
                writer
              );
              try {
                debugEmitNodeEnd(writer, context, node.id, "success", Date.now() - nodeStartMs,
                  result.messages[0]?.content);
              } catch { /* stream closed by client */ }
            } catch (error) {
              logger.error("AI streaming handler error", error, { agentId: context.agentId, nodeId: node.id });
              nodesFailed++;
              try {
                debugEmitNodeEnd(writer, context, node.id, "error", Date.now() - nodeStartMs,
                  undefined, error instanceof Error ? error.message : String(error));
              } catch { /* stream closed by client */ }
              const nodeLabel = nodeName ? `"${nodeName}"` : `node [${node.type}]`;
              const isTimeout = error instanceof Error && error.message.toLowerCase().includes("timeout");
              const errorDetail = isTimeout
                ? `${nodeLabel} timed out after ${Math.round((Date.now() - nodeStartMs) / 1000)}s`
                : nodeLabel;
              const msg: OutputMessage = {
                role: "assistant",
                content: `There was an issue with ${errorDetail}. Continuing with the remaining steps.`,
              };
              allMessages.push(msg);
              try { writer.write({ type: "error", content: msg.content }); } catch { /* stream closed */ }
              context.currentNodeId = resolveNextNodeId(
                { nextNodeId: null }, node.id, node.type,
                context.flowContent.edges, nodeMap,
              );
              continue;
            }
          // ── Codepath 2: parallel ─────────────────────────────────────────
          } else if (node.type === "parallel") {
            try {
              try { writer.write({ type: "heartbeat" }); } catch { /* stream closed */ }
              result = await parallelStreamingHandler(node, context, writer);
              try {
                debugEmitNodeEnd(writer, context, node.id, "success", Date.now() - nodeStartMs);
              } catch { /* stream closed by client */ }
            } catch (error) {
              logger.error("Parallel streaming handler error", error, { agentId: context.agentId, nodeId: node.id });
              nodesFailed++;
              try {
                debugEmitNodeEnd(writer, context, node.id, "error", Date.now() - nodeStartMs,
                  undefined, error instanceof Error ? error.message : String(error));
              } catch { /* stream closed by client */ }
              const msg: OutputMessage = {
                role: "assistant",
                content: `There was an issue with the parallel step${nodeName ? ` "${nodeName}"` : ""}. Continuing with remaining steps.`,
              };
              allMessages.push(msg);
              try { writer.write({ type: "error", content: msg.content }); } catch { /* stream closed */ }
              context.currentNodeId = null; // parallel manages its own routing — stop on error
              continue;
            }
          // ── Codepath 3: all other handlers ───────────────────────────────
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
              debugEmitNodeEnd(writer, context, node.id, "skipped", Date.now() - nodeStartMs);
              context.currentNodeId = resolveNextNodeId(
                { nextNodeId: null }, node.id, node.type,
                context.flowContent.edges, nodeMap,
              );
              continue;
            }

            try {
              // For long-running nodes (e.g. MCP tools), send heartbeats
              const isLongRunning = node.type === "mcp_tool";
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

              debugEmitNodeEnd(writer, context, node.id, "success", Date.now() - nodeStartMs,
                result.messages[0]?.content);
            } catch (error) {
              logger.error("Node handler error", error, { agentId: context.agentId, nodeType: node.type, nodeId: node.id });
              nodesFailed++;
              debugEmitNodeEnd(writer, context, node.id, "error", Date.now() - nodeStartMs,
                undefined, error instanceof Error ? error.message : String(error));
              const nodeLabel = nodeName ? `"${nodeName}"` : `a [${node.type}] step`;
              const msg: OutputMessage = {
                role: "assistant",
                content: `There was an issue with ${nodeLabel}. Continuing with remaining steps.`,
              };
              allMessages.push(msg);
              writer.write({
                type: "message",
                role: msg.role,
                content: msg.content,
              });
              context.currentNodeId = resolveNextNodeId(
                { nextNodeId: null }, node.id, node.type,
                context.flowContent.edges, nodeMap,
              );
              continue;
            }

            for (const msg of result.messages) {
              try {
                writer.write({
                  type: "message",
                  role: msg.role,
                  content: msg.content,
                  ...(msg.metadata ? { metadata: msg.metadata } : {}),
                });
              } catch {
                // stream closed by client — messages still pushed to allMessages below
              }
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
            // Debug: waiting for input status on current node
            debugEmit(writer, context, {
              type: "debug_node_start",
              nodeId: result.nextNodeId ?? node.id,
              nodeType: node.type,
              nodeName: nodeName,
              iteration,
              timestamp: Date.now(),
              variables: {},
            });
            waitingForInput = true;
            break;
          }

          // ── Resolve next node + emit edge taken ──────────────────────────
          const nextNodeId = resolveNextNodeId(
            result, node.id, node.type,
            context.flowContent.edges, nodeMap,
          );

          if (nextNodeId) {
            debugEmitEdge(writer, context, node.id, nextNodeId);
          }

          context.currentNodeId = nextNodeId;
        }

        if (iterations >= MAX_ITERATIONS && context.currentNodeId) {
          logger.warn("Flow reached max iterations", { agentId: context.agentId, iterations });
          const msg: OutputMessage = {
            role: "assistant",
            content: "This conversation has reached its processing limit. Please start a new conversation.",
          };
          allMessages.push(msg);
          try { writer.write({ type: "message", role: msg.role, content: msg.content }); } catch { /* stream closed */ }
          context.currentNodeId = null;
        }

        // ── Debug: flow summary ────────────────────────────────────────────
        try {
          debugEmit(writer, context, {
            type: "debug_flow_summary",
            totalDurationMs: Date.now() - flowStartMs,
            nodesExecuted: executionPath.length,
            nodesFailed,
            executionPath,
            otelTraceId: context.otelTraceId,
          });
        } catch { /* stream closed by client */ }

        try {
          writer.write({
            type: "done",
            conversationId: context.conversationId,
            waitForInput: waitingForInput,
          });
        } catch { /* stream closed by client */ }
      } finally {
        // Cleanup debug session in Redis (fire-and-forget)
        if (context.debugSessionId) {
          void cleanupDebugSession(context.debugSessionId).catch(() => {});
        }
        try { await saveMessages(context.conversationId, allMessages); } catch (err) { logger.error("Failed to save messages", err, { conversationId: context.conversationId }); }
        // If client disconnected (aborted) while engine was still running, mark as ABANDONED
        const statusOverride = aborted && context.currentNodeId
          ? { forceStatus: "ABANDONED" as const }
          : undefined;
        try { await saveContext(context, statusOverride); } catch (err) { logger.error("Failed to save context", err, { conversationId: context.conversationId }); }
        try { writer.close(); } catch { /* stream already closed */ }
      }
    },
  });
}
