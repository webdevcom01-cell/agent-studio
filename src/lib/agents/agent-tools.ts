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
import { Prisma } from "@/generated/prisma";

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
 * Task 3.2 — Per-Agent Timeout Profiles.
 * Name-pattern tiers (first match wins):
 *   - "fast"      30s — fact-checkers, validators, linters
 *   - "standard"  60s — research, analysis, summaries, audits
 *   - "slow"      90s — architecture, design, planning, specs
 *   - "very-slow" 120s — code generation, full implementation, QA testing
 */
const AGENT_TIMEOUT_PROFILES: ReadonlyArray<{
  pattern: RegExp;
  timeoutSeconds: number;
  label: string;
}> = [
  { pattern: /reality.?checker|fact.?check|quick|validator|linter|critic|sanity/i, timeoutSeconds: 30, label: "fast" },
  { pattern: /research|discovery|product|market|analy|summar|review|audit/i, timeoutSeconds: 60, label: "standard" },
  { pattern: /architect|design|plan|strategic|decision|spec|blueprint/i, timeoutSeconds: 90, label: "slow" },
  { pattern: /code|generat|implement|build|develop|engineer|test|quality|qa/i, timeoutSeconds: 120, label: "very-slow" },
];

/**
 * Resolve the per-agent call timeout using a 3-priority system:
 *   1. Explicit `expectedDurationSeconds` stored on the Agent record (DB value).
 *   2. Pattern matching against the agent name using AGENT_TIMEOUT_PROFILES.
 *   3. Flat DEFAULT_TIMEOUT_SECONDS (120s) if no pattern matches.
 *
 * Exported so it can be unit-tested independently.
 */
