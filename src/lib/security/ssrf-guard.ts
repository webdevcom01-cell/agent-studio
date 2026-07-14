/**
 * F4-4: SSRF guard for MCPServer.url.
 *
 * User-registered MCP servers are connected to from the backend, so a
 * malicious URL could reach internal services or cloud metadata endpoints.
 * This guard resolves the hostname and checks EVERY resolved IP against a
 * private/metadata blocklist.
 *
 * ALLOWLIST: *.railway.internal is trusted infrastructure — the ECC MCP
 * (ECC_MCP_URL = http://positive-inspiration.railway.internal:8000) is a
 * legitimate MCPServer row connected through this same path (client.ts
 * matches mcpServer.url === ECC_MCP_URL; featured-servers.ts offers it).
 *
 * TOCTOU / DNS-rebinding limitation: resolve-then-check is not airtight —
 * DNS can change between this check and the actual connection. Mitigation
 * today: the guard runs BOTH at write time and at connect time (every
 * connect re-resolves). Full protection (pin the verified IP for the actual
 * socket) is a possible follow-up.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "@/lib/logger";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Hostnames blocked outright (cloud metadata aliases)
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

// Trusted private infrastructure (Railway private networking)
function isAllowlistedInternal(hostname: string): boolean {
  return hostname === "railway.internal" || hostname.endsWith(".railway.internal");
}

function ipv4ToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], //     "this" network
  ["10.0.0.0", 8], //    private
  ["127.0.0.0", 8], //   loopback
  ["169.254.0.0", 16], // link-local + cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.168.0.0", 16], // private
];

function isBlockedIPv4(ip: string): boolean {
  return BLOCKED_V4.some(([base, bits]) => inCidr4(ip, base, bits));
}

function isBlockedIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  // IPv4-mapped — dotted (::ffff:10.0.0.1) or hex (::ffff:a00:1, URL-normalized)
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::1" || ip === "::") return true; //          loopback / unspecified
  if (/^f[cd]/.test(ip)) return true; //                    fc00::/7 unique local (covers fd00:ec2::254)
  if (/^fe[89ab]/.test(ip)) return true; //                 fe80::/10 link-local
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip.replace(/^\[|\]$/g, ""));
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true; // unknown format — fail closed
}

export interface SsrfVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates an MCP server URL against SSRF targets.
 * Resolves the hostname (A + AAAA) and rejects if ANY resolved IP is private,
 * loopback, link-local, or a metadata endpoint. Fail-closed on DNS errors.
 */
export async function validateMcpUrl(rawUrl: string): Promise<SsrfVerdict> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { allowed: false, reason: `Protocol ${url.protocol} is not allowed` };
  }

  const hostname = url.hostname.toLowerCase();

  if (isAllowlistedInternal(hostname)) return { allowed: true };

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { allowed: false, reason: `Host ${hostname} is not allowed` };
  }

  // IP literal — no DNS needed
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    return isBlockedIp(hostname)
      ? { allowed: false, reason: `IP ${hostname} is in a blocked range` }
      : { allowed: true };
  }

  // Hostname — resolve ALL addresses and check each
  try {
    const addrs = await lookup(hostname, { all: true, verbatim: true });
    if (addrs.length === 0) {
      return { allowed: false, reason: `Hostname ${hostname} did not resolve` };
    }
    for (const { address } of addrs) {
      if (isBlockedIp(address)) {
        return {
          allowed: false,
          reason: `Hostname ${hostname} resolves to blocked address ${address}`,
        };
      }
    }
    return { allowed: true };
  } catch (err) {
    // Fail-closed: unresolvable target cannot be verified
    logger.warn("SSRF guard: DNS lookup failed", {
      hostname,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: false, reason: `Hostname ${hostname} could not be resolved` };
  }
}
