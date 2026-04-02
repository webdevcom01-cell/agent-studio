const COMMON_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Build a Content-Security-Policy header value.
 *
 * Uses 'self' + 'unsafe-inline' for script-src because Next.js standalone
 * mode injects inline bootstrap scripts without nonce attributes. The previous
 * nonce + 'strict-dynamic' approach silently broke JS loading: 'strict-dynamic'
 * causes CSP Level 3 browsers to IGNORE 'self', so all <script src> tags
 * without a nonce were blocked — rendering the app as a blank "Loading..." page.
 */
function buildCSP(pathname: string): string {
  const isEmbed = pathname.startsWith("/embed");

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
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

  response.headers.set("Content-Security-Policy", buildCSP(pathname));
}

export { buildCSP };
