import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

export const messageHandler: NodeHandler = async (node, context) => {
  const message = resolveTemplate(
    (node.data.message as string) ?? "",
    context.variables
  );

  return {
    messages: message ? [{ role: "assistant", content: message }] : [],
    nextNodeId: null,
    waitForInput: false,
  };
};
