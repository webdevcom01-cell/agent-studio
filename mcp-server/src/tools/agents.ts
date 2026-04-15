/**
 * tools/agents.ts — Read-only tools for inspecting agents and flows.
 *
 * Tools:
 *   as_list_agents        — list all agents (name, model, isPublic, category)
 *   as_get_agent          — full agent details + flow node summary
 *   as_inspect_flow       — detailed flow: nodes, edges, prompt preview
 *   as_get_recent_executions — latest AgentExecution records for an agent
 *
 * Schema notes (Railway PostgreSQL):
 *   - Agent has `isPublic` (no `enabled` column).
 *   - AgentExecution has `startedAt`, `completedAt`, `durationMs`, `outputResult`
 *     (no `updatedAt`, no `output`).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, queryOne } from "../db.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  model: string;
  isPublic: boolean;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  flowId: string | null;
}

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

interface FlowContent {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: unknown[];
}

interface ExecutionRow {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  outputResult: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function promptPreview(prompt: unknown, maxLen = 200): string {
  if (typeof prompt !== "string" || !prompt) return "(empty)";
  return prompt.length > maxLen ? prompt.slice(0, maxLen) + "…" : prompt;
}

function summariseNode(node: FlowNode): string {
  const d = node.data;
  switch (node.type) {
    case "ai_response":
      return `ai_response | model=${d.model ?? "default"} | out=${d.outputVariable ?? "-"} | prompt: ${promptPreview(d.prompt)}`;
    case "sandbox_verify":
      return `sandbox_verify | inputVar=${d.inputVariable ?? "-"}`;
    case "call_agent":
      return `call_agent | target=${d.agentName ?? d.agentId ?? "?"} | out=${d.outputVariable ?? "-"}`;
    case "project_context":
      return `project_context | vars: ${Object.keys(d).filter(k => k !== "label").join(", ")}`;
    case "human_input":
      return `human_input | var=${d.outputVariable ?? "-"}`;
    default:
      return `${node.type} | id=${node.id}`;
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerAgentTools(server: McpServer): void {

  // ── as_list_agents ────────────────────────────────────────────────────────
  server.registerTool(
    "as_list_agents",
    {
      title: "List Agents",
      description: `List all agents in the agent-studio database.

Returns name, model, isPublic, category, and IDs.
Use this as first step before inspecting a specific agent.

Returns JSON array of agents sorted by name.`,
      inputSchema: {
        filter_public: z.boolean().optional()
          .describe("If true, return only public agents. If false, only private. Omit for all."),
        search: z.string().optional()
          .describe("Case-insensitive substring match on agent name."),
        limit: z.number().int().min(1).max(200).default(50)
          .describe("Max agents to return (default 50)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ filter_public, search, limit }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filter_public !== undefined) {
        params.push(filter_public);
        conditions.push(`a."isPublic" = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`a.name ILIKE $${params.length}`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit);

      const rows = await query<AgentRow>(
        `SELECT a.id, a.name, a.description, a.model, a."isPublic", a.category,
                a."createdAt", a."updatedAt", f.id as "flowId"
         FROM "Agent" a
         LEFT JOIN "Flow" f ON f."agentId" = a.id
         ${where}
         ORDER BY a.name ASC
         LIMIT $${params.length}`,
        params
      );

      const out = rows.map(r => ({
        id: r.id,
        name: r.name,
        model: r.model,
        isPublic: r.isPublic,
        category: r.category,
        hasFlow: !!r.flowId,
        createdAt: r.createdAt,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: { agents: out, count: out.length },
      };
    }
  );

  // ── as_get_agent ──────────────────────────────────────────────────────────
  server.registerTool(
    "as_get_agent",
    {
      title: "Get Agent Details",
      description: `Get full details for a single agent by name or ID, including its flow node summary.

Provide either agent_name (partial, case-insensitive) or agent_id (exact ID).
Returns agent config + a readable summary of each flow node.`,
      inputSchema: {
        agent_name: z.string().optional()
          .describe("Partial agent name — case-insensitive LIKE match."),
        agent_id: z.string().optional()
          .describe("Exact agent ID (cuid)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const condition = agent_id
        ? `a.id = $1`
        : `a.name ILIKE $1`;
      const param = agent_id ?? `%${agent_name}%`;

      const row = await queryOne<AgentRow & { systemPrompt: string | null; flowContent: FlowContent | null }>(
        `SELECT a.id, a.name, a.description, a.model, a."isPublic", a.category,
                a."systemPrompt", a."createdAt", a."updatedAt",
                f.id as "flowId", f.content as "flowContent"
         FROM "Agent" a
         LEFT JOIN "Flow" f ON f."agentId" = a.id
         WHERE ${condition}
         LIMIT 1`,
        [param]
      );

      if (!row) {
        return { content: [{ type: "text", text: `Agent not found: ${agent_name ?? agent_id}` }] };
      }

      const nodeSummaries = row.flowContent
        ? (row.flowContent as FlowContent).nodes.map(n => summariseNode(n))
        : [];

      const out = {
        id: row.id,
        name: row.name,
        model: row.model,
        isPublic: row.isPublic,
        category: row.category,
        description: row.description,
        flowId: row.flowId,
        nodeCount: nodeSummaries.length,
        nodes: nodeSummaries,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_inspect_flow ───────────────────────────────────────────────────────
  server.registerTool(
    "as_inspect_flow",
    {
      title: "Inspect Agent Flow",
      description: `Deep inspection of an agent's flow — full node data including complete prompts.

Use this when you need to read the actual prompt text, outputVariable, model,
inputMapping, or any other node configuration.

Returns full nodes array and edges array from the flow JSON.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name."),
        agent_id: z.string().optional().describe("Exact agent ID."),
        node_type: z.string().optional()
          .describe("Filter to only this node type (e.g. 'ai_response', 'call_agent')."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id, node_type }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const condition = agent_id ? `a.id = $1` : `a.name ILIKE $1`;
      const param = agent_id ?? `%${agent_name}%`;

      const row = await queryOne<{ name: string; content: FlowContent }>(
        `SELECT a.name, f.content
         FROM "Agent" a
         JOIN "Flow" f ON f."agentId" = a.id
         WHERE ${condition}
         LIMIT 1`,
        [param]
      );

      if (!row) {
        return { content: [{ type: "text", text: `Agent or flow not found: ${agent_name ?? agent_id}` }] };
      }

      const content = row.content as FlowContent;
      let nodes = content.nodes ?? [];
      if (node_type) nodes = nodes.filter(n => n.type === node_type);

      const out = {
        agentName: row.name,
        nodeCount: nodes.length,
        edgeCount: (content.edges ?? []).length,
        nodes,
        edges: content.edges ?? [],
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_get_recent_executions ──────────────────────────────────────────────
  server.registerTool(
    "as_get_recent_executions",
    {
      title: "Get Recent Agent Executions",
      description: `List the most recent AgentExecution records for an agent.

Useful to check if an agent has been running, what its status was,
and whether there are recent errors.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name."),
        agent_id: z.string().optional().describe("Exact agent ID."),
        limit: z.number().int().min(1).max(50).default(10)
          .describe("Number of executions to return (default 10)."),
        status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional()
          .describe("Filter by execution status."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id, limit, status }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const agentCondition = agent_id ? `a.id = $1` : `a.name ILIKE $1`;
      const agentParam = agent_id ?? `%${agent_name}%`;

      const agentRow = await queryOne<{ id: string; name: string }>(
        `SELECT id, name FROM "Agent" a WHERE ${agentCondition} LIMIT 1`,
        [agentParam]
      );

      if (!agentRow) {
        return { content: [{ type: "text", text: `Agent not found: ${agent_name ?? agent_id}` }] };
      }

      const params: unknown[] = [agentRow.id];
      let statusFilter = "";
      if (status) {
        params.push(status);
        statusFilter = `AND e.status = $${params.length}`;
      }
      params.push(limit);

      const rows = await query<ExecutionRow>(
        `SELECT e.id, e.status, e."startedAt", e."completedAt", e."durationMs",
                e.error, e."outputResult"
         FROM "AgentExecution" e
         WHERE e."agentId" = $1 ${statusFilter}
         ORDER BY e."startedAt" DESC
         LIMIT $${params.length}`,
        params
      );

      const out = {
        agentId: agentRow.id,
        agentName: agentRow.name,
        count: rows.length,
        executions: rows.map(r => ({
          id: r.id,
          status: r.status,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          durationMs: r.durationMs,
          error: r.error ?? null,
          outputPreview: r.outputResult
            ? JSON.stringify(r.outputResult).slice(0, 300)
            : null,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
