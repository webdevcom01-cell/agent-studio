import { streamText, stepCountIs } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
import type { ExecutionResult, RuntimeContext, StreamWriter } from "../types";
import type { FlowNode } from "@/types";
import { resolveTemplate } from "../template";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_STEPS = 20;

interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function isSessionMessageArray(value: unknown): value is SessionMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      "role" in m &&
      "content" in m &&
      typeof (m as Record<string, unknown>).content === "string"
  );
}

async function loadMCPTools(agentId: string): Promise<Record<string, unknown>> {
  try {
    const tools = await getMCPToolsForAgent(agentId);
    if (Object.keys(tools).length > 0) return tools;
  } catch (err) {
    logger.warn("Claude Agent SDK streaming: MCP tools unavailable", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {};
}

async function loadSubAgentTools(
  agentId: string,
  context: RuntimeContext,
  currentInput: string
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
      currentInput,
    };
    const tools = await getAgentToolsForAgent(agentId, ctx);
    return tools as Record<string, unknown>;
  } catch (err) {
    logger.warn("Claude Agent SDK streaming: subagent tools unavailable", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {};
}

export async function claudeAgentSdkStreamingHandler(
  node: FlowNode,
  context: RuntimeContext,
  writer: StreamWriter
): Promise<ExecutionResult> {
  const task = resolveTemplate(
    (node.data.task as string) ?? "",
    context.variables
  );
  const systemPrompt = resolveTemplate(
    (node.data.systemPrompt as string) ?? "",
    context.variables
  );
  const modelId = (node.data.model as string) || DEFAULT_CLAUDE_MODEL;
  const maxSteps = (node.data.maxSteps as number) ?? DEFAULT_MAX_STEPS;
  const enableMCP = (node.data.enableMCP as boolean) ?? true;
  const enableSubAgents = (node.data.enableSubAgents as boolean) ?? false;
  const enableSessionResume = (node.data.enableSessionResume as boolean) ?? false;
  const sessionVarName = (node.data.sessionVarName as string) || "__sdk_session";
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const nextNodeId = (node.data.nextNodeId as string | null) ?? null;

  try {
    const model = getModel(modelId);

    // ── Session resume ─────────────────────────────────────────────────────
    let sessionMessages: SessionMessage[] = [];
    if (enableSessionResume && sessionVarName) {
      const stored = context.variables[sessionVarName];
      if (isSessionMessageArray(stored)) {
        sessionMessages = stored;
        logger.info("Claude Agent SDK streaming: resuming session", {
          agentId: context.agentId,
          nodeId: node.id,
          sessionVarName,
          messageCount: sessionMessages.length,
        });
      }
    }

    const latestUserMsg =
      [...context.messageHistory]
        .reverse()
        .find((m) => m.role === "user")?.content ?? "";
    const userMessage = task || latestUserMsg || "Please proceed.";

    const messages: { role: "user" | "assistant" | "system"; content: string }[] = [
      ...sessionMessages,
      { role: "user", content: userMessage },
    ];

    // ── Load tools ─────────────────────────────────────────────────────────
    const [mcpTools, subAgentTools] = await Promise.all([
      enableMCP ? loadMCPTools(context.agentId) : Promise.resolve({}),
      enableSubAgents
        ? loadSubAgentTools(context.agentId, context, userMessage)
        : Promise.resolve({}),
    ]);

    const allTools = { ...subAgentTools, ...mcpTools };
    const hasTools = Object.keys(allTools).length > 0;

    if (hasTools && Object.keys(subAgentTools).length >= 2) {
      const parallelHint =
        "\n\n---\n**Parallel Execution:** When multiple subagents can work independently, " +
        "call them simultaneously in a single step rather than sequentially.";
      messages.unshift({
        role: "system",
        content: (systemPrompt ? systemPrompt + parallelHint : parallelHint),
      });
    } else if (systemPrompt) {
      messages.unshift({ role: "system", content: systemPrompt });
    }

    // ── Build stream options ───────────────────────────────────────────────
    type StreamOptions = Parameters<typeof streamText>[0];
    const streamOptions: StreamOptions = { model, messages };

    if (hasTools) {
      streamOptions.tools = allTools as StreamOptions["tools"];
      streamOptions.stopWhen = stepCountIs(maxSteps);
    }

    // ── Observability span ─────────────────────────────────────────────────
    const span = traceGenAI("gen_ai.agent_sdk.stream", {
      "gen_ai.system": "anthropic",
      "gen_ai.request.model": modelId,
      "gen_ai.operation.name": "agent_stream",
      "gen_ai.agent.id": context.agentId,
    });

    const startMs = Date.now();

    // Emit stream_start
    try {
      writer.write({ type: "stream_start" });
    } catch { /* stream closed */ }

    const streamResult = streamText(streamOptions);
    let fullText = "";

    // Stream tokens as they arrive
    for await (const delta of streamResult.textStream) {
      fullText += delta;
      try {
        writer.write({ type: "stream_delta", content: delta });
      } catch { /* stream closed by client — continue accumulating */ }
    }

    const durationMs = Date.now() - startMs;

    // Await promises from streamText result object
    const usage = await streamResult.usage;
    const inputTokens = usage?.inputTokens ?? 0;
    const outputTokens = usage?.outputTokens ?? 0;

    span.setAttributes({
      "gen_ai.usage.input_tokens": inputTokens,
      "gen_ai.usage.output_tokens": outputTokens,
    });
    span.end();

    recordChatLatency(context.agentId, modelId, durationMs);
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage(context.agentId, modelId, inputTokens, outputTokens);
    }

    const responseText = fullText || "Agent completed task.";

    try {
      writer.write({ type: "stream_end", content: responseText });
    } catch { /* stream closed */ }

    logger.info("Claude Agent SDK streaming: task completed", {
      agentId: context.agentId,
      nodeId: node.id,
      durationMs,
      inputTokens,
      outputTokens,
      sessionResumed: sessionMessages.length > 0,
    });

    // ── Session persistence ────────────────────────────────────────────────
    const updatedVariables: Record<string, unknown> = {};

    if (outputVariable) {
      updatedVariables[outputVariable] = responseText;
    }

    if (enableSessionResume && sessionVarName) {
      const updatedSession: SessionMessage[] = [
        ...sessionMessages,
        { role: "user", content: userMessage },
        { role: "assistant", content: responseText },
      ];
      updatedVariables[sessionVarName] = updatedSession;
    }

    return {
      messages: [{ role: "assistant", content: responseText }],
      nextNodeId,
      waitForInput: false,
      updatedVariables:
        Object.keys(updatedVariables).length > 0 ? updatedVariables : undefined,
    };
  } catch (error) {
    logger.error("Claude Agent SDK streaming: execution failed", {
      nodeId: node.id,
      agentId: context.agentId,
      error,
    });

    try {
      writer.write({
        type: "stream_end",
        content: "An error occurred in the Claude Agent SDK node.",
      });
    } catch { /* stream closed */ }

    return {
      messages: [
        {
          role: "assistant",
          content: "An error occurred in the Claude Agent SDK node.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }
}
