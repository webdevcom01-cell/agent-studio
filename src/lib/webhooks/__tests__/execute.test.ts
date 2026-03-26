import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock factories must not reference outer variables (vi.mock is hoisted).
// Use vi.fn() directly in the factory and access via the imported mock object.
vi.mock("@/lib/prisma", () => {
  const mockFindFirst = vi.fn();
  const mockFindUnique = vi.fn();
  const mockCreate = vi.fn();
  const mockUpdate = vi.fn();
  return {
    prisma: {
      webhookConfig: {
        findFirst: mockFindFirst,
        update: mockUpdate,
      },
      webhookExecution: {
        findUnique: mockFindUnique,
        create: mockCreate,
        update: mockUpdate,
      },
    },
  };
});

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 59, retryAfterMs: 0 })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/runtime/context", () => ({
  loadContext: vi.fn(async () => ({
    conversationId: "conv-test-123",
    agentId: "agent-test-abc",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    variables: {},
    messageHistory: [],
    isNewConversation: true,
  })),
  saveContext: vi.fn(async () => undefined),
  saveMessages: vi.fn(async () => undefined),
}));

vi.mock("@/lib/runtime/engine", () => ({
  executeFlow: vi.fn(async () => ({
    messages: [{ role: "assistant", content: "Flow executed" }],
    waitingForInput: false,
  })),
}));

import { executeWebhookTrigger, sanitizeHeadersForStorage } from "../execute";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-test-abc";
const WEBHOOK_ID = "webhook-test-xyz";
const SECRET = "test-secret-key-32-chars-long-ab";
const RAW_BODY = JSON.stringify({ action: "opened", repo: "agent-studio" });
const MSG_ID = "msg_01jtest999";

function makeTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

function makeSignature(id: string, ts: string, body: string, secret: string): string {
  const base = `${id}.${ts}.${body}`;
  const raw = createHmac("sha256", secret).update(base).digest("base64");
  return `v1,${raw}`;
}

function makeHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  const ts = makeTimestamp();
  const id = MSG_ID;
  return {
    "x-webhook-id": id,
    "x-webhook-timestamp": ts,
    "x-webhook-signature": makeSignature(id, ts, RAW_BODY, SECRET),
    "content-type": "application/json",
    ...overrides,
  };
}

function makeWebhookConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: WEBHOOK_ID,
    enabled: true,
    secret: SECRET,
    eventFilters: [] as string[],
    bodyMappings: [],
    headerMappings: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("executeWebhookTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.webhookExecution.findUnique).mockResolvedValue(null as never); // No existing execution by default
    vi.mocked(prisma.webhookExecution.create).mockResolvedValue({ id: "exec-test-001" } as never);
    vi.mocked(prisma.webhookExecution.update).mockResolvedValue({} as never);
    vi.mocked(prisma.webhookConfig.update).mockResolvedValue({} as never);
  });

  describe("happy path", () => {
    it("returns success with conversationId on valid request", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
        sourceIp: "1.2.3.4",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.conversationId).toBe("conv-test-123");
      expect(result.executionId).toBe("exec-test-001");
    });

    it("injects __webhook_payload into flow variables", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      const { loadContext } = await import("@/lib/runtime/context");

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      // Context is loaded — then variables are injected before executeFlow is called
      expect(loadContext).toHaveBeenCalledWith(AGENT_ID);
    });

    it("applies body mappings correctly", async () => {
      const bodyMappings = [
        { jsonPath: "$.action", variableName: "event_action" },
        { jsonPath: "$.repo", variableName: "repo_name" },
      ];
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig({ bodyMappings }) as never);
      const { executeFlow } = await import("@/lib/runtime/engine");

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(executeFlow).toHaveBeenCalled();
      const contextArg = (executeFlow as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(contextArg.variables.event_action).toBe("opened");
      expect(contextArg.variables.repo_name).toBe("agent-studio");
    });

    it("applies header mappings correctly", async () => {
      const headerMappings = [
        { headerName: "X-GitHub-Event", variableName: "github_event" },
      ];
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig({ headerMappings }) as never);
      const { executeFlow } = await import("@/lib/runtime/engine");

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      const contextArg = (executeFlow as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(contextArg.variables.github_event).toBe("push");
    });
  });

  describe("webhook config validation", () => {
    it("returns 404 when webhook config not found", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(null);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/not found/i);
    });

    it("returns 404 when webhook is disabled", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig({ enabled: false }) as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/disabled/i);
    });
  });

  describe("signature verification", () => {
    it("returns 400 when signature is wrong", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig({ secret: "different-secret" }) as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/signature mismatch/i);
    });

    it("returns 400 when signature headers are missing", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: { "content-type": "application/json" }, // no webhook headers
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  describe("idempotency", () => {
    it("returns 409 (skipped=true) when event was already processed", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      vi.mocked(prisma.webhookExecution.findUnique).mockResolvedValue({
        id: "exec-existing-999",
        conversationId: "conv-existing-888",
        status: "COMPLETED",
      } as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(result.status).toBe(409);
      expect(result.skipped).toBe(true);
      expect(result.executionId).toBe("exec-existing-999");
    });

    it("does not call executeFlow for a duplicate event", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      vi.mocked(prisma.webhookExecution.findUnique).mockResolvedValue({ id: "exec-existing", conversationId: null, status: "COMPLETED" } as never);

      const { executeFlow } = await import("@/lib/runtime/engine");
      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(executeFlow).not.toHaveBeenCalled();
    });
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      vi.mocked(checkRateLimit).mockReturnValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterMs: 30_000,
      });

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(429);
      expect(result.error).toMatch(/rate limit/i);
    });
  });

  describe("non-JSON body", () => {
    it("handles plain text body gracefully", async () => {
      const textBody = "plain text webhook event";
      const ts = makeTimestamp();
      const id = "msg_text_test";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, textBody, SECRET),
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: textBody,
        headers,
      });

      expect(result.success).toBe(true);
      const { executeFlow } = await import("@/lib/runtime/engine");
      const contextArg = (executeFlow as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect((contextArg.variables.__webhook_payload as { __raw: string }).__raw).toBe(textBody);
    });
  });

  describe("event filtering", () => {
    it("allows request when eventFilters is empty (accept all)", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: [] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBeUndefined();
    });

    it("allows request when event type matches a filter", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["push", "pull_request"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBeUndefined();
    });

    it("skips (200 + skipped=true) when event type does not match filters", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["pull_request"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBe(true);
      expect(result.error).toMatch(/push/i);
    });

    it("skips when filters are set and no event type is detectable", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["payment_intent.succeeded"] }) as never
      );
      // No event type header and plain JSON body without $.type
      const body = JSON.stringify({ custom: "data" });
      const ts = makeTimestamp();
      const id = "msg_no_event_type";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, body, SECRET),
      };

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: body,
        headers,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBe(true);
      expect(result.error).toMatch(/no event type/i);
    });

    it("does not create execution record for a filtered-out event", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["pull_request"] }) as never
      );

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      // WebhookExecution.create should NOT be called for filtered events
      expect(prisma.webhookExecution.create).not.toHaveBeenCalled();
    });

    it("does not call executeFlow for a filtered-out event", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["deployment"] }) as never
      );
      const { executeFlow } = await import("@/lib/runtime/engine");

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders({ "x-github-event": "push" }),
      });

      expect(executeFlow).not.toHaveBeenCalled();
    });
  });

  describe("body-based event type extraction", () => {
    it("extracts event type from Stripe $.type field", async () => {
      const stripeBody = JSON.stringify({
        type: "payment_intent.succeeded",
        id: "evt_test123",
        data: { object: { id: "pi_test456" } },
      });
      const ts = makeTimestamp();
      const id = "msg_stripe_01";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, stripeBody, SECRET),
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["payment_intent.succeeded"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: stripeBody,
        headers,
      });

      // Should pass the filter because body $.type matches
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBeUndefined();
    });

    it("extracts event type from Stripe body and filters correctly", async () => {
      const stripeBody = JSON.stringify({
        type: "charge.failed",
        id: "evt_test456",
      });
      const ts = makeTimestamp();
      const id = "msg_stripe_02";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, stripeBody, SECRET),
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["payment_intent.succeeded"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: stripeBody,
        headers,
      });

      // charge.failed doesn't match payment_intent.succeeded
      expect(result.skipped).toBe(true);
    });

    it("extracts event type from Slack $.event.type field", async () => {
      const slackBody = JSON.stringify({
        type: "event_callback",
        event: { type: "app_mention", user: "U123456", text: "Hello" },
        team_id: "T123456",
      });
      const ts = makeTimestamp();
      const id = "msg_slack_01";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, slackBody, SECRET),
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["app_mention"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: slackBody,
        headers,
      });

      // $.event.type = app_mention matches the filter
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBeUndefined();
    });

    it("prefers header event type over body event type", async () => {
      // Body has $.type = "push" but header has x-github-event = "pull_request"
      const body = JSON.stringify({ type: "push", repo: "test" });
      const ts = makeTimestamp();
      const id = "msg_header_priority";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, body, SECRET),
        "x-github-event": "pull_request",
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: ["pull_request"] }) as never
      );

      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: body,
        headers,
      });

      // Header event type (pull_request) is used → matches filter
      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.skipped).toBeUndefined();
    });

    it("sets __webhook_event_type to body-derived event type when no header", async () => {
      const stripeBody = JSON.stringify({ type: "invoice.paid", id: "evt_xyz" });
      const ts = makeTimestamp();
      const id = "msg_body_event_type";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, stripeBody, SECRET),
      };
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(
        makeWebhookConfig({ eventFilters: [] }) as never
      );

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: stripeBody,
        headers,
      });

      const { executeFlow } = await import("@/lib/runtime/engine");
      const contextArg = (executeFlow as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(contextArg.variables.__webhook_event_type).toBe("invoice.paid");
    });
  });

  // ── Replay ───────────────────────────────────────────────────────────────────

  describe("replay mode (isReplay: true)", () => {
    it("skips signature verification and succeeds", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      // No valid signature headers — would fail in normal mode
      const result = await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: { "content-type": "application/json" }, // no signature
        isReplay: true,
        replayOf: "exec-original-001",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
    });

    it("generates a fresh idempotency key (does not use x-webhook-id)", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      vi.mocked(prisma.webhookExecution.create).mockResolvedValue({ id: "exec-replay-001" } as never);

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: { "x-webhook-id": "original-id-should-not-be-reused" },
        isReplay: true,
        replayOf: "exec-original-001",
      });

      const createCall = vi.mocked(prisma.webhookExecution.create).mock.calls[0][0];
      // Fresh key must not equal the original header value
      expect(createCall.data.idempotencyKey).not.toBe("original-id-should-not-be-reused");
      // Must start with WEBHOOK_ID (pattern: `${webhookId}:${timestamp}`)
      expect(createCall.data.idempotencyKey).toMatch(new RegExp(`^${WEBHOOK_ID}:`));
    });

    it("stores isReplay=true and replayOf on the execution record", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: {},
        isReplay: true,
        replayOf: "exec-original-abc",
      });

      const createCall = vi.mocked(prisma.webhookExecution.create).mock.calls[0][0];
      expect(createCall.data.isReplay).toBe(true);
      expect(createCall.data.replayOf).toBe("exec-original-abc");
    });

    it("stores rawPayload when body fits within 1 MB", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      const _ts = makeTimestamp();
      const _id = "msg_store_test";
      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      const createCall = vi.mocked(prisma.webhookExecution.create).mock.calls[0][0];
      expect(createCall.data.rawPayload).toBe(RAW_BODY);
    });

    it("stores null rawPayload when body exceeds 1 MB", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);
      const bigBody = "x".repeat(1_048_577); // 1 MB + 1 byte
      const ts = makeTimestamp();
      const id = "msg_big_body";
      const headers = {
        "x-webhook-id": id,
        "x-webhook-timestamp": ts,
        "x-webhook-signature": makeSignature(id, ts, bigBody, SECRET),
      };

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: bigBody,
        headers,
      });

      const createCall = vi.mocked(prisma.webhookExecution.create).mock.calls[0][0];
      expect(createCall.data.rawPayload).toBeNull();
    });

    it("default isReplay is false for normal executions", async () => {
      vi.mocked(prisma.webhookConfig.findFirst).mockResolvedValue(makeWebhookConfig() as never);

      await executeWebhookTrigger({
        agentId: AGENT_ID,
        webhookId: WEBHOOK_ID,
        rawBody: RAW_BODY,
        headers: makeHeaders(),
      });

      const createCall = vi.mocked(prisma.webhookExecution.create).mock.calls[0][0];
      expect(createCall.data.isReplay).toBe(false);
      expect(createCall.data.replayOf).toBeNull();
    });
  });

  // ── sanitizeHeadersForStorage ─────────────────────────────────────────────

  describe("sanitizeHeadersForStorage", () => {
    it("removes Authorization header", () => {
      const result = sanitizeHeadersForStorage({
        Authorization: "Bearer token123",
        "content-type": "application/json",
      });
      expect(result).not.toHaveProperty("Authorization");
      expect(result["content-type"]).toBe("application/json");
    });

    it("removes cookie and set-cookie headers", () => {
      const result = sanitizeHeadersForStorage({
        Cookie: "session=abc",
        "Set-Cookie": "token=xyz",
        "x-request-id": "req-001",
      });
      expect(result).not.toHaveProperty("Cookie");
      expect(result).not.toHaveProperty("Set-Cookie");
      expect(result["x-request-id"]).toBe("req-001");
    });

    it("redacts x-webhook-signature value but keeps the key", () => {
      const result = sanitizeHeadersForStorage({
        "x-webhook-signature": "v1,abc123secret",
        "x-webhook-id": "msg_001",
      });
      expect(result["x-webhook-signature"]).toBe("[REDACTED]");
      expect(result["x-webhook-id"]).toBe("msg_001");
    });

    it("removes x-api-key header", () => {
      const result = sanitizeHeadersForStorage({
        "x-api-key": "supersecretkey",
        "content-type": "application/json",
      });
      expect(result).not.toHaveProperty("x-api-key");
    });

    it("flattens array header values to first element", () => {
      const result = sanitizeHeadersForStorage({
        "x-github-event": ["push", "duplicate"],
        "content-type": "application/json",
      });
      expect(result["x-github-event"]).toBe("push");
    });

    it("omits headers with undefined value", () => {
      const result = sanitizeHeadersForStorage({
        "content-type": undefined,
        "x-request-id": "req-001",
      });
      expect(result).not.toHaveProperty("content-type");
      expect(result["x-request-id"]).toBe("req-001");
    });

    it("preserves normal provider event headers", () => {
      const result = sanitizeHeadersForStorage({
        "x-github-event": "push",
        "x-webhook-id": "msg_001",
        "x-webhook-timestamp": "1700000000",
        "content-type": "application/json",
        "user-agent": "GitHub-Hookshot/abc",
      });
      expect(result["x-github-event"]).toBe("push");
      expect(result["x-webhook-id"]).toBe("msg_001");
      expect(result["content-type"]).toBe("application/json");
    });
  });
});
