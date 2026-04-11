import { generateText, stepCountIs } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import { getMCPToolsForAgent } from "@/lib/mcp/client";
import { getAgentToolsForAgent, type AgentToolContext } from "@/lib/agents/agent-tools";
import { traceGenAI } from "@/lib/observability/tracer";
import { recordChatLatency, recordTokenUsage } from "@/lib/observability/metrics";
import {
  loadSdkSession,
  createSdkSession,
  updateSdkSession,
  type SessionMessage,
} from "@/lib/sdk-sessions/persistence";
import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_STEPS = 20;

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
  const outputVariable = (node.data.outputVariable as string) ?? "";
  const nextNodeId = (node.data.nextNodeId as string | null) ?? null;

  // Session config — sdkSessionId takes precedence (DB-backed), sessionVarName is legacy fallback
  const sdkSessionId = (node.data.sdkSessionId as string) || "";
  const sessionVarName = (node.data.sessionVarName as string) || "__sdk_session";

  try {
    const model = getModel(modelId);

    // ── Session resume: load from DB or flow variables ─────────────────────
    let sessionMessages: SessionMessage[] = [];
    let activeDbSessionId: string | null = null;

    if (enableSessionResume) {
      if (sdkSessionId) {
        // DB-backed session (Prioritet 2) — load from AgentSdkSession table
        try {
          const dbSession = await loadSdkSession(sdkSessionId);
          if (dbSession && dbSession.agentId === context.agentId) {
            sessionMessages = dbSession.messages;
            activeDbSessionId = dbSession.id;
            logger.info("Claude Agent SDK: resuming DB session", {
              agentId: context.agentId,
              nodeId: node.id,
              sessionId: dbSession.id,
              messageCount: sessionMessages.length,
              resumeCount: dbSession.resumeCount,
            });
          } else {
            logger.warn("Claude Agent SDK: DB session not found or agent mismatch", {
              sdkSessionId,
              agentId: context.agentId,
            });
          }
        } catch (err) {
          logger.warn("Claude Agent SDK: failed to load DB session, continuing without", {
            sdkSessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (sessionVarName) {
        // Legacy fallback: load from flow variables
        const stored = context.variables[sessionVarName];
        if (isSessionMessageArray(stored)) {
          sessionMessages = stored;
          logger.info("Claude Agent SDK: resuming from variable", {
            agentId: context.agentId,
            nodeId: node.id,
            sessionVarName,
            messageCount: sessionMessages.length,
          });
        }
      }
    }

    // ── Resolve user task ──────────────────────────────────────────────────
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

    // ── Session persistence ────────────────────────────────────────────────
    const updatedVariables: Record<string, unknown> = {};

    if (outputVariable) {
      updatedVariables[outputVariable] = responseText;
    }

    if (enableSessionResume) {
      const updatedMessages: SessionMessage[] = [
        ...sessionMessages,
        { role: "user", content: userMessage },
        { role: "assistant", content: responseText },
      ];

      if (activeDbSessionId) {
        // Update existing DB session
        try {
          await updateSdkSession(activeDbSessionId, {
            messages: updatedMessages,
            inputTokensDelta: inputTokens,
            outputTokensDelta: outputTokens,
            metadata: { lastModel: modelId, lastDurationMs: durationMs },
          });
        } catch (err) {
          logger.warn("Claude Agent SDK: failed to update DB session", {
            sessionId: activeDbSessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (sdkSessionId === "" || !sdkSessionId) {
        // Auto-create a new DB session if no specific session ID was given
        try {
          const newSession = await createSdkSession({
            agentId: context.agentId,
            userId: context.userId,
            messages: updatedMessages,
            metadata: { model: modelId, durationMs },
          });
          // Expose the new session ID so downstream nodes / UI can reference it
          updatedVariables["__sdk_session_id"] = newSession.id;
          logger.info("Claude Agent SDK: auto-created DB session", {
            sessionId: newSession.id,
            agentId: context.agentId,
          });
        } catch (err) {
          logger.warn("Claude Agent SDK: failed to create DB session, falling back to variables", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Always keep the variable-based copy as fallback
      if (sessionVarName) {
        updatedVariables[sessionVarName] = updatedMessages;
      }
    }

    logger.info("Claude Agent SDK: task completed", {
      agentId: context.agentId,
      nodeId: node.id,
      durationMs,
      inputTokens,
      outputTokens,
      toolSteps: result.steps?.length ?? 0,
      sessionResumed: sessionMessages.length > 0,
      dbSession: activeDbSessionId ?? undefined,
    });

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
