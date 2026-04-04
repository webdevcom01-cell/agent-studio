import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

export const endHandler: NodeHandler = async (node, context) => {
  const message = resolveTemplate(
    (node.data.message as string) ?? "",
    context.variables
  );

  // Persistent mode: if the verifier hasn't confirmed, route back to the
  // reflexive_loop node instead of terminating the flow.
  const persistentMode = context.variables.__persistent_mode === true;
  const verifierConfirmed = context.variables.__verifier_confirmed === true;
  const returnNodeId = context.variables.__persistent_return_node as string | undefined;

  if (persistentMode && !verifierConfirmed && returnNodeId) {
    logger.info("End node: persistent mode — routing back to reflexive loop", {
      agentId: context.agentId,
      returnNodeId,
    });

    return {
      messages: message ? [{ role: "assistant", content: message }] : [],
      nextNodeId: returnNodeId,
      waitForInput: false,
    };
  }

  return {
    messages: message ? [{ role: "assistant", content: message }] : [],
    nextNodeId: null,
    waitForInput: false,
  };
};
