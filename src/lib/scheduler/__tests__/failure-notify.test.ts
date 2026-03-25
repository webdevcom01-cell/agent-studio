import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifyScheduleFailure,
  notifyCircuitBreakerOpen,
  sendWebhookNotification,
  type FailureEvent,
} from "../failure-notify";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeEvent(overrides: Partial<FailureEvent> = {}): FailureEvent {
  return {
    scheduleId: "sched-1",
    agentId: "agent-1",
    executionId: "exec-1",
    error: "Flow execution timed out",
    durationMs: 30000,
    failureCount: 2,
    maxRetries: 3,
    autoDisabled: false,
    scheduledAt: "2026-03-20T09:00:00.000Z",
    failureWebhookUrl: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
});

describe("notifyScheduleFailure", () => {
  it("logs failure event with warn level", async () => {
    await notifyScheduleFailure(makeEvent());

    expect(logger.warn).toHaveBeenCalledWith(
      "Scheduled flow FAILED",
      expect.objectContaining({
        scheduleId: "sched-1",
        agentId: "agent-1",
        error: "Flow execution timed out",
      })
    );
  });

  it("logs with error level when auto-disabled", async () => {
    await notifyScheduleFailure(makeEvent({ autoDisabled: true }));

    expect(logger.error).toHaveBeenCalledWith(
      "Scheduled flow FAILED — circuit breaker triggered",
      expect.objectContaining({ autoDisabled: true })
    );
  });

  it("sends webhook when failureWebhookUrl is configured", async () => {
    await notifyScheduleFailure(makeEvent({
      failureWebhookUrl: "https://hooks.slack.com/services/xxx",
    }));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/xxx",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("does not send webhook when URL is null", async () => {
    await notifyScheduleFailure(makeEvent({ failureWebhookUrl: null }));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("never throws even if webhook fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    await expect(
      notifyScheduleFailure(makeEvent({
        failureWebhookUrl: "https://hooks.slack.com/services/xxx",
      }))
    ).resolves.toBeUndefined();
  });
});

describe("notifyCircuitBreakerOpen", () => {
  it("logs circuit breaker open as error", async () => {
    await notifyCircuitBreakerOpen(makeEvent({ autoDisabled: true, failureCount: 3 }));

    expect(logger.error).toHaveBeenCalledWith(
      "Schedule circuit breaker OPEN — auto-disabled",
      expect.objectContaining({
        scheduleId: "sched-1",
        failureCount: 3,
      })
    );
  });

  it("sends webhook with circuit breaker prefix in error", async () => {
    await notifyCircuitBreakerOpen(makeEvent({
      autoDisabled: true,
      failureCount: 3,
      failureWebhookUrl: "https://hooks.slack.com/services/xxx",
    }));

    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("CIRCUIT BREAKER");
  });
});

describe("sendWebhookNotification", () => {
  it("sends Slack-compatible payload", async () => {
    await sendWebhookNotification("https://hook.example.com/test", makeEvent());

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hook.example.com/test");

    const body = JSON.parse(options.body);
    expect(body.text).toContain("Schedule Execution Failed");
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0].type).toBe("section");
    expect(body.event.scheduleId).toBe("sched-1");
  });

  it("includes full event data in payload", async () => {
    await sendWebhookNotification("https://hook.example.com/test", makeEvent());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event.agentId).toBe("agent-1");
    expect(body.event.error).toBe("Flow execution timed out");
    expect(body.event.failureCount).toBe(2);
    expect(body.event.durationMs).toBe(30000);
  });

  it("logs warning on non-OK response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await sendWebhookNotification("https://hook.example.com/test", makeEvent());

    expect(logger.warn).toHaveBeenCalledWith(
      "Failure webhook returned non-OK status",
      expect.objectContaining({ status: 500 })
    );
  });

  it("logs warning on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));
    await sendWebhookNotification("https://hook.example.com/test", makeEvent());

    expect(logger.warn).toHaveBeenCalledWith(
      "Failure webhook request failed",
      expect.objectContaining({ error: "Connection refused" })
    );
  });

  it("formats circuit breaker event differently", async () => {
    await sendWebhookNotification(
      "https://hook.example.com/test",
      makeEvent({ autoDisabled: true })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("CIRCUIT BREAKER");
  });
});
