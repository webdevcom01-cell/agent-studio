import * as net from "net";
import { logger } from "@/lib/logger";

// Blocked IP ranges as [lo, hi] inclusive, 32-bit unsigned integers
const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
  [ipToLong("0.0.0.0"), ipToLong("0.255.255.255")],       // 0.0.0.0/8
  [ipToLong("10.0.0.0"), ipToLong("10.255.255.255")],     // 10.0.0.0/8
  [ipToLong("127.0.0.0"), ipToLong("127.255.255.255")],   // 127.0.0.0/8
  [ipToLong("169.254.0.0"), ipToLong("169.254.255.255")], // 169.254.0.0/16 — link-local / metadata
  [ipToLong("172.16.0.0"), ipToLong("172.31.255.255")],   // 172.16.0.0/12
  [ipToLong("192.168.0.0"), ipToLong("192.168.255.255")], // 192.168.0.0/16
];

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(hostname: string): boolean {
  if (!net.isIPv4(hostname)) return false;
  const long = ipToLong(hostname);
  return BLOCKED_IPV4_RANGES.some(([lo, hi]) => long >= lo && long <= hi);
}

function isBlockedIPv6Mapped(hostname: string): boolean {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  const mapped = bare.match(/^::ffff:(.+)$/i);
  if (!mapped) return false;

  const candidate = mapped[1];
  if (net.isIPv4(candidate)) return isBlockedIPv4(candidate);

  // hex short form: ::ffff:0a00:0001 → 10.0.0.1
  const hex = candidate.replace(":", "");
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    const n = parseInt(hex, 16);
    const dotted = [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ].join(".");
    return isBlockedIPv4(dotted);
  }

  return false;
}

/**
 * Extracts the raw hostname from a URL string WITHOUT going through WHATWG
 * normalization. The WHATWG URL parser normalises hex (0x7f000001), octal
 * (0177.0.0.1), and pure-decimal (2130706433) hostnames to dotted-decimal,
 * which would make them indistinguishable from a literal "127.0.0.1".
 * We need the raw form so the allowlist check only matches exact strings.
 */
function getRawHostname(url: string): string {
  // Capture everything in the authority section (after scheme://)
  const match = url.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/([^/?#]*)/);
  if (!match) return "";

  let host = match[1];
  // Strip userinfo (user:pass@)
  const atIdx = host.lastIndexOf("@");
  if (atIdx >= 0) host = host.slice(atIdx + 1);

  // IPv6 literal: keep brackets, strip port after "]"
  if (host.startsWith("[")) {
    const bracketEnd = host.indexOf("]");
    return bracketEnd >= 0 ? host.slice(0, bracketEnd + 1) : host;
  }

  // Strip port
  const colonIdx = host.lastIndexOf(":");
  return colonIdx >= 0 ? host.slice(0, colonIdx) : host;
}

function resolveAllowedHostnames(): Set<string> {
  const allowed = new Set<string>(["localhost", "127.0.0.1", "[::1]"]);

  for (const envVar of ["NEXTAUTH_URL", "NEXT_PUBLIC_APP_URL"]) {
    const raw = process.env[envVar];
    if (!raw) continue;
    try {
      const { hostname } = new URL(raw);
      if (hostname) allowed.add(hostname);
    } catch {
      // malformed env var — fail-safe: skip
    }
  }

  return allowed;
}

/**
 * Validates that baseUrl is safe for server-side fetch.
 *
 * Strategy:
 *   1. Scheme must be http: or https:
 *   2. Allowlist check uses the RAW hostname (before WHATWG normalization) so
 *      encoded forms of 127.0.0.1 (hex, octal, decimal) are not confused with
 *      the literal "127.0.0.1" which we explicitly permit for local dev.
 *   3. Blocked-range check uses the WHATWG-normalized hostname, which catches
 *      all encoded variants that normalize to a private IP.
 *
 * TODO: DNS rebinding (a hostname that resolves to a blocked IP at request time)
 * is not addressed — residual risk for authenticated attackers controlling DNS.
 *
 * @throws Error with prefix SSRF_BLOCKED when the url is not allowed
 */
export function validateEvalBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    const msg = `SSRF_BLOCKED: '${baseUrl}' is not a valid URL`;
    logger.error("ssrf_blocked", { baseUrl, reason: "invalid_url" });
    throw new Error(msg);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    const msg = `SSRF_BLOCKED: scheme '${parsed.protocol}' is not allowed`;
    logger.error("ssrf_blocked", { baseUrl, reason: "disallowed_scheme" });
    throw new Error(msg);
  }

  // Allowlist: check the RAW (pre-normalization) hostname only.
  // This ensures "0x7f000001" never matches the "127.0.0.1" allowlist entry.
  const rawHostname = getRawHostname(baseUrl);
  const allowedHostnames = resolveAllowedHostnames();

  if (allowedHostnames.has(rawHostname)) return;

  // Blocked ranges: check the WHATWG-normalized hostname.
  // Encoded forms (hex, octal, decimal) are normalized to dotted-decimal here.
  const normalizedHostname = parsed.hostname;

  if (isBlockedIPv4(normalizedHostname)) {
    const msg = `SSRF_BLOCKED: '${baseUrl}' resolves to a blocked IP range`;
    logger.error("ssrf_blocked", { baseUrl, normalizedHostname, reason: "blocked_ipv4" });
    throw new Error(msg);
  }

  if (isBlockedIPv6Mapped(normalizedHostname)) {
    const msg = `SSRF_BLOCKED: '${baseUrl}' contains an IPv6-mapped blocked address`;
    logger.error("ssrf_blocked", { baseUrl, normalizedHostname, reason: "blocked_ipv6_mapped" });
    throw new Error(msg);
  }

  // Hostname not in allowlist and not a recognized blocked IP — reject.
  const msg = `SSRF_BLOCKED: host '${rawHostname}' is not in the allowed list`;
  logger.error("ssrf_blocked", { baseUrl, rawHostname, reason: "not_in_allowlist" });
  throw new Error(msg);
}