export function getTimeoutForAgent(
  agent: { name: string; expectedDurationSeconds?: number | null }
): number {
  if (
    agent.expectedDurationSeconds !== null &&
    agent.expectedDurationSeconds !== undefined &&
    agent.expectedDurationSeconds > 0
  ) {
    return agent.expectedDurationSeconds;
  }
  for (const profile of AGENT_TIMEOUT_PROFILES) {
    if (profile.pattern.test(agent.name)) {
      return profile.timeoutSeconds;
    }
  }
  return DEFAULT_TIMEOUT_SECONDS;
}

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
  /** Conversation ID for audit logging + pipeline resume */
  conversationId?: string;
  /** AbortSignal from the parent stream — cancels sub-agent execution when user hits Stop */
  abortSignal?: AbortSignal;
  /**
   * The current user input (first 200 chars) — used as pipeline resume fingerprint.
   * When set, Task 3.1 resume logic can skip already-completed sub-agents whose
   * cached result fingerprint matches this value.
   */
  currentInput?: string;
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

    // ── Task 3.1: Pipeline Resume ────────────────────────────────────────────
    // Load any partial results saved by previous runs of this pipeline. If the
    // fingerprint (first 200 chars of user input) matches, we can skip agents
    // that already completed successfully — saving time and API cost.
    const fingerprint = ctx.currentInput?.slice(0, 200) ?? "";
    const cachedResults =
      ctx.conversationId && fingerprint
        ? await loadPartialResults(ctx.conversationId, fingerprint)
        : {};

    const resumedAgents = Object.entries(cachedResults)
      .filter(([, r]) => r.status === "COMPLETED")
      .map(([k]) => k);

    if (resumedAgents.length > 0) {
      logger.info("Pipeline resume: will skip already-completed sub-agents", {
        callerAgentId,
        conversationId: ctx.conversationId,
        resumedAgents,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    const tools: ToolSet = {};

    for (const agent of agents) {
      const toolName = sanitizeToolName(agent.name, agent.id);
      const capturedAgent = agent;
      const capturedCtx = ctx;
      const capturedCache = cachedResults[toolName] ?? null;
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
          return executeAgentTool(capturedAgent, input, capturedCtx, capturedCache);
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
 *
 * @param cachedResult - If supplied and status=COMPLETED, returns the cached
 *   output immediately without re-running the sub-agent (Task 3.1 resume).
 */
async function executeAgentTool(
  agent: AgentInfo,
  input: string,
  ctx: AgentToolContext,
  cachedResult?: PartialResultEntry | null
): Promise<string> {
  const {
    callerAgentId,
    userId,
    depth = 0,
    callStack = [callerAgentId],
    traceId = generateSpanId(),
    conversationId,
    abortSignal,
    currentInput,
  } = ctx;

  // ── Task 3.1: Pipeline Resume — return cached output without re-running ──
  if (cachedResult?.status === "COMPLETED" && cachedResult.output) {
    logger.info("Pipeline resume: returning cached sub-agent result", {
      callerAgentId,
      calleeAgentName: agent.name,
      cachedDurationMs: cachedResult.durationMs,
      cachedAt: cachedResult.completedAt,
    });
    return cachedResult.output;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Bail out immediately if already aborted (user hit Stop before this tool call)
  if (abortSignal?.aborted) {
    return `[Agent "${agent.name}" was cancelled]`;
  }

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
      abortSignal,
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

    // Fire-and-forget: persist partial result so pipeline resume (Task 3.1) can
    // skip this agent if the orchestrator restarts mid-pipeline.
    // Fingerprint ensures cached results are only reused for the same user input.
    const myToolName = sanitizeToolName(agent.name, agent.id);
    void savePartialResult(
      conversationId,
      myToolName,
      {
        status: "COMPLETED",
        output: outputText.length > 2000 ? `${outputText.slice(0, 2000)}…` : outputText,
        durationMs,
        completedAt: new Date().toISOString(),
      },
      currentInput?.slice(0, 200)
    );

    return outputText || "[Agent returned no output]";
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isCancelled =
      errorMsg.includes("cancelled: parent stream") || abortSignal?.aborted === true;

    // Don't penalise circuit breaker for user-initiated cancellation
    if (!isCancelled) {
      recordFailure(callerAgentId, agent.id);
    }

    // Update audit log with failure/cancellation
    if (callLogId) {
      await prisma.agentCallLog
        .update({
          where: { id: callLogId },
          data: {
            status: "FAILED",
            errorMessage: isCancelled ? "cancelled by user" : errorMsg,
            durationMs,
            completedAt: new Date(),
          },
        })
        .catch((updateErr) =>
          logger.warn("Agent tool: audit log update failed", {
            error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          })
        );
    }

    if (isCancelled) {
      logger.info("Agent tool cancelled by user", {
        callerAgentId,
        calleeAgentId: agent.id,
        durationMs,
      });
      return `[Agent "${agent.name}" was cancelled]`;
    }

    // Fire-and-forget: persist failure so resume can surface which agents failed
    void savePartialResult(
      conversationId,
      sanitizeToolName(agent.name, agent.id),
      {
        status: "FAILED",
        error: errorMsg.length > 500 ? `${errorMsg.slice(0, 500)}…` : errorMsg,
        durationMs,
        completedAt: new Date().toISOString(),
      },
      currentInput?.slice(0, 200)
    );

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

// ─── Partial result persistence + pipeline resume ────────────────────────────

interface PartialResultEntry {
  status: "COMPLETED" | "FAILED";
  output?: string;
  error?: string;
  durationMs: number;
  completedAt: string;
}

/**
 * Task 3.1 — Pipeline Resume
 *
 * Load previously-saved partial results for this conversation from the DB and
 * validate them against the current request fingerprint.
 *
 * The fingerprint is the first 200 chars of the user's current message. It is
 * written alongside each partial result by savePartialResult(). If the stored
 * fingerprint matches the current one, the results belong to the same request
 * and can be safely reused to skip already-completed sub-agents.
 *
 * Returns an empty map when:
 *   - No partial results exist in the DB
 *   - The fingerprint doesn't match (different user message → fresh run)
 *   - Any DB/parse error (fail-open: run agents normally)
 */
async function loadPartialResults(
  conversationId: string,
  fingerprint: string
): Promise<Record<string, PartialResultEntry>> {
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { variables: true },
    });

    const vars = conv?.variables as Record<string, unknown> | null;
    const stored = vars?.__partial_results as Record<string, unknown> | null;
    if (!stored) return {};

    // Validate fingerprint to avoid returning stale results from a previous question
    const storedFp = stored._fp as string | undefined;
    if (storedFp !== fingerprint) {
      logger.info("Pipeline resume: fingerprint mismatch, starting fresh", {
        conversationId,
        storedFp: storedFp?.slice(0, 60),
        currentFp: fingerprint.slice(0, 60),
      });
      return {};
    }

    // Extract valid PartialResultEntry records (skip the internal _fp key)
    const results: Record<string, PartialResultEntry> = {};
    for (const [key, val] of Object.entries(stored)) {
      if (key === "_fp") continue;
      if (
        val !== null &&
        typeof val === "object" &&
        "status" in val &&
        "durationMs" in val
      ) {
        results[key] = val as PartialResultEntry;
      }
    }

    const completedCount = Object.values(results).filter(
      (r) => r.status === "COMPLETED"
    ).length;
    if (completedCount > 0) {
      logger.info("Pipeline resume: loaded cached sub-agent results", {
        conversationId,
        completedCount,
        cachedAgents: Object.entries(results)
          .filter(([, r]) => r.status === "COMPLETED")
          .map(([k]) => k),
      });
    }

    return results;
  } catch (err) {
    logger.warn("Failed to load partial results for pipeline resume — running fresh", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/**
 * Atomically merge one sub-agent result into Conversation.variables.__partial_results.
 * Uses PostgreSQL jsonb_set so parallel agents can write to different keys simultaneously
 * without losing each other's data. Fire-and-forget — never throws.
 *
 * Key: toolName (e.g. "agent_research_assistant")
 * Location: Conversation.variables.__partial_results[toolName]
 *
 * When fingerprint is supplied, also writes __partial_results._fp (the first 200 chars
 * of the user's input). This allows Task 3.1 resume logic to verify that cached results
 * belong to the same request before returning them.
 */
async function savePartialResult(
  conversationId: string | undefined,
  toolName: string,
  entry: PartialResultEntry,
  fingerprint?: string
): Promise<void> {
  if (!conversationId) return;
  try {
    const resultPath = `{__partial_results,${toolName}}`;

    if (fingerprint !== undefined) {
      // Nested jsonb_set: write fingerprint + result atomically in a single UPDATE.
      // Inner call writes _fp; outer call writes the agent result.
      const fpPath = `{__partial_results,_fp}`;
      await prisma.$executeRaw`
        UPDATE "Conversation"
        SET variables = jsonb_set(
          jsonb_set(
            COALESCE(variables::jsonb, '{}'::jsonb),
            ${fpPath}::text[],
            ${JSON.stringify(fingerprint)}::jsonb,
            true
          ),
          ${resultPath}::text[],
          ${JSON.stringify(entry)}::jsonb,
          true
        )
        WHERE id = ${conversationId}
      `;
    } else {
      // No fingerprint — just write the result (backward compat)
      await prisma.$executeRaw`
        UPDATE "Conversation"
        SET variables = jsonb_set(
          COALESCE(variables::jsonb, '{}'::jsonb),
          ${resultPath}::text[],
          ${JSON.stringify(entry)}::jsonb,
          true
        )
        WHERE id = ${conversationId}
      `;
    }
  } catch (err) {
    logger.warn("Failed to save partial result for sub-agent", {
      conversationId,
      toolName,
      error: err instanceof Error ? err.message : String(err),
    });
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
  abortSignal?: AbortSignal;
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
    abortSignal,
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

  // Abort promise: rejects immediately if signal fires (user hit Stop)
  const abortPromise = abortSignal
    ? new Promise<never>((_, reject) => {
        if (abortSignal.aborted) {
          reject(new Error("Sub-agent cancelled: parent stream was stopped"));
          return;
        }
        abortSignal.addEventListener(
          "abort",
          () => reject(new Error("Sub-agent cancelled: parent stream was stopped")),
          { once: true }
        );
      })
    : null;

  const executionPromise = executeFlow(subContext, input.message);

  let result: Awaited<typeof executionPromise>;
  const races: Promise<unknown>[] = [executionPromise, timeoutPromise];
  if (abortPromise) races.push(abortPromise);

  try {
    result = await Promise.race(races) as Awaited<typeof executionPromise>;
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
