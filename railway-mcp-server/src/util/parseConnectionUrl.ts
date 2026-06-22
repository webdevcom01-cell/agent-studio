/**
 * Parse a database connection URL into safe, non-secret components.
 *
 * CRITICAL: the returned object never contains the password. We deliberately
 * do not even copy it onto the result, so it cannot leak downstream.
 */

export interface ParsedConnection {
  /** URL scheme, e.g. "postgresql" or "postgres" or "redis". */
  scheme: string;
  /** Host name, e.g. "containers-us-west-1.railway.app". */
  host: string;
  /** Port as a string, or null if not present. */
  port: string | null;
  /** Database name (path without the leading slash), or null. */
  database: string | null;
  /** Username if present, or null. */
  username: string | null;
  /** Whether a password was present in the URL (boolean only — value is discarded). */
  hasPassword: boolean;
  /** Convenience host:port/db string, password-free. */
  hostPortDb: string;
}

/**
 * Returns parsed components, or null if the value is not a parseable URL.
 * Never throws on bad input.
 */
export function parseConnectionUrl(value: string): ParsedConnection | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // URL keeps a trailing ":" on protocol, e.g. "postgresql:".
  const scheme = url.protocol.replace(/:$/, "");
  const host = url.hostname;
  if (!host) return null;
  const port = url.port ? url.port : null;
  const database = url.pathname && url.pathname !== "/"
    ? decodeURIComponent(url.pathname.replace(/^\//, ""))
    : null;
  const username = url.username ? decodeURIComponent(url.username) : null;
  const hasPassword = url.password.length > 0;

  const hostPort = port ? `${host}:${port}` : host;
  const hostPortDb = database ? `${hostPort}/${database}` : hostPort;

  return { scheme, host, port, database, username, hasPassword, hostPortDb };
}

/** Heuristic: is this variable value a Postgres connection URL? */
export function isPostgresUrl(value: string): boolean {
  const parsed = parseConnectionUrl(value);
  if (!parsed) return false;
  return parsed.scheme === "postgres" || parsed.scheme === "postgresql";
}
