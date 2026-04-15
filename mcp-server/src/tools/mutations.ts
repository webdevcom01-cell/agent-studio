/**
 * tools/mutations.ts — Write tools for modifying agents and flows.
 *
 * Tools:
 *   as_update_agent_model   — change model on agent + all ai_response nodes in flow
 *   as_set_agent_public     — toggle agent's isPublic flag (marketplace visibility)
 *   as_patch_node_field     — update a specific field in a flow node's data
 *   as_update_agent_prompt  — replace the prompt on an ai_response node
 *   as_delete_agent         — permanently delete an agent + all dependent rows (transactional)
 *   as_update_flow          — replace entire nodes+edges array in a flow (structural rewiring)
 *
 * Schema notes: Agent has `isPublic` (no `enabled`).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, queryOne, getPool } from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface FlowContent {
  nodes: FlowNode[];
  edges: unknown[];
  variables?: unknown[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAgentWithFlow(
  agent_name?: string,
  agent_id?: string
): Promise<{ id: string; name: string; flowId: string; content: FlowContent } | null> {
  const condition = agent_id ? `a.id = $1` : `a.name ILIKE $1`;
  const param = agent_id ?? `%${agent_name}%`;

  const row = await queryOne<{ id: string; name: string; flowId: string; content: FlowContent }>(
    `SELECT a.id, a.name, f.id as "flowId", f.content
     FROM "Agent" a
     JOIN "Flow" f ON f."agentId" = a.id
     WHERE ${condition}
     LIMIT 1`,
    [param]
  );
  return row;
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerMutationTools(server: McpServer): void {

  // ── as_update_agent_model ─────────────────────────────────────────────────
  server.registerTool(
    "as_update_agent_model",
    {
      title: "Update Agent Model",
      description: `Change the AI model for an agent and all its ai_response flow nodes.

This is the equivalent of the fix-switch-to-openai.ts / fix-switch-to-deepseek.ts
diagnostic scripts — executed directly without any file or deploy step.

Updates BOTH:
  1. Agent.model (the top-level config)
  2. Every ai_response node's data.model inside the flow JSON

Common models:
  - gpt-4.1          (OpenAI, balanced, good for code)
  - gpt-4.1-mini     (OpenAI, fast, cheap — good for review/lighter tasks)
  - deepseek-chat    (DeepSeek, excellent for code, cheapest)
  - claude-sonnet-4-6  (Anthropic — requires ANTHROPIC_API_KEY on server)`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name (case-insensitive)."),
        agent_id: z.string().optional().describe("Exact agent UUID."),
        model: z.string().min(1).describe("Target model ID, e.g. 'gpt-4.1' or 'deepseek-chat'."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id, model }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const row = await getAgentWithFlow(agent_name, agent_id);
      if (!row) {
        return { content: [{ type: "text", text: `Agent or flow not found: ${agent_name ?? agent_id}` }] };
      }

      // 1. Update Agent.model
      await query(`UPDATE "Agent" SET model = $1, "updatedAt" = NOW() WHERE id = $2`, [model, row.id]);

      // 2. Patch all ai_response nodes in flow
      const content = row.content as FlowContent;
      let patchedCount = 0;
      const patchLog: string[] = [];

      for (const node of content.nodes) {
        if (node.type === "ai_response") {
          const old = node.data.model ?? "(default)";
          node.data.model = model;
          patchLog.push(`  node ${node.id}: ${old} → ${model}`);
          patchedCount++;
        }
      }

      if (patchedCount > 0) {
        await query(
          `UPDATE "Flow" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(content), row.flowId]
        );
      }

      const out = {
        success: true,
        agentId: row.id,
        agentName: row.name,
        newModel: model,
        patchedNodes: patchedCount,
        details: patchLog,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_set_agent_public ───────────────────────────────────────────────────
  server.registerTool(
    "as_set_agent_public",
    {
      title: "Set Agent Public/Private",
      description: `Toggle an agent's visibility (isPublic flag).

Public agents appear in the marketplace; private agents are visible only
to their owner. agent-studio has no enable/disable concept — this is the
closest analog for taking an agent out of public circulation.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name."),
        agent_id: z.string().optional().describe("Exact agent ID."),
        isPublic: z.boolean().describe("true to publish, false to make private."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name, agent_id, isPublic }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const condition = agent_id ? `id = $1` : `name ILIKE $1`;
      const param = agent_id ?? `%${agent_name}%`;

      const existing = await queryOne<{ id: string; name: string; isPublic: boolean }>(
        `SELECT id, name, "isPublic" FROM "Agent" WHERE ${condition} LIMIT 1`,
        [param]
      );

      if (!existing) {
        return { content: [{ type: "text", text: `Agent not found: ${agent_name ?? agent_id}` }] };
      }

      await query(
        `UPDATE "Agent" SET "isPublic" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [isPublic, existing.id]
      );

      const out = {
        success: true,
        agentId: existing.id,
        agentName: existing.name,
        previousIsPublic: existing.isPublic,
        newIsPublic: isPublic,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_patch_node_field ───────────────────────────────────────────────────
  server.registerTool(
    "as_patch_node_field",
    {
      title: "Patch Flow Node Field",
      description: `Update a specific field inside a flow node's data object.

Use this to change outputVariable, inputMapping, temperature, maxTokens,
or any other node.data field without replacing the entire flow.

The field_value is parsed as JSON — use quoted strings for string values:
  field_value: '"my-variable"'   (string)
  field_value: '0.7'             (number)
  field_value: 'true'            (boolean)
  field_value: '{"key":"value"}' (object)

Warning: changes are applied directly to the database. Double-check
agent_name and node_id before calling.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name."),
        agent_id: z.string().optional().describe("Exact agent UUID."),
        node_id: z.string().describe("The node ID to patch (from as_inspect_flow)."),
        field_name: z.string().describe("The data field to update, e.g. 'outputVariable', 'model', 'temperature'."),
        field_value: z.string().describe("New value as a JSON literal, e.g. '\"gpt-4.1\"' or '0.5'."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ agent_name, agent_id, node_id, field_name, field_value }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      // Parse value
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(field_value);
      } catch {
        return { content: [{ type: "text", text: `Error: field_value is not valid JSON. Use '"string"', '42', 'true', or '{"key":"val"}'.` }] };
      }

      const row = await getAgentWithFlow(agent_name, agent_id);
      if (!row) {
        return { content: [{ type: "text", text: `Agent or flow not found: ${agent_name ?? agent_id}` }] };
      }

      const content = row.content as FlowContent;
      const node = content.nodes.find(n => n.id === node_id);
      if (!node) {
        const ids = content.nodes.map(n => `${n.id} (${n.type})`).join(", ");
        return { content: [{ type: "text", text: `Node '${node_id}' not found. Available: ${ids}` }] };
      }

      const oldValue = node.data[field_name];
      node.data[field_name] = parsedValue;

      await query(
        `UPDATE "Flow" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
        [JSON.stringify(content), row.flowId]
      );

      const out = {
        success: true,
        agentName: row.name,
        nodeId: node_id,
        nodeType: node.type,
        field: field_name,
        oldValue,
        newValue: parsedValue,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_update_agent_prompt ────────────────────────────────────────────────
  server.registerTool(
    "as_update_agent_prompt",
    {
      title: "Update Agent Prompt",
      description: `Replace the prompt on an ai_response node in an agent's flow.

This is the surgical version of rewriting an agent's instructions.
The prompt goes into node.data.prompt (the only field the handler reads).

If the agent has multiple ai_response nodes, specify node_id to target
the right one (get node IDs from as_inspect_flow).`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name."),
        agent_id: z.string().optional().describe("Exact agent UUID."),
        node_id: z.string().optional()
          .describe("Target node ID. If omitted, patches the first ai_response node."),
        prompt: z.string().min(1).describe("New prompt text. Use {{variable}} for template substitution."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ agent_name, agent_id, node_id, prompt }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const row = await getAgentWithFlow(agent_name, agent_id);
      if (!row) {
        return { content: [{ type: "text", text: `Agent or flow not found: ${agent_name ?? agent_id}` }] };
      }

      const content = row.content as FlowContent;
      const node = node_id
        ? content.nodes.find(n => n.id === node_id)
        : content.nodes.find(n => n.type === "ai_response");

      if (!node) {
        return { content: [{ type: "text", text: `No ai_response node found${node_id ? ` with id '${node_id}'` : ""}.` }] };
      }

      const oldPromptPreview = typeof node.data.prompt === "string"
        ? node.data.prompt.slice(0, 150) + "…"
        : "(empty)";

      node.data.prompt = prompt;

      await query(
        `UPDATE "Flow" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
        [JSON.stringify(content), row.flowId]
      );

      const out = {
        success: true,
        agentName: row.name,
        nodeId: node.id,
        oldPromptPreview,
        newPromptLength: prompt.length,
        newPromptPreview: prompt.slice(0, 150) + (prompt.length > 150 ? "…" : ""),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_delete_agent ───────────────────────────────────────────────────────
  server.registerTool(
    "as_delete_agent",
    {
      title: "Delete Agent",
      description: `Permanently delete an agent and all its dependent rows (Flow, AgentExecution, etc.).

⚠️ DESTRUCTIVE — cannot be undone. Requires confirm=true to execute.
Without confirm=true this returns a dry-run preview listing what would be deleted.

The tool dynamically discovers every table with a FK to "Agent" via information_schema,
then deletes rows from each in a single transaction before deleting the agent itself.
If any DELETE fails, the entire transaction rolls back.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name (case-insensitive)."),
        agent_id: z.string().optional().describe("Exact agent UUID."),
        confirm: z.boolean().default(false)
          .describe("Must be true to actually delete. Default false = dry-run preview."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ agent_name, agent_id, confirm }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const condition = agent_id ? `id = $1` : `name ILIKE $1`;
      const param = agent_id ?? `%${agent_name}%`;

      const agent = await queryOne<{ id: string; name: string }>(
        `SELECT id, name FROM "Agent" WHERE ${condition} LIMIT 1`,
        [param]
      );

      if (!agent) {
        return { content: [{ type: "text", text: `Agent not found: ${agent_name ?? agent_id}` }] };
      }

      // Discover every table/column with FK → "Agent"
      const fkRows = await query<{ table_name: string; column_name: string }>(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND ccu.table_name = 'Agent'
           AND ccu.column_name = 'id'`
      );

      // Count rows that would be deleted per FK table
      const previewCounts: Record<string, number> = {};
      for (const { table_name, column_name } of fkRows) {
        const [row] = await query<{ count: string }>(
          `SELECT COUNT(*)::text as count FROM "${table_name}" WHERE "${column_name}" = $1`,
          [agent.id]
        );
        previewCounts[`${table_name}.${column_name}`] = Number(row.count);
      }

      if (!confirm) {
        const out = {
          dryRun: true,
          wouldDelete: { id: agent.id, name: agent.name },
          dependentRows: previewCounts,
          foreignKeys: fkRows.map(r => `${r.table_name}.${r.column_name}`),
          hint: "Pass confirm=true to actually delete.",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
        };
      }

      // Execute transactional delete
      const client = await getPool().connect();
      const deletedCounts: Record<string, number> = {};
      try {
        await client.query("BEGIN");
        for (const { table_name, column_name } of fkRows) {
          const r = await client.query(
            `DELETE FROM "${table_name}" WHERE "${column_name}" = $1`,
            [agent.id]
          );
          deletedCounts[`${table_name}.${column_name}`] = r.rowCount ?? 0;
        }
        const agentResult = await client.query(
          `DELETE FROM "Agent" WHERE id = $1`,
          [agent.id]
        );
        deletedCounts["Agent"] = agentResult.rowCount ?? 0;
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Delete failed and rolled back: ${msg}` }],
          structuredContent: { success: false, error: msg },
        };
      } finally {
        client.release();
      }

      const out = {
        success: true,
        deletedAgent: { id: agent.id, name: agent.name },
        deletedCounts,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_update_flow ────────────────────────────────────────────────────────
  server.registerTool(
    "as_update_flow",
    {
      title: "Update Flow Structure",
      description: `Replace the entire nodes and/or edges array in an agent's flow.

Use this for structural rewiring: adding new nodes, removing nodes, changing
edge connections, or reorganizing the flow topology.

Pass nodes_json and/or edges_json as JSON strings (arrays).
Omit either parameter to leave that part of the flow unchanged.

Before calling, fetch current state with as_inspect_flow so you have the
full node/edge list to modify. Build the new arrays, then call this tool.

⚠️  Replaces the full nodes/edges in DB immediately — no undo.
    Always call as_inspect_flow first to capture the current state.`,
      inputSchema: {
        agent_name: z.string().optional().describe("Partial agent name (case-insensitive)."),
        agent_id: z.string().optional().describe("Exact agent UUID."),
        nodes_json: z.string().optional()
          .describe("Full replacement nodes array as a JSON string. Omit to leave nodes unchanged."),
        edges_json: z.string().optional()
          .describe("Full replacement edges array as a JSON string. Omit to leave edges unchanged."),
        dry_run: z.boolean().default(false)
          .describe("If true, validates input and returns a preview without writing to DB."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ agent_name, agent_id, nodes_json, edges_json, dry_run }) => {
      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }
      if (!nodes_json && !edges_json) {
        return { content: [{ type: "text", text: "Error: provide at least one of nodes_json or edges_json." }] };
      }

      // Parse nodes
      let newNodes: unknown[] | undefined;
      if (nodes_json) {
        try {
          newNodes = JSON.parse(nodes_json) as unknown[];
          if (!Array.isArray(newNodes)) throw new Error("nodes_json must be a JSON array");
        } catch (e) {
          return { content: [{ type: "text", text: `Error parsing nodes_json: ${e instanceof Error ? e.message : String(e)}` }] };
        }
      }

      // Parse edges
      let newEdges: unknown[] | undefined;
      if (edges_json) {
        try {
          newEdges = JSON.parse(edges_json) as unknown[];
          if (!Array.isArray(newEdges)) throw new Error("edges_json must be a JSON array");
        } catch (e) {
          return { content: [{ type: "text", text: `Error parsing edges_json: ${e instanceof Error ? e.message : String(e)}` }] };
        }
      }

      const row = await getAgentWithFlow(agent_name, agent_id);
      if (!row) {
        return { content: [{ type: "text", text: `Agent or flow not found: ${agent_name ?? agent_id}` }] };
      }

      const content = row.content as FlowContent;
      const prevNodeCount = content.nodes.length;
      const prevEdgeCount = (content.edges as unknown[]).length;

      // Apply changes
      if (newNodes !== undefined) content.nodes = newNodes as FlowNode[];
      if (newEdges !== undefined) content.edges = newEdges;

      const out = {
        success: true,
        dryRun: dry_run,
        agentId: row.id,
        agentName: row.name,
        nodes: { before: prevNodeCount, after: content.nodes.length },
        edges: { before: prevEdgeCount, after: (content.edges as unknown[]).length },
      };

      if (!dry_run) {
        await query(
          `UPDATE "Flow" SET content = $1, "updatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(content), row.flowId]
        );
      }

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
