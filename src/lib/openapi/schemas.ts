/**
 * OpenAPI schema definitions.
 *
 * Registers every reusable data model with the OpenAPI registry so they
 * appear as named $ref components in the generated spec.
 */
import { registry, z } from "./registry";

// ── Primitives ───────────────────────────────────────────────────────────────

export const ErrorResponseSchema = registry.register(
  "ErrorResponse",
  z
    .object({
      success: z.literal(false),
      error: z.string().openapi({ example: "Not found" }),
    })
    .openapi("ErrorResponse")
);

// ── Agent ────────────────────────────────────────────────────────────────────

export const AgentSchema = registry.register(
  "Agent",
  z
    .object({
      id: z.string().openapi({ example: "cm_abc123" }),
      name: z.string().openapi({ example: "Customer Support Agent" }),
      description: z
        .string()
        .nullable()
        .openapi({ example: "Handles customer inquiries" }),
      systemPrompt: z
        .string()
        .nullable()
        .openapi({ example: "You are a helpful assistant..." }),
      model: z.string().openapi({ example: "gpt-4.1-mini" }),
      category: z
        .string()
        .nullable()
        .openapi({ example: "customer-support" }),
      tags: z
        .array(z.string())
        .openapi({ example: ["support", "chat"] }),
      isPublic: z.boolean().openapi({ example: false }),
      userId: z.string().nullable().openapi({ example: "user_xyz" }),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      _count: z
        .object({
          conversations: z.number().openapi({ example: 42 }),
          knowledgeSources: z.number().openapi({ example: 3 }),
        })
        .optional(),
    })
    .openapi("Agent")
);

export const CreateAgentBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "My Agent" }),
    description: z
      .string()
      .max(500)
      .optional()
      .openapi({ example: "A helpful assistant" }),
    systemPrompt: z.string().optional().openapi({ example: "You are..." }),
    model: z
      .string()
      .optional()
      .openapi({ example: "gpt-4.1-mini" }),
    templateId: z
      .string()
      .optional()
      .openapi({ example: "customer-support-basic" }),
  })
  .openapi("CreateAgentBody");

export const PatchAgentBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional().openapi({ example: "Renamed Agent" }),
    description: z.string().max(500).optional(),
    systemPrompt: z.string().optional(),
    model: z.string().optional().openapi({ example: "gpt-4.1" }),
    category: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    isPublic: z.boolean().optional(),
  })
  .openapi("PatchAgentBody");

// ── Chat ─────────────────────────────────────────────────────────────────────

export const ChatMessageSchema = registry.register(
  "ChatMessage",
  z
    .object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().openapi({ example: "Hello, how can I help you?" }),
    })
    .openapi("ChatMessage")
);

export const ChatRequestSchema = z
  .object({
    message: z.string().min(1).openapi({ example: "What can you help me with?" }),
    conversationId: z
      .string()
      .optional()
      .openapi({ example: "conv_abc123" }),
    stream: z
      .boolean()
      .optional()
      .openapi({
        example: false,
        description:
          "Set to true for NDJSON streaming response. Default false returns JSON.",
      }),
  })
  .openapi("ChatRequest");

export const ChatResponseSchema = registry.register(
  "ChatResponse",
  z
    .object({
      success: z.literal(true),
      data: z.object({
        conversationId: z.string(),
        messages: z.array(ChatMessageSchema),
      }),
    })
    .openapi("ChatResponse")
);

// ── Flow ─────────────────────────────────────────────────────────────────────

export const FlowNodeSchema = registry.register(
  "FlowNode",
  z
    .object({
      id: z.string().openapi({ example: "node_1" }),
      type: z.string().openapi({ example: "ai_response" }),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.record(z.unknown()).openapi({ description: "Node-specific configuration" }),
    })
    .openapi("FlowNode")
);

export const FlowEdgeSchema = registry.register(
  "FlowEdge",
  z
    .object({
      id: z.string().openapi({ example: "edge_1" }),
      source: z.string(),
      target: z.string(),
      sourceHandle: z.string().nullable().optional(),
      targetHandle: z.string().nullable().optional(),
    })
    .openapi("FlowEdge")
);

export const FlowContentSchema = registry.register(
  "FlowContent",
  z
    .object({
      nodes: z.array(FlowNodeSchema),
      edges: z.array(FlowEdgeSchema),
      variables: z
        .array(
          z.object({
            name: z.string(),
            value: z.unknown(),
            type: z.string(),
          })
        )
        .optional(),
    })
    .openapi("FlowContent")
);

// ── Knowledge ────────────────────────────────────────────────────────────────

export const KBSourceSchema = registry.register(
  "KBSource",
  z
    .object({
      id: z.string().openapi({ example: "src_abc123" }),
      type: z.enum(["URL", "TEXT", "FILE", "SITEMAP"]),
      status: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]),
      url: z.string().nullable().openapi({ example: "https://docs.example.com" }),
      title: z.string().nullable().openapi({ example: "Documentation" }),
      chunkCount: z.number().openapi({ example: 24 }),
      createdAt: z.string().datetime(),
    })
    .openapi("KBSource")
);

export const KBSearchRequestSchema = z
  .object({
    query: z.string().min(1).openapi({ example: "How to reset my password?" }),
    topK: z.number().int().min(1).max(20).optional().openapi({ example: 5 }),
    rerank: z.boolean().optional().openapi({ example: false }),
  })
  .openapi("KBSearchRequest");

