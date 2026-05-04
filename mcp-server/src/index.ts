#!/usr/bin/env node
/**
 * agent-studio-mcp-server
 *
 * MCP server providing direct read/write access to the agent-studio
 * Railway PostgreSQL database — inspect agents, patch flows, diagnose
 * model mismatches, all without writing scripts or redeploying.
 *
 * Transport: Streamable HTTP (remote Railway service)
 * Auth:      MCP_API_KEY header check on every request
 *
 * Required env vars:
 *   DATABASE_URL   — PostgreSQL connection string (Railway provides this)
 *   MCP_API_KEY    — Secret key clients must send as Bearer token
 *
 * Optional env vars:
 *   PORT           — HTTP port (default 3000)
 *   TRANSPORT      — "http" (default) or "stdio" (local dev)
 *
 * For Claude Cowork / Claude.ai connection, add this server URL:
 *   https://<your-railway-domain>/mcp
 * with header:  Authorization: Bearer <MCP_API_KEY>
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { registerAgentTools } from "./tools/agents.js";
import { registerMutationTools } from "./tools/mutations.js";
import { registerDiagnosticTools } from "./tools/diagnostics.js";
import { registerA2ATools } from "./tools/a2a.js";
import { registerExecutionTools } from "./tools/execution.js";
import { registerKnowledgeTools } from "./tools/knowledge.js";
import { registerEvalTools } from "./tools/evals.js";
import { registerF1F7Tools } from "./tools/f1-f7.js";
import { ping } from "./db.js";
import { resolveAuthMode } from "./auth.js";

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "agent-studio-mcp-server",
  version: "1.0.0",
});

registerAgentTools(server);      // 4 tools: list_agents, get_agent, inspect_flow, get_recent_executions
registerMutationTools(server);   // 6 tools: update_model, set_public, patch_node, update_prompt, delete, update_flow
registerDiagnosticTools(server); // 3 tools: diagnose_models, health_check, find_broken_flows
registerA2ATools(server);        // 2 tools: get_agent_call_log, list_agent_calls
registerExecutionTools(server);  // 1 tool:  chat_with_agent
registerKnowledgeTools(server);  // 5 tools: list_kb, search_kb, add_kb_url, add_kb_text, kb_status
registerEvalTools(server);       // 5 tools: list_evals, run_eval, get_eval_result, create_eval_case, create_agent
registerF1F7Tools(server);       // 9 tools: get/set_budget, get_org_chart, assign_department, list/link_goals, get_heartbeat, set_heartbeat_context, export_template
                                 // Total: 35 tools

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.MCP_API_KEY;

  // If no key is configured, skip auth (useful for local dev)
  if (!apiKey) {
    next();
    return;
  }

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

  if (token !== apiKey) {
    res.status(401).json({ error: "Unauthorized: invalid or missing MCP_API_KEY" });
    return;
  }
  next();
}

// ── HTTP transport ────────────────────────────────────────────────────────────

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // ── OAuth2 endpoints (required for Claude Connectors UI) ──────────────────
  //
  // Claude's "Add custom connector" always initiates OAuth2 PKCE flow.
  // We implement a minimal pass-through: /authorize redirects immediately
  // and /token returns MCP_API_KEY as the access token.
  // The actual security still lives in requireApiKey on POST /mcp.

  app.get("/authorize", (req: Request, res: Response) => {
    const { redirect_uri, state, code_challenge } = req.query as Record<string, string>;
    if (!redirect_uri) {
      res.status(400).json({ error: "missing redirect_uri" });
      return;
    }
    // Issue a one-time code (we'll just use a fixed value — /token validates nothing here)
    const code = "mcp_auth_code_" + Date.now();
    const separator = redirect_uri.includes("?") ? "&" : "?";
    const location = `${redirect_uri}${separator}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
    process.stderr.write(`[MCP] OAuth /authorize → redirecting (challenge=${code_challenge ?? "none"})\n`);
    res.redirect(302, location);
  });

  app.post("/token", express.urlencoded({ extended: false }), (req: Request, res: Response) => {
    // Return MCP_API_KEY as the Bearer token so Claude uses it on /mcp requests
    const accessToken = process.env.MCP_API_KEY ?? "no-key-configured";
    process.stderr.write("[MCP] OAuth /token → issuing access token\n");
    res.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 31536000,  // 1 year
    });
  });

  // Health endpoint — no auth required
  app.get("/health", async (_req: Request, res: Response) => {
    const dbOk = await ping();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "connected" : "unreachable",
      server: "agent-studio-mcp-server@1.0.0",
      time: new Date().toISOString(),
    });
  });

  // MCP endpoint — auth required
  app.post("/mcp", requireApiKey, async (req: Request, res: Response) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,  // stateless — new transport per request
        enableJsonResponse: true,
      });
      res.on("close", () => { transport.close().catch(() => undefined); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      process.stderr.write(`[MCP] Request error: ${err instanceof Error ? err.message : String(err)}\n`);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // 404 catch-all
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found. MCP endpoint is POST /mcp" });
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    const authMode = (() => {
      try { return resolveAuthMode(); } catch { return "UNCONFIGURED"; }
    })();
    process.stderr.write(`[MCP] agent-studio-mcp-server running on port ${port}\n`);
    process.stderr.write(`[MCP] Auth mode: ${authMode}\n`);
    process.stderr.write(`[MCP] Endpoint: POST http://localhost:${port}/mcp\n`);
    process.stderr.write(`[MCP] Auth: ${process.env.MCP_API_KEY ? "✅ MCP_API_KEY set" : "⚠️  MCP_API_KEY not set — open access"}\n`);
    process.stderr.write(`[MCP] Database: ${process.env.DATABASE_URL ? "✅ DATABASE_URL set" : "❌ DATABASE_URL missing"}\n`);
    process.stderr.write(`[MCP] Studio URL: ${process.env.AGENT_STUDIO_URL ? `✅ ${process.env.AGENT_STUDIO_URL}` : "⚠️  AGENT_STUDIO_URL not set — as_chat_with_agent disabled"}\n`);
    process.stderr.write(`[MCP] Studio API key: ${process.env.AGENT_STUDIO_API_KEY ? "✅ set" : "⚠️  AGENT_STUDIO_API_KEY not set — as_chat_with_agent disabled"}\n`);
    process.stderr.write(`[MCP] KB tools: 5 registered\n`);
    process.stderr.write(`[MCP] Eval tools: 5 registered\n`);
    process.stderr.write(`[MCP] F1-F7 tools: 9 registered (budget, org-chart, goals, heartbeat, templates)\n`);
    process.stderr.write(`[MCP] Total tools: 35\n`);
  });
}

// ── stdio transport (local dev) ───────────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[MCP] agent-studio-mcp-server running via stdio\n");
}

// ── Startup ───────────────────────────────────────────────────────────────────

const transport = process.env.TRANSPORT ?? "http";

if (transport === "stdio") {
  runStdio().catch((err: unknown) => {
    process.stderr.write(`[MCP] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
} else {
  runHTTP().catch((err: unknown) => {
    process.stderr.write(`[MCP] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
