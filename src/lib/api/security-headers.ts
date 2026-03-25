const COMMON_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function applySecurityHeaders(
  response: Response,
  pathname: string
): void {
  for (const [key, value] of Object.entries(COMMON_HEADERS)) {
    response.headers.set(key, value);
  }

  const framePolicy = pathname.startsWith("/embed") ? "SAMEORIGIN" : "DENY";
  response.headers.set("X-Frame-Options", framePolicy);
}
