import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

interface ButtonOption {
  id: string;
  label: string;
  value: string;
}

export const buttonHandler: NodeHandler = async (node, context) => {
  const buttons = (node.data.buttons as ButtonOption[]) ?? [];
  const message = resolveTemplate(
    (node.data.message as string) ?? "",
    context.variables
  );
  const variableName = (node.data.variableName as string) || `${node.id}_selection`;

  const visitCountKey = `__visit_count_${node.id}`;
  const visitCount = (context.variables[visitCountKey] as number) ?? 0;

  if (visitCount > 3) {
    return {
      messages: [{ role: "assistant", content: "I seem to be stuck. Let me end here." }],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  context.variables[visitCountKey] = visitCount + 1;

  const lastUserMsg = context.isResuming
    ? context.messageHistory.filter((m) => m.role === "user").pop()
    : undefined;

  if (lastUserMsg) {
    const matched = buttons.find(
      (b) => b.value === lastUserMsg.content || b.label === lastUserMsg.content
    );
    const handleId = matched?.id ?? "else";

    const edge = context.flowContent.edges.find(
      (e) => e.source === node.id && e.sourceHandle === handleId
    );
    const defaultEdge = context.flowContent.edges.find(
      (e) => e.source === node.id && !e.sourceHandle
    );

    return {
      messages: [],
      nextNodeId: edge?.target ?? defaultEdge?.target ?? null,
      waitForInput: false,
      updatedVariables: matched ? { [variableName]: matched.value } : undefined,
    };
  }

  const buttonLabels = buttons.map((b) => b.label).join(", ");
  const fullMessage = message
    ? `${message}\n\nOptions: ${buttonLabels}`
    : `Choose: ${buttonLabels}`;

  return {
    messages: [
      {
        role: "assistant",
        content: fullMessage,
        metadata: { buttons: buttons.map((b) => ({ label: b.label, value: b.value })) },
      },
    ],
    nextNodeId: null,
    waitForInput: true,
  };
};
