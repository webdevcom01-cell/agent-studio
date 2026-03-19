import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startSpan, traceGenAI, createTraceContext } from "../tracer";

describe("createTraceContext", () => {
  it("generates unique traceId and spanId", () => {
    const ctx = createTraceContext();
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.parentSpanId).toBeUndefined();
  });

  it("includes parentSpanId when provided", () => {
    const ctx = createTraceContext("parent-123");
    expect(ctx.parentSpanId).toBe("parent-123");
  });
});

describe("startSpan", () => {
  it("creates a span with name and default kind", () => {
    const span = startSpan("test-operation");
    expect(span.name).toBe("test-operation");
    expect(span.kind).toBe("internal");
    expect(span.traceContext.traceId).toHaveLength(32);
  });

  it("supports custom attributes", () => {
    const span = startSpan("custom", {
      attributes: { "http.method": "GET", "http.status_code": 200 },
    });
    expect(span.attributes["http.method"]).toBe("GET");
    expect(span.attributes["http.status_code"]).toBe(200);
  });

  it("records events", () => {
    const span = startSpan("with-events");
    span.addEvent({ name: "tool_call", attributes: { tool: "search" } });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe("tool_call");
  });

  it("end() logs the span", async () => {
    const { logger: loggerMock } = vi.mocked(await import("@/lib/logger"));
    const span = startSpan("ending");
    span.end();
    expect(loggerMock.info).toHaveBeenCalledWith("span", expect.objectContaining({
      name: "ending",
      traceId: span.traceContext.traceId,
    }));
  });

  it("inherits traceId from parent context", () => {
    const parent = createTraceContext();
    const child = startSpan("child-op", { parentContext: parent });
    expect(child.traceContext.traceId).toBe(parent.traceId);
    expect(child.traceContext.parentSpanId).toBe(parent.spanId);
  });
});

describe("traceGenAI", () => {
  it("creates a client-kind span with gen_ai attributes", () => {
    const span = traceGenAI("chat-completion", {
      "gen_ai.system": "deepseek",
      "gen_ai.request.model": "deepseek-chat",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 50,
    });
    expect(span.kind).toBe("client");
    expect(span.attributes["gen_ai.system"]).toBe("deepseek");
    expect(span.attributes["gen_ai.request.model"]).toBe("deepseek-chat");
  });
});
