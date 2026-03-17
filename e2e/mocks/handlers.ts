import { type Page } from "@playwright/test";
import {
  MOCK_CHAT_RESPONSE,
  MOCK_EMBEDDING_RESPONSE,
  createMockDeepSeekSSE,
  createMockNDJSONStream,
} from "./ai-responses";

/**
 * Mock all external AI provider API calls.
 *
 * Must be called before any test that triggers chat or embedding operations.
 * Uses Playwright's page.route() to intercept outgoing requests.
 */
export async function mockAIProviders(page: Page) {
  // Mock DeepSeek Chat API (streaming SSE)
  await page.route("**/api.deepseek.com/**", (route) => {
    const body = createMockDeepSeekSSE("Hello! I'm a test assistant.");
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  // Mock OpenAI Chat API
  await page.route("**/api.openai.com/v1/chat/completions", (route) => {
    const body = createMockDeepSeekSSE(
      "Hello from OpenAI mock! How can I help?"
    );
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });

  // Mock OpenAI Embeddings API
  await page.route("**/api.openai.com/v1/embeddings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EMBEDDING_RESPONSE),
    })
  );

  // Mock Anthropic API
  await page.route("**/api.anthropic.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Anthropic mock!"),
    })
  );

  // Mock Google Gemini API
  await page.route("**/generativelanguage.googleapis.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Gemini mock!"),
    })
  );

  // Mock Groq API
  await page.route("**/api.groq.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: createMockDeepSeekSSE("Hello from Groq mock!"),
    })
  );
}

/**
 * Mock the internal chat API endpoint to return NDJSON stream.
 * Use this when you want to bypass the entire backend and test
 * pure frontend streaming behavior.
 */
export async function mockChatAPI(
  page: Page,
  options?: { content?: string; agentId?: string }
) {
  const pattern = options?.agentId
    ? `**/api/agents/${options.agentId}/chat`
    : "**/api/agents/*/chat";

  const body = options?.content
    ? createMockNDJSONStream(options.content)
    : MOCK_CHAT_RESPONSE;

  await page.route(pattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body,
    })
  );
}

/**
 * Mock the embeddings for knowledge base operations.
 * Intercepts at the Next.js API level, not provider level.
 */
export async function mockEmbeddings(page: Page) {
  await page.route("**/api.openai.com/v1/embeddings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EMBEDDING_RESPONSE),
    })
  );
}

// ─── Webhook mock data ────────────────────────────────────────────────────────

/** Minimal mock webhook config returned by list / detail endpoints. */
export const MOCK_WEBHOOK: Record<string, unknown> = {
  id: "wh_mock_001",
  name: "E2E Mock Webhook",
  description: "Created by E2E mocks",
  enabled: true,
  secret: "mock_secret_abcdefghijklmnopqrstuvwxyz012345",
  triggerCount: 3,
  failureCount: 0,
  lastTriggeredAt: new Date(Date.now() - 60_000).toISOString(),
  nodeId: null,
  eventFilters: [],
  bodyMappings: [],
  headerMappings: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  _count: { executions: 1 },
  executions: [
    {
      id: "exec_001",
      status: "COMPLETED",
      triggeredAt: new Date(Date.now() - 60_000).toISOString(),
      completedAt: new Date(Date.now() - 59_500).toISOString(),
      durationMs: 500,
      eventType: "test.event",
      sourceIp: "127.0.0.1",
      conversationId: "conv_mock_001",
      errorMessage: null,
    },
  ],
};

/** Mock webhook with event filters active. */
export const MOCK_WEBHOOK_WITH_FILTERS: Record<string, unknown> = {
  ...MOCK_WEBHOOK,
  id: "wh_mock_002",
  name: "Filtered Webhook",
  eventFilters: ["push", "pull_request"],
  _count: { executions: 0 },
  executions: [],
};

/**
 * Mock all webhook API routes for a given agent.
 *
 * Intercepts:
 *  GET  /api/agents/[agentId]/webhooks        → list  (MOCK_WEBHOOK)
 *  POST /api/agents/[agentId]/webhooks        → create
 *  GET  /api/agents/[agentId]/webhooks/[id]   → detail
 *  PATCH /api/agents/[agentId]/webhooks/[id]  → update
 *  DELETE /api/agents/[agentId]/webhooks/[id] → delete
 *  POST /api/agents/[agentId]/webhooks/[id]/rotate → rotate secret
 *
 * Pass `agentId` to scope the mock to a specific agent; omit for wildcard.
 */
export async function mockWebhooksAPI(
  page: Page,
  options?: {
    agentId?: string;
    webhooks?: Record<string, unknown>[];
    returnEmpty?: boolean;
  }
) {
  const base = options?.agentId
    ? `**/api/agents/${options.agentId}/webhooks`
    : "**/api/agents/*/webhooks";

  const webhooks = options?.returnEmpty
    ? []
    : (options?.webhooks ?? [MOCK_WEBHOOK]);

  // GET list
  await page.route(base, (route) => {
    if (route.request().method() !== "GET") {
      // Let POST fall through to the "create" handler below
      void route.fallback();
      return;
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: webhooks }),
    });
  });

  // POST create
  await page.route(base, async (route) => {
    if (route.request().method() !== "POST") {
      void route.fallback();
      return;
    }
    const created: Record<string, unknown> = {
      ...MOCK_WEBHOOK,
      id: `wh_created_${Date.now()}`,
      name: "New Webhook",
      ...((await route.request().postDataJSON().catch(() => ({}))) as Record<string, unknown>),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: created }),
    });
  });

  // GET detail / PATCH update / DELETE
  const detailBase = options?.agentId
    ? `**/api/agents/${options.agentId}/webhooks/*`
    : "**/api/agents/*/webhooks/*";

  await page.route(detailBase, (route) => {
    const method = route.request().method();

    if (route.request().url().includes("/rotate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { secret: "new_rotated_secret_abcdefghij0123456789" },
        }),
      });
    }

    if (method === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: webhooks[0] ?? MOCK_WEBHOOK }),
      });
    }

    if (method === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: webhooks[0] ?? MOCK_WEBHOOK }),
      });
    }

    if (method === "DELETE") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }

    void route.fallback();
  });
}

/**
 * Mock the webhook trigger endpoint.
 *
 * By default returns a successful 200 (triggered).
 * Pass `skipped: true` to simulate an event-filtered response.
 * Pass `status: 400` to simulate an invalid-signature response.
 */
export async function mockWebhookTrigger(
  page: Page,
  options?: {
    agentId?: string;
    webhookId?: string;
    status?: number;
    skipped?: boolean;
  }
) {
  const pattern =
    options?.agentId && options?.webhookId
      ? `**/api/agents/${options.agentId}/trigger/${options.webhookId}`
      : "**/api/agents/*/trigger/*";

  const status = options?.status ?? 200;
  const body = options?.skipped
    ? JSON.stringify({ success: true, status: 200, skipped: true })
    : status === 400
    ? JSON.stringify({ success: false, error: "Signature mismatch" })
    : JSON.stringify({ success: true, status: 200 });

  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: "application/json", body })
  );
}
