import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FlowHookRegistry,
  WebhookHookSink,
  createHooksFromFlowContent,
  emitHook,
} from "../hooks";
import type { FlowHookPayload, RuntimeContext } from "../types";
import type { FlowContent } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<RuntimeContext>): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function makePayload(overrides?: Partial<FlowHookPayload>): FlowHookPayload {
  return {
    event: "onFlowStart",
    agentId: "agent-1",
    conversationId: "conv-1",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FlowHookRegistry
// ---------------------------------------------------------------------------

describe("FlowHookRegistry", () => {
  it("emits to all registered sinks", () => {
    const sink1 = { send: vi.fn() };
    const sink2 = { send: vi.fn() };
    const registry = new FlowHookRegistry();
    registry.addSink(sink1);
    registry.addSink(sink2);

    const payload = makePayload();
    registry.emit(payload);

    expect(sink1.send).toHaveBeenCalledWith(payload);
    expect(sink2.send).toHaveBeenCalledWith(payload);
  });

  it("filters events when allowedEvents is set", () => {
    const sink = { send: vi.fn() };
    const registry = new FlowHookRegistry(["onFlowStart", "onFlowComplete"]);
    registry.addSink(sink);

    registry.emit(makePayload({ event: "onFlowStart" }));
    registry.emit(makePayload({ event: "beforeNodeExecute" }));
    registry.emit(makePayload({ event: "onFlowComplete" }));

    expect(sink.send).toHaveBeenCalledTimes(2);
    expect(sink.send).toHaveBeenCalledWith(
      expect.objectContaining({ event: "onFlowStart" })
    );
    expect(sink.send).toHaveBeenCalledWith(
      expect.objectContaining({ event: "onFlowComplete" })
    );
  });

  it("passes all events when allowedEvents is empty", () => {
    const sink = { send: vi.fn() };
    const registry = new FlowHookRegistry([]);
    registry.addSink(sink);

    registry.emit(makePayload({ event: "onFlowStart" }));
    registry.emit(makePayload({ event: "beforeNodeExecute" }));

    expect(sink.send).toHaveBeenCalledTimes(2);
  });

  it("catches and logs sink errors without throwing", () => {
    const badSink = {
      send: vi.fn(() => {
        throw new Error("sink exploded");
      }),
    };
    const goodSink = { send: vi.fn() };
    const registry = new FlowHookRegistry();
    registry.addSink(badSink);
    registry.addSink(goodSink);

    // Should not throw
    expect(() => registry.emit(makePayload())).not.toThrow();
    // Good sink still called
    expect(goodSink.send).toHaveBeenCalledTimes(1);
  });

  it("works with no sinks registered", () => {
    const registry = new FlowHookRegistry();
    expect(() => registry.emit(makePayload())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// WebhookHookSink
// ---------------------------------------------------------------------------

describe("WebhookHookSink", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("sends POST to all configured URLs", () => {
    const sink = new WebhookHookSink([
      "https://example.com/hook1",
      "https://example.com/hook2",
    ]);
    const payload = makePayload();
    sink.send(payload);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/hook1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Hook-Event": payload.event,
        }),
      })
    );
  });

  it("filters empty URL strings", () => {
    const sink = new WebhookHookSink(["https://example.com/hook", "", ""]);
    sink.send(makePayload());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw when fetch rejects", async () => {
    fetchSpy.mockRejectedValue(new Error("network error"));
    const sink = new WebhookHookSink(["https://example.com/hook"]);
    // Should not throw
    expect(() => sink.send(makePayload())).not.toThrow();
  });

  it("sends nothing when no URLs configured", () => {
    const sink = new WebhookHookSink([]);
    sink.send(makePayload());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createHooksFromFlowContent
// ---------------------------------------------------------------------------

describe("createHooksFromFlowContent", () => {
  it("returns null when no hookWebhookUrls configured", () => {
    const content: FlowContent = { nodes: [], edges: [], variables: [] };
    expect(createHooksFromFlowContent(content)).toBeNull();
  });

  it("returns null when hookWebhookUrls is empty array", () => {
    const content: FlowContent = {
      nodes: [],
      edges: [],
      variables: [],
      hookWebhookUrls: [],
    };
    expect(createHooksFromFlowContent(content)).toBeNull();
  });

  it("creates registry when URLs are configured", () => {
    const content: FlowContent = {
      nodes: [],
      edges: [],
      variables: [],
      hookWebhookUrls: ["https://example.com/hook"],
    };
    const registry = createHooksFromFlowContent(content);
    expect(registry).not.toBeNull();
    expect(registry).toBeInstanceOf(FlowHookRegistry);
  });

  it("passes hookEvents as event filter", () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);

    const content: FlowContent = {
      nodes: [],
      edges: [],
      variables: [],
      hookWebhookUrls: ["https://example.com/hook"],
      hookEvents: ["onFlowStart"],
    };
    const registry = createHooksFromFlowContent(content)!;

    // onFlowStart should go through
    registry.emit(makePayload({ event: "onFlowStart" }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // beforeNodeExecute should be filtered out
    registry.emit(makePayload({ event: "beforeNodeExecute" }));
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1
  });
});

// ---------------------------------------------------------------------------
// emitHook convenience function
// ---------------------------------------------------------------------------

describe("emitHook", () => {
  it("is a no-op when hooks is undefined", () => {
    const context = makeContext();
    // Should not throw
    expect(() => emitHook(context, "onFlowStart")).not.toThrow();
  });

  it("calls hooks.emit with correct payload shape", () => {
    const emitFn = vi.fn();
    const context = makeContext({
      hooks: { emit: emitFn },
    });

    emitHook(context, "beforeNodeExecute", {
      nodeId: "node-1",
      nodeType: "ai_response",
    });

    expect(emitFn).toHaveBeenCalledTimes(1);
    const payload = emitFn.mock.calls[0][0] as FlowHookPayload;
    expect(payload.event).toBe("beforeNodeExecute");
    expect(payload.agentId).toBe("agent-1");
    expect(payload.conversationId).toBe("conv-1");
    expect(payload.nodeId).toBe("node-1");
    expect(payload.nodeType).toBe("ai_response");
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  it("merges extra fields into payload", () => {
    const emitFn = vi.fn();
    const context = makeContext({ hooks: { emit: emitFn } });

    emitHook(context, "afterToolCall", {
      toolName: "web_search",
      toolCallId: "tc-1",
      durationMs: 123,
      error: "timeout",
    });

    const payload = emitFn.mock.calls[0][0] as FlowHookPayload;
    expect(payload.toolName).toBe("web_search");
    expect(payload.toolCallId).toBe("tc-1");
    expect(payload.durationMs).toBe(123);
    expect(payload.error).toBe("timeout");
  });

  it("catches and does not throw when hooks.emit throws", () => {
    const context = makeContext({
      hooks: {
        emit: () => {
          throw new Error("hooks exploded");
        },
      },
    });

    expect(() =>
      emitHook(context, "onFlowError", { error: "some error" })
    ).not.toThrow();
  });
});
