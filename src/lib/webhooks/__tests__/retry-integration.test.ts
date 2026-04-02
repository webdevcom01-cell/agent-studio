/**
 * Integration tests for webhook retry processor.
 *
 * Tests the wire-up between execute.ts and the retry/queue infrastructure:
 *   - Failed executions call handleFailedExecution with the correct args
 *   - A BullMQ delayed job is scheduled when handleFailedExecution returns "retry"
 *   - retryJobId is persisted on the execution record
 *   - No job is scheduled for "dead_letter" or "circuit_broken" outcomes
 *   - Retry runs skip idempotency and rate limiting
 *   - currentRetryCount is read from the existing execution for worker-dispatched retries
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  webhookConfig: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  webhookExecution: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const mockCheckRateLimit = vi.hoisted(() =>
  vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
);
const mockExecuteFlow = vi.hoisted(() => vi.fn());
const mockLoadContext = vi.hoisted(() => vi.fn());
const mockSaveMessages = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockSaveContext = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockVerifySignature = vi.hoisted(() => vi.fn().mockReturnValue({ valid: true }));
const mockDecryptSecret = vi.hoisted(() => vi.fn().mockReturnValue("secret"));
const mockAddWebhookRetryJob = vi.hoisted(() => vi.fn().mockResolvedValue("job_abc"));
const mockHandleFailedExecution = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ action: "retry", details: "Retry #1 in 60s" }),
);

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("@/lib/runtime/engine", () => ({ executeFlow: mockExecuteFlow }));
vi.mock("@/lib/runtime/context", () => ({
  loadContext: mockLoadContext,
  saveMessages: mockSaveMessages,
  saveContext: mockSaveContext,
}));
vi.mock("../verify", () => ({
  verifyWebhookSignature: mockVerifySignature,
  decryptWebhookSecret: mockDecryptSecret,
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/queue", () => ({
  addWebhookRetryJob: mockAddWebhookRetryJob,
}));
// Mock retry.ts so tests are deterministic and don't depend on retry internals.
vi.mock("../retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("../retry")>();
  return {
    ...original, // keep RETRY_DELAYS_MS, shouldRetryExecution, etc.
    handleFailedExecution: mockHandleFailedExecution,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_CONFIG = {
  id: "wh_1",
  enabled: true,
  secret: "sec",
  secretEncrypted: false,
  bodyMappings: [],
  headerMappings: [],
  eventFilters: [],
};

/**
 * Waits for all pending microtasks + a macrotask so the fire-and-forget
 * `scheduleWebhookRetry` chain can complete before we assert on mock calls.
 */
async function drainAsync(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 20));
}

function buildOpts(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "agent_1",
    webhookId: "wh_1",
    rawBody: JSON.stringify({ event: "push" }),
    headers: { "x-webhook-id": "ev_abc", "content-type": "application/json" },
    ...overrides,
  };
}

// ── Tests: retry scheduling wired into execute.ts ─────────────────────────────

