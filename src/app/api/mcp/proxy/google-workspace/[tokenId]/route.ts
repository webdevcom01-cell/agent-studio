import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google-workspace/token";
import {
  GOOGLE_WORKSPACE_TOOLS,
  callGoogleTool,
} from "@/lib/google-workspace/tools";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// MCP JSON-RPC 2.0 types
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
// Route handler
// ---------------------------------------------------------------------------

/**
 * POST /api/mcp/proxy/google-workspace/[tokenId]
 *
 * Internal MCP proxy implementing the MCP JSON-RPC 2.0 protocol.
 * Handles `initialize`, `tools/list`, and `tools/call` methods.
 * Looks up the GoogleOAuthToken by tokenId, auto-refreshes as needed,
 * then dispatches to Google Calendar / Gmail REST APIs.
 *
 * This endpoint is intentionally unauthenticated (no session check) because
 * it's called server-to-server by the MCP client pool using the tokenId as
 * the authorization mechanism. The tokenId is a CUID that is only known to
 * the owning user via their MCPServer URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
): Promise<NextResponse> {
  const { tokenId } = await params;

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { id, method, params: rpcParams } = body;

  try {
    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "google-workspace",
            version: "1.0.0",
          },
        });

      case "notifications/initialized":
        // Acknowledgement — no response needed but return empty result to be safe
        return jsonRpcResult(id, {});

      case "tools/list":
        return jsonRpcResult(id, { tools: GOOGLE_WORKSPACE_TOOLS });

      case "tools/call": {
        const toolName = rpcParams?.name as string | undefined;
        const toolArgs = (rpcParams?.arguments ?? {}) as Record<
          string,
          unknown
        >;

        if (!toolName) {
          return jsonRpcError(id, -32602, "Missing tool name");
        }

        // Retrieve a valid (auto-refreshed) access token
        let accessToken: string;
        try {
          accessToken = await getValidAccessToken(tokenId);
        } catch (err) {
          logger.error("Google Workspace proxy: token retrieval failed", {
            tokenId,
            err,
          });
          return jsonRpcError(
            id,
            -32001,
            err instanceof Error
              ? err.message
              : "Failed to retrieve access token",
          );
        }

        // Dispatch to the appropriate Google API tool
        let toolResult: unknown;
        try {
          toolResult = await callGoogleTool(toolName, toolArgs, accessToken);
        } catch (err) {
          logger.error("Google Workspace proxy: tool call failed", {
            tokenId,
            toolName,
            err,
          });
          return jsonRpcResult(id, {
            content: [
              {
                type: "text",
                text:
                  err instanceof Error
                    ? err.message
                    : `Tool "${toolName}" failed`,
              },
            ],
            isError: true,
          });
        }

        return jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(toolResult) }],
        });
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    logger.error("Google Workspace MCP proxy unexpected error", {
      tokenId,
      method,
      err,
    });
    return jsonRpcError(id, -32603, "Internal error");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRpcResult(
  id: string | number | null,
  result: unknown,
): NextResponse {
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
  return NextResponse.json(response, { status: 200 }); // MCP errors use 200 with error field
}
