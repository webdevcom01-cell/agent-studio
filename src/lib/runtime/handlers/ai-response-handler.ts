import { generateText } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

export const aiResponseHandler: NodeHandler = async (node, context) => {
  const prompt = resolveTemplate(
    (node.data.prompt as string) ?? "",
    context.variables
  );
  const modelId = (node.data.model as string) ?? DEFAULT_MODEL;
  const temperature = (node.data.temperature as number) ?? 0.7;
  const maxTokens = (node.data.maxTokens as number) ?? 500;
  const outputVariable = (node.data.outputVariable as string) ?? "";

  try {
    const model = getModel(modelId);

    const systemMessages = prompt
      ? [{ role: "system" as const, content: prompt }]
      : [];

    const historyMessages = context.messageHistory.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const result = await generateText({
      model,
      messages: [...systemMessages, ...historyMessages],
      temperature,
      maxOutputTokens: maxTokens,
    });

    const responseText = result.text || "I couldn't generate a response.";

    return {
      messages: [{ role: "assistant", content: responseText }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable
        ? { [outputVariable]: responseText }
        : undefined,
    };
  } catch (error) {
    console.error("AI Response error:", error);
    return {
      messages: [
        {
          role: "assistant",
          content: "I'm having trouble generating a response right now. Let me continue.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }
};
