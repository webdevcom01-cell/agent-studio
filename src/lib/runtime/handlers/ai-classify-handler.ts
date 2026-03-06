import { generateText } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import type { NodeHandler } from "../types";

export const aiClassifyHandler: NodeHandler = async (node, context) => {
  const categories = (node.data.categories as string[]) ?? [];
  const inputVariable = (node.data.inputVariable as string) ?? "";
  const modelId = (node.data.model as string) ?? DEFAULT_MODEL;

  if (categories.length === 0) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  const inputText = inputVariable
    ? String(context.variables[inputVariable] ?? "")
    : context.messageHistory.filter((m) => m.role === "user").pop()?.content ?? "";

  if (!inputText.trim()) {
    return { messages: [], nextNodeId: null, waitForInput: false };
  }

  try {
    const model = getModel(modelId);

    const prompt = `Classify the following text into one of these categories: ${categories.join(", ")}

Text: "${inputText}"

Respond with ONLY the category name, nothing else.`;

    const result = await generateText({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxOutputTokens: 50,
    });

    const classification = result.text.trim().toLowerCase();
    const matchedCategory = categories.find((c) => c.toLowerCase() === classification);

    const handleId = matchedCategory ?? "else";
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
      updatedVariables: { [`${node.id}_classification`]: matchedCategory ?? classification },
    };
  } catch (error) {
    console.error("AI Classify error:", error);
    return { messages: [], nextNodeId: null, waitForInput: false };
  }
};
