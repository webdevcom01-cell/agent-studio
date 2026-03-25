import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiCallHandler } from "../api-call-handler";
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
    id: "api-1",
    type: "api_call",
    position: { x: 0, y: 0 },
    data: { label: "API", url: "https://api.example.com/data", method: "GET", outputVariable: "result", ...overrides },
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "api-1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("apiCallHandler", () => {
  it("makes a GET request and stores JSON response", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ name: "test" })),
    });
    const result = await apiCallHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.result).toEqual({ name: "test" });
    expect(result.messages).toHaveLength(0);
  });

  it("stores raw text when response is not valid JSON", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve("plain text response"),
    });
    const result = await apiCallHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.result).toBe("plain text response");
  });

  it("makes a POST request with body", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
    });
    const result = await apiCallHandler(
      makeNode({ method: "POST", body: '{"key":"value"}' }),
      makeContext(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ method: "POST", body: '{"key":"value"}' }),
    );
    expect(result.updatedVariables?.result).toEqual({ ok: true });
  });

  it("does not include body for GET requests even if body is provided", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve("ok"),
    });
    await apiCallHandler(makeNode({ method: "GET", body: "ignored" }), makeContext());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ body: expect.anything() }),
    );
  });

  it("resolves template variables in URL", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve("ok"),
    });
    await apiCallHandler(
      makeNode({ url: "https://api.example.com/{{resource}}" }),
      makeContext({ resource: "users" }),
    );
    expect(mockFetch).toHaveBeenCalledWith("https://api.example.com/users", expect.any(Object));
  });

  it("resolves template variables in headers", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve("ok"),
    });
    await apiCallHandler(
      makeNode({ headers: { Authorization: "Bearer {{token}}" } }),
      makeContext({ token: "abc123" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer abc123" }),
      }),
    );
  });

  it("returns error message on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const result = await apiCallHandler(makeNode(), makeContext());
    expect(result.messages[0].content).toContain("Error making API request");
    expect(result.updatedVariables?.result).toBeNull();
    expect(result.updatedVariables?.result_error).toContain("Network error");
  });

  it("blocks private IPs via URL validation", async () => {
    const { validateExternalUrlWithDNS } = await import("@/lib/utils/url-validation");
    vi.mocked(validateExternalUrlWithDNS).mockResolvedValueOnce({ valid: false, error: "Blocked destination" });

    const result = await apiCallHandler(
      makeNode({ url: "http://127.0.0.1/secret" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("Error making API request");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not set updatedVariables when outputVariable is empty", async () => {
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve("ok"),
    });
    const result = await apiCallHandler(makeNode({ outputVariable: "" }), makeContext());
    expect(result.updatedVariables).toBeUndefined();
  });
});
