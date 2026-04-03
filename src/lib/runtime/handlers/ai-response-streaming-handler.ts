import { streamText, stepCountIs } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
import { injectRAGContext } from "@/lib/knowledge/rag-inject";
import { reformulateWithHistory } from "@/lib/knowledge/query-reformulation";
import type { ExecutionResult, RuntimeContext, StreamWriter } from "../types";
import { debugEmit } from "../types";
import type { FlowNode } from "@/types";
import { resolveTemplate } from "../template";
import { checkInputSafety, checkOutputSafety } from "@/lib/safety/engine-safety-middleware";

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
  context: RuntimeContext,
  currentInput?: string
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
      abortSignal: context.abortSignal,
      // Task 3.1: pass current user input as resume fingerprint
      currentInput,
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
  const maxTokens = (node.data.maxTokens as number) ?? 4000;
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const enableAgentTools = (node.data.enableAgentTools as boolean) ?? false;
  // enableRAG defaults to true — agents with a KB always use it unless explicitly disabled
  const enableRAG = (node.data.enableRAG as boolean) ?? true;

  try {
    const model = getModel(modelId);

    const historyMessages = context.messageHistory.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // ── RAG injection ──────────────────────────────────────────────────────────
    // Find the latest user message to use as the retrieval query.
    const latestUserMsg = [...historyMessages]
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";

    let effectiveSystemPrompt = prompt;
    if (latestUserMsg) {
      // Reformulate query using conversation history (handles "tell me more", pronouns, etc.)
      const reformulatedQuery = await reformulateWithHistory(
        latestUserMsg,
        context.messageHistory,
      );
      const ragResult = await injectRAGContext(
        context.agentId,
        effectiveSystemPrompt,
        reformulatedQuery,
        context.conversationId,
        { disabled: !enableRAG },
      );
      effectiveSystemPrompt = ragResult.augmentedSystemPrompt;
      if (ragResult.retrievedChunkCount > 0) {
        logger.info("RAG injected into ai_response streaming node", {
          agentId: context.agentId,
          chunks: ragResult.retrievedChunkCount,
          retrievalMs: ragResult.retrievalTimeMs,
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // ── Context summary injection ─────────────────────────────────────────
    const contextSummary = context.variables["__context_summary"];
    if (typeof contextSummary === "string" && contextSummary.length > 0) {
      effectiveSystemPrompt = `[Context from earlier in this conversation:\n${contextSummary}]\n\n${effectiveSystemPrompt}`;
    }
    // ──────────────────────────────────────────────────────────────────────────

    // ── Safety: check user input for injection ────────────────────────────
    if (latestUserMsg) {
      const inputCheck = await checkInputSafety(latestUserMsg, context.agentId, node.id);
      if (!inputCheck.safe) {
        try { writer.write({
          type: "message",
          role: "assistant",
          content: "I'm unable to process that request due to safety guidelines.",
        }); } catch { /* stream closed by client */ }
        return {
          messages: [
            { role: "assistant", content: "I'm unable to process that request due to safety guidelines." },
          ],
          nextNodeId: null,
          waitForInput: true,
        };
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Load MCP tools (always)
    const mcpTools = await loadMCPTools(context.agentId);

    // Load agent tools (only when enabled on this node)
    const agentTools = enableAgentTools
      ? await loadAgentTools(context.agentId, context, latestUserMsg)
      : {};

    // Merge all tools — MCP tools take priority on name conflicts
    const allTools = { ...agentTools, ...mcpTools };
    const hasTools = Object.keys(allTools).length > 0;

    // Inject parallel-execution hint when 2+ agent tools are available.
    // The AI SDK already executes parallel tool calls within a step simultaneously
    // (Promise.allSettled internally) — we just need the LLM to batch them.
    const agentToolCount = Object.keys(agentTools).length;
    if (agentToolCount >= 2) {
      effectiveSystemPrompt +=
        "\n\n---\n**Parallel Execution:** When multiple agents can work independently, " +
        "call them all in a single response step (multiple simultaneous tool calls) rather " +
        "than one at a time. Only call agents sequentially when each one depends on the " +
        "previous result.";
    }

    const systemMessages = effectiveSystemPrompt
      ? [{ role: "system" as const, content: effectiveSystemPrompt }]
      : [];

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
      "gen_ai.operation.name": "stream",
      "gen_ai.agent.id": context.agentId,
      "gen_ai.request.temperature": temperature,
      "gen_ai.request.max_tokens": maxTokens,
    });

    const startMs = Date.now();
    const result = streamText(streamOptions);

    try { writer.write({ type: "stream_start" }); } catch { /* stream closed by client */ }

    // Track active tool call timings for debug
    const toolStartTimes = new Map<string, number>();

    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
      try { writer.write({ type: "stream_delta", content: delta }); } catch { /* stream closed by client */ }
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

    // Record tool calls as span events + debug events
    const toolCalls = await result.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        span.addEvent({
          name: "gen_ai.tool_call",
          attributes: { "tool.name": toolCall.toolName },
        });
        // Emit debug tool events (start + end approximated from final result)
        const toolStartMs = toolStartTimes.get(toolCall.toolCallId) ?? startMs;
        debugEmit(writer, context, {
          type: "debug_tool_start",
          nodeId: node.id,
          toolName: toolCall.toolName,
          input: "input" in toolCall ? (toolCall as Record<string, unknown>).input : undefined,
          timestamp: toolStartMs,
        });
        debugEmit(writer, context, {
          type: "debug_tool_end",
          nodeId: node.id,
          toolName: toolCall.toolName,
          durationMs: Date.now() - toolStartMs,
          status: "success",
        });
      }
    }

    span.end();

    recordChatLatency(context.agentId, modelId, durationMs);
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage(context.agentId, modelId, inputTokens, outputTokens);
    }

    if (!fullText) fullText = "I couldn't generate a response.";

    // ── Safety: check AI output for PII ──────────────────────────────────
    const outputCheck = await checkOutputSafety(fullText, context.agentId, node.id);
    if (outputCheck.piiRedacted) {
      fullText = outputCheck.sanitized;
    }
    // ─────────────────────────────────────────────────────────────────────

    try { writer.write({ type: "stream_end", content: fullText }); } catch { /* stream closed by client */ }

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
    try { writer.write({ type: "error", content: errorMsg }); } catch { /* stream closed by client */ }
    return {
      messages: [{ role: "assistant", content: errorMsg }],
      nextNodeId: null,
      waitForInput: false,
    };
  }
}
