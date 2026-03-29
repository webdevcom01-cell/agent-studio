/**
 * Lightweight JSONPath resolver for webhook body mappings.
 *
 * Supports:
 *   "$.foo.bar"         — standard dot notation with leading $
 *   "foo.bar"           — dot notation without leading $
 *   "commits[0].message" — bracket array index
 *   "$"                 — root object (returns the full input)
 *
 * Does NOT support wildcards (*), recursive descent (..), or filter expressions.
 * Zero external dependencies — keeps the server bundle small.
 *
 * Security:
 *   Paths containing "__proto__", "constructor", or "prototype" segments are
 *   rejected (return undefined) to prevent prototype-pollution attacks.
 */

/** Dangerous property names that could pollute the prototype chain. */
const BLOCKED_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export type JSONPathResult =
  | { found: true; value: unknown }
  | { found: false; reason: string };

/**
 * Resolves a JSONPath expression and returns a typed result distinguishing
 * "not found" from "found but null".
 */
export function resolveJsonPathTyped(obj: unknown, path: string): JSONPathResult {
  if (obj === null || obj === undefined) {
    return { found: false, reason: "root object is null/undefined" };
  }
  if (typeof path !== "string" || path.length === 0) {
    return { found: false, reason: "path is empty" };
  }

  if (path === "$") return { found: true, value: obj };

  const normalised = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (normalised.length === 0) return { found: true, value: obj };

  const parts = normalised.split(/[.[\]]/).filter((p) => p.length > 0);

  for (const part of parts) {
    if (BLOCKED_SEGMENTS.has(part)) {
      return { found: false, reason: `blocked segment: ${part}` };
    }
  }

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return { found: false, reason: `path segment '${part}' hit null/undefined` };
    }
    if (typeof current !== "object") {
      return { found: false, reason: `path segment '${part}' accessed non-object (${typeof current})` };
    }
    const next = (current as Record<string, unknown>)[part];
    if (next === undefined && !(part in (current as Record<string, unknown>))) {
      return { found: false, reason: `key '${part}' does not exist` };
    }
    current = next;
  }

  return { found: true, value: current };
}

/**
 * Resolves a simple JSONPath expression against an object.
 *
 * @param obj   - The object to query (any JSON-serialisable value).
 * @param path  - JSONPath string, e.g. "$.repository.full_name" or "commits[0].message".
 * @returns The resolved value, or `undefined` if the path does not match.
 */
export function resolveJsonPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (typeof path !== "string" || path.length === 0) return undefined;

  // "$."-only root shortcut — return the whole object
  if (path === "$") return obj;

  // Normalise: strip leading "$." or "$"
  const normalised = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;

  if (normalised.length === 0) return obj; // bare "$" after strip

  // Split on "." and "[" / "]", discard empty segments
  const parts = normalised
    .split(/[.[\]]/)
    .filter((p) => p.length > 0);

  // Security: reject any path that contains dangerous property names
  for (const part of parts) {
    if (BLOCKED_SEGMENTS.has(part)) return undefined;
  }

  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