describe("webhook retry integration — scheduleWebhookRetry wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.webhookConfig.findFirst.mockResolvedValue(WEBHOOK_CONFIG);
    mockPrisma.webhookExecution.create.mockResolvedValue({ id: "exec_1" });
    // Return null so the idempotency check (step 3) sees no prior execution.
    // Individual tests that test the retry path (isRetry=true) override this.
    mockPrisma.webhookExecution.findUnique.mockResolvedValue(null);
    mockPrisma.webhookExecution.update.mockResolvedValue({});
    mockPrisma.webhookConfig.update.mockResolvedValue({});
    mockLoadContext.mockResolvedValue({ conversationId: "conv_1", variables: {} });
    // Default: retry decision
    mockHandleFailedExecution.mockResolvedValue({ action: "retry", details: "Retry #1 in 60s" });
    mockAddWebhookRetryJob.mockResolvedValue("job_abc");
  });

  it("does NOT call handleFailedExecution on successful execution", async () => {
    mockExecuteFlow.mockResolvedValue({ messages: [] });

    const { executeWebhookTrigger } = await import("../execute");
    const result = await executeWebhookTrigger(buildOpts());
    await drainAsync();

    expect(result.success).toBe(true);
    expect(mockHandleFailedExecution).not.toHaveBeenCalled();
    expect(mockAddWebhookRetryJob).not.toHaveBeenCalled();
  });

  it("calls handleFailedExecution with correct args when execution fails", async () => {
    mockExecuteFlow.mockRejectedValue(new Error("upstream timeout"));

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(buildOpts());
    await drainAsync();

    expect(mockHandleFailedExecution).toHaveBeenCalledWith(
      "exec_1",    // executionId
      "wh_1",      // webhookId
      0,           // currentRetryCount (first attempt)
      "upstream timeout",
    );
  });

  it("schedules BullMQ retry job with 60s delay on first failure", async () => {
    mockExecuteFlow.mockRejectedValue(new Error("db timeout"));

    const { executeWebhookTrigger } = await import("../execute");
    const result = await executeWebhookTrigger(buildOpts());
    await drainAsync();

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);

    expect(mockAddWebhookRetryJob).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_1",
        webhookId: "wh_1",
        executionId: "exec_1",
        retryCount: 1,
      }),
      60_000, // RETRY_DELAYS_MS[0] — first retry after 1 minute
    );
  });

  it("persists retryJobId on the execution record after scheduling", async () => {
    mockExecuteFlow.mockRejectedValue(new Error("timeout"));
    mockAddWebhookRetryJob.mockResolvedValue("bullmq_job_xyz");

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(buildOpts());
    await drainAsync();

    const updateCalls = mockPrisma.webhookExecution.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const retryJobUpdate = updateCalls.find((c) => c[0].data.retryJobId !== undefined);
    expect(retryJobUpdate).toBeDefined();
    expect(retryJobUpdate![0].data.retryJobId).toBe("bullmq_job_xyz");
  });

  it("does NOT schedule retry when handleFailedExecution returns 'dead_letter'", async () => {
    mockHandleFailedExecution.mockResolvedValue({
      action: "dead_letter",
      details: "Max retries exhausted",
    });
    mockExecuteFlow.mockRejectedValue(new Error("permanent failure"));

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(buildOpts());
    await drainAsync();

    expect(mockAddWebhookRetryJob).not.toHaveBeenCalled();
  });

  it("does NOT schedule retry when handleFailedExecution returns 'circuit_broken'", async () => {
    mockHandleFailedExecution.mockResolvedValue({
      action: "circuit_broken",
      details: "Webhook auto-disabled after consecutive failures",
    });
    mockExecuteFlow.mockRejectedValue(new Error("flow error"));

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(buildOpts());
    await drainAsync();

    expect(mockAddWebhookRetryJob).not.toHaveBeenCalled();
  });

  it("uses 5-minute delay for second retry (RETRY_DELAYS_MS[1])", async () => {
    // Simulate a worker-dispatched retry: execution already has retryCount=1
    mockPrisma.webhookExecution.findUnique.mockResolvedValue({
      id: "exec_r2",
      retryCount: 1,
    });
    mockExecuteFlow.mockRejectedValue(new Error("still failing"));
    mockHandleFailedExecution.mockResolvedValue({ action: "retry", details: "Retry #2 in 300s" });

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(
      buildOpts({ retryExecutionId: "exec_r2", isReplay: true }),
    );
    await drainAsync();

    expect(mockAddWebhookRetryJob).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 2 }),
      300_000, // RETRY_DELAYS_MS[1] — second retry after 5 minutes
    );
  });

  it("uses 30-minute delay for third retry (RETRY_DELAYS_MS[2])", async () => {
    mockPrisma.webhookExecution.findUnique.mockResolvedValue({
      id: "exec_r3",
      retryCount: 2,
    });
    mockExecuteFlow.mockRejectedValue(new Error("still failing"));
    mockHandleFailedExecution.mockResolvedValue({ action: "retry", details: "Retry #3 in 1800s" });

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(
      buildOpts({ retryExecutionId: "exec_r3", isReplay: true }),
    );
    await drainAsync();

    expect(mockAddWebhookRetryJob).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 3 }),
      1_800_000, // RETRY_DELAYS_MS[2] — third retry after 30 minutes
    );
  });
});

// ── Tests: retry path skips guards ───────────────────────────────────────────

describe("webhook retry path — idempotency + rate limiting skipped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.webhookConfig.findFirst.mockResolvedValue(WEBHOOK_CONFIG);
    mockPrisma.webhookExecution.findUnique.mockResolvedValue({
      id: "exec_retry",
      retryCount: 1,
    });
    mockPrisma.webhookExecution.update.mockResolvedValue({});
    mockPrisma.webhookConfig.update.mockResolvedValue({});
    mockLoadContext.mockResolvedValue({ conversationId: "conv_r", variables: {} });
    mockExecuteFlow.mockResolvedValue({ messages: [] });
    mockHandleFailedExecution.mockResolvedValue({ action: "dead_letter", details: "n/a" });
  });

  it("does not call checkRateLimit when retryExecutionId is provided", async () => {
    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(
      buildOpts({ retryExecutionId: "exec_retry", isReplay: true }),
    );

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("does not create a new execution record — updates the existing one", async () => {
    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(
      buildOpts({ retryExecutionId: "exec_retry", isReplay: true }),
    );

    expect(mockPrisma.webhookExecution.create).not.toHaveBeenCalled();
    const updateCalls = mockPrisma.webhookExecution.update.mock.calls as Array<
      [{ where: { id: string } }]
    >;
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[0][0].where.id).toBe("exec_retry");
  });

  it("throws when retryExecutionId points to a missing execution", async () => {
    mockPrisma.webhookExecution.findUnique.mockResolvedValue(null);

    const { executeWebhookTrigger } = await import("../execute");
    await expect(
      executeWebhookTrigger(
        buildOpts({ retryExecutionId: "exec_gone", isReplay: true }),
      ),
    ).rejects.toThrow("not found");
  });

  it("reads currentRetryCount from existing execution (1 → delay=300s)", async () => {
    // retryCount=1 on the execution → second retry → 5min delay
    mockExecuteFlow.mockRejectedValue(new Error("still failing"));
    mockHandleFailedExecution.mockResolvedValue({ action: "retry", details: "Retry #2" });
    mockAddWebhookRetryJob.mockResolvedValue("job_r2");

    const { executeWebhookTrigger } = await import("../execute");
    await executeWebhookTrigger(
      buildOpts({ retryExecutionId: "exec_retry", isReplay: true }),
    );
    await drainAsync();

    // handleFailedExecution called with retryCount=1 (from the existing execution)
    expect(mockHandleFailedExecution).toHaveBeenCalledWith(
      "exec_retry",
      "wh_1",
      1, // currentRetryCount read from execution record
      "still failing",
    );
    // Delay for retryCount=1 is RETRY_DELAYS_MS[1] = 300s
    expect(mockAddWebhookRetryJob).toHaveBeenCalledWith(
      expect.objectContaining({ retryCount: 2 }),
      300_000,
    );
  });
});
