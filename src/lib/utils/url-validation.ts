import dns from "node:dns/promises";

interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "[::1]",
  "[0:0:0:0:0:0:0:1]",
]);

const PRIVATE_IP_RANGES = [
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
];

const BLOCKED_IPV6_PREFIXES = [
  "::1",
  "fe80:",
  "fc00:",
  "fd00:",
  "::ffff:127.",
  "::ffff:10.",
  "::ffff:192.168.",
  "::ffff:169.254.",
  "::ffff:0.0.0.0",
];

function isPrivateIPv4(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(hostname));
}

function isBlockedIPv6(hostname: string): boolean {
  const bare = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return BLOCKED_IPV6_PREFIXES.some((prefix) => bare.startsWith(prefix));
}

function isBlockedIP(ip: string): boolean {
  return isPrivateIPv4(ip) || isBlockedIPv6(ip);
}

export function validateExternalUrl(url: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only http and https protocols are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, error: "Blocked destination" };
  }

  if (isPrivateIPv4(hostname)) {
    return { valid: false, error: "Blocked destination" };
  }

  if (isBlockedIPv6(hostname)) {
    return { valid: false, error: "Blocked destination" };
  }

  return { valid: true };
}

export async function validateExternalUrlWithDNS(url: string): Promise<UrlValidationResult> {
  const staticCheck = validateExternalUrl(url);
  if (!staticCheck.valid) return staticCheck;

  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  // If hostname is already an IP literal, static check is sufficient
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { valid: true };
  }
  if (hostname.startsWith("[")) {
    return { valid: true };
  }

  // Resolve DNS and check all resolved IPs against private ranges
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      return { valid: false, error: "DNS resolution failed" };
    }

    for (const ip of allAddresses) {
      if (isBlockedIP(ip)) {
        return { valid: false, error: "Blocked destination (DNS resolves to private IP)" };
      }
    }
  } catch {
    return { valid: false, error: "DNS resolution failed" };
  }

  return { valid: true };
}
