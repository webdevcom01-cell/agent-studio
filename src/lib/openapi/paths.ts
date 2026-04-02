/**
 * OpenAPI path definitions.
 *
 * Registers all public API endpoints with the registry.
 * Group order: Health → Agents → Flow → Knowledge → API Keys →
 *              MCP Servers → Evals → Webhooks → Jobs → Schedules
 */
import { registry, z } from "./registry";
import {
  AgentSchema,
  ApiKeySchema,
  ChatResponseSchema,
  ChatRequestSchema,
  CreateAgentBodySchema,
  CreateApiKeyBodySchema,
  CreateApiKeyResponseSchema,
  ErrorResponseSchema,
  EvalSuiteSchema,
  FlowContentSchema,
  FlowScheduleSchema,
  HealthResponseSchema,
  JobStatusSchema,
  KBSearchRequestSchema,
  KBSearchResultSchema,
  KBSourceSchema,
  MCPServerSchema,
  PatchAgentBodySchema,
  WebhookConfigSchema,
} from "./schemas";

// ── Security scheme ───────────────────────────────────────────────────────────

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "API key  (as_…)",
  description:
    "Pass your Agent Studio API key as a Bearer token: `Authorization: Bearer as_prod_…`",
});

registry.registerComponent("securitySchemes", "CookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "authjs.session-token",
  description: "Browser session cookie set after OAuth login.",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Explicit type avoids TS2322 — openapi3-ts SecurityRequirementObject
// requires { [key: string]: string[] } (no optional/undefined values).
const auth: Array<Record<string, string[]>> = [{ BearerAuth: [] }, { CookieAuth: [] }];

function ok<T extends z.ZodTypeAny>(schema: T) {
  return {
    description: "Success",
    content: { "application/json": { schema } },
  };
}

function err(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorResponseSchema } },
  };
}

// ── Health ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["System"],
  summary: "Health check",
  description: "Returns database connectivity, Redis status, uptime, and version.",
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: HealthResponseSchema })
    ),
  },
});

// ── Agents ───────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents",
  tags: ["Agents"],
  summary: "List agents",
  security: auth,
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(AgentSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents",
  tags: ["Agents"],
  summary: "Create agent",
  security: auth,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateAgentBodySchema } },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: AgentSchema })),
    401: err("Unauthorised"),
    422: err("Validation error"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}",
  tags: ["Agents"],
  summary: "Get agent",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: AgentSchema })),
    401: err("Unauthorised"),
    403: err("Forbidden"),
    404: err("Agent not found"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/agents/{agentId}",
  tags: ["Agents"],
  summary: "Update agent",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: PatchAgentBodySchema } },
    },
  },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: AgentSchema })),
    401: err("Unauthorised"),
    422: err("Validation error"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/agents/{agentId}",
  tags: ["Agents"],
  summary: "Delete agent",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: z.object({ deleted: z.boolean() }) })),
    401: err("Unauthorised"),
    404: err("Agent not found"),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/agents/discover",
  tags: ["Agents"],
  summary: "Discover public agents (marketplace)",
  description: "Faceted search and pagination across all public agents.",
  request: {
    query: z.object({
      q: z.string().optional().openapi({ example: "customer support" }),
      category: z.string().optional().openapi({ example: "customer-support" }),
      tags: z.string().optional().openapi({ example: "chat,support" }),
      sort: z
        .enum(["recent", "popular", "name"])
        .optional()
        .openapi({ example: "popular" }),
      page: z.string().optional().openapi({ example: "1" }),
      pageSize: z.string().optional().openapi({ example: "20" }),
    }),
  },
  responses: {
    200: ok(
      z.object({
        success: z.literal(true),
        data: z.object({
          agents: z.array(AgentSchema),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
        }),
      })
    ),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/export",
  tags: ["Agents"],
  summary: "Export agent as JSON",
  description: "Returns the agent config + flow as a versioned JSON file you can re-import.",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: {
      description: "Agent export JSON",
      content: {
        "application/json": {
          schema: z.object({
            version: z.literal(1),
            exportedAt: z.string().datetime(),
            agent: AgentSchema,
            flow: FlowContentSchema,
          }),
        },
      },
    },
    401: err("Unauthorised"),
    404: err("Agent not found"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/import",
  tags: ["Agents"],
  summary: "Import agent from JSON",
  description: "Creates a new agent from an exported agent JSON. Name receives an `(imported)` suffix.",
  security: auth,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            version: z.literal(1),
            agent: z.record(z.unknown()),
            flow: z.record(z.unknown()),
          }),
        },
      },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: AgentSchema })),
    401: err("Unauthorised"),
    422: err("Invalid export format"),
  },
});

