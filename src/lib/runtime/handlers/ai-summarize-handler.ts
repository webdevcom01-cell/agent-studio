import { generateText } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import type { NodeHandler } from "../types";

export const aiSummarizeHandler: NodeHandler = async (node, context) => {
  const modelId = (node.data.model as string) ?? DEFAULT_MODEL;
  const outputVariable = (node.data.outputVariable as string) ?? "summary";
  const maxLength = (node.data.maxLength as number) ?? 200;

  const conversationText = context.messageHistory
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  if (!conversationText.trim()) {
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: "" },
    };
  }

  try {
    const model = getModel(modelId);

    const prompt = `Summarize the following conversation in ${maxLength} characters or less. Be concise.

Conversation:
${conversationText}

Summary:`;

    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      maxOutputTokens: Math.ceil(maxLength / 2),
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: result.text.trim() },
    };
  } catch (error) {
    console.error("AI Summarize error:", error);
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: { [outputVariable]: "" },
    };
  }
};
