import type { NodeHandler } from "../types";
import { getHandler } from "./index";
import type { FlowNode, FlowContent } from "@/types";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * retry — Exponential backoff wrapper for any child node.
 * Executes the target node, retries on failure with configurable backoff.
 */
export const retryHandler: NodeHandler = async (node, context) => {
  const targetNodeId = (node.data.targetNodeId as string) ?? "";
  const maxRetries =
    (node.data.maxRetries as number) ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs =
    (node.data.baseDelayMs as number) ?? DEFAULT_BASE_DELAY_MS;
  const outputVariable = (node.data.outputVariable as string) || "";

  if (!targetNodeId) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Retry node has no target node configured.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const targetNode = findNode(targetNodeId, context.flowContent);
  if (!targetNode) {
    return {
      messages: [
        {
          role: "assistant",
          content: `Retry: target node "${targetNodeId}" not found.`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const handler = getHandler(targetNode.type);
  if (!handler) {
    return {
      messages: [
        {
          role: "assistant",
          content: `Retry: no handler for node type "${targetNode.type}".`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await handler(targetNode, context);

      const hasError = result.updatedVariables
        ? Object.values(result.updatedVariables).some(
            (v) => typeof v === "string" && v.startsWith("[Error:"),
          )
        : false;

      if (!hasError) {
        const retryMeta = outputVariable
          ? { [`${outputVariable}_attempts`]: attempt + 1 }
          : {};

        return {
          ...result,
          updatedVariables: {
            ...context.variables,
            ...result.updatedVariables,
            ...retryMeta,
          },
        };
      }

      lastError = "Node returned an error result";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.round(delayMs * (Math.random() * 0.5 - 0.25));
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }

  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      ...(outputVariable
        ? {
            [outputVariable]: `[Error: Failed after ${maxRetries + 1} attempts: ${lastError}]`,
            [`${outputVariable}_attempts`]: maxRetries + 1,
          }
        : {}),
    },
  };
};

function findNode(
  nodeId: string,
  flowContent: FlowContent,
): FlowNode | undefined {
  return flowContent.nodes.find((n) => n.id === nodeId);
}
