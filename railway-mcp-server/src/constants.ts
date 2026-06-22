/**
 * Shared constants for the Railway MCP server.
 *
 * Endpoint verified from Railway docs:
 *   https://docs.railway.com/integrations/api  ("Public API")
 */
export const RAILWAY_GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2";

/** Max characters returned by a tool before we truncate (keeps agent context lean). */
export const CHARACTER_LIMIT = 25000;

/** Request timeout in milliseconds. */
export const REQUEST_TIMEOUT_MS = 30000;

/** Max automatic retries on HTTP 429 (rate limit). */
export const MAX_RETRIES = 3;
