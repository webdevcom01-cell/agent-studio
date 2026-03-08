import { generateText, stepCountIs } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

const MAX_TOOL_STEPS = 5;

async function loadMCPTools(agentId: string): Promise<Record<string, unknown>> {
  try {
    const tools = await getMCPToolsForAgent(agentId);
    if (Object.keys(tools).length > 0) {
      return tools;
    }
  } catch (err) {
    logger.warn("MCP tools unavailable, continuing without tools", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {};
}

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

    const mcpTools = await loadMCPTools(context.agentId);
    const hasTools = Object.keys(mcpTools).length > 0;

    const generateOptions: Parameters<typeof generateText>[0] = {
      model,
      messages: [...systemMessages, ...historyMessages],
      temperature,
      maxOutputTokens: maxTokens,
    };

    if (hasTools) {
      generateOptions.tools = mcpTools as Parameters<typeof generateText>[0]["tools"];
      generateOptions.stopWhen = stepCountIs(MAX_TOOL_STEPS);
    }

    const result = await generateText(generateOptions);

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
    logger.error("AI response failed", error, { agentId: context.agentId });
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
