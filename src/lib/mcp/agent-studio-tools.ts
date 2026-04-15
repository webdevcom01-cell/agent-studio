/**
 * agent-studio MCP Server — Tool Definitions & Implementations
 *
 * Exposes agent-studio capabilities as MCP tools so Claude Code,
 * Cowork, and any MCP-compatible client can interact with agents,
 * knowledge bases, and async tasks.
 *
 * Auth: Bearer API key (as_live_*) validated before every call.
 * Scopes enforced per tool:
 *   agents:read   → list_agents, get_agent, get_task_status
 *   flows:execute → trigger_agent
 *   kb:read       → search_knowledge_base
 */

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { hybridSearch } from "@/lib/knowledge/search";
import { createTask, markFailed } from "@/lib/managed-tasks/manager";
import { addMcpFlowJob } from "@/lib/queue";

// ---------------------------------------------------------------------------
// Pagination / search limits
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_LIMIT = 20;
const MAX_AGENT_LIMIT = 50;
const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 20;
const TASK_DESCRIPTION_MAX_LENGTH = 200;

// ---------------------------------------------------------------------------
// MCP Tool Definition types (MCP 2025-11-05 spec)
// ---------------------------------------------------------------------------

interface MCPToolParameter {
  type: string;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

interface MCPToolInputSchema {
  type: "object";
  properties: Record<string, MCPToolParameter>;
  required?: string[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Tool definitions (returned by tools/list)
// ---------------------------------------------------------------------------

export const AGENT_STUDIO_TOOLS: MCPToolDefinition[] = [
  {
    name: "list_agents",
    description:
      "List AI agents in the agent-studio workspace. Returns id, name, description, and model for each agent. The `returned` field shows how many agents were returned (up to the limit); use the `limit` parameter to paginate. Use this to discover available agents before triggering them.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: `Maximum number of agents to return (1-${MAX_AGENT_LIMIT}).`,
          minimum: 1,
          maximum: MAX_AGENT_LIMIT,
          default: DEFAULT_AGENT_LIMIT,
        },
        search: {
          type: "string",
          description: "Optional text to filter agents by name or description.",
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_agent",
    description:
      "Get detailed information about a specific agent including its description, model, and flow configuration summary.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The unique ID of the agent to retrieve.",
        },
      },
      required: ["agentId"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "trigger_agent",
    description:
      "Run an agent with a user message. Enqueues the agent flow for async execution and returns a taskId immediately. Poll get_task_status with the taskId to retrieve the result when status is COMPLETED. Use this to get answers, generate content, or automate tasks via your agents.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The unique ID of the agent to run.",
        },
        message: {
          type: "string",
          description: "The user message or input to send to the agent.",
        },
        variables: {
          type: "string",
          description:
            "Optional JSON string of input variables to inject into the flow (e.g. '{\"topic\":\"AI\"}').",
        },
      },
      required: ["agentId", "message"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "search_knowledge_base",
    description:
      "Search a knowledge base using hybrid semantic + keyword search (RAG). Returns relevant text chunks with relevance scores. Use this to retrieve information from documents, notes, or any indexed content.",
    inputSchema: {
      type: "object",
      properties: {
        knowledgeBaseId: {
          type: "string",
          description: "The unique ID of the knowledge base to search.",
        },
        query: {
          type: "string",
          description: "The natural language search query.",
        },
        topK: {
          type: "number",
          description: `Number of results to return (1-${MAX_TOP_K}).`,
          minimum: 1,
          maximum: MAX_TOP_K,
          default: DEFAULT_TOP_K,
        },
      },
      required: ["knowledgeBaseId", "query"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "get_task_status",
    description:
      "Check the status of an async agent task (BullMQ managed task). Returns status (PENDING, RUNNING, PAUSED, COMPLETED, FAILED, ABANDONED, CANCELLED), progress, and output when available. Poll until status is COMPLETED, FAILED, ABANDONED, or CANCELLED.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The unique ID of the agent task to check.",
        },
      },
      required: ["taskId"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

// ---------------------------------------------------------------------------
// Tool call result type
// ---------------------------------------------------------------------------

export interface MCPToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): MCPToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): MCPToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export async function callAgentStudioTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  try {
    switch (name) {
      case "list_agents":
        return await toolListAgents(args, userId);
      case "get_agent":
        return await toolGetAgent(args, userId);
      case "trigger_agent":
        return await toolTriggerAgent(args, userId);
      case "search_knowledge_base":
        return await toolSearchKnowledgeBase(args, userId);
      case "get_task_status":
        return await toolGetTaskStatus(args, userId);
      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error("agent-studio MCP tool error", { name, userId, error });
    return err(`Tool "${name}" failed unexpectedly.`);
  }
}

// ── list_agents ──────────────────────────────────────────────────────────────

async function toolListAgents(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const rawLimit = Number(args.limit ?? DEFAULT_AGENT_LIMIT);
  const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_AGENT_LIMIT, MAX_AGENT_LIMIT);
  const search = typeof args.search === "string" ? args.search : undefined;

