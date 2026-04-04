import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { WebhookSink, InAppSink, LogSink, getSink } from "../sinks";
import type { RenderedMessage, SinkConfig } from "../types";

const rendered: RenderedMessage = {
  text: "✅ Build passed",
  body: { text: "✅ Build passed", level: "success" },
  level: "success",
};

const baseConfig: SinkConfig = {
  agentId: "agent-1",
  timeoutMs: 5000,
};

// ── WebhookSink ─────────────────────────────────────────────────────────

describe("WebhookSink", () => {
  const sink = new WebhookSink();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fails when no URL configured", async () => {
    const result = await sink.deliver(rendered, baseConfig);
    expect(result.success).toBe(false);
    expect(result.error).toContain("No webhook URL");
  });

  it("delivers to webhook URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );

    const result = await sink.deliver(rendered, {
      ...baseConfig,
      webhookUrl: "https://example.com/hook",
    });

    expect(result.success).toBe(true);
    expect(result.channel).toBe("webhook");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect((opts as RequestInit).method).toBe("POST");
  });

  it("handles non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    const result = await sink.deliver(rendered, {
      ...baseConfig,
      webhookUrl: "https://example.com/hook",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
  });

  it("handles fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await sink.deliver(rendered, {
      ...baseConfig,
      webhookUrl: "https://example.com/hook",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

// ── InAppSink ───────────────────────────────────────────────────────────

describe("InAppSink", () => {
  const sink = new InAppSink();

  it("always succeeds", async () => {
    const result = await sink.deliver(rendered, baseConfig);
    expect(result.success).toBe(true);
    expect(result.channel).toBe("in_app");
  });
});

// ── LogSink ─────────────────────────────────────────────────────────────

describe("LogSink", () => {
  const sink = new LogSink();

  it("always succeeds", async () => {
    const result = await sink.deliver(rendered, baseConfig);
    expect(result.success).toBe(true);
    expect(result.channel).toBe("log");
  });

  it("uses error level for error notifications", async () => {
    const { logger } = await import("@/lib/logger");
    const errorRendered: RenderedMessage = { ...rendered, level: "error" };
    await sink.deliver(errorRendered, baseConfig);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ── getSink ─────────────────────────────────────────────────────────────

describe("getSink", () => {
  it("returns correct sink by name", () => {
    expect(getSink("webhook").name).toBe("webhook");
    expect(getSink("in_app").name).toBe("in_app");
    expect(getSink("log").name).toBe("log");
  });

  it("falls back to log for unknown name", () => {
    expect(getSink("email").name).toBe("log");
    expect(getSink("").name).toBe("log");
  });
});