// ── Chat ──────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/chat",
  tags: ["Chat"],
  summary: "Send message",
  description:
    "Send a user message and receive the agent response. " +
    "Set `stream: true` for an NDJSON stream (each line is a JSON chunk). " +
    "Suitable for the embed widget without authentication.",
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: ChatRequestSchema } },
    },
  },
  responses: {
    200: ok(ChatResponseSchema),
    404: err("Agent not found"),
    429: err("Rate limit exceeded"),
    500: err("Execution error"),
  },
});

// ── Flow ──────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/flow",
  tags: ["Flow"],
  summary: "Get flow content",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: FlowContentSchema })
    ),
    401: err("Unauthorised"),
    404: err("Flow not found"),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/agents/{agentId}/flow",
  tags: ["Flow"],
  summary: "Save flow content",
  description: "Upserts the flow. Automatically creates an immutable version snapshot (throttled to 30 s).",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: FlowContentSchema } },
    },
  },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: FlowContentSchema })
    ),
    401: err("Unauthorised"),
    422: err("Invalid flow content"),
  },
});

// ── Knowledge ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/knowledge/sources",
  tags: ["Knowledge"],
  summary: "List knowledge sources",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(KBSourceSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/knowledge/sources",
  tags: ["Knowledge"],
  summary: "Add knowledge source (URL or TEXT)",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.discriminatedUnion("type", [
            z.object({
              type: z.literal("URL"),
              url: z.string().url().openapi({ example: "https://docs.example.com" }),
            }),
            z.object({
              type: z.literal("TEXT"),
              content: z.string().min(1).openapi({ example: "# My knowledge\n..." }),
              title: z.string().optional().openapi({ example: "Internal FAQ" }),
            }),
          ]),
        },
      },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: KBSourceSchema })),
    401: err("Unauthorised"),
    422: err("Validation error"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/knowledge/sources/upload",
  tags: ["Knowledge"],
  summary: "Upload knowledge file (PDF or DOCX)",
  description: "Multipart/form-data upload. Max 10 MB.",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.instanceof(File).openapi({ description: "PDF or DOCX, max 10 MB" }),
          }),
        },
      },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: KBSourceSchema })),
    401: err("Unauthorised"),
    413: err("File too large"),
    422: err("Unsupported file type"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/agents/{agentId}/knowledge/sources/{sourceId}",
  tags: ["Knowledge"],
  summary: "Delete knowledge source",
  security: auth,
  request: {
    params: z.object({ agentId: z.string(), sourceId: z.string() }),
  },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: z.object({ deleted: z.boolean() }) })),
    401: err("Unauthorised"),
    404: err("Source not found"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/knowledge/search",
  tags: ["Knowledge"],
  summary: "Hybrid semantic search",
  description: "Runs semantic + BM25 hybrid search against the agent's knowledge base.",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: { "application/json": { schema: KBSearchRequestSchema } },
    },
  },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(KBSearchResultSchema) })
    ),
    401: err("Unauthorised"),
  },
});

// ── API Keys ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/api-keys",
  tags: ["API Keys"],
  summary: "List API keys",
  description: "Returns metadata only. The plaintext key is never shown after creation.",
  security: auth,
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(ApiKeySchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/api-keys",
  tags: ["API Keys"],
  summary: "Create API key",
  description:
    "Generates a new API key. The plaintext value is returned **once** in this response. " +
    "Store it immediately — it cannot be retrieved again.",
  security: auth,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CreateApiKeyBodySchema } },
    },
  },
  responses: {
    201: ok(CreateApiKeyResponseSchema),
    401: err("Unauthorised"),
    422: err("Validation error"),
    429: err("Limit of 20 keys reached"),
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/api-keys/{keyId}",
  tags: ["API Keys"],
  summary: "Rename or update scopes",
  security: auth,
  request: {
    params: z.object({ keyId: z.string() }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional().openapi({ example: "New name" }),
            scopes: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: ApiKeySchema })),
    401: err("Unauthorised"),
    404: err("Key not found"),
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/api-keys/{keyId}",
  tags: ["API Keys"],
  summary: "Revoke API key",
  security: auth,
  request: { params: z.object({ keyId: z.string() }) },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: z.object({ revoked: z.boolean() }) })),
    401: err("Unauthorised"),
    404: err("Key not found"),
  },
});