  const agents = await prisma.agent.findMany({
    where: {
      userId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return ok({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? null,
      model: a.model,
      totalConversations: a._count.conversations,
      updatedAt: a.updatedAt.toISOString(),
    })),
    returned: agents.length,
  });
}

// ── get_agent ────────────────────────────────────────────────────────────────

async function toolGetAgent(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const agentId = typeof args.agentId === "string" ? args.agentId : null;
  if (!agentId) return err("agentId is required.");

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
    select: {
      id: true,
      name: true,
      description: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      flow: { select: { id: true } },
      knowledgeBase: { select: { id: true } },
      _count: { select: { conversations: true } },
    },
  });

  if (!agent) return err(`Agent "${agentId}" not found.`);

  return ok({
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    model: agent.model,
    hasFlow: !!agent.flow,
    hasKnowledgeBase: !!agent.knowledgeBase,
    totalConversations: agent._count.conversations,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  });
}

// ── trigger_agent ────────────────────────────────────────────────────────────

async function toolTriggerAgent(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const agentId = typeof args.agentId === "string" ? args.agentId : null;
  const message = typeof args.message === "string" ? args.message.trim() : null;

  if (!agentId) return err("agentId is required.");
  if (!message) return err("message is required and cannot be empty.");

  let inputVariables: Record<string, unknown> = {};
  if (typeof args.variables === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.variables);
    } catch {
      return err("variables must be a valid JSON string.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return err("variables must be a JSON object (e.g. {\"key\": \"value\"}).");
    }
    inputVariables = parsed as Record<string, unknown>;
  }

  // Verify the agent exists and belongs to this user before enqueueing
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
    select: { id: true, name: true, flow: { select: { id: true } } },
  });

  if (!agent) return err(`Agent "${agentId}" not found.`);
  if (!agent.flow) return err(`Agent "${agentId}" has no flow configured.`);

  // Create a ManagedAgentTask record (PENDING) — worker will execute and update it
  const task = await createTask({
    name: `MCP: ${agent.name}`,
    description: message.slice(0, TASK_DESCRIPTION_MAX_LENGTH),
    agentId,
    userId,
    input: { task: message },
  });

  // Enqueue the async flow job — returns immediately
  try {
    await addMcpFlowJob({ taskId: task.id, agentId, userId, message, variables: inputVariables });
  } catch (queueError) {
    try {
      await markFailed(task.id, "Failed to enqueue job");
    } catch {
      // best-effort cleanup — ignore secondary failure
    }
    logger.error("trigger_agent failed to enqueue job", { taskId: task.id, agentId, error: queueError });
    return err("Failed to queue agent execution. Please try again.");
  }

  logger.info("trigger_agent enqueued async flow job", { taskId: task.id, agentId, userId });

  return ok({
    taskId: task.id,
    status: "PENDING",
    message: "Agent triggered. Poll get_task_status with taskId to retrieve the result.",
  });
}

// ── search_knowledge_base ────────────────────────────────────────────────────

async function toolSearchKnowledgeBase(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const knowledgeBaseId =
    typeof args.knowledgeBaseId === "string" ? args.knowledgeBaseId : null;
  const query = typeof args.query === "string" ? args.query : null;
  const rawTopK = Number(args.topK ?? DEFAULT_TOP_K);
  const topK = Math.min(Number.isFinite(rawTopK) ? rawTopK : DEFAULT_TOP_K, MAX_TOP_K);

  if (!knowledgeBaseId) return err("knowledgeBaseId is required.");
  if (!query) return err("query is required.");

  // Verify the KB belongs to this user (KB is owned via its agent)
  const kb = await prisma.knowledgeBase.findFirst({
    where: { id: knowledgeBaseId, agent: { userId } },
    select: { id: true, name: true },
  });

  if (!kb) return err(`Knowledge base "${knowledgeBaseId}" not found.`);

  const results = await hybridSearch(query, knowledgeBaseId, { topK });

  return ok({
    knowledgeBase: kb.name,
    query,
    results: results.map((r) => ({
      content: r.content,
      score: r.relevanceScore,
      metadata: r.metadata ?? null,
    })),
    total: results.length,
  });
}

// ── get_task_status ──────────────────────────────────────────────────────────

async function toolGetTaskStatus(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const taskId = typeof args.taskId === "string" ? args.taskId : null;
  if (!taskId) return err("taskId is required.");

  const task = await prisma.managedAgentTask.findFirst({
    where: { id: taskId, userId },
    select: {
      id: true,
      status: true,
      progress: true,
      output: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  if (!task) return err(`Task "${taskId}" not found.`);

  return ok({
    id: task.id,
    status: task.status,
    progress: task.progress ?? null,
    output: task.output ?? null,
    error: task.error ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  });
}
