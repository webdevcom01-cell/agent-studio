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
  const fields = normalizeFields(node.data.fields, node.id);
  const modelId = (node.data.model as string) ?? DEFAULT_MODEL;

  if (fields.length === 0) {
    return {
      messages: [
        {
          role: "assistant",
          content:
            "ai_extract requires at least one field definition. Add fields in the property panel.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
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

/**
 * Normalizes field input — accepts ExtractField[], JSON Schema object, or undefined.
 * Converts schema objects to ExtractField[] and filters out invalid entries.
 */
function normalizeFields(raw: unknown, nodeId: string): ExtractField[] {
  if (!raw) return [];

  // Already an array — filter to valid fields
  if (Array.isArray(raw)) {
    const valid: ExtractField[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;
      if (!obj.name || typeof obj.name !== "string") {
        logger.warn("ai_extract: skipping field without name", { nodeId, field: item });
        continue;
      }
      valid.push({
        name: obj.name,
        description: (obj.description as string) ?? "",
        type: (["string", "number", "boolean"].includes(obj.type as string)
          ? obj.type
          : "string") as ExtractField["type"],
      });
    }
    return valid;
  }

  // Schema object format: { "email": "string", "age": "number" } or
  // JSON Schema: { "properties": { "email": { "type": "string" } } }
  if (typeof raw === "object") {
    logger.info("ai_extract: converted schema object to fields array", { nodeId });

    const obj = raw as Record<string, unknown>;

    // JSON Schema with "properties" key
    if (obj.properties && typeof obj.properties === "object") {
      const props = obj.properties as Record<string, Record<string, unknown>>;
      return Object.entries(props).map(([key, schema]) => ({
        name: key,
        description: (schema.description as string) ?? "",
        type: (["string", "number", "boolean"].includes(schema.type as string)
          ? schema.type
          : "string") as ExtractField["type"],
      }));
    }

    // Simple object: { "email": "string", "age": "number" }
    return Object.entries(obj).map(([key, value]) => ({
      name: key,
      description: "",
      type: (["string", "number", "boolean"].includes(value as string)
        ? value
        : "string") as ExtractField["type"],
    }));
  }

  return [];
}