export const KBSearchResultSchema = registry.register(
  "KBSearchResult",
  z
    .object({
      chunkId: z.string(),
      content: z.string().openapi({ example: "To reset your password, visit..." }),
      score: z.number().openapi({ example: 0.87 }),
      sourceId: z.string(),
      sourceTitle: z.string().nullable(),
    })
    .openapi("KBSearchResult")
);

// ── API Keys ─────────────────────────────────────────────────────────────────

export const ApiKeySchema = registry.register(
  "ApiKey",
  z
    .object({
      id: z.string().openapi({ example: "key_abc123" }),
      name: z.string().openapi({ example: "Production key" }),
      prefix: z.string().openapi({ example: "as_prod_Ab1C" }),
      scopes: z
        .array(z.string())
        .openapi({ example: ["agents:read", "chat:write"] }),
      expiresAt: z.string().datetime().nullable(),
      lastUsedAt: z.string().datetime().nullable(),
      createdAt: z.string().datetime(),
    })
    .openapi("ApiKey")
);

export const CreateApiKeyBodySchema = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: "CI/CD key" }),
    scopes: z
      .array(z.string())
      .min(1)
      .openapi({ example: ["agents:read", "chat:write"] }),
    expiresInDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .openapi({ example: 90 }),
  })
  .openapi("CreateApiKeyBody");

export const CreateApiKeyResponseSchema = registry.register(
  "CreateApiKeyResponse",
  z
    .object({
      success: z.literal(true),
      data: z.object({
        key: ApiKeySchema,
        plaintext: z
          .string()
          .openapi({
            example: "as_prod_AbCdEfGhIjKlMnOpQrStUvWxYz",
            description:
              "The full API key — shown ONCE, store it securely.",
          }),
      }),
    })
    .openapi("CreateApiKeyResponse")
);

// ── MCP Servers ──────────────────────────────────────────────────────────────

export const MCPServerSchema = registry.register(
  "MCPServer",
  z
    .object({
      id: z.string().openapi({ example: "mcp_abc123" }),
      name: z.string().openapi({ example: "GitHub Tools" }),
      url: z.string().url().openapi({ example: "https://mcp.example.com/mcp" }),
      transport: z.enum(["STREAMABLE_HTTP", "SSE"]),
      description: z.string().nullable(),
      toolsCache: z.array(z.string()).openapi({ example: ["list_repos", "create_pr"] }),
      createdAt: z.string().datetime(),
    })
    .openapi("MCPServer")
);

// ── Eval Suites ──────────────────────────────────────────────────────────────

export const EvalSuiteSchema = registry.register(
  "EvalSuite",
  z
    .object({
      id: z.string().openapi({ example: "suite_abc123" }),
      name: z.string().openapi({ example: "Regression suite" }),
      description: z.string().nullable(),
      isDefault: z.boolean(),
      runOnDeploy: z.boolean(),
      testCaseCount: z.number().openapi({ example: 12 }),
      lastRunScore: z.number().nullable().openapi({ example: 0.92 }),
      createdAt: z.string().datetime(),
    })
    .openapi("EvalSuite")
);

// ── Webhooks ─────────────────────────────────────────────────────────────────

export const WebhookConfigSchema = registry.register(
  "WebhookConfig",
  z
    .object({
      id: z.string().openapi({ example: "wh_abc123" }),
      name: z.string().openapi({ example: "GitHub push events" }),
      provider: z.string().nullable().openapi({ example: "github" }),
      eventFilters: z.array(z.string()).openapi({ example: ["push", "pull_request"] }),
      triggerUrl: z
        .string()
        .openapi({
          example: "https://your-app.railway.app/api/agents/cm_abc/trigger/wh_abc",
        }),
      createdAt: z.string().datetime(),
    })
    .openapi("WebhookConfig")
);

// ── Jobs ─────────────────────────────────────────────────────────────────────

export const JobStatusSchema = registry.register(
  "JobStatus",
  z
    .object({
      jobId: z.string().openapi({ example: "job_abc123" }),
      state: z
        .enum(["waiting", "active", "completed", "failed", "delayed"])
        .openapi({ example: "completed" }),
      progress: z.number().min(0).max(100).openapi({ example: 100 }),
      result: z.unknown().nullable().openapi({ description: "Job output when completed" }),
      failedReason: z
        .string()
        .nullable()
        .openapi({ description: "Error message when state=failed" }),
    })
    .openapi("JobStatus")
);

// ── Health ───────────────────────────────────────────────────────────────────

export const HealthResponseSchema = registry.register(
  "HealthResponse",
  z
    .object({
      status: z.enum(["ok", "degraded"]).openapi({ example: "ok" }),
      db: z.enum(["connected", "error"]).openapi({ example: "connected" }),
      redis: z.enum(["connected", "unavailable"]).openapi({ example: "connected" }),
      uptime: z.number().openapi({ example: 3600 }),
      version: z.string().openapi({ example: "0.1.0" }),
    })
    .openapi("HealthResponse")
);

// ── Schedules ────────────────────────────────────────────────────────────────

export const FlowScheduleSchema = registry.register(
  "FlowSchedule",
  z
    .object({
      id: z.string().openapi({ example: "sched_abc123" }),
      scheduleType: z.enum(["CRON", "INTERVAL", "MANUAL"]),
      cronExpression: z.string().nullable().openapi({ example: "0 9 * * 1" }),
      intervalMinutes: z.number().nullable().openapi({ example: 60 }),
      timezone: z.string().openapi({ example: "Europe/Berlin" }),
      enabled: z.boolean(),
      label: z.string().nullable().openapi({ example: "Weekly report" }),
      nextRunAt: z.string().datetime().nullable(),
    })
    .openapi("FlowSchedule")
);
