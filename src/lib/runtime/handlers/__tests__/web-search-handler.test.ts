import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTavilySearch = vi.fn();

vi.mock("@tavily/core", () => ({
  tavily: () => ({
    search: mockTavilySearch,
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { webSearchHandler } from "../web-search-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "search-1",
    type: "web_search",
    position: { x: 0, y: 0 },
    data: {
      query: "latest AI news",
      provider: "tavily",
      maxResults: 5,
      searchDepth: "basic",
      includeImages: false,
      includeDomains: [],
      excludeDomains: [],
      outputVariable: "search_results",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "search-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TAVILY_API_KEY", "tvly-test-key");
  vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
});

describe("webSearchHandler", () => {
  it("returns error when query is empty", async () => {
    const result = await webSearchHandler(
      makeNode({ query: "" }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("no query");
  });

  it("returns structured results from Tavily", async () => {
    mockTavilySearch.mockResolvedValueOnce({
      results: [
        { url: "https://example.com", title: "Example", content: "Snippet", score: 0.95, publishedDate: "2026-03-01" },
        { url: "https://test.com", title: "Test", content: "Another snippet", score: 0.80, publishedDate: null },
      ],
    });

    const result = await webSearchHandler(makeNode(), makeContext());
    const results = result.updatedVariables?.search_results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: "https://example.com",
      title: "Example",
      snippet: "Snippet",
      score: 0.95,
      publishedDate: "2026-03-01",
    });
    expect(result.updatedVariables?.search_results_count).toBe(2);
  });

  it("warns when no API keys are configured", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");

    const result = await webSearchHandler(makeNode(), makeContext());
    expect(result.messages[0].content).toContain("no API key");
    expect(result.updatedVariables?.search_results).toEqual([]);
  });

  it("resolves template variables in query", async () => {
    mockTavilySearch.mockResolvedValueOnce({ results: [] });

    await webSearchHandler(
      makeNode({ query: "{{userQuery}}" }),
      makeContext({ variables: { userQuery: "machine learning" } }),
    );

    expect(mockTavilySearch).toHaveBeenCalledWith(
      "machine learning",
      expect.objectContaining({ maxResults: 5 }),
    );
  });

  it("handles API errors gracefully without crashing", async () => {
    mockTavilySearch.mockRejectedValueOnce(new Error("429 Rate limit exceeded"));

    const result = await webSearchHandler(makeNode(), makeContext());
    expect(result.updatedVariables?.search_results).toEqual([]);
    expect(result.updatedVariables?.search_results_error).toContain("429");
  });
});
