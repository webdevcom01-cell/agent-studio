/**
 * POST /api/mcp/agent-studio
 *
 * Remote MCP server (Streamable HTTP, MCP 2025-11-05 spec, stateless).
 * Implements JSON-RPC 2.0 with: initialize, tools/list, tools/call.
 *
 * Authentication: Bearer API key (as_live_*) in Authorization header.
 * Scopes enforced per tool — see agent-studio-tools.ts.
 *
 * Usage from Claude Code:
 *   claude mcp add agent-studio \
 *     --transport http \
 *     https://agent-studio-production-c43e.up.railway.app/api/mcp/agent-studio \
 *     --header "Authorization: Bearer as_live_YOUR_KEY"
 */

import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, hasScope } from "@/lib/api/api-key";
import { logger } from "@/lib/logger";
import {
  AGENT_STUDIO_TOOLS,
  callAgentStudioTool,
} from "@/lib/mcp/agent-studio-tools";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ---------------------------------------------------------------------------
// Scope requirements per tool
// ---------------------------------------------------------------------------

const TOOL_SCOPES: Record<string, Parameters<typeof hasScope>[1]> = {
  list_agents: "agents:read",
  get_agent: "agents:read",
  trigger_agent: "flows:execute",
  search_knowledge_base: "kb:read",
  get_task_status: "agents:read",
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const rawKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (!rawKey) {
    return jsonRpcError(null, -32001, "Missing Authorization header. Use: Bearer as_live_YOUR_KEY");
  }

  const auth = await validateApiKey(rawKey);
  if (!auth) {
    return jsonRpcError(null, -32001, "Invalid or expired API key.");
  }

  // ── 2. Parse request ───────────────────────────────────────────────────────
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error: invalid JSON.");
  }

  const { id, method, params: rpcParams } = body;

  logger.info("agent-studio MCP request", { method, userId: auth.userId });

  // ── 3. Dispatch ────────────────────────────────────────────────────────────
  try {
    switch (method) {
      // MCP handshake
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "agent-studio",
            version: "1.0.0",
          },
        });

      case "notifications/initialized":
        return jsonRpcResult(id, {});

      // Tool discovery
      case "tools/list":
        return jsonRpcResult(id, { tools: AGENT_STUDIO_TOOLS });

      // Tool execution
      case "tools/call": {
        const toolName = rpcParams?.name as string | undefined;
        const rawArgs = rpcParams?.arguments;
        const toolArgs: Record<string, unknown> =
          rawArgs !== null && typeof rawArgs === "object" && !Array.isArray(rawArgs)
            ? (rawArgs as Record<string, unknown>)
            : {};

        if (!toolName) {
          return jsonRpcError(id, -32602, "Missing tool name in params.name");
        }

        // Check tool exists
        const toolDef = AGENT_STUDIO_TOOLS.find((t) => t.name === toolName);
        if (!toolDef) {
          return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
        }

        // Check scope
        const requiredScope = TOOL_SCOPES[toolName];
        if (requiredScope && !hasScope(auth.scopes, requiredScope)) {
          return jsonRpcResult(id, {
            content: [
              {
                type: "text",
                text: `Permission denied: API key missing scope "${requiredScope}". Please regenerate your key with the required scope.`,
              },
            ],
            isError: true,
          });
        }

        const result = await callAgentStudioTool(toolName, toolArgs, auth.userId);
        return jsonRpcResult(id, result);
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    logger.error("agent-studio MCP unexpected error", { method, error });
    return jsonRpcError(id, -32603, "Internal error");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRpcResult(id: string | number | null, result: unknown): NextResponse {
  const response: JsonRpcResponse = { jsonrpc: "2.0", id, result };
  return NextResponse.json(response);
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): NextResponse {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
  // MCP spec: errors use HTTP 200 with error field in body
  return NextResponse.json(response, { status: 200 });
}
