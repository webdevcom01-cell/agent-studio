import { generateText } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { NodeHandler } from "../types";

interface ExtractField {
  name: string;
  description: string;
  type: "string" | "number" | "boolean";
}

export const aiExtractHandler: NodeHandler = async (node, context) => {
  const fields = (node.data.fields as ExtractField[]) ?? [];
  const modelId = (node.data.model as string) ?? DEFAULT_MODEL;

  if (fields.length === 0) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const conversationText = context.messageHistory
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  if (!conversationText.trim()) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  try {
    const model = getModel(modelId);

    const fieldDescriptions = fields
      .map((f) => `- ${f.name} (${f.type}): ${f.description}`)
      .join("\n");

    const prompt = `Extract the following information from this conversation:

${fieldDescriptions}

Conversation:
${conversationText}

Respond with a JSON object containing the extracted fields. Use null for missing values.`;

    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxOutputTokens: 500,
    });

    let extracted: Record<string, unknown> = {};
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      }
    } catch (parseError) {
      logger.error("Failed to parse AI extraction result", parseError, { agentId: context.agentId });
    }

    const updatedVariables: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.name in extracted) {
        updatedVariables[field.name] = extracted[field.name];
      }
    }

    return { messages: [], nextNodeId: null, waitForInput: false, updatedVariables };
  } catch (error) {
    logger.error("AI extract failed", error, { agentId: context.agentId });
    return { messages: [], nextNodeId: null, waitForInput: false };
  }
};
