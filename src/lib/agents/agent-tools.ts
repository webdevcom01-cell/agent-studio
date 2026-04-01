/**
 * Agent-as-Tool Provider
 *
 * Converts other agents owned by the same user into Vercel AI SDK tool definitions,
 * enabling AI-driven orchestration where the LLM dynamically decides which sub-agents
 * to invoke based on the conversation context.
 *
 * Uses existing infrastructure: executeSubAgent(), circuit breaker, rate limiter, audit logging.
 *
 * @see https://a2a-protocol.org/latest/specification/ — Google A2A standard (2025)
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling — Vercel AI SDK tools
 */
import { z } from "zod";
import { dynamicTool, zodSchema, type ToolSet } from "ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  checkCircuit,
  recordSuccess,
  recordFailure,
  checkDepthLimit,
  checkCycleDetection,
  MAX_AGENT_DEPTH,
  A2ACircuitError,
} from "@/lib/a2a/circuit-breaker";
import { checkRateLimit } from "@/lib/a2a/rate-limiter";
import { parseFlowContent } from "@/lib/validators/flow-content";

const DEFAULT_TIMEOUT_SECONDS = 120;

/**
 * Desktop capability metadata extracted from agent flows.
 * Helps orchestrating AI understand what desktop apps a sub-agent can control.
 */
export interface AgentToolMetadata {
  desktopApps: string[];
  requiredCLIs: string[];
  estimatedDuration: number;
  outputTypes: string[];
}

/**
 * Agent metadata used to construct tool definitions.
 */
interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
}

interface AgentInfoWithFlow extends AgentInfo {
  flow?: { content: unknown } | null;
}

/**
 * Context required for executing agent tools at runtime.
 */
export interface AgentToolContext {
  /** The agent whose ai_response node is running */
  callerAgentId: string;
  /** Owner user ID for access control + rate limiting */
  userId: string | null;
  /** Current A2A nesting depth (prevents runaway recursion) */
  depth?: number;
  /** Call stack for circular detection */
  callStack?: string[];
  /** Distributed trace ID for audit logging */
  traceId?: string;
  /** Conversation ID for audit logging */
  conversationId?: string;
}

/**
 * Load all agents owned by the same user (excluding the caller) and return
 * them as Vercel AI SDK tool definitions.
 *
 * The LLM sees each agent as a callable tool with:
 *   - name: `agent_<sanitized_name>` (e.g. `agent_research_assistant`)
 *   - description: agent's description (or fallback)
 *   - parameters: { input: string } — the task/question to delegate
 *
 * Each tool execution:
 *   1. Checks circuit breaker + rate limiter
 *   2. Creates AgentCallLog for distributed tracing
 *   3. Runs executeSubAgent() with timeout + depth limiting
 *   4. Returns the sub-agent's response text
 */
