import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookExecution: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    webhookConfig: {
      findUnique: vi.fn().mockResolvedValue({ failureCount: 0, enabled: true }),
      update: vi.fn(),
    },
    webhookDeadLetter: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  shouldRetryExecution,
  moveToDeadLetter,
  checkCircuitBreaker,
  handleFailedExecution,
  MAX_RETRIES,
  RETRY_DELAYS_MS,
} from "../retry";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shouldRetryExecution", () => {
  it("returns retry for first failure", () => {
    const decision = shouldRetryExecution(0, "Connection timeout");
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(RETRY_DELAYS_MS[0]);
    expect(decision.retryCount).toBe(1);
  });

  it("returns retry for second failure with longer delay", () => {
    const decision = shouldRetryExecution(1, "HTTP 500");
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(RETRY_DELAYS_MS[1]);
  });

  it("returns no retry after max retries exhausted", () => {
    const decision = shouldRetryExecution(MAX_RETRIES, "still failing");
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain("Max retries");
  });

  it("returns no retry for signature verification failures", () => {
    const decision = shouldRetryExecution(0, "Signature verification failed");
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toContain("Non-retryable");
  });

  it("returns no retry for webhook not found", () => {
    const decision = shouldRetryExecution(0, "Webhook not found");
    expect(decision.shouldRetry).toBe(false);
  });
});

describe("moveToDeadLetter", () => {
  it("creates dead letter record", async () => {
    mockFindUnique.mockResolvedValueOnce({
      eventType: "push",
      rawPayload: '{"action":"push"}',
      rawHeaders: { "x-github-event": "push" },
      retryCount: 3,
    });
    mockCreate.mockResolvedValueOnce({ id: "dl-1" });

    const id = await moveToDeadLetter("exec-1", "wh-1", "Final failure");

    expect(id).toBe("dl-1");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionId: "exec-1",
          webhookConfigId: "wh-1",
          retryCount: 3,
        }),
      }),
    );
  });
});

describe("checkCircuitBreaker", () => {
  it("does not trip when below threshold", async () => {
    vi.mocked(prisma.webhookConfig.findUnique).mockResolvedValueOnce({
      failureCount: 2,
      enabled: true,
    } as ReturnType<typeof prisma.webhookConfig.findUnique> extends Promise<infer T> ? T : never);

    const result = await checkCircuitBreaker("wh-1");
    expect(result.tripped).toBe(false);
  });

  it("trips and disables webhook at threshold", async () => {
    vi.mocked(prisma.webhookConfig.findUnique).mockResolvedValueOnce({
      failureCount: 5,
      enabled: true,
    } as ReturnType<typeof prisma.webhookConfig.findUnique> extends Promise<infer T> ? T : never);

    const result = await checkCircuitBreaker("wh-1");
    expect(result.tripped).toBe(true);
    expect(prisma.webhookConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { enabled: false },
      }),
    );
  });
});

describe("handleFailedExecution", () => {
  it("schedules retry on retryable error", async () => {
    vi.mocked(prisma.webhookConfig.findUnique).mockResolvedValueOnce({
      failureCount: 0,
      enabled: true,
    } as ReturnType<typeof prisma.webhookConfig.findUnique> extends Promise<infer T> ? T : never);
    mockUpdate.mockResolvedValueOnce({});

    const result = await handleFailedExecution("exec-1", "wh-1", 0, "HTTP 500");

    expect(result.action).toBe("retry");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryCount: 1, status: "PENDING" }),
      }),
    );
  });

  it("moves to dead letter after max retries", async () => {
    vi.mocked(prisma.webhookConfig.findUnique).mockResolvedValueOnce({
      failureCount: 0,
      enabled: true,
    } as ReturnType<typeof prisma.webhookConfig.findUnique> extends Promise<infer T> ? T : never);
    mockFindUnique.mockResolvedValueOnce({ eventType: null, rawPayload: null, rawHeaders: null, retryCount: 3 });
    mockCreate.mockResolvedValueOnce({ id: "dl-2" });

    const result = await handleFailedExecution("exec-1", "wh-1", 3, "still failing");

    expect(result.action).toBe("dead_letter");
  });

  it("triggers circuit breaker when threshold reached", async () => {
    vi.mocked(prisma.webhookConfig.findUnique).mockResolvedValueOnce({
      failureCount: 5,
      enabled: true,
    } as ReturnType<typeof prisma.webhookConfig.findUnique> extends Promise<infer T> ? T : never);
    mockFindUnique.mockResolvedValueOnce({ eventType: null, rawPayload: null, rawHeaders: null, retryCount: 0 });
    mockCreate.mockResolvedValueOnce({ id: "dl-3" });

    const result = await handleFailedExecution("exec-1", "wh-1", 0, "timeout");

    expect(result.action).toBe("circuit_broken");
  });
});
