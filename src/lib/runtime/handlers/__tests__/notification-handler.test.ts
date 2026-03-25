import { describe, it, expect, vi, beforeEach } from "vitest";
import { notificationHandler } from "../notification-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeNode(overrides: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id: "notif-1",
    type: "notification",
    position: { x: 0, y: 0 },
    data: {
      label: "Notification",
      channel: "log",
      title: "Test Alert",
      message: "Something happened",
      level: "info",
      webhookUrl: "",
      outputVariable: "notification_result",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    agentId: "agent-1",
    conversationId: "conv-1",
    variables: {},
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
    ...overrides,
  };
}

describe("notificationHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("log channel", () => {
    it("logs notification and sets output variable", async () => {
      const result = await notificationHandler(makeNode(), makeContext());

      const notifResult = result.updatedVariables?.notification_result as Record<string, unknown>;
      expect(notifResult.success).toBe(true);
      expect(notifResult.channel).toBe("log");
      expect(notifResult.title).toBe("Test Alert");
      expect(notifResult.level).toBe("info");
      expect(result.messages).toHaveLength(0);
    });
  });

  describe("in_app channel", () => {
    it("returns a message for in-app notification", async () => {
      const node = makeNode({ channel: "in_app" });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain("Test Alert");
      expect(result.messages[0].content).toContain("Something happened");

      const notifResult = result.updatedVariables?.notification_result as Record<string, unknown>;
      expect(notifResult.channel).toBe("in_app");
    });

    it("handles title-only in-app notification", async () => {
      const node = makeNode({ channel: "in_app", message: "" });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages[0].content).toContain("Test Alert");
    });
  });

  describe("webhook channel", () => {
    it("sends notification via webhook", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const node = makeNode({
        channel: "webhook",
        webhookUrl: "https://hooks.slack.com/test",
      });
      const result = await notificationHandler(node, makeContext());

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({ method: "POST" })
      );

      const notifResult = result.updatedVariables?.notification_result as Record<string, unknown>;
      expect(notifResult.success).toBe(true);
      expect(notifResult.channel).toBe("webhook");
    });

    it("fails when no webhook URL configured", async () => {
      const node = makeNode({ channel: "webhook", webhookUrl: "" });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages[0].content).toContain("no webhook URL");
    });

    it("handles webhook error response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      }));

      const node = makeNode({
        channel: "webhook",
        webhookUrl: "https://hooks.slack.com/test",
      });
      const result = await notificationHandler(node, makeContext());

      const notifResult = result.updatedVariables?.notification_result as Record<string, unknown>;
      expect(notifResult.success).toBe(false);
      expect(notifResult.status).toBe(403);
    });
  });

  describe("common behavior", () => {
    it("skips when both title and message are empty", async () => {
      const node = makeNode({ title: "", message: "" });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages[0].content).toContain("no title or message");
    });

    it("resolves template variables", async () => {
      const node = makeNode({
        title: "Alert for {{user}}",
        message: "Score: {{score}}",
      });
      const ctx = makeContext({ variables: { user: "Alice", score: "99" } });
      const result = await notificationHandler(node, ctx);

      const notifResult = result.updatedVariables?.notification_result as Record<string, unknown>;
      expect(notifResult.title).toBe("Alert for Alice");
      expect(notifResult.message).toBe("Score: 99");
    });

    it("uses custom output variable", async () => {
      const node = makeNode({ outputVariable: "my_notif" });
      const result = await notificationHandler(node, makeContext());

      expect(result.updatedVariables?.my_notif).toBeDefined();
    });

    it("returns error for unknown channel", async () => {
      const node = makeNode({ channel: "sms" });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages[0].content).toContain('unknown channel "sms"');
    });

    it("handles fetch errors gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

      const node = makeNode({
        channel: "webhook",
        webhookUrl: "https://hooks.slack.com/test",
      });
      const result = await notificationHandler(node, makeContext());

      expect(result.messages[0].content).toContain("could not be sent");
    });
  });
});
