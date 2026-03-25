import { describe, it, expect, vi, beforeEach } from "vitest";
import { webFetchHandler } from "../web-fetch-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/utils/url-validation", () => ({
  validateExternalUrl: vi.fn((url: string) => {
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      return { valid: false, error: "Blocked destination" };
    }
    return { valid: true };
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "web_fetch", position: { x: 0, y: 0 }, data };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

describe("webFetchHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error message when URL is empty", async () => {
    const node = makeNode({ url: "" });
    const result = await webFetchHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no URL configured");
  });

  it("fetches via Jina Reader by default", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("# Hello World\n\nSome content here."),
    });

    const node = makeNode({ url: "https://example.com", provider: "jina" });
    const result = await webFetchHandler(node, makeContext());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.com",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "text/markdown" }),
      }),
    );
    expect(result.updatedVariables?.web_content).toBe("# Hello World\n\nSome content here.");
  });

  it("fetches raw HTML and extracts text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("<html><body><p>Hello World</p></body></html>"),
      headers: new Headers({ "content-type": "text/html" }),
    });

    const node = makeNode({ url: "https://example.com", provider: "raw" });
    const result = await webFetchHandler(node, makeContext());

    expect(result.updatedVariables?.web_content).toContain("Hello World");
  });

  it("resolves template variables in URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("Content from resolved URL"),
    });

    const node = makeNode({ url: "https://{{domain}}/page", provider: "jina" });
    const result = await webFetchHandler(
      node,
      makeContext({ domain: "example.com" }),
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "https://r.jina.ai/https://example.com/page",
      expect.anything(),
    );
    expect(result.updatedVariables?.web_content).toBe("Content from resolved URL");
  });

  it("truncates content at maxLength", async () => {
    const longContent = "A".repeat(20000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(longContent),
    });

    const node = makeNode({
      url: "https://example.com",
      provider: "jina",
      maxLength: 5000,
    });
    const result = await webFetchHandler(node, makeContext());

    expect((result.updatedVariables?.web_content as string).length).toBe(5000);
  });

  it("returns error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const node = makeNode({ url: "https://example.com", provider: "jina" });
    const result = await webFetchHandler(node, makeContext());

    expect(result.updatedVariables?.web_content).toBe("[Error: Network timeout]");
  });

  it("returns error for blocked URLs", async () => {
    const node = makeNode({ url: "http://localhost:3000/secret" });
    const result = await webFetchHandler(node, makeContext());

    expect(result.updatedVariables?.web_content).toBe("[Error: Blocked destination]");
  });

  it("uses custom output variable name", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("Page content"),
    });

    const node = makeNode({
      url: "https://example.com",
      provider: "jina",
      outputVariable: "page_data",
    });
    const result = await webFetchHandler(node, makeContext());

    expect(result.updatedVariables?.page_data).toBe("Page content");
  });

  it("returns error on HTTP error status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const node = makeNode({ url: "https://example.com", provider: "jina" });
    const result = await webFetchHandler(node, makeContext());

    expect(result.updatedVariables?.web_content).toContain("[Error:");
    expect(result.updatedVariables?.web_content).toContain("404");
  });
});