export async function getAgentToolsForAgent(
  callerAgentId: string,
  ctx: AgentToolContext
): Promise<ToolSet> {
  const depth = ctx.depth ?? 0;

  // Don't generate agent tools if we're already at max depth
  if (depth >= MAX_AGENT_DEPTH) {
    logger.warn("Agent tools skipped: max depth reached", {
      callerAgentId,
      depth,
    });
    return {};
  }

  try {
    // Fetch sibling agents (same owner, exclude self, must have a flow)
    const agents = await loadAvailableAgents(callerAgentId, ctx.userId);

    if (agents.length === 0) return {};

    const tools: ToolSet = {};

    for (const agent of agents) {
      const toolName = sanitizeToolName(agent.name, agent.id);
      const capturedAgent = agent;
      const capturedCtx = ctx;
      const metadata = extractDesktopMetadata(agent);

      const inputSchema = z.object({
        input: z
          .string()
          .describe(
            "The task, question, or instruction to send to this agent. Be specific and provide all necessary context."
          ),
      });

      tools[toolName] = dynamicTool({
        description: buildToolDescription(capturedAgent, metadata),
        inputSchema: zodSchema(inputSchema),
        execute: async (args: unknown) => {
          const { input } = args as { input: string };
          return executeAgentTool(capturedAgent, input, capturedCtx);
        },
      });
    }

    logger.info("Agent tools loaded", {
      callerAgentId,
      agentToolCount: Object.keys(tools).length,
      toolNames: Object.keys(tools),
    });

    return tools;
  } catch (err) {
    logger.warn("Failed to load agent tools, continuing without them", {
      callerAgentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Execute a single agent tool call with full protection stack.
 */
async function executeAgentTool(
  agent: AgentInfo,
  input: string,
  ctx: AgentToolContext
): Promise<string> {
  const {
    callerAgentId,
    userId,
    depth = 0,
    callStack = [callerAgentId],
    traceId = generateSpanId(),
    conversationId,
  } = ctx;

  // Depth limit and circular call detection
  try {
    checkDepthLimit(depth, callStack);
    checkCycleDetection(agent.id, callStack);
  } catch (err) {
    if (err instanceof A2ACircuitError) {
      logger.warn("Agent tool: call rejected", {
        code: err.code,
        message: err.message,
        data: err.data,
      });
      return `[Skipped: ${err.message}]`;
    }
    throw err;
  }

  // Rate limiting
  if (userId) {
    try {
      checkRateLimit(userId, agent.id);
    } catch (err) {
      return `[Rate limit exceeded for agent "${agent.name}": ${err instanceof Error ? err.message : String(err)}]`;
    }
  }

  // Circuit breaker
  try {
    checkCircuit(callerAgentId, agent.id);
  } catch (err) {
    return `[Circuit open for agent "${agent.name}": ${err instanceof Error ? err.message : String(err)}]`;
  }

  // Create audit log
  const spanId = generateSpanId();
  const taskId = generateSpanId();
  const startTime = Date.now();

  let callLogId: string | null = null;

  try {
    const callLog = await prisma.agentCallLog.create({
      data: {
        traceId,
        spanId,
        callerAgentId,
        calleeAgentId: agent.id,
        taskId,
        status: "SUBMITTED",
        inputParts: [{ type: "text", text: input }],
        depth,
        isParallel: false,
        executionId: conversationId ?? null,
        conversationId: conversationId ?? null,
      },
    });
    callLogId = callLog.id;

    await prisma.agentCallLog.update({
      where: { id: callLogId },
      data: { status: "WORKING" },
    });
  } catch (err) {
    // Audit log failures are non-critical — continue execution
    logger.warn("Agent tool: audit log creation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const result = await executeSubAgentInternal({
      targetAgentId: agent.id,
      callerUserId: userId,
      input: { message: input },
      depth: depth + 1,
      callStack: [...callStack, agent.id],
      traceId,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    });

    recordSuccess(callerAgentId, agent.id);

    const durationMs = Date.now() - startTime;
    const outputText = typeof result.output === "string"
      ? result.output
      : JSON.stringify(result.output);

    // Update audit log
    if (callLogId) {
      await prisma.agentCallLog
        .update({
          where: { id: callLogId },
          data: {
            status: "COMPLETED",
            outputParts: [{ type: "text", text: outputText }],
            durationMs,
            completedAt: new Date(),
          },
        })
        .catch((err) =>
          logger.warn("Agent tool: audit log update failed", {
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    return outputText || "[Agent returned no output]";
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    recordFailure(callerAgentId, agent.id);

    // Update audit log with failure
    if (callLogId) {
      await prisma.agentCallLog
        .update({
          where: { id: callLogId },
          data: {
            status: "FAILED",
            errorMessage: errorMsg,
            durationMs,
            completedAt: new Date(),
          },
        })
        .catch((err) =>
          logger.warn("Agent tool: audit log update failed", {
            error: err instanceof Error ? err.message : String(err),
          })
        );
    }

    logger.error("Agent tool execution failed", err instanceof Error ? err : new Error(errorMsg), {
      callerAgentId,
      calleeAgentId: agent.id,
      durationMs,
    });

    const isTimeout = errorMsg.toLowerCase().includes("timeout") || errorMsg.toLowerCase().includes("timed out");
    const reason = isTimeout
      ? `timed out after ${Math.round(durationMs / 1000)}s`
      : errorMsg;
    return `[Agent "${agent.name}" failed: ${reason}]`;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

/**
 * Fetch agents available for orchestration.
 * Rules:
 *   - Same owner (userId match) OR unowned agents (userId is null)
 *   - Exclude the caller itself
 *   - Must have a flow (no point calling an agent without logic)
 *   - Limit to 20 agents to keep tool list manageable for the LLM
 */
async function loadAvailableAgents(
  callerAgentId: string,
  userId: string | null
): Promise<AgentInfoWithFlow[]> {
  const whereClause = userId
    ? {
        id: { not: callerAgentId },
        OR: [{ userId }, { userId: null }],
        flow: { isNot: null },
      }
    : {
        id: { not: callerAgentId },
        userId: null,
        flow: { isNot: null },
      };

  const agents = await prisma.agent.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      description: true,
      flow: { select: { content: true } },
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });

  return agents;
}

/**
 * Extract desktop app metadata from an agent's flow content.
 * Scans for desktop_app nodes and extracts app IDs and output types.
 */
export function extractDesktopMetadata(
  agent: AgentInfoWithFlow,
): AgentToolMetadata {
  const metadata: AgentToolMetadata = {
    desktopApps: [],
    requiredCLIs: [],
    estimatedDuration: 30,
    outputTypes: [],
  };

  if (!agent.flow?.content) return metadata;

  try {
    const content = agent.flow.content as { nodes?: Array<{ type?: string; data?: Record<string, unknown> }> };
    const nodes = content.nodes ?? [];

    for (const node of nodes) {
      if (node.type !== "desktop_app") continue;

      const appId = node.data?.appId as string | undefined;
      if (appId && !metadata.desktopApps.includes(appId)) {
        metadata.desktopApps.push(appId);
        metadata.requiredCLIs.push(appId);
      }

      const actions = (node.data?.actions as Array<{ command?: string }>) ?? [];
      for (const action of actions) {
        if (action.command) {
          const outputType = inferOutputType(action.command);
          if (outputType && !metadata.outputTypes.includes(outputType)) {
            metadata.outputTypes.push(outputType);
          }
        }
      }
    }

    if (metadata.desktopApps.length > 0) {
      metadata.estimatedDuration = 30 + metadata.desktopApps.length * 15;
    }
  } catch {
    // Non-critical — return empty metadata
  }

  return metadata;
}

function inferOutputType(command: string): string | null {
  const cmd = command.toLowerCase();
  if (cmd.includes("render") || cmd.includes("export-png") || cmd.includes("convert")) {
    return "file";
  }
  if (cmd.includes("script") || cmd.includes("run")) {
    return "text";
  }
  return null;
}

/**
 * Build a description that helps the LLM understand when to use this agent.
 * Enriches with desktop app capabilities when detected.
 */
function buildToolDescription(
  agent: AgentInfo,
  metadata?: AgentToolMetadata,
): string {
  const parts: string[] = [];

  const desc = agent.description?.trim();
  if (desc && desc.length > 10) {
    parts.push(`Delegate a task to the "${agent.name}" agent. ${desc}`);
  } else {
    parts.push(`Delegate a task to the "${agent.name}" agent.`);
  }

  if (metadata && metadata.desktopApps.length > 0) {
    parts.push(
      `This agent controls desktop applications: ${metadata.desktopApps.join(", ")}.`,
    );
    if (metadata.outputTypes.length > 0) {
      parts.push(`Output types: ${metadata.outputTypes.join(", ")}.`);
    }
    parts.push(
      `Estimated duration: ~${metadata.estimatedDuration}s. Requires CLI bridge.`,
    );
  }

  return parts.join(" ");
}

/**
 * Sanitize agent name into a valid tool name.
 * Tool names must be alphanumeric + underscores, no spaces/special chars.
 */
function sanitizeToolName(name: string, id: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  if (!sanitized) {
    return `agent_${id.slice(0, 12)}`;
  }

  return `agent_${sanitized}`;
}

function generateSpanId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Sub-agent execution (mirrors call-agent-handler logic) ─────────

interface SubAgentParams {
  targetAgentId: string;
  callerUserId: string | null;
  input: Record<string, string>;
  depth: number;
  callStack: string[];
  traceId: string;
  timeoutSeconds: number;
}

interface SubAgentResult {
  output: unknown;
}

async function executeSubAgentInternal(
  params: SubAgentParams
): Promise<SubAgentResult> {
  const {
    targetAgentId,
    callerUserId,
    input,
    depth,
    callStack,
    traceId,
    timeoutSeconds,
  } = params;

  const whereClause = callerUserId
    ? {
        id: targetAgentId,
        OR: [{ userId: callerUserId }, { userId: null }],
      }
    : { id: targetAgentId };

  const agent = await prisma.agent.findFirst({
    where: whereClause,
    include: { flow: true },
  });

  if (!agent) {
    throw new Error(`Agent "${targetAgentId}" not found or access denied`);
  }

  if (!agent.flow) {
    throw new Error(`Agent "${agent.name}" has no flow`);
  }

  const flowContent = parseFlowContent(agent.flow.content);

  const conversation = await prisma.conversation.create({
    data: {
      agentId: targetAgentId,
      status: "ACTIVE",
      variables: input,
    },
  });

  const subContext = {
    conversationId: conversation.id,
    agentId: targetAgentId,
    flowContent,
    currentNodeId: null,
    variables: { ...input } as Record<string, unknown>,
    messageHistory: [] as { role: "user" | "assistant" | "system"; content: string }[],
    isNewConversation: true,
    _a2aDepth: depth,
    _a2aCallStack: callStack,
    _a2aTraceId: traceId,
  };

  const { executeFlow } = await import("@/lib/runtime/engine");

  let timeoutRef: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(
      () => reject(new Error(`Sub-agent timed out after ${timeoutSeconds}s`)),
      timeoutSeconds * 1000
    );
  });

  const executionPromise = executeFlow(subContext, input.message);

  let result: Awaited<typeof executionPromise>;
  try {
    result = await Promise.race([executionPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutRef!);
  }

  const lastAssistantMessage = result.messages
    .filter((m) => m.role === "assistant")
    .pop();

  return {
    output: lastAssistantMessage?.content ?? null,
  };
}
