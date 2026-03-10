import { describe, it, expect, vi, beforeEach } from "vitest";
import { webhookHandler } from "../webhook-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/utils/url-validation", () => ({
  validateExternalUrlWithDNS: vi.fn().mockResolvedValue({ valid: true }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "wh-1",
    type: "webhook",
    position: { x: 0, y: 0 },
    data: { label: "Webhook", url: "https://hooks.example.com/notify", method: "POST", outputVariable: "wh_result", ...overrides },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "wh-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("webhookHandler", () => {
  it("makes POST request and stores JSON response with status", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ received: true })),
    });
    const result = await webhookHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.wh_result).toEqual({ received: true });
    expect(result.updatedVariables?.wh_result_status).toBe(200);
    expect(result.messages).toHaveLength(0);
  });

  it("stores raw text when response is not JSON", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: () => Promise.resolve("OK"),
    });
    const result = await webhookHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.wh_result).toBe("OK");
  });

  it("returns empty result when URL is empty", async () => {
    const result = await webhookHandler(makeNode({ url: "" }), makeContext());
    expect(result.messages).toHaveLength(0);
    expect(result.nextNodeId).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resolves template variables in URL", async () => {
    mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve("ok") });
    await webhookHandler(
      makeNode({ url: "https://hooks.example.com/{{channel}}" }),
      makeContext({ channel: "alerts" }),
    );
    expect(mockFetch).toHaveBeenCalledWith("https://hooks.example.com/alerts", expect.any(Object));
  });

  it("includes body for POST with template resolution", async () => {
    mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve("ok") });
    await webhookHandler(
      makeNode({ body: '{"msg":"{{message}}"}' }),
      makeContext({ message: "hello" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: '{"msg":"hello"}' }),
    );
  });

  it("stores error info on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));
    const result = await webhookHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.wh_result).toBeNull();
    expect(result.updatedVariables?.wh_result_error).toContain("Connection refused");
    expect(result.messages).toHaveLength(0);
  });

  it("blocks private IPs via URL validation", async () => {
    const { validateExternalUrlWithDNS } = await import("@/lib/utils/url-validation");
    vi.mocked(validateExternalUrlWithDNS).mockResolvedValueOnce({ valid: false, error: "Blocked" });

    const result = await webhookHandler(
      makeNode({ url: "http://10.0.0.1/internal" }),
      makeContext(),
    );
    expect(result.updatedVariables?.wh_result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not set updatedVariables when outputVariable is empty", async () => {
    mockFetch.mockResolvedValue({ status: 200, text: () => Promise.resolve("ok") });
    const result = await webhookHandler(makeNode({ outputVariable: "" }), makeContext());
    expect(result.updatedVariables).toBeUndefined();
  });
});
