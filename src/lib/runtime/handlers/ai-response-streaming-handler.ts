import { streamText, stepCountIs } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
// TODO: integrate citations when kb_search results are available in context
// import { extractCitations, formatCitationsForAI } from "@/lib/knowledge/citations";
import type { ExecutionResult, RuntimeContext, StreamWriter } from "../types";
import type { FlowNode } from "@/types";
import { resolveTemplate } from "../template";

const MAX_TOOL_STEPS = 20;

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

async function loadAgentTools(
  agentId: string,
  context: RuntimeContext
): Promise<Record<string, unknown>> {
  try {
    const extended = context as unknown as Record<string, unknown>;
    const ctx: AgentToolContext = {
      callerAgentId: agentId,
      userId: context.userId ?? null,
      depth: extended._a2aDepth as number | undefined,
      callStack: extended._a2aCallStack as string[] | undefined,
      traceId: extended._a2aTraceId as string | undefined,
      conversationId: context.conversationId,
    };

    const tools = await getAgentToolsForAgent(agentId, ctx);
    return tools as Record<string, unknown>;
  } catch (err) {
    logger.warn("Agent tools unavailable, continuing without them", {
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
  const maxTokens = (node.data.maxTokens as number) ?? 2000;
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const enableAgentTools = (node.data.enableAgentTools as boolean) ?? false;

  try {
    const model = getModel(modelId);

    const systemMessages = prompt
      ? [{ role: "system" as const, content: prompt }]
      : [];

    const historyMessages = context.messageHistory.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Load MCP tools (always)
    const mcpTools = await loadMCPTools(context.agentId);

    // Load agent tools (only when enabled on this node)
    const agentTools = enableAgentTools
      ? await loadAgentTools(context.agentId, context)
      : {};

    // Merge all tools — MCP tools take priority on name conflicts
    const allTools = { ...agentTools, ...mcpTools };
    const hasTools = Object.keys(allTools).length > 0;

    const streamOptions: Parameters<typeof streamText>[0] = {
      model,
      messages: [...systemMessages, ...historyMessages],
      temperature,
      maxOutputTokens: maxTokens,
    };

    if (hasTools) {
      streamOptions.tools = allTools as Parameters<typeof streamText>[0]["tools"];
      streamOptions.stopWhen = stepCountIs(MAX_TOOL_STEPS);
    }

    // Send heartbeats during long-running tool calls to keep connection alive
    const heartbeatTimer = hasTools
      ? setInterval(() => {
          try { writer.write({ type: "heartbeat" }); } catch { /* stream closed */ }
        }, 5000)
      : null;

    const span = traceGenAI("gen_ai.stream", {
      "gen_ai.system": modelId.split("-")[0],
      "gen_ai.request.model": modelId,
      "gen_ai.request.temperature": temperature,
      "gen_ai.request.max_tokens": maxTokens,
    });

    const startMs = Date.now();
    const result = streamText(streamOptions);

    writer.write({ type: "stream_start" });

    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
      writer.write({ type: "stream_delta", content: delta });
    }

    if (heartbeatTimer) clearInterval(heartbeatTimer);

    const durationMs = Date.now() - startMs;

    // Await usage from the stream result
    const usage = await result.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    span.setAttributes({
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
    });

    // Record tool calls as span events
    const toolCalls = await result.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        span.addEvent({
          name: "gen_ai.tool_call",
          attributes: { "tool.name": toolCall.toolName },
        });
      }
    }

    span.end();

    recordChatLatency(context.agentId, modelId, durationMs);
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage(context.agentId, modelId, inputTokens, outputTokens);
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
