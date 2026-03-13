import type { NodeHandler, ExecutionResult, RuntimeContext, OutputMessage } from "../types";
import { getHandler } from "./index";
import { logger } from "@/lib/logger";
const MAX_BRANCHES = 5;

interface BranchConfig {
  /** Unique identifier for this branch */
  branchId: string;
  /** Label shown in the builder UI */
  label?: string;
  /** Variable to store this branch's output */
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
 * Execute a single branch subflow starting from the given startNodeId.
 * Runs nodes sequentially within the branch, collecting messages and variable updates.
 * Isolated from main context — operates on a copy of variables.
 */
async function executeBranch(
  startNodeId: string,
  context: RuntimeContext,
  branchId: string,
  timeoutMs: number
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
      messages.push({
        role: "assistant",
        content: `Branch "${branchId}" timed out.`,
      });
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

    const handler = getHandler(node.type);
    if (!handler) {
      break;
    }

    try {
      // Create an isolated context for this branch
      const branchContext: RuntimeContext = {
        ...context,
        variables: branchVariables,
        currentNodeId,
        messageHistory: [...context.messageHistory],
      };

      const result: ExecutionResult = await handler(node, branchContext);

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
        // Branch can't wait for user input — stop here
        break;
      }

      // Follow the edge to next node
      currentNodeId = result.nextNodeId ?? findNextEdge(context, node.id);
    } catch (error) {
      logger.error("Branch node handler error", error, {
        branchId,
        nodeId: node.id,
        nodeType: node.type,
      });
      messages.push({
        role: "assistant",
        content: `Error in branch "${branchId}": processing failed.`,
      });
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

export const parallelHandler: NodeHandler = async (node, context) => {
  const branches = (node.data.branches as BranchConfig[]) ?? [];
  const mergeStrategy = (node.data.mergeStrategy as "all" | "any") ?? "all";
  const timeoutSeconds = (node.data.timeoutSeconds as number) ?? 30;
  const timeoutMs = Math.min(timeoutSeconds * 1000, 120000); // Max 2 minutes

  if (branches.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Parallel node has no branches configured.",
        },
      ],
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

  // Find start node for each branch via sourceHandle
  const branchStarts = activeBranches.map((branch) => {
    const edge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === branch.branchId
    );
    return {
      ...branch,
      startNodeId: edge?.target ?? null,
    };
  });

  // Filter out branches with no connected start node
  const runnableBranches = branchStarts.filter((b) => b.startNodeId !== null);

  if (runnableBranches.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content: "No branches are connected in this parallel node.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // Execute all branches concurrently
  const branchPromises = runnableBranches.map((branch) =>
    executeBranch(
      branch.startNodeId as string,
      context,
      branch.branchId,
      timeoutMs
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

  // Collect all messages
  const allMessages: OutputMessage[] = [];
  const updatedVariables: Record<string, unknown> = {};

  // Store results per branch
  const branchResultMap: Record<string, unknown> = {};

  for (let i = 0; i < runnableBranches.length; i++) {
    const branch = runnableBranches[i];
    const result = branchResults[i];

    allMessages.push(...result.messages);

    // Store branch-specific output in its configured variable
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

  // Store overall parallel result
  updatedVariables["__parallel_result"] = {
    totalBranches: runnableBranches.length,
    succeeded: branchResults.filter((r) => r.status === "fulfilled").length,
    failed: branchResults.filter((r) => r.status === "rejected").length,
    branches: branchResultMap,
  };

  // Check merge strategy
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

  // Route to "done" exit
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
};
