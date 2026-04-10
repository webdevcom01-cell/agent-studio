import { generateText, stepCountIs } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
import type { NodeHandler } from "../types";
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
    logger.warn("Claude Agent SDK: MCP tools unavailable", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {};
}

async function loadSubAgentTools(
  agentId: string,
  context: Parameters<NodeHandler>[1],
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
    logger.warn("Claude Agent SDK: subagent tools unavailable", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {};
}

export const claudeAgentSdkHandler: NodeHandler = async (node, context) => {
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
  const sessionVarName = ((node.data.sessionVarName as string) || "__sdk_session");
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const nextNodeId = (node.data.nextNodeId as string | null) ?? null;

  try {
    const model = getModel(modelId);

    // ── Session resume: load previous messages ─────────────────────────────
    let sessionMessages: SessionMessage[] = [];
    if (enableSessionResume && sessionVarName) {
      const stored = context.variables[sessionVarName];
      if (isSessionMessageArray(stored)) {
        sessionMessages = stored;
        logger.info("Claude Agent SDK: resuming session", {
          agentId: context.agentId,
          nodeId: node.id,
          sessionVarName,
          messageCount: sessionMessages.length,
        });
      }
    }

    // ── Resolve user task ──────────────────────────────────────────────────
    // If no explicit task configured, fall back to the latest user message.
    const latestUserMsg =
      [...context.messageHistory]
        .reverse()
        .find((m) => m.role === "user")?.content ?? "";
    const userMessage = task || latestUserMsg || "Please proceed.";

    // ── Build message array ────────────────────────────────────────────────
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

    // Subagent tools first, MCP overrides name conflicts (MCP is more specific)
    const allTools = { ...subAgentTools, ...mcpTools };
    const hasTools = Object.keys(allTools).length > 0;

    if (hasTools && Object.keys(subAgentTools).length >= 2) {
      // Parallel execution hint for multi-agent orchestration
      const existingSystem = systemPrompt;
      const parallelHint =
        "\n\n---\n**Parallel Execution:** When multiple subagents can work independently, " +
        "call them simultaneously in a single step rather than sequentially.";
      messages.unshift({
        role: "system",
        content: (existingSystem ? existingSystem + parallelHint : parallelHint),
      });
    } else if (systemPrompt) {
      messages.unshift({ role: "system", content: systemPrompt });
    }

    // ── Build generate options ─────────────────────────────────────────────
    type GenerateOptions = Parameters<typeof generateText>[0];
    const generateOptions: GenerateOptions = { model, messages };

    if (hasTools) {
      generateOptions.tools = allTools as GenerateOptions["tools"];
      generateOptions.stopWhen = stepCountIs(maxSteps);
    }

    // ── Observability span ─────────────────────────────────────────────────
    const span = traceGenAI("gen_ai.agent_sdk.generate", {
      "gen_ai.system": "anthropic",
      "gen_ai.request.model": modelId,
      "gen_ai.operation.name": "agent",
      "gen_ai.agent.id": context.agentId,
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
    span.end();

    recordChatLatency(context.agentId, modelId, durationMs);
    if (inputTokens > 0 || outputTokens > 0) {
      recordTokenUsage(context.agentId, modelId, inputTokens, outputTokens);
    }

    const responseText = result.text || "Agent completed task.";

    logger.info("Claude Agent SDK: task completed", {
      agentId: context.agentId,
      nodeId: node.id,
      durationMs,
      inputTokens,
      outputTokens,
      toolSteps: result.steps?.length ?? 0,
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
    logger.error("Claude Agent SDK: execution failed", {
      nodeId: node.id,
      agentId: context.agentId,
      error,
    });
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
};
