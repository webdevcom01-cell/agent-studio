/**
 * tools/a2a.ts — Read-only tools for inspecting the Agent-to-Agent call log.
 *
 * Tools:
 *   as_get_agent_call_log  — fetch a single call log entry by id or agent filters
 *   as_list_agent_calls    — list recent A2A calls with caller/callee name filters
 *
 * Schema notes (Railway PostgreSQL):
 *   - AgentCallLog.status uses A2ATaskStatus enum:
 *     SUBMITTED | WORKING | INPUT_REQUIRED | COMPLETED | FAILED
 *   - calleeAgentId is nullable (external URL calls have no internal callee)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, queryOne } from "../db.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface CallLogRow {
  id: string;
  callerAgentId: string;
  callerAgentName: string;
  calleeAgentId: string | null;
  calleeAgentName: string | null;
  externalUrl: string | null;
  status: string;
  inputParts: unknown;
  outputParts: unknown;
  errorMessage: string | null;
  durationMs: number | null;
  tokensUsed: number | null;
  depth: number;
  createdAt: string;
  completedAt: string | null;
}

const A2A_STATUS_VALUES = ["SUBMITTED", "WORKING", "INPUT_REQUIRED", "COMPLETED", "FAILED"] as const;
type A2AStatus = typeof A2A_STATUS_VALUES[number];

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonPreview(value: unknown, maxLen = 300): string {
  if (value === null || value === undefined) return "(none)";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return raw.length > maxLen ? raw.slice(0, maxLen) + "…" : raw;
}

function formatCallLog(row: CallLogRow) {
  return {
    id: row.id,
    callerAgentId: row.callerAgentId,
    callerAgentName: row.callerAgentName,
    calleeAgentId: row.calleeAgentId ?? null,
    calleeAgentName: row.calleeAgentName ?? null,
    externalUrl: row.externalUrl ?? null,
    status: row.status,
    durationMs: row.durationMs ?? null,
    tokensUsed: row.tokensUsed ?? null,
    depth: row.depth,
    errorMessage: row.errorMessage ?? null,
    inputPreview: jsonPreview(row.inputParts),
    outputPreview: jsonPreview(row.outputParts),
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
  };
}

const CALL_LOG_SELECT = `
  acl.id,
  acl."callerAgentId",
  caller."name" AS "callerAgentName",
  acl."calleeAgentId",
  callee."name" AS "calleeAgentName",
  acl."externalUrl",
  acl.status,
  acl."inputParts",
  acl."outputParts",
  acl."errorMessage",
  acl."durationMs",
  acl."tokensUsed",
  acl.depth,
  acl."createdAt",
  acl."completedAt"
`;

const CALL_LOG_JOINS = `
  FROM "AgentCallLog" acl
  JOIN "Agent" caller ON caller.id = acl."callerAgentId"
  LEFT JOIN "Agent" callee ON callee.id = acl."calleeAgentId"
`;

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerA2ATools(server: McpServer): void {

  // ── as_get_agent_call_log ─────────────────────────────────────────────────
  server.registerTool(
    "as_get_agent_call_log",
    {
      title: "Get Agent Call Log",
      description: `Fetch Agent-to-Agent call log entries filtered by agent name or ID.

Provide agent_name (partial ILIKE match against caller OR callee) or agent_id (exact,
matches either callerAgentId or calleeAgentId). Optionally filter by status.

Returns call id, caller/callee names, status, duration, error, and previews of
inputParts and outputParts (first 300 chars each).`,
      inputSchema: {
        agent_name: z.string().optional()
          .describe("Partial agent name — ILIKE match against caller or callee name."),
        agent_id: z.string().optional()
          .describe("Exact agent ID — matches callerAgentId or calleeAgentId."),
        status: z.enum(A2A_STATUS_VALUES).optional()
          .describe("Filter by call status: SUBMITTED | WORKING | INPUT_REQUIRED | COMPLETED | FAILED."),
        limit: z.number().int().min(1).max(50).default(10)
          .describe("Max entries to return (default 10, max 50)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id, status, limit }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (agent_id) {
        params.push(agent_id);
        conditions.push(`(acl."callerAgentId" = $${params.length} OR acl."calleeAgentId" = $${params.length})`);
      } else if (agent_name) {
        params.push(`%${agent_name}%`);
        conditions.push(`(caller."name" ILIKE $${params.length} OR callee."name" ILIKE $${params.length})`);
      }

      if (status) {
        params.push(status as A2AStatus);
        conditions.push(`acl.status = $${params.length}::"A2ATaskStatus"`);
      }

      params.push(limit);

      const rows = await query<CallLogRow>(
        `SELECT ${CALL_LOG_SELECT}
         ${CALL_LOG_JOINS}
         WHERE ${conditions.join(" AND ")}
         ORDER BY acl."createdAt" DESC
         LIMIT $${params.length}`,
        params
      );

      const calls = rows.map(formatCallLog);

      return {
        content: [{ type: "text", text: JSON.stringify(calls, null, 2) }],
        structuredContent: { calls, count: calls.length },
      };
    }
  );

  // ── as_list_agent_calls ───────────────────────────────────────────────────
  server.registerTool(
    "as_list_agent_calls",
    {
      title: "List Agent Calls",
      description: `List recent Agent-to-Agent call log entries, sorted by createdAt DESC.

Filter by caller name, callee name, status, and/or a time window (since_hours).
All filters are optional — omit all to get the most recent calls across all agents.

Returns call id, caller/callee names, status, duration, error, and input/output previews.`,
      inputSchema: {
        caller_agent_name: z.string().optional()
          .describe("Partial caller agent name — ILIKE match."),
        callee_agent_name: z.string().optional()
          .describe("Partial callee agent name — ILIKE match."),
        status: z.enum(A2A_STATUS_VALUES).optional()
          .describe("Filter by call status: SUBMITTED | WORKING | INPUT_REQUIRED | COMPLETED | FAILED."),
        since_hours: z.number().min(0).default(24)
          .describe("Only include calls created within this many hours (default 24). Set to 0 for no time filter."),
        limit: z.number().int().min(1).max(100).default(20)
          .describe("Max entries to return (default 20, max 100)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ caller_agent_name, callee_agent_name, status, since_hours, limit }) => {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (caller_agent_name) {
        params.push(`%${caller_agent_name}%`);
        conditions.push(`caller."name" ILIKE $${params.length}`);
      }

      if (callee_agent_name) {
        params.push(`%${callee_agent_name}%`);
        conditions.push(`callee."name" ILIKE $${params.length}`);
      }

      if (status) {
        params.push(status as A2AStatus);
        conditions.push(`acl.status = $${params.length}::"A2ATaskStatus"`);
      }

      if (since_hours > 0) {
        params.push(since_hours);
        conditions.push(`acl."createdAt" >= NOW() - ($${params.length} || ' hours')::INTERVAL`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit);

      const rows = await query<CallLogRow>(
        `SELECT ${CALL_LOG_SELECT}
         ${CALL_LOG_JOINS}
         ${where}
         ORDER BY acl."createdAt" DESC
         LIMIT $${params.length}`,
        params
      );

      const calls = rows.map(formatCallLog);

      return {
        content: [{ type: "text", text: JSON.stringify(calls, null, 2) }],
        structuredContent: { calls, count: calls.length },
      };
    }
  );
}
