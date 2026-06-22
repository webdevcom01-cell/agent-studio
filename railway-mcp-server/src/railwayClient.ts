/**
 * Minimal GraphQL client for the Railway public API.
 *
 * - Auth: `Authorization: Bearer <token>` (account or workspace token).
 *   Project tokens (Project-Access-Token header) are out of scope here.
 * - Honors HTTP 429 via Retry-After with bounded retries.
 * - Surfaces GraphQL errors as thrown Error with a clear message.
 */
import {
  RAILWAY_GRAPHQL_ENDPOINT,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
} from "./constants.js";

export class RailwayError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RailwayError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function getToken(): string {
  const token = process.env.RAILWAY_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new RailwayError(
      "RAILWAY_TOKEN environment variable is not set. Create a token at " +
        "https://railway.com/account/tokens and export RAILWAY_TOKEN.",
    );
  }
  return token.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a GraphQL operation. Returns the `data` payload typed as T.
 * Throws RailwayError with an actionable message on failure.
 */
export async function railwayRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = getToken();
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        throw new RailwayError("Request to Railway timed out. Please try again.");
      }
      throw new RailwayError(
        `Network error contacting Railway: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    // Rate limited: respect Retry-After, retry a bounded number of times.
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
      attempt += 1;
      await sleep(retryAfter * 1000);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new RailwayError(
        "Authentication failed (HTTP " +
          res.status +
          "). Check that RAILWAY_TOKEN is valid and has access to this resource.",
        res.status,
      );
    }

    if (!res.ok) {
      const body = await safeText(res);
      throw new RailwayError(
        `Railway API request failed with HTTP ${res.status}. ${body}`.trim(),
        res.status,
      );
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors && json.errors.length > 0) {
      throw new RailwayError(
        "GraphQL error: " + json.errors.map((e) => e.message).join("; "),
      );
    }
    if (json.data === undefined) {
      throw new RailwayError("Railway API returned no data.");
    }
    return json.data;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

// ---- Relay pagination helper ----

interface Edge<N> {
  node: N;
}
interface Connection<N> {
  edges: Edge<N>[];
  pageInfo?: { hasNextPage: boolean; endCursor: string | null };
}

/**
 * Walk all pages of a Relay connection and return a flat array of nodes.
 * `select` extracts the connection from the GraphQL data payload.
 */
export async function paginateAll<N>(
  query: string,
  baseVariables: Record<string, unknown>,
  select: (data: any) => Connection<N>,
  pageSize = 50,
): Promise<N[]> {
  const nodes: N[] = [];
  let after: string | null = null;
  // Hard cap to avoid infinite loops on malformed pageInfo.
  for (let i = 0; i < 1000; i++) {
    const data = await railwayRequest<any>(query, {
      ...baseVariables,
      first: pageSize,
      after,
    });
    const conn = select(data);
    for (const edge of conn.edges) nodes.push(edge.node);
    if (!conn.pageInfo?.hasNextPage || !conn.pageInfo.endCursor) break;
    after = conn.pageInfo.endCursor;
  }
  return nodes;
}