// ── MCP Servers ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/mcp-servers",
  tags: ["MCP Servers"],
  summary: "List MCP servers",
  security: auth,
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(MCPServerSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/mcp-servers",
  tags: ["MCP Servers"],
  summary: "Register MCP server",
  security: auth,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().min(1).openapi({ example: "GitHub Tools" }),
            url: z.string().url().openapi({ example: "https://mcp.example.com/mcp" }),
            transport: z.enum(["STREAMABLE_HTTP", "SSE"]).optional(),
            description: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: MCPServerSchema })),
    401: err("Unauthorised"),
    422: err("Invalid URL"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/mcp-servers/{serverId}/test",
  tags: ["MCP Servers"],
  summary: "Test MCP connection",
  description: "Connects to the server, lists available tools, and updates the cache.",
  security: auth,
  request: { params: z.object({ serverId: z.string() }) },
  responses: {
    200: ok(
      z.object({
        success: z.literal(true),
        data: z.object({
          connected: z.boolean(),
          tools: z.array(z.string()),
        }),
      })
    ),
    401: err("Unauthorised"),
    404: err("Server not found"),
  },
});

// ── Eval Suites ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/evals",
  tags: ["Evals"],
  summary: "List eval suites",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(EvalSuiteSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/evals/{suiteId}/run",
  tags: ["Evals"],
  summary: "Trigger eval run",
  description: "Runs all test cases in the suite. Returns 409 if a run is already in progress.",
  security: auth,
  request: {
    params: z.object({ agentId: z.string(), suiteId: z.string() }),
  },
  responses: {
    201: ok(
      z.object({
        success: z.literal(true),
        data: z.object({ runId: z.string(), status: z.string() }),
      })
    ),
    401: err("Unauthorised"),
    409: err("Run already in progress"),
  },
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/webhooks",
  tags: ["Webhooks"],
  summary: "List webhook configs",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(WebhookConfigSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/trigger/{webhookId}",
  tags: ["Webhooks"],
  summary: "Inbound webhook trigger (public)",
  description:
    "Public endpoint. Authenticated via HMAC-SHA256 signature headers " +
    "(`x-webhook-id`, `x-webhook-timestamp`, `x-webhook-signature`). " +
    "No session cookie required.",
  request: {
    params: z.object({ agentId: z.string(), webhookId: z.string() }),
    headers: z.object({
      "x-webhook-id": z.string().openapi({ example: "evt_abc123" }),
      "x-webhook-timestamp": z.string().openapi({ example: "1711234567" }),
      "x-webhook-signature": z.string().openapi({ example: "v1,base64signature==" }),
    }),
    body: {
      required: true,
      content: { "application/json": { schema: z.record(z.unknown()) } },
    },
  },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: z.object({ received: z.boolean() }) })),
    401: err("Invalid signature"),
    409: err("Duplicate event (idempotency)"),
    429: err("Rate limit exceeded"),
  },
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/jobs/{jobId}",
  tags: ["Jobs"],
  summary: "Poll async job status",
  description:
    "Poll this endpoint after kicking off an async operation " +
    "(e.g. a queued chat execution). Returns state, progress, and result.",
  security: auth,
  request: { params: z.object({ jobId: z.string() }) },
  responses: {
    200: ok(z.object({ success: z.literal(true), data: JobStatusSchema })),
    401: err("Unauthorised"),
    404: err("Job not found"),
  },
});

// ── Schedules ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/agents/{agentId}/schedules",
  tags: ["Schedules"],
  summary: "List flow schedules",
  security: auth,
  request: { params: z.object({ agentId: z.string() }) },
  responses: {
    200: ok(
      z.object({ success: z.literal(true), data: z.array(FlowScheduleSchema) })
    ),
    401: err("Unauthorised"),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/agents/{agentId}/schedules",
  tags: ["Schedules"],
  summary: "Create flow schedule",
  security: auth,
  request: {
    params: z.object({ agentId: z.string() }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            scheduleType: z.enum(["CRON", "INTERVAL", "MANUAL"]),
            cronExpression: z
              .string()
              .optional()
              .openapi({ example: "0 9 * * 1", description: "5-field cron, CRON type only" }),
            intervalMinutes: z
              .number()
              .int()
              .min(1)
              .optional()
              .openapi({ example: 60, description: "INTERVAL type only" }),
            timezone: z
              .string()
              .optional()
              .openapi({ example: "Europe/Berlin" }),
            label: z.string().optional().openapi({ example: "Morning report" }),
          }),
        },
      },
    },
  },
  responses: {
    201: ok(z.object({ success: z.literal(true), data: FlowScheduleSchema })),
    401: err("Unauthorised"),
    422: err("Invalid cron expression"),
  },
});
