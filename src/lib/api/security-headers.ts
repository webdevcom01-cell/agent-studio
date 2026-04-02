import { randomBytes } from "node:crypto";

const COMMON_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Build a Content-Security-Policy header value.
 * Nonce-based script-src for inline Next.js scripts.
 */
function buildCSP(nonce: string, pathname: string): string {
  const isEmbed = pathname.startsWith("/embed");

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://api.openai.com https://api.deepseek.com https://api.anthropic.com https://api.cohere.com https://*.sentry.io wss:`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    isEmbed
      ? `frame-ancestors *`
      : `frame-ancestors 'self'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}

export function applySecurityHeaders(
  response: Response,
  pathname: string,
): void {
  for (const [key, value] of Object.entries(COMMON_HEADERS)) {
    response.headers.set(key, value);
  }

  const framePolicy = pathname.startsWith("/embed") ? "SAMEORIGIN" : "DENY";
  response.headers.set("X-Frame-Options", framePolicy);

  // CSP with nonce for inline scripts
  const nonce = randomBytes(16).toString("base64");
  response.headers.set("Content-Security-Policy", buildCSP(nonce, pathname));
  response.headers.set("x-csp-nonce", nonce);
}

export { buildCSP };
