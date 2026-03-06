import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

export const setVariableHandler: NodeHandler = async (node, context) => {
  const variableName = (node.data.variableName as string) ?? "";
  const rawValue = (node.data.value as string) ?? "";

  const resolvedValue = resolveTemplate(rawValue, context.variables);

  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: variableName ? { [variableName]: resolvedValue } : undefined,
  };
};
