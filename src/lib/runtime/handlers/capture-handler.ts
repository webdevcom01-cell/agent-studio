import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

export const captureHandler: NodeHandler = async (node, context) => {
  const variableName = (node.data.variableName as string) ?? "";
  const prompt = resolveTemplate(
    (node.data.prompt as string) ?? "",
    context.variables
  );
  const validationType = (node.data.validationType as string) ?? "text";
  const fallbackNodeId = (node.data.fallbackNodeId as string) ?? null;

  const retryCountKey = `__retry_count_${node.id}`;
  const retryCount = (context.variables[retryCountKey] as number) ?? 0;

  const lastUserMsg = context.isResuming
    ? context.messageHistory.filter((m) => m.role === "user").pop()
    : undefined;

  if (lastUserMsg && variableName) {
    const input = lastUserMsg.content;

    let validationFailed = false;
    let errorMessage = "";

    if (validationType === "number" && isNaN(Number(input))) {
      validationFailed = true;
      errorMessage = "Please enter a valid number.";
    } else if (validationType === "email" && !input.includes("@")) {
      validationFailed = true;
      errorMessage = "Please enter a valid email address.";
    }

    if (validationFailed) {
      if (retryCount >= 3) {
        if (fallbackNodeId) {
          return {
            messages: [{ role: "assistant", content: "Let me try something else." }],
            nextNodeId: fallbackNodeId,
            waitForInput: false,
            updatedVariables: { [retryCountKey]: 0 },
          };
        }
        return {
          messages: [{ role: "assistant", content: "Could not capture valid input. Moving on." }],
          nextNodeId: null,
          waitForInput: false,
        };
      }

      context.variables[retryCountKey] = retryCount + 1;
      return {
        messages: [{ role: "assistant", content: errorMessage }],
        nextNodeId: null,
        waitForInput: true,
      };
    }

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        [variableName]: validationType === "number" ? Number(input) : input,
        [retryCountKey]: 0,
      },
    };
  }

  return {
    messages: prompt ? [{ role: "assistant", content: prompt }] : [],
    nextNodeId: null,
    waitForInput: true,
  };
};
