import { streamText, stepCountIs } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import type { ExecutionResult, RuntimeContext, StreamWriter } from "../types";
import type { FlowNode } from "@/types";
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

export async function aiResponseStreamingHandler(
  node: FlowNode,
  context: RuntimeContext,
  writer: StreamWriter
): Promise<ExecutionResult> {
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

    const streamOptions: Parameters<typeof streamText>[0] = {
      model,
      messages: [...systemMessages, ...historyMessages],
      temperature,
      maxOutputTokens: maxTokens,
    };

    if (hasTools) {
      streamOptions.tools = mcpTools as Parameters<typeof streamText>[0]["tools"];
      streamOptions.stopWhen = stepCountIs(MAX_TOOL_STEPS);
    }

    const result = streamText(streamOptions);

    writer.write({ type: "stream_start" });

    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
      writer.write({ type: "stream_delta", content: delta });
    }

    if (!fullText) fullText = "I couldn't generate a response.";

    writer.write({ type: "stream_end", content: fullText });

    return {
      messages: [{ role: "assistant", content: fullText }],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: outputVariable
        ? { [outputVariable]: fullText }
        : undefined,
    };
  } catch (err) {
    logger.error("AI streaming response failed", err instanceof Error ? err : new Error(String(err)), { agentId: context.agentId });
    const errorMsg =
      "I'm having trouble generating a response right now. Let me continue.";
    writer.write({ type: "error", content: errorMsg });
    return {
      messages: [{ role: "assistant", content: errorMsg }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
}
