/**
 * tools/diagnostics.ts — Diagnostic tools learned from real debugging sessions.
 *
 * Tools:
 *   as_diagnose_models    — check every agent's model vs available API keys
 *   as_health_check       — DB ping + agent/flow counts
 *   as_find_broken_flows  — detect flows with known problem patterns
 *
 * Schema notes: Agent has `isPublic` (no `enabled`). All agents are scanned
 * by default; pass public_only=true to restrict to marketplace agents.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, ping } from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentModelRow {
  id: string;
  name: string;
  model: string;
  isPublic: boolean;
  nodeModels: string[];
}

// Model → required env var mapping (mirrors src/lib/ai.ts logic)
const MODEL_KEY_MAP: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  "gpt-": "OPENAI_API_KEY",
  "o1-": "OPENAI_API_KEY",
  "o3-": "OPENAI_API_KEY",
  "o4-": "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
  llama: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
};

function requiredKeyForModel(modelId: string): string {
  for (const [prefix, envKey] of Object.entries(MODEL_KEY_MAP)) {
    if (modelId.toLowerCase().startsWith(prefix)) return envKey;
  }
  return "UNKNOWN";
}

function isKeySet(envKey: string): boolean {
  return !!process.env[envKey];
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerDiagnosticTools(server: McpServer): void {

  // ── as_diagnose_models ────────────────────────────────────────────────────
  server.registerTool(
    "as_diagnose_models",
    {
      title: "Diagnose Agent Models",
      description: `Check every agent's configured model and flag ones whose required API key
is missing from the server environment.

This is the direct equivalent of the diagnose-model-mismatch.ts script.
Run this whenever you see AI calls silently failing or "input variable is empty" errors.

Returns:
- Per-agent model info
- Whether the required API key is set on THIS server
- A list of agents that will fail at runtime due to missing keys
- Summary of all configured API keys (masked)`,
      inputSchema: {
        public_only: z.boolean().default(false)
          .describe("If true, only check public agents. Default: scan all agents."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ public_only }) => {
      const rows = await query<{
        id: string; name: string; model: string; isPublic: boolean; flowContent: unknown;
      }>(
        `SELECT a.id, a.name, a.model, a."isPublic", f.content as "flowContent"
         FROM "Agent" a
         LEFT JOIN "Flow" f ON f."agentId" = a.id
         ${public_only ? `WHERE a."isPublic" = true` : ""}
         ORDER BY a.name ASC`
      );

      const results: AgentModelRow[] = rows.map(row => {
        const content = row.flowContent as { nodes?: Array<{ type: string; data: { model?: string } }> } | null;
        const nodeModels = (content?.nodes ?? [])
          .filter(n => n.type === "ai_response" && n.data.model)
          .map(n => n.data.model as string);
        return { id: row.id, name: row.name, model: row.model, isPublic: row.isPublic, nodeModels };
      });

      // Check API key status
      const checkedKeys = new Set<string>();
      const keyStatus: Record<string, boolean> = {};

      const agentDiagnosis = results.map(agent => {
        const requiredKey = requiredKeyForModel(agent.model);
        if (!checkedKeys.has(requiredKey)) {
          keyStatus[requiredKey] = isKeySet(requiredKey);
          checkedKeys.add(requiredKey);
        }

        // Also check node-level models
        const nodeIssues: string[] = [];
        for (const nodeModel of agent.nodeModels) {
          const nk = requiredKeyForModel(nodeModel);
          if (!checkedKeys.has(nk)) {
            keyStatus[nk] = isKeySet(nk);
            checkedKeys.add(nk);
          }
          if (!keyStatus[nk]) {
            nodeIssues.push(`node model '${nodeModel}' requires ${nk} (NOT SET)`);
          }
        }

        const agentKeyOk = keyStatus[requiredKey];
        return {
          name: agent.name,
          agentModel: agent.model,
          requiredKey,
          keyConfigured: agentKeyOk,
          nodeModels: agent.nodeModels,
          nodeIssues,
          status: !agentKeyOk || nodeIssues.length > 0 ? "❌ WILL FAIL" : "✅ OK",
        };
      });

      const broken = agentDiagnosis.filter(a => a.status.includes("FAIL"));

      // API keys summary (masked)
      const keysSummary: Record<string, string> = {};
      for (const [key, ok] of Object.entries(keyStatus)) {
        const val = process.env[key];
        keysSummary[key] = ok
          ? `✅ SET (${val!.slice(0, 4)}…${val!.slice(-4)})`
          : "❌ NOT SET";
      }

      const out = {
        summary: {
          total: agentDiagnosis.length,
          broken: broken.length,
          ok: agentDiagnosis.length - broken.length,
        },
        apiKeys: keysSummary,
        agents: agentDiagnosis,
        brokenAgents: broken.map(a => a.name),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_health_check ───────────────────────────────────────────────────────
  server.registerTool(
    "as_health_check",
    {
      title: "Health Check",
      description: `Verify the MCP server can reach the database and return basic counts.
Use this as a first step to confirm the connection is working.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const dbOk = await ping();

      if (!dbOk) {
        return {
          content: [{ type: "text", text: "❌ Database unreachable. Check DATABASE_URL env var." }],
          structuredContent: { dbOk: false },
        };
      }

      const [counts] = await query<{
        agents: string; public_agents: string; flows: string; executions: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM "Agent") as agents,
           (SELECT COUNT(*) FROM "Agent" WHERE "isPublic" = true) as public_agents,
           (SELECT COUNT(*) FROM "Flow") as flows,
           (SELECT COUNT(*) FROM "AgentExecution") as executions`
      );

      const out = {
        dbOk: true,
        agents: { total: Number(counts.agents), public: Number(counts.public_agents) },
        flows: Number(counts.flows),
        executions: Number(counts.executions),
        serverTime: new Date().toISOString(),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_find_broken_flows ──────────────────────────────────────────────────
  server.registerTool(
    "as_find_broken_flows",
    {
      title: "Find Broken Flows",
      description: `Scan all flows for known problem patterns discovered during debugging sessions:

1. ai_response nodes with no outputVariable — downstream nodes can't read the result
2. ai_response nodes whose prompt is empty — model gets no instructions
3. call_agent nodes targeting non-existent agents
4. sandbox_verify nodes whose inputVariable doesn't match any upstream outputVariable

Returns a list of issues per agent with severity and suggested fixes.`,
      inputSchema: {
        public_only: z.boolean().default(false)
          .describe("Only scan public agents (default false = scan all)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ public_only }) => {
      const rows = await query<{ name: string; content: unknown }>(
        `SELECT a.name, f.content
         FROM "Agent" a
         JOIN "Flow" f ON f."agentId" = a.id
         ${public_only ? `WHERE a."isPublic" = true` : ""}
         ORDER BY a.name ASC`
      );

      // Get all known agent names for call_agent validation (all agents — names
      // referenced in flows might be private agents owned by the same user).
      const allAgentNames = (await query<{ name: string }>(
        `SELECT name FROM "Agent"`
      )).map(r => r.name.toLowerCase());

      const issues: Array<{ agent: string; severity: "ERROR" | "WARN"; issue: string; fix: string }> = [];

      for (const row of rows) {
        const content = row.content as { nodes?: Array<{ id: string; type: string; data: Record<string, unknown> }> };
        const nodes = content?.nodes ?? [];

        // Collect all outputVariables produced in this flow
        const producedVars = new Set<string>(
          nodes
            .map(n => n.data.outputVariable as string | undefined)
            .filter((v): v is string => !!v)
        );

        for (const node of nodes) {
          if (node.type === "ai_response") {
            if (!node.data.outputVariable) {
              issues.push({
                agent: row.name,
                severity: "WARN",
                issue: `Node '${node.id}': ai_response has no outputVariable — result is lost.`,
                fix: `Set outputVariable on the node. Use as_patch_node_field with field_name='outputVariable'.`,
              });
            }
            if (!node.data.prompt || (node.data.prompt as string).trim() === "") {
              issues.push({
                agent: row.name,
                severity: "ERROR",
                issue: `Node '${node.id}': ai_response prompt is empty — model gets no instructions.`,
                fix: `Set prompt using as_update_agent_prompt.`,
              });
            }
          }

          if (node.type === "call_agent") {
            const targetName = (node.data.agentName as string | undefined)?.toLowerCase();
            if (targetName && !allAgentNames.includes(targetName)) {
              issues.push({
                agent: row.name,
                severity: "ERROR",
                issue: `Node '${node.id}': call_agent targets '${node.data.agentName}' which does not exist.`,
                fix: `Check agent name spelling.`,
              });
            }
          }

          if (node.type === "sandbox_verify") {
            const inputVar = node.data.inputVariable as string | undefined;
            if (inputVar && !producedVars.has(inputVar)) {
              issues.push({
                agent: row.name,
                severity: "ERROR",
                issue: `Node '${node.id}': sandbox_verify reads '${inputVar}' but no upstream node produces it.`,
                fix: `Check that the ai_response node before this has outputVariable='${inputVar}'.`,
              });
            }
          }
        }
      }

      const out = {
        scanned: rows.length,
        issueCount: issues.length,
        errors: issues.filter(i => i.severity === "ERROR").length,
        warnings: issues.filter(i => i.severity === "WARN").length,
        issues,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
