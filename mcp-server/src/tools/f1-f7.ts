/**
 * tools/f1-f7.ts — Tools for F1-F7 features (Budget, Org Chart, Goals, Heartbeat, Templates).
 *
 * Tools (9 total):
 *   as_get_agent_budget         — F1: get agent cost budget and current spend
 *   as_set_agent_budget         — F1: create or update agent budget limits
 *   as_get_org_chart            — F2: get department hierarchy tree
 *   as_assign_agent_department  — F2: assign an agent to a department
 *   as_list_agent_goals         — F4: list goals linked to an agent
 *   as_link_goal_to_agent       — F4: link a goal to an agent
 *   as_get_heartbeat_status     — F3: get heartbeat config + recent runs
 *   as_set_heartbeat_context    — F3: write a key-value pair into heartbeat context
 *   as_export_agent_template    — F7: export an agent as a portable Clipmart template
 *
 * All tools use the REST API (USER mode) via AGENT_STUDIO_URL + AGENT_STUDIO_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ── REST helper ───────────────────────────────────────────────────────────────

interface EnvConfig {
  studioUrl: string;
  apiKey: string;
}

function getEnv(): EnvConfig | { error: string } {
  const studioUrl = process.env.AGENT_STUDIO_URL;
  const apiKey = process.env.AGENT_STUDIO_API_KEY;
  if (!studioUrl || !apiKey) {
    return { error: "AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY must both be set." };
  }
  return { studioUrl: studioUrl.replace(/\/$/, ""), apiKey };
}

async function apiGet(path: string): Promise<unknown> {
  const env = getEnv();
  if ("error" in env) throw new Error(env.error);
  const res = await fetch(`${env.studioUrl}${path}`, {
    headers: { "x-api-key": env.apiKey },
  });
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const env = getEnv();
  if ("error" in env) throw new Error(env.error);
  const res = await fetch(`${env.studioUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.apiKey },
    body: JSON.stringify(body),
  });
  return res.json();
}

function ok(data: unknown): ReturnType<Parameters<McpServer["registerTool"]>[2]> {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function err(message: string): ReturnType<Parameters<McpServer["registerTool"]>[2]> {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerF1F7Tools(server: McpServer): void {

  // F1 ── as_get_agent_budget ─────────────────────────────────────────────────
  server.registerTool(
    "as_get_agent_budget",
    {
      title: "Get Agent Budget",
      description: `Get the cost budget configuration and current monthly spend for an agent.

Returns hardLimitUsd, softLimitUsd, currentSpendUsd, alertThreshold, isHardStop, and periodStart.
Returns null data if no budget is configured for the agent.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id }) => {
      try {
        const data = await apiGet(`/api/agents/${agent_id}/budget`);
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F1 ── as_set_agent_budget ─────────────────────────────────────────────────
  server.registerTool(
    "as_set_agent_budget",
    {
      title: "Set Agent Budget",
      description: `Create or update the monthly cost budget for an agent.

Set hardLimitUsd to block new requests when the limit is hit (requires isHardStop: true).
Set softLimitUsd for an alert-only threshold.
alertThreshold (0.0–1.0) triggers a warning alert when spend / hardLimit exceeds it.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
        hardLimitUsd: z.number().min(0).optional().describe("Hard monthly limit in USD. 0 = no limit."),
        softLimitUsd: z.number().min(0).optional().describe("Soft monthly limit in USD for alerts only."),
        alertThreshold: z.number().min(0).max(1).optional().describe("Fraction of hard limit that triggers alert (default 0.8)."),
        isHardStop: z.boolean().optional().describe("If true, block requests when hard limit is hit (default true)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id, hardLimitUsd, softLimitUsd, alertThreshold, isHardStop }) => {
      try {
        const data = await apiPost(`/api/agents/${agent_id}/budget`, { hardLimitUsd, softLimitUsd, alertThreshold, isHardStop });
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F2 ── as_get_org_chart ────────────────────────────────────────────────────
  server.registerTool(
    "as_get_org_chart",
    {
      title: "Get Org Chart",
      description: `Get the department hierarchy tree for an organization.

Returns a flat list of departments with parentId for tree reconstruction.
Use this to understand the organization structure before assigning agents to departments.`,
      inputSchema: {
        org_id: z.string().describe("Organization ID."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ org_id }) => {
      try {
        const data = await apiGet(`/api/departments?orgId=${org_id}`);
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F2 ── as_assign_agent_department ─────────────────────────────────────────
  server.registerTool(
    "as_assign_agent_department",
    {
      title: "Assign Agent to Department",
      description: `Assign an agent to a department in the org chart.

Use as_get_org_chart first to find the correct departmentId.
An agent can only belong to one department at a time.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
        department_id: z.string().describe("Department ID to assign the agent to."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id, department_id }) => {
      try {
        const data = await apiPost(`/api/agents/${agent_id}/department`, { departmentId: department_id });
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F4 ── as_list_agent_goals ─────────────────────────────────────────────────
  server.registerTool(
    "as_list_agent_goals",
    {
      title: "List Agent Goals",
      description: `List all goals linked to an agent, including inherited goals from parent agents.

Returns goal title, description, successMetric, priority, status, role (OWNER/CONTRIBUTOR/OBSERVER),
and inherited flag with inheritedFrom agent ID when the goal comes from a parent.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id }) => {
      try {
        const data = await apiGet(`/api/agents/${agent_id}/goals`);
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F4 ── as_link_goal_to_agent ───────────────────────────────────────────────
  server.registerTool(
    "as_link_goal_to_agent",
    {
      title: "Link Goal to Agent",
      description: `Link an existing goal to an agent with a role (OWNER, CONTRIBUTOR, or OBSERVER).

The goal must already exist — use POST /api/goals to create one first if needed.
Returns the AgentGoalLink record on success.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
        goal_id: z.string().describe("Goal ID to link."),
        role: z.enum(["OWNER", "CONTRIBUTOR", "OBSERVER"]).optional().describe("Agent's role for this goal (default CONTRIBUTOR)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id, goal_id, role }) => {
      try {
        const data = await apiPost(`/api/agents/${agent_id}/goals`, { goalId: goal_id, role });
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F3 ── as_get_heartbeat_status ─────────────────────────────────────────────
  server.registerTool(
    "as_get_heartbeat_status",
    {
      title: "Get Agent Heartbeat Status",
      description: `Get the heartbeat configuration and recent run history for an agent.

Returns cronExpression, timezone, enabled status, maxContextItems, and the 5 most recent runs.
Use this to check if a heartbeat is configured and when it last ran.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id }) => {
      try {
        const data = await apiGet(`/api/agents/${agent_id}/heartbeat`);
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F3 ── as_set_heartbeat_context ────────────────────────────────────────────
  server.registerTool(
    "as_set_heartbeat_context",
    {
      title: "Set Heartbeat Context Value",
      description: `Write a key-value pair into an agent's persistent heartbeat context.

The context is injected as a formatted memory prompt at the start of each heartbeat run.
Use this to pass state, instructions, or data that the agent should remember across runs.
Optionally set a TTL in seconds after which the key will be automatically pruned.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID."),
        org_id: z.string().describe("Organization ID."),
        key: z.string().min(1).max(200).describe("Context key (e.g. 'last_report_date')."),
        value: z.unknown().describe("Context value (any JSON-serializable value)."),
        ttl_seconds: z.number().int().min(1).optional().describe("TTL in seconds. Omit for no expiry."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_id, org_id, key, value, ttl_seconds }) => {
      try {
        const data = await apiPost(`/api/agents/${agent_id}/heartbeat/context`, {
          organizationId: org_id,
          key,
          value,
          ttlSeconds: ttl_seconds,
        });
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // F7 ── as_export_agent_template ────────────────────────────────────────────
  server.registerTool(
    "as_export_agent_template",
    {
      title: "Export Agent as Template",
      description: `Export an agent as a portable Clipmart template (F7).

Generates a scrubbed JSON payload — all secrets, API keys, and private URLs are removed.
MCP server URLs become placeholder variables like \${MCP_SERVER_NAME_URL}.
Returns { payload, checksum } for download, and optionally saves to the Clipmart marketplace.

Set save: true with name and description to publish to the Clipmart marketplace.`,
      inputSchema: {
        agent_id: z.string().describe("Exact agent ID to export."),
        save: z.boolean().optional().describe("If true, save to Clipmart marketplace in addition to returning payload."),
        name: z.string().optional().describe("Template name (required if save: true)."),
        description: z.string().optional().describe("Template description."),
        is_public: z.boolean().optional().describe("If true, publish to public Clipmart marketplace."),
        category: z.enum(["GENERAL", "SALES", "SUPPORT", "ENGINEERING", "MARKETING"]).optional().describe("Template category."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ agent_id, save, name, description, is_public, category }) => {
      try {
        const data = await apiPost(`/api/agents/${agent_id}/export`, {
          save,
          name,
          description,
          isPublic: is_public,
          category,
        });
        return ok(data);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
