import type { NodeHandler } from "../types";

export const waitHandler: NodeHandler = async (node) => {
  const durationSeconds = (node.data.duration as number) ?? 1;
  await new Promise((resolve) => setTimeout(resolve, Math.min(durationSeconds * 1000, 5000)));

  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
  };
};
