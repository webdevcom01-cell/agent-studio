/**
 * tools/execution.ts — Tools for sending messages to Agent Studio agents via HTTP API.
 *
 * Tools:
 *   as_chat_with_agent — Send a message to an agent and return its response.
 *
 * Required env vars:
 *   AGENT_STUDIO_URL     — Base URL of the Agent Studio app (e.g. https://your-app.railway.app)
 *   AGENT_STUDIO_API_KEY — API key for authentication (create one at /api/api-keys)
 *
 * Agent name resolution uses the local DB connection (same as other tools).
 * The chat call itself goes through the Agent Studio HTTP API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queryOne } from "../db.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatResponseData {
  conversationId: string;
  messages: ChatMessage[];
  waitForInput: boolean;
}

interface ChatApiResponse {
  success: boolean;
  data?: ChatResponseData;
  error?: string;
}

interface EnvConfig {
  studioUrl: string;
  apiKey: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_TIMEOUT_SECONDS = 300;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEnvConfig(): EnvConfig | { error: string } {
  const studioUrl = process.env.AGENT_STUDIO_URL;
  const apiKey = process.env.AGENT_STUDIO_API_KEY;

  if (!studioUrl && !apiKey) {
    return {
      error:
        "Missing required env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.\n" +
        "  AGENT_STUDIO_URL     — your Agent Studio app URL (e.g. https://your-app.railway.app)\n" +
        "  AGENT_STUDIO_API_KEY — API key from <your-app>/api/api-keys",
    };
  }
  if (!studioUrl) {
    return {
      error:
        "AGENT_STUDIO_URL is not set. " +
        "Set it to your Agent Studio base URL (e.g. https://your-app.railway.app).",
    };
  }
  if (!apiKey) {
    return {
      error:
        "AGENT_STUDIO_API_KEY is not set. " +
        "Create an API key at your Agent Studio app under /api/api-keys.",
    };
  }

  return { studioUrl: studioUrl.replace(/\/$/, ""), apiKey };
}

async function resolveAgent(
  agentName: string | undefined,
  agentId: string | undefined
): Promise<AgentRow | null> {
  if (agentId) {
    return queryOne<AgentRow>(
      `SELECT id, name FROM "Agent" WHERE id = $1`,
      [agentId]
    );
  }
  if (agentName) {
    return queryOne<AgentRow>(
      `SELECT id, name FROM "Agent" WHERE name ILIKE $1 LIMIT 1`,
      [`%${agentName}%`]
    );
  }
  return null;
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerExecutionTools(server: McpServer): void {

  // ── as_chat_with_agent ────────────────────────────────────────────────────
  server.registerTool(
    "as_chat_with_agent",
    {
      title: "Chat With Agent",
      description: `Send a message to an Agent Studio agent and return its response.

Resolves the agent by name (partial ILIKE match) or exact agent_id, then calls
the Agent Studio HTTP API at POST /api/agents/{id}/chat.

Optionally provide conversation_id to continue an existing conversation;
omit it to start a new one. The response includes the agent's reply text,
the conversation_id (for follow-up turns), and round-trip duration.

Requires env vars: AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY.`,
      inputSchema: {
        agent_name: z.string().optional()
          .describe("Partial agent name — case-insensitive ILIKE match."),
        agent_id: z.string().optional()
          .describe("Exact agent ID (cuid)."),
        message: z.string().min(1)
          .describe("The user message to send to the agent."),
        conversation_id: z.string().optional()
          .describe("Continue an existing conversation. Omit to start a new one."),
        timeout_seconds: z.number().int().min(1).max(MAX_TIMEOUT_SECONDS).default(DEFAULT_TIMEOUT_SECONDS)
          .describe(`Request timeout in seconds (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ agent_name, agent_id, message, conversation_id, timeout_seconds }) => {
      const config = getEnvConfig();
      if ("error" in config) {
        return { content: [{ type: "text", text: `Configuration error: ${config.error}` }] };
      }

      if (!agent_name && !agent_id) {
        return { content: [{ type: "text", text: "Error: provide agent_name or agent_id." }] };
      }

      const agent = await resolveAgent(agent_name, agent_id);
      if (!agent) {
        return {
          content: [{
            type: "text",
            text: `Agent not found: ${agent_name ?? agent_id}`,
          }],
        };
      }

      const url = `${config.studioUrl}/api/agents/${agent.id}/chat`;
      const timeoutMs = timeout_seconds * 1000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const startTime = Date.now();
      let apiResponse: ChatApiResponse;

      try {
        const httpResponse = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            ...(conversation_id ? { conversationId: conversation_id } : {}),
          }),
          signal: controller.signal,
        });

        if (!httpResponse.ok) {
          const body = await httpResponse.text().catch(() => "");
          return {
            content: [{
              type: "text",
              text: `HTTP ${httpResponse.status} from Agent Studio API: ${body.slice(0, 500)}`,
            }],
          };
        }

        apiResponse = await httpResponse.json() as ChatApiResponse;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return {
            content: [{
              type: "text",
              text: `Request timed out after ${timeout_seconds}s. The agent may still be processing — use conversation_id to poll or retry.`,
            }],
          };
        }
        return {
          content: [{
            type: "text",
            text: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
          }],
        };
      } finally {
        clearTimeout(timer);
      }

      if (!apiResponse.success || !apiResponse.data) {
        return {
          content: [{
            type: "text",
            text: `Agent Studio returned an error: ${apiResponse.error ?? "unknown error"}`,
          }],
        };
      }

      const durationMs = Date.now() - startTime;
      const data = apiResponse.data;
      const lastAssistantMsg = [...data.messages].reverse().find((m) => m.role === "assistant");
      const responseText = lastAssistantMsg?.content ?? "(no assistant response)";

      const out = {
        agentId: agent.id,
        agentName: agent.name,
        conversationId: data.conversationId,
        response: responseText,
        waitForInput: data.waitForInput,
        messageCount: data.messages.length,
        durationMs,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
        structuredContent: out,
      };
    }
  );
}
