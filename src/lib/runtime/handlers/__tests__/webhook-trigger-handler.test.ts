import { describe, it, expect, vi, beforeEach } from "vitest";
import { webhookTriggerHandler } from "../webhook-trigger-handler";
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
    id: "webhook-node-1",
    type: "webhook_trigger",
    position: { x: 0, y: 0 },
    data: {
      label: "Webhook Trigger",
      outputVariable: "webhook_payload",
      eventTypeVariable: "",
      ...overrides,
    },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    agentId: "agent-test",
    conversationId: "conv-test",
    variables: {
      __webhook_payload: { action: "opened", repo: "agent-studio" },
      __webhook_event_type: "push",
      __webhook_id: "msg_01jtest123",
      ...variables,
    },
    messageHistory: [],
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: null,
    isNewConversation: false,
  };
}

describe("webhookTriggerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("happy path", () => {
    it("returns no messages and does not wait for input", async () => {
      const result = await webhookTriggerHandler(makeNode(), makeContext());
      expect(result.messages).toHaveLength(0);
      expect(result.waitForInput).toBe(false);
    });

    it("stores __webhook_payload into the output variable", async () => {
      const payload = { action: "opened", repo: "agent-studio" };
      const result = await webhookTriggerHandler(
        makeNode({ outputVariable: "my_payload" }),
        makeContext({ __webhook_payload: payload }),
      );
      expect(result.updatedVariables?.my_payload).toEqual(payload);
    });

    it("defaults outputVariable to webhook_payload", async () => {
      const result = await webhookTriggerHandler(makeNode(), makeContext());
      expect(result.updatedVariables?.webhook_payload).toBeDefined();
    });

    it("sets __webhook_received_at as a valid ISO timestamp", async () => {
      const result = await webhookTriggerHandler(makeNode(), makeContext());
      const receivedAt = result.updatedVariables?.__webhook_received_at as string;
      expect(receivedAt).toBeDefined();
      expect(new Date(receivedAt).toISOString()).toBe(receivedAt);
    });

    it("does not set eventTypeVariable when not configured", async () => {
      const result = await webhookTriggerHandler(
        makeNode({ eventTypeVariable: "" }),
        makeContext(),
      );
      // eventTypeVariable is empty string — no key should be set for it
      expect("" in (result.updatedVariables ?? {})).toBe(false);
    });

    it("stores event type into eventTypeVariable when configured", async () => {
      const result = await webhookTriggerHandler(
        makeNode({ eventTypeVariable: "github_event" }),
        makeContext({ __webhook_event_type: "pull_request" }),
      );
      expect(result.updatedVariables?.github_event).toBe("pull_request");
    });
  });

  describe("missing ambient variables", () => {
    it("handles missing __webhook_payload gracefully (null)", async () => {
      const result = await webhookTriggerHandler(
        makeNode(),
        makeContext({ __webhook_payload: undefined }),
      );
      expect(result.updatedVariables?.webhook_payload).toBeNull();
    });

    it("handles missing __webhook_event_type (null stored, no crash)", async () => {
      const result = await webhookTriggerHandler(
        makeNode({ eventTypeVariable: "evt" }),
        makeContext({ __webhook_event_type: undefined }),
      );
      expect(result.updatedVariables?.evt).toBeNull();
    });
  });

  describe("non-JSON payload", () => {
    it("handles string payload (non-JSON body) stored as __raw", async () => {
      const rawPayload = { __raw: "plain text webhook event" };
      const result = await webhookTriggerHandler(
        makeNode(),
        makeContext({ __webhook_payload: rawPayload }),
      );
      expect((result.updatedVariables?.webhook_payload as Record<string, unknown>).__raw)
        .toBe("plain text webhook event");
    });
  });

  describe("passthrough behavior", () => {
    it("returns nextNodeId as null (entry point — no input handle)", async () => {
      const result = await webhookTriggerHandler(makeNode(), makeContext());
      expect(result.nextNodeId).toBeNull();
    });

    it("does not modify other existing context variables", async () => {
      const result = await webhookTriggerHandler(
        makeNode({ outputVariable: "my_payload" }),
        makeContext(),
      );
      const keys = Object.keys(result.updatedVariables ?? {});
      // Should only set: my_payload + __webhook_received_at
      expect(keys).toContain("my_payload");
      expect(keys).toContain("__webhook_received_at");
      expect(keys).not.toContain("__webhook_event_type"); // no eventTypeVariable set
    });
  });
});
