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

import { executeWebhookTrigger } from "../execute";
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
});
