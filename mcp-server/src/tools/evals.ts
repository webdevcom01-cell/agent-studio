/**
 * tools/evals.ts — Tools for managing and running Agent Studio eval suites.
 *
 * Tools:
 *   as_list_evals       — list eval suites for an agent with last run summary
 *   as_run_eval         — trigger a full eval run for a suite
 *   as_get_eval_result  — get detailed run results with per-case breakdown
 *   as_create_eval_case — add a test case to an existing eval suite
 *   as_create_agent     — create a new agent
 *
 * Read-only tools use direct DB queries (faster, no auth dependency).
 * Mutating tools use the REST API (requires AGENT_STUDIO_URL + AGENT_STUDIO_API_KEY).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query, queryOne } from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
}

interface EvalSuiteRow {
  id: string;
  name: string;
  description: string | null;
  agentId: string;
  caseCount: string;
  lastRunAt: string | null;
  lastRunScore: number | null;
  lastRunStatus: string | null;
}

interface EvalRunRow {
  id: string;
  suiteId: string;
  suiteName: string;
  status: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  score: number | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface EvalResultRow {
  id: string;
  testCaseId: string;
  testCaseLabel: string;
  testCaseInput: string;
  status: string;
  agentOutput: string | null;
  score: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
}

interface SuiteAgentRow {
  agentId: string;
}

interface EnvConfig {
  studioUrl: string;
  apiKey: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

interface CreatedAgentData {
  id: string;
  name: string;
  model: string;
  description: string | null;
}

interface RunResponseData {
  queued?: boolean;
  jobId?: string;
  runId?: string;
  status?: string;
  score?: number | null;
}

interface CreatedCaseData {
  id: string;
  label: string;
  input: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEnvConfig(): EnvConfig | { error: string } {
  const studioUrl = process.env.AGENT_STUDIO_URL;
  const apiKey = process.env.AGENT_STUDIO_API_KEY;

  if (!studioUrl && !apiKey) {
    return {
      error:
        "Missing AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.\n" +
        "  AGENT_STUDIO_URL     — your Agent Studio app URL\n" +
        "  AGENT_STUDIO_API_KEY — API key from <your-app>/api/api-keys",
    };
  }
  if (!studioUrl) {
    return { error: "AGENT_STUDIO_URL is not set." };
  }
  if (!apiKey) {
    return { error: "AGENT_STUDIO_API_KEY is not set." };
  }
  return { studioUrl: studioUrl.replace(/\/$/, ""), apiKey };
}

async function resolveAgentByName(agentName: string): Promise<AgentRow | null> {
  return queryOne<AgentRow>(
    `SELECT id, name FROM "Agent" WHERE name ILIKE $1 LIMIT 1`,
    [`%${agentName}%`]
  );
}

async function resolveSuiteAgent(suiteId: string): Promise<SuiteAgentRow | null> {
  return queryOne<SuiteAgentRow>(
    `SELECT "agentId" FROM "EvalSuite" WHERE id = $1`,
    [suiteId]
  );
}

async function restPost<TResponse>(
  config: EnvConfig,
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: TResponse } | { ok: false; error: string }> {
  let response: Response;
  try {
    response = await fetch(`${config.studioUrl}${path}`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 400)}` };
  }

  try {
    const parsed = JSON.parse(text) as ApiResponse<TResponse>;
    if (!parsed.success) {
      return { ok: false, error: (parsed as ApiError).error ?? "Unknown API error" };
    }
    return { ok: true, data: (parsed as ApiSuccess<TResponse>).data };
  } catch {
    return { ok: false, error: `Invalid JSON response: ${text.slice(0, 200)}` };
  }
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerEvalTools(server: McpServer): void {

  // ── as_list_evals ─────────────────────────────────────────────────────────
  server.registerTool(
    "as_list_evals",
    {
      title: "List Eval Suites",
      description: `List all eval suites for an agent including test case count and last run summary.

Resolves the agent by partial name (case-insensitive ILIKE match). Returns each suite's
id, name, caseCount, lastRunAt, lastRunScore, and lastRunStatus.`,
      inputSchema: {
        agent_name: z.string()
          .describe("Partial agent name — case-insensitive ILIKE match."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agent_name }) => {
      const agent = await resolveAgentByName(agent_name);
      if (!agent) {
        return { content: [{ type: "text", text: `Agent not found: ${agent_name}` }] };
      }

      const rows = await query<EvalSuiteRow>(
        `SELECT
           es.id,
           es.name,
           es.description,
           es."agentId",
           COUNT(DISTINCT etc.id)::text                                  AS "caseCount",
           MAX(er."createdAt")::text                                     AS "lastRunAt",
           (SELECT er2.score
            FROM "EvalRun" er2
            WHERE er2."suiteId" = es.id
            ORDER BY er2."createdAt" DESC LIMIT 1)                       AS "lastRunScore",
           (SELECT er3.status
            FROM "EvalRun" er3
            WHERE er3."suiteId" = es.id
            ORDER BY er3."createdAt" DESC LIMIT 1)                       AS "lastRunStatus"
         FROM "EvalSuite" es
         LEFT JOIN "EvalTestCase" etc ON etc."suiteId" = es.id
         LEFT JOIN "EvalRun" er ON er."suiteId" = es.id
         WHERE es."agentId" = $1
         GROUP BY es.id, es.name, es.description, es."agentId"
         ORDER BY es."createdAt" DESC`,
        [agent.id]
      );

      const suites = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        caseCount: Number(r.caseCount),
        lastRunAt: r.lastRunAt ?? null,
        lastRunScore: r.lastRunScore ?? null,
        lastRunStatus: r.lastRunStatus ?? null,
      }));

      const out = { agentId: agent.id, agentName: agent.name, suites, count: suites.length };
      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_run_eval ───────────────────────────────────────────────────────────
  server.registerTool(
    "as_run_eval",
    {
      title: "Run Eval Suite",
      description: `Trigger a full eval run for an eval suite.

Calls POST /api/agents/:agentId/evals/:evalId/run. When Redis is available the run is queued
via BullMQ and returns a jobId; otherwise it runs synchronously.

Returns { status, jobId?, runId?, message }.

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        eval_id: z.string()
          .describe("Eval suite ID (EvalSuite.id, a cuid)."),
        agent_name: z.string().optional()
          .describe("Optional agent name for context (not required for the call)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ eval_id }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const suiteAgent = await resolveSuiteAgent(eval_id);
      if (!suiteAgent) {
        return { content: [{ type: "text", text: `Eval suite not found: ${eval_id}` }] };
      }

      const result = await restPost<RunResponseData>(
        config,
        `/api/agents/${suiteAgent.agentId}/evals/${eval_id}/run`,
        { triggeredBy: "manual" }
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Failed to run eval: ${result.error}` }] };
      }

      const out: Record<string, unknown> = {
        evalId: eval_id,
        agentId: suiteAgent.agentId,
      };

      if (result.data.queued) {
        out.status = "queued";
        out.jobId = result.data.jobId;
        out.message = "Eval run queued. Use as_get_eval_result with the runId once it completes.";
      } else {
        out.status = result.data.status ?? "completed";
        out.runId = result.data.runId;
        out.message = "Eval run completed synchronously.";
      }

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_get_eval_result ────────────────────────────────────────────────────
  server.registerTool(
    "as_get_eval_result",
    {
      title: "Get Eval Run Result",
      description: `Get detailed results for a completed eval run including per-test-case output.

Provide the run_id (EvalRun.id). Returns overall stats (totalCases, passed, failed, score)
and a list of individual test case results with input, actualOutput, passed flag, and score.`,
      inputSchema: {
        run_id: z.string()
          .describe("Eval run ID (EvalRun.id, a cuid)."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ run_id }) => {
      const run = await queryOne<EvalRunRow>(
        `SELECT
           er.id,
           er."suiteId",
           es.name AS "suiteName",
           er.status,
           er."totalCases",
           er."passedCases",
           er."failedCases",
           er.score,
           er."durationMs",
           er."createdAt"::text AS "createdAt",
           er."completedAt"::text AS "completedAt"
         FROM "EvalRun" er
         JOIN "EvalSuite" es ON es.id = er."suiteId"
         WHERE er.id = $1`,
        [run_id]
      );

      if (!run) {
        return { content: [{ type: "text", text: `Eval run not found: ${run_id}` }] };
      }

      const results = await query<EvalResultRow>(
        `SELECT
           res.id,
           res."testCaseId",
           tc.label      AS "testCaseLabel",
           tc.input      AS "testCaseInput",
           res.status,
           res."agentOutput",
           res.score,
           res."latencyMs",
           res."errorMessage"
         FROM "EvalResult" res
         JOIN "EvalTestCase" tc ON tc.id = res."testCaseId"
         WHERE res."runId" = $1
         ORDER BY tc."order" ASC`,
        [run_id]
      );

      const out = {
        runId: run.id,
        evalName: run.suiteName,
        status: run.status,
        totalCases: run.totalCases,
        passed: run.passedCases,
        failed: run.failedCases,
        score: run.score,
        durationMs: run.durationMs,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        cases: results.map((r) => ({
          testCaseId: r.testCaseId,
          label: r.testCaseLabel,
          input: r.testCaseInput,
          actualOutput: r.agentOutput,
          passed: r.status === "PASSED",
          score: r.score,
          latencyMs: r.latencyMs,
          errorMessage: r.errorMessage ?? null,
        })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_create_eval_case ───────────────────────────────────────────────────
  server.registerTool(
    "as_create_eval_case",
    {
      title: "Create Eval Test Case",
      description: `Add a test case to an existing eval suite.

Provide eval_id (EvalSuite.id), the input message, and expected_output. The expected_output
is registered as a \`contains\` assertion — the agent response must include that string.
An optional description becomes the test case label; defaults to a truncated version of input.

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        eval_id: z.string()
          .describe("Eval suite ID (EvalSuite.id, a cuid)."),
        input: z.string().min(1)
          .describe("The user message to send to the agent during the eval."),
        expected_output: z.string().min(1)
          .describe("Expected content in the agent response (registered as a `contains` assertion)."),
        description: z.string().optional()
          .describe("Label / display name for this test case."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ eval_id, input, expected_output, description }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const suiteAgent = await resolveSuiteAgent(eval_id);
      if (!suiteAgent) {
        return { content: [{ type: "text", text: `Eval suite not found: ${eval_id}` }] };
      }

      const label = description ?? `Test: ${input.slice(0, 60)}`;
      const assertions = [{ type: "contains", value: expected_output }];

      const result = await restPost<CreatedCaseData>(
        config,
        `/api/agents/${suiteAgent.agentId}/evals/${eval_id}/cases`,
        { label, input, assertions, tags: [] }
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Failed to create test case: ${result.error}` }] };
      }

      const out = {
        testCaseId: result.data.id,
        evalId: eval_id,
        label: result.data.label,
        input: result.data.input,
        assertion: assertions[0],
        message: "Test case added. Run the suite with as_run_eval to evaluate.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );

  // ── as_create_agent ───────────────────────────────────────────────────────
  server.registerTool(
    "as_create_agent",
    {
      title: "Create Agent",
      description: `Create a new Agent Studio agent.

Provide a name and optionally description, model, and system_prompt. The agent is created
via POST /api/agents and a default empty flow is attached automatically.

Returns { agentId, name, model, publicUrl }.

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        name: z.string().min(1).max(200)
          .describe("Agent name (1–200 chars)."),
        description: z.string().max(2000).optional()
          .describe("Short description of what the agent does."),
        model: z.string().optional().default("gpt-4.1-mini")
          .describe("Model ID (default: gpt-4.1-mini)."),
        system_prompt: z.string().max(50000).optional()
          .describe("System prompt for the agent."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, description, model, system_prompt }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      const body: Record<string, unknown> = { name };
      if (description !== undefined) body.description = description;
      if (model) body.model = model;
      if (system_prompt !== undefined) body.systemPrompt = system_prompt;

      const result = await restPost<CreatedAgentData>(
        config,
        `/api/agents`,
        body
      );

      if (!result.ok) {
        return { content: [{ type: "text", text: `Failed to create agent: ${result.error}` }] };
      }

      const out = {
        agentId: result.data.id,
        name: result.data.name,
        model: result.data.model,
        publicUrl: `${config.studioUrl}/agents/${result.data.id}`,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
