import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startSpan, traceGenAI, traceAgentCall, childContext, createTraceContext } from "../tracer";

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

  it("accepts AAIF 2026 gen_ai.operation.name attribute", () => {
    const span = traceGenAI("gen_ai.generate", {
      "gen_ai.system": "openai",
      "gen_ai.request.model": "gpt-4.1",
      "gen_ai.operation.name": "generate",
      "gen_ai.agent.id": "agent-abc123",
    });
    expect(span.attributes["gen_ai.operation.name"]).toBe("generate");
    expect(span.attributes["gen_ai.agent.id"]).toBe("agent-abc123");
  });
});

// Task 3.3 — AAIF 2026 multi-hop agent tracing tests
describe("traceAgentCall", () => {
  it("creates a client-kind span named gen_ai.agent_call", () => {
    const span = traceAgentCall({
      "gen_ai.operation.name": "agent_call",
      "gen_ai.agent.id": "callee-agent-id",
      "gen_ai.agent.name": "Research Agent",
      "gen_ai.caller.agent.id": "orchestrator-id",
      "gen_ai.caller.agent.name": "Orchestrator",
      "agent_call.depth": 1,
      "agent_call.input_length": 42,
      "agent_call.timeout_seconds": 60,
    });
    expect(span.name).toBe("gen_ai.agent_call");
    expect(span.kind).toBe("client");
    expect(span.attributes["gen_ai.agent.id"]).toBe("callee-agent-id");
    expect(span.attributes["gen_ai.agent.name"]).toBe("Research Agent");
    expect(span.attributes["gen_ai.operation.name"]).toBe("agent_call");
  });

  it("sets caller agent attributes correctly", () => {
    const span = traceAgentCall({
      "gen_ai.operation.name": "agent_call",
      "gen_ai.agent.id": "callee-id",
      "gen_ai.agent.name": "TDD Guide",
      "gen_ai.caller.agent.id": "planner-id",
      "gen_ai.caller.agent.name": "Strategic Planner",
      "agent_call.depth": 2,
      "agent_call.input_length": 100,
      "agent_call.timeout_seconds": 90,
    });
    expect(span.attributes["gen_ai.caller.agent.id"]).toBe("planner-id");
    expect(span.attributes["gen_ai.caller.agent.name"]).toBe("Strategic Planner");
    expect(span.attributes["agent_call.depth"]).toBe(2);
    expect(span.attributes["agent_call.timeout_seconds"]).toBe(90);
  });

  it("propagates parent traceId when parentContext is supplied", () => {
    const parentCtx = createTraceContext();
    const span = traceAgentCall(
      {
        "gen_ai.operation.name": "agent_call",
        "gen_ai.agent.id": "callee",
        "gen_ai.agent.name": "Sub Agent",
        "gen_ai.caller.agent.id": "orchestrator",
        "agent_call.depth": 1,
        "agent_call.input_length": 10,
        "agent_call.timeout_seconds": 30,
      },
      childContext(parentCtx)
    );
    // Same root traceId → appears as a single trace in Grafana
    expect(span.traceContext.traceId).toBe(parentCtx.traceId);
    expect(span.traceContext.parentSpanId).not.toBeUndefined();
  });

  it("creates an independent trace when no parentContext is supplied", () => {
    const span = traceAgentCall({
      "gen_ai.operation.name": "agent_call",
      "gen_ai.agent.id": "standalone-callee",
      "gen_ai.agent.name": "Standalone Agent",
      "gen_ai.caller.agent.id": "root",
      "agent_call.depth": 0,
      "agent_call.input_length": 5,
      "agent_call.timeout_seconds": 120,
    });
    expect(span.traceContext.traceId).toHaveLength(32);
    expect(span.traceContext.parentSpanId).toBeUndefined();
  });
});

describe("childContext", () => {
  it("inherits traceId from parent and assigns a new spanId", () => {
    const parent = createTraceContext();
    const child = childContext(parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.spanId).toHaveLength(16);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it("produces distinct spanIds for multiple children of the same parent", () => {
    const parent = createTraceContext();
    const child1 = childContext(parent);
    const child2 = childContext(parent);
    expect(child1.spanId).not.toBe(child2.spanId);
    // Both share the root traceId
    expect(child1.traceId).toBe(parent.traceId);
    expect(child2.traceId).toBe(parent.traceId);
  });

  it("nested chain — grandchild shares root traceId", () => {
    const root = createTraceContext();
    const child = childContext(root);
    const grandchild = childContext(child);
    expect(grandchild.traceId).toBe(root.traceId);
    expect(grandchild.parentSpanId).toBe(child.spanId);
  });
});
