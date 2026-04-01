import { generateText, stepCountIs } from "ai";
import { getModel, DEFAULT_MODEL } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
import { injectRAGContext } from "@/lib/knowledge/rag-inject";
import { reformulateWithHistory } from "@/lib/knowledge/query-reformulation";
import type { NodeHandler } from "../types";
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
  context: Parameters<NodeHandler>[1],
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

export const aiResponseHandler: NodeHandler = async (node, context) => {
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
        logger.info("RAG injected into ai_response node", {
          agentId: context.agentId,
          chunks: ragResult.retrievedChunkCount,
          retrievalMs: ragResult.retrievalTimeMs,
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // ── Safety: check user input for injection ────────────────────────────
    if (latestUserMsg) {
      const inputCheck = await checkInputSafety(latestUserMsg, context.agentId, node.id);
      if (!inputCheck.safe) {
        return {
          messages: [
            { role: "assistant", content: "I'm unable to process that request due to safety guidelines." },
          ],
          nextNodeId: null,
          waitForInput: true,
          updatedVariables: outputVariable
            ? { ...context.variables, [outputVariable]: `[Safety blocked: ${inputCheck.reason}]` }
            : undefined,
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

    const generateOptions: Parameters<typeof generateText>[0] = {
      model,
      messages: [...systemMessages, ...historyMessages],
      temperature,
      maxOutputTokens: maxTokens,
    };

    if (hasTools) {
      generateOptions.tools = allTools as Parameters<typeof generateText>[0]["tools"];
      generateOptions.stopWhen = stepCountIs(MAX_TOOL_STEPS);
    }

    const span = traceGenAI("gen_ai.generate", {
      "gen_ai.system": modelId.split("-")[0],
      "gen_ai.request.model": modelId,
      "gen_ai.request.temperature": temperature,
      "gen_ai.request.max_tokens": maxTokens,
    });

    const startMs = Date.now();
    const result = await generateText(generateOptions);
    const durationMs = Date.now() - startMs;

    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;

    span.setAttributes({
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
      "gen_ai.response.finish_reason": result.finishReason ?? "unknown",
    });

    if (result.toolCalls && result.toolCalls.length > 0) {
      for (const toolCall of result.toolCalls) {
        span.addEvent({
          name: "gen_ai.tool_call",
          attributes: {
            "tool.name": toolCall.toolName,
          },
        });
      }
    }

    span.end();

    recordChatLatency(context.agentId, modelId, durationMs);
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage(context.agentId, modelId, inputTokens, outputTokens);
    }

    let responseText = result.text || "I couldn't generate a response.";

    // ── Safety: check AI output for PII ──────────────────────────────────
    const outputCheck = await checkOutputSafety(responseText, context.agentId, node.id);
    if (outputCheck.piiRedacted) {
      responseText = outputCheck.sanitized;
    }
    // ─────────────────────────────────────────────────────────────────────

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
