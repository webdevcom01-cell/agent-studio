import type { NodeHandler } from "../types";

export const gotoHandler: NodeHandler = async (node, context) => {
  const targetNodeId = (node.data.targetNodeId as string) ?? null;

  if (!targetNodeId) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const targetExists = context.flowContent.nodes.some((n) => n.id === targetNodeId);
  if (!targetExists) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  return { messages: [], nextNodeId: targetNodeId, waitForInput: false };
};
