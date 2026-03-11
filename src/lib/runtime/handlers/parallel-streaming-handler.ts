import type { ExecutionResult, RuntimeContext, OutputMessage, StreamWriter } from "../types";
import { getHandler } from "./index";
import { aiResponseStreamingHandler } from "./ai-response-streaming-handler";
import { logger } from "@/lib/logger";
import type { FlowNode } from "@/types";

const MAX_BRANCHES = 5;
const DEFAULT_TIMEOUT_MS = 30000;

interface BranchConfig {
  branchId: string;
  label?: string;
  outputVariable: string;
}

interface BranchResult {
  branchId: string;
  status: "fulfilled" | "rejected";
  messages: OutputMessage[];
  variables: Record<string, unknown>;
  error?: string;
}

/**
 * Execute a single branch subflow with streaming support.
 * When a branch encounters an ai_response node, it uses the streaming handler
 * to emit tokens in real-time. Other node messages are emitted immediately via writer.
 */
async function executeBranchStreaming(
  startNodeId: string,
  context: RuntimeContext,
  branchId: string,
  timeoutMs: number,
  writer: StreamWriter
): Promise<{ messages: OutputMessage[]; variables: Record<string, unknown> }> {
  const messages: OutputMessage[] = [];
  const branchVariables = { ...context.variables };
  const nodeMap = new Map(context.flowContent.nodes.map((n) => [n.id, n]));
  const MAX_BRANCH_ITERATIONS = 25;
  let iterations = 0;
  let currentNodeId: string | null = startNodeId;

  const deadline = Date.now() + timeoutMs;

  while (currentNodeId && iterations < MAX_BRANCH_ITERATIONS) {
    if (Date.now() > deadline) {
      logger.warn("Branch execution timeout", {
        branchId,
        agentId: context.agentId,
        iterations,
      });
      const msg: OutputMessage = {
        role: "assistant",
        content: `Branch "${branchId}" timed out.`,
      };
      messages.push(msg);
      writer.write({ type: "message", role: msg.role, content: msg.content });
      break;
    }

    iterations++;
    const node = nodeMap.get(currentNodeId);

    if (!node) {
      break;
    }

    // Don't recurse into parallel or loop nodes within branches
    if (node.type === "parallel" || node.type === "end") {
      break;
    }

    // Create an isolated context for this branch
    const branchContext: RuntimeContext = {
      ...context,
      variables: branchVariables,
      currentNodeId,
      messageHistory: [...context.messageHistory],
    };

    try {
      let result: ExecutionResult;

      if (node.type === "ai_response") {
        // Use streaming handler for AI nodes — emits tokens in real-time
        result = await aiResponseStreamingHandler(node, branchContext, writer);
      } else {
        const handler = getHandler(node.type);
        if (!handler) {
          break;
        }
        result = await handler(node, branchContext);

        // Emit non-AI messages immediately to the stream
        for (const msg of result.messages) {
          writer.write({ type: "message", role: msg.role, content: msg.content });
        }
      }

      messages.push(...result.messages);

      if (result.updatedVariables) {
        Object.assign(branchVariables, result.updatedVariables);
      }

      for (const msg of result.messages) {
        branchContext.messageHistory.push({
          role: msg.role,
          content: msg.content,
        });
      }

      if (result.waitForInput) {
        break;
      }

      currentNodeId = result.nextNodeId ?? findNextEdge(context, node.id);
    } catch (error) {
      logger.error("Branch node handler error", error, {
        branchId,
        nodeId: node.id,
        nodeType: node.type,
      });
      const msg: OutputMessage = {
        role: "assistant",
        content: `Error in branch "${branchId}": processing failed.`,
      };
      messages.push(msg);
      writer.write({ type: "message", role: msg.role, content: msg.content });
      break;
    }
  }

  return { messages, variables: branchVariables };
}

function findNextEdge(context: RuntimeContext, sourceNodeId: string): string | null {
  const edge = context.flowContent.edges.find(
    (e) => e.source === sourceNodeId && !e.sourceHandle
  );
  return edge?.target ?? null;
}

/**
 * Streaming-aware parallel handler. Used by engine-streaming.ts to enable
 * real-time token streaming from ai_response nodes within parallel branches.
 * Messages from non-AI nodes are also emitted immediately.
 *
 * Note: Multiple branches run concurrently and may interleave their stream output.
 * Each write is atomic (one NDJSON line), so this is safe for the protocol.
 */
