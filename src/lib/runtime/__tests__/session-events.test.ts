import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  emitSessionEvent,
  getSessionNotificationConfig,
  formatSessionMessage,
  ALL_SESSION_EVENT_TYPES,
} from "../session-events";
import type { RuntimeContext, FlowHookRegistryInterface } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── ALL_SESSION_EVENT_TYPES ─────────────────────────────────────────────

describe("ALL_SESSION_EVENT_TYPES", () => {
  it("contains 7 event types", () => {
    expect(ALL_SESSION_EVENT_TYPES).toHaveLength(7);
  });

  it("includes all expected events", () => {
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.started");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.finished");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.failed");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.timeout");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.blocked");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.verification_passed");
    expect(ALL_SESSION_EVENT_TYPES).toContain("session.verification_failed");
  });
});

// ── emitSessionEvent ────────────────────────────────────────────────────

describe("emitSessionEvent", () => {
  it("emits through hook registry when available", () => {
    const emitFn = vi.fn();
    const hooks: FlowHookRegistryInterface = { emit: emitFn };
    const ctx = makeContext({ hooks });

    emitSessionEvent(ctx, "session.started");

    expect(emitFn).toHaveBeenCalledTimes(1);
    const payload = emitFn.mock.calls[0][0];
    expect(payload.meta.sessionEvent).toBe("session.started");
    expect(payload.agentId).toBe("agent-1");
  });

  it("works without hook registry", () => {
    const ctx = makeContext();
    // Should not throw
    expect(() => emitSessionEvent(ctx, "session.finished")).not.toThrow();
  });

  it("includes extra fields in hook payload", () => {
    const emitFn = vi.fn();
    const hooks: FlowHookRegistryInterface = { emit: emitFn };
    const ctx = makeContext({ hooks });

    emitSessionEvent(ctx, "session.failed", {
      durationMs: 1234,
      iterations: 5,
      error: "Something broke",
    });

    const meta = emitFn.mock.calls[0][0].meta;
    expect(meta.durationMs).toBe(1234);
    expect(meta.iterations).toBe(5);
    expect(meta.error).toBe("Something broke");
  });

  it("never throws even if hook emit throws", () => {
    const hooks: FlowHookRegistryInterface = {
      emit: () => { throw new Error("hook crash"); },
    };
    const ctx = makeContext({ hooks });

    expect(() => emitSessionEvent(ctx, "session.started")).not.toThrow();
  });
});

// ── getSessionNotificationConfig ────────────────────────────────────────

describe("getSessionNotificationConfig", () => {
  it("returns null when no config", () => {
    const ctx = makeContext();
    expect(getSessionNotificationConfig(ctx)).toBeNull();
  });

  it("returns null when events array is empty", () => {
    const ctx = makeContext({
      flowContent: {
        nodes: [],
        edges: [],
        variables: [],
        sessionNotifications: { events: [], channel: "log" },
      } as RuntimeContext["flowContent"],
    });
    expect(getSessionNotificationConfig(ctx)).toBeNull();
  });

  it("parses valid config", () => {
    const ctx = makeContext({
      flowContent: {
        nodes: [],
        edges: [],
        variables: [],
        sessionNotifications: {
          events: ["session.started", "session.failed"],
          channel: "webhook",
          webhookUrl: "https://example.com/hook",
          format: "discord",
        },
      } as RuntimeContext["flowContent"],
    });

    const config = getSessionNotificationConfig(ctx);
    expect(config).not.toBeNull();
    expect(config!.events).toEqual(["session.started", "session.failed"]);
    expect(config!.channel).toBe("webhook");
    expect(config!.webhookUrl).toBe("https://example.com/hook");
    expect(config!.format).toBe("discord");
  });

  it("filters out invalid event types", () => {
    const ctx = makeContext({
      flowContent: {
        nodes: [],
        edges: [],
        variables: [],
        sessionNotifications: {
          events: ["session.started", "invalid.event"],
          channel: "log",
        },
      } as RuntimeContext["flowContent"],
    });

    const config = getSessionNotificationConfig(ctx);
    expect(config!.events).toEqual(["session.started"]);
  });

  it("returns null for invalid channel", () => {
    const ctx = makeContext({
      flowContent: {
        nodes: [],
        edges: [],
        variables: [],
        sessionNotifications: {
          events: ["session.started"],
          channel: "telegram",
        },
      } as RuntimeContext["flowContent"],
    });

    expect(getSessionNotificationConfig(ctx)).toBeNull();
  });
});

// ── formatSessionMessage ────────────────────────────────────────────────

describe("formatSessionMessage", () => {
  const basePayload = {
    event: "session.finished" as const,
    agentId: "agent-123456789",
    conversationId: "conv-1",
    timestamp: Date.now(),
    durationMs: 2500,
    iterations: 10,
  };

  it("formats plain text", () => {
    const result = formatSessionMessage(basePayload, "plain");
    expect(result.text).toContain("Session Finished");
    expect(result.text).toContain("2.5s");
    expect(result.body.event).toBe("session.finished");
    expect(result.body.durationMs).toBe(2500);
  });

  it("formats discord embed", () => {
    const result = formatSessionMessage(basePayload, "discord");
    expect(result.body.embeds).toBeDefined();
    const embed = (result.body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.color).toBe(0x2ecc71); // green for finished
    expect(embed.fields).toBeDefined();
  });

  it("formats slack blocks", () => {
    const result = formatSessionMessage(basePayload, "slack");
    expect(result.body.blocks).toBeDefined();
    const blocks = result.body.blocks as Array<Record<string, unknown>>;
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(blocks[0].type).toBe("header");
  });

  it("includes error in failed event", () => {
    const failPayload = {
      ...basePayload,
      event: "session.failed" as const,
      error: "Node handler crash",
    };
    const result = formatSessionMessage(failPayload, "plain");
    expect(result.text).toContain("Node handler crash");
    expect(result.body.error).toBe("Node handler crash");
  });

  it("discord uses red color for failed events", () => {
    const failPayload = {
      ...basePayload,
      event: "session.failed" as const,
      error: "crash",
    };
    const result = formatSessionMessage(failPayload, "discord");
    const embed = (result.body.embeds as Array<Record<string, unknown>>)[0];
    expect(embed.color).toBe(0xe74c3c);
  });
});
