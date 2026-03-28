import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { logger } from "@/lib/logger";

const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_OUTPUT_VARIABLE = "search_results";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  score: number;
  publishedDate: string | null;
}

/**
 * web_search — Semantic web search via Tavily (primary) or Brave Search (fallback).
 * Returns structured results with relevance scores.
 */
export const webSearchHandler: NodeHandler = async (node, context) => {
  const queryTemplate = (node.data.query as string) ?? "";
  const provider = (node.data.provider as string) ?? "tavily";
  const maxResults = (node.data.maxResults as number) ?? DEFAULT_MAX_RESULTS;
  const searchDepth = (node.data.searchDepth as string) ?? "basic";
  const includeImages = (node.data.includeImages as boolean) ?? false;
  const includeDomains = (node.data.includeDomains as string[]) ?? [];
  const excludeDomains = (node.data.excludeDomains as string[]) ?? [];
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  const query = resolveTemplate(queryTemplate, context.variables);

  if (!query) {
    return {
      messages: [
        { role: "assistant", content: "Web Search node has no query configured." },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const tavilyKey = process.env.TAVILY_API_KEY;
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!tavilyKey && !braveKey) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Web Search: no API key configured. Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: [],
      },
    };
  }

  try {
    let results: SearchResult[];

    if (provider === "brave" && braveKey) {
      results = await searchBrave(query, maxResults, braveKey);
    } else if (tavilyKey) {
      results = await searchTavily(query, {
        maxResults,
        searchDepth,
        includeImages,
        includeDomains,
        excludeDomains,
        apiKey: tavilyKey,
      });
    } else if (braveKey) {
      results = await searchBrave(query, maxResults, braveKey);
    } else {
      results = [];
    }

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: results,
        [`${outputVariable}_count`]: results.length,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn("Web search failed", {
      agentId: context.agentId,
      error: errorMsg,
    });

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: [],
        [`${outputVariable}_count`]: 0,
        [`${outputVariable}_error`]: errorMsg,
      },
    };
  }
};

interface TavilyOptions {
  maxResults: number;
  searchDepth: string;
  includeImages: boolean;
  includeDomains: string[];
  excludeDomains: string[];
  apiKey: string;
}

async function searchTavily(
  query: string,
  options: TavilyOptions,
): Promise<SearchResult[]> {
  const { tavily } = await import("@tavily/core");
  const client = tavily({ apiKey: options.apiKey });

  const response = await client.search(query, {
    maxResults: options.maxResults,
    searchDepth: options.searchDepth as "basic" | "advanced",
    includeImages: options.includeImages,
    includeDomains: options.includeDomains.length > 0 ? options.includeDomains : undefined,
    excludeDomains: options.excludeDomains.length > 0 ? options.excludeDomains : undefined,
  });

  return (response.results ?? []).map((r) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    snippet: r.content ?? "",
    score: r.score ?? 0,
    publishedDate: r.publishedDate ?? null,
  }));
}

async function searchBrave(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Brave Search HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    web?: {
      results?: {
        url?: string;
        title?: string;
        description?: string;
        age?: string;
      }[];
    };
  };

  return (data.web?.results ?? []).map((r, i) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    snippet: r.description ?? "",
    score: 1 - i * (1 / maxResults),
    publishedDate: r.age ?? null,
  }));
}
