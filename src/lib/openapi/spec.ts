/**
 * OpenAPI spec generator.
 *
 * Imports registry + all path/schema registrations (side-effects) and
 * returns a fully-built OpenAPI 3.1 document object.
 *
 * The result is cached in-process so repeated calls (e.g. from /api/openapi.json)
 * pay the generation cost only once per cold start.
 */
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import type { OpenAPIObject } from "openapi3-ts/oas31";

// Import registry first, then paths/schemas to trigger side-effect registrations
import { registry } from "./registry";
import "./schemas"; // registers schema components
import "./paths"; // registers path items

// Register security schemes once (side-effect safe — registry deduplicates)
registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API key (as_prod_… or as_test_…)",
  description:
    "API key obtained from `/settings/api-keys`. " +
    "Pass scopes when creating the key. Example: `Authorization: Bearer as_prod_abc123`",
} as never);

registry.registerComponent("securitySchemes", "CookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "authjs.session-token",
  description: "Session cookie set automatically after OAuth login (GitHub / Google).",
} as never);

let cached: OpenAPIObject | null = null;

export function generateOpenApiSpec(): OpenAPIObject {
  if (cached) return cached;

  const generator = new OpenApiGeneratorV31(registry.definitions);

  const doc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Agent Studio API",
      version: "1.0.0",
      description: [
        "REST API for **Agent Studio** — a visual AI agent builder with multi-agent",
        "orchestration, RAG knowledge bases, and flow-based execution.",
        "",
        "## Authentication",
        "",
        "Most endpoints accept either:",
        "- **Bearer token**: `Authorization: Bearer as_prod_…` (API key from `/settings/api-keys`)",
        "- **Session cookie**: set automatically after OAuth login (GitHub / Google)",
        "",
        "The `/api/agents/{agentId}/chat` and `/api/agents/{agentId}/trigger/{webhookId}`",
        "endpoints are **public** (or HMAC-verified) so your embed widget and webhook",
        "providers can reach them without a session.",
        "",
        "## API Key Scopes",
        "",
        "API keys use fine-grained scopes. Pass the required scopes when creating a key",
        "at `POST /api/api-keys`. The `admin` scope grants all permissions.",
        "",
        "| Scope | Description |",
        "|-------|-------------|",
        "| `agents:read` | List and retrieve agents |",
        "| `agents:write` | Create and update agents |",
        "| `agents:delete` | Delete agents |",
        "| `flows:read` | Read flow content and version history |",
        "| `flows:execute` | Execute flows and send chat messages |",
        "| `kb:read` | Search and list knowledge base sources |",
        "| `kb:write` | Add, upload, and delete knowledge sources |",
        "| `evals:read` | Read eval suites and run results |",
        "| `evals:run` | Trigger eval suite runs |",
        "| `webhooks:read` | List webhooks and execution history |",
        "| `admin` | Full access — all scopes above |",
        "",
        "## Rate limits",
        "",
        "Chat: 20 req/min per agentId + IP.  Webhooks: 60 req/min per webhookId.  ",
        "API key creation: 3 req/min.",
      ].join("\n"),
      contact: {
        name: "Agent Studio",
        url: "https://github.com/webdevcom01-cell/agent-studio",
      },
      license: {
        name: "MIT",
        url: "https://github.com/webdevcom01-cell/agent-studio/blob/main/LICENSE",
      },
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        description: "Current environment",
      },
      {
        url: "https://agent-studio-production-c43e.up.railway.app",
        description: "Production (Railway)",
      },
    ],
    tags: [
      { name: "System",       description: "Health and observability" },
      { name: "Agents",       description: "Agent CRUD, discover, export/import" },
      { name: "Chat",         description: "Send messages to an agent (streaming + sync)" },
      { name: "Flow",         description: "Flow content and version management" },
      { name: "Knowledge",    description: "Knowledge base sources, upload, search" },
      { name: "API Keys",     description: "Programmatic API access management" },
      { name: "MCP Servers",  description: "Model Context Protocol server registry" },
      { name: "Evals",        description: "Agent evaluation suites and runs" },
      { name: "Webhooks",     description: "Inbound webhook triggers and executions" },
      { name: "Jobs",         description: "Async job status polling" },
      { name: "Schedules",    description: "Scheduled flow execution" },
    ],
  }) as OpenAPIObject;

  // Inject top-level security requirement (generated separately from registry components)
  cached = { ...doc, security: [{ BearerAuth: [] }, { CookieAuth: [] }] };

  return cached;
}

/** Invalidate the cached spec (useful in tests). */
export function resetSpecCache(): void {
  cached = null;
}
