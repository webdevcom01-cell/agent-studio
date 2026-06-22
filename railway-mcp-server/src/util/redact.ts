/**
 * Secret-masking helpers.
 *
 * Hard rule for this server: passwords / credentials must NEVER appear in tool output.
 * These helpers are the single choke point that enforces that.
 */

const REDACTED = "***REDACTED***";

/**
 * Mask the password component of any connection-string-like value.
 *
 * Matches the `user:password@` portion of a URL (e.g. postgres://user:pw@host:5432/db)
 * and replaces the password with a redaction marker, leaving scheme/user/host/db intact.
 *
 * Non-URL strings are returned unchanged.
 */
export function maskUrlPassword(value: string): string {
  if (typeof value !== "string") return value;
  // scheme://user:password@rest  ->  scheme://user:***REDACTED***@rest
  return value.replace(
    /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/?#@\s]+):[^@/?#\s]*@/,
    `$1:${REDACTED}@`,
  );
}

/**
 * Apply password masking across a flat variables map (key -> string value).
 * Only the password inside URL-shaped values is masked; other values pass through
 * so the agent can still read non-secret config.
 */
export function maskVariablesMap(
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = typeof v === "string" ? maskUrlPassword(v) : v;
  }
  return out;
}

export { REDACTED };