export async function parallelStreamingHandler(
  node: FlowNode,
  context: RuntimeContext,
  writer: StreamWriter
): Promise<ExecutionResult> {
  const branches = (node.data.branches as BranchConfig[]) ?? [];
  const mergeStrategy = (node.data.mergeStrategy as "all" | "any") ?? "all";
  const timeoutSeconds = (node.data.timeoutSeconds as number) ?? 30;
  const timeoutMs = Math.min(timeoutSeconds * 1000, 120000);

  if (branches.length === 0) {
    const msg: OutputMessage = {
      role: "assistant",
      content: "Parallel node has no branches configured.",
    };
    writer.write({ type: "message", role: msg.role, content: msg.content });
    return {
      messages: [msg],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  if (branches.length > MAX_BRANCHES) {
    logger.warn("Too many parallel branches", {
      nodeId: node.id,
      count: branches.length,
      max: MAX_BRANCHES,
    });
  }

  const activeBranches = branches.slice(0, MAX_BRANCHES);

  const branchStarts = activeBranches.map((branch) => {
    const edge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === branch.branchId
    );
    return {
      ...branch,
      startNodeId: edge?.target ?? null,
    };
  });

  const runnableBranches = branchStarts.filter((b) => b.startNodeId !== null);

  if (runnableBranches.length === 0) {
    const msg: OutputMessage = {
      role: "assistant",
      content: "No branches are connected in this parallel node.",
    };
    writer.write({ type: "message", role: msg.role, content: msg.content });
    return {
      messages: [msg],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // Execute all branches concurrently with streaming support
  const branchPromises = runnableBranches.map((branch) =>
    executeBranchStreaming(
      branch.startNodeId as string,
      context,
      branch.branchId,
      timeoutMs,
      writer
    )
      .then(
        (result): BranchResult => ({
          branchId: branch.branchId,
          status: "fulfilled",
          messages: result.messages,
          variables: result.variables,
        })
      )
      .catch(
        (error): BranchResult => ({
          branchId: branch.branchId,
          status: "rejected",
          messages: [
            {
              role: "assistant",
              content: `Branch "${branch.branchId}" failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          variables: {},
          error: error instanceof Error ? error.message : "Unknown error",
        })
      )
  );

  const results = await Promise.allSettled(branchPromises);
  const branchResults: BranchResult[] = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          branchId: "unknown",
          status: "rejected" as const,
          messages: [{ role: "assistant" as const, content: "Branch execution failed." }],
          variables: {},
          error: r.reason instanceof Error ? r.reason.message : "Unknown error",
        }
  );

  // Collect all messages (already streamed, but needed for ExecutionResult)
  const allMessages: OutputMessage[] = [];
  const updatedVariables: Record<string, unknown> = {};
  const branchResultMap: Record<string, unknown> = {};

  for (let i = 0; i < runnableBranches.length; i++) {
    const branch = runnableBranches[i];
    const result = branchResults[i];

    allMessages.push(...result.messages);

    if (branch.outputVariable) {
      updatedVariables[branch.outputVariable] = {
        status: result.status,
        messages: result.messages.map((m) => m.content),
        variables: result.variables,
        error: result.error,
      };
    }

    branchResultMap[branch.branchId] = {
      status: result.status,
      messageCount: result.messages.length,
      error: result.error,
    };
  }

  updatedVariables["__parallel_result"] = {
    totalBranches: runnableBranches.length,
    succeeded: branchResults.filter((r) => r.status === "fulfilled").length,
    failed: branchResults.filter((r) => r.status === "rejected").length,
    branches: branchResultMap,
  };

  const allSucceeded = branchResults.every((r) => r.status === "fulfilled");
  const anySucceeded = branchResults.some((r) => r.status === "fulfilled");

  if (mergeStrategy === "all" && !allSucceeded) {
    const failedEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === "failed"
    );
    if (failedEdge) {
      return {
        messages: allMessages,
        nextNodeId: failedEdge.target,
        waitForInput: false,
        updatedVariables,
      };
    }
  }

  if (mergeStrategy === "any" && !anySucceeded) {
    const failedEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === "failed"
    );
    if (failedEdge) {
      return {
        messages: allMessages,
        nextNodeId: failedEdge.target,
        waitForInput: false,
        updatedVariables,
      };
    }
  }

  const doneEdge = context.flowContent.edges.find(
    (e) => e.source === node.id && e.sourceHandle === "done"
  );
  const defaultEdge = context.flowContent.edges.find(
    (e) => e.source === node.id && !e.sourceHandle
  );

  return {
    messages: allMessages,
    nextNodeId: doneEdge?.target ?? defaultEdge?.target ?? null,
    waitForInput: false,
    updatedVariables,
  };
}
