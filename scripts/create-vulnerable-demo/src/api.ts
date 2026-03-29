/**
 * api.ts — INTENTIONALLY VULNERABLE (for DevOps Swarm demo)
 * Vulnerability 1: SSRF — unvalidated URL fetch
 * Vulnerability 2: XSS — unsanitized HTML output
 * CWE-918: Server-Side Request Forgery
 * CWE-79: Cross-Site Scripting
 */

export async function fetchExternalData(url: string) {
  // ❌ VULNERABLE: No URL validation — allows SSRF to internal services
  // e.g. url = "http://169.254.169.254/latest/meta-data/" (AWS metadata)
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

export function renderUserProfile(username: string): string {
  // ❌ VULNERABLE: XSS — user input directly injected into HTML
  // e.g. username = "<script>alert('XSS')</script>"
  return `<div class="profile"><h1>Welcome, ${username}!</h1></div>`;
}

export function processWebhook(req: { body: Record<string, unknown>; headers: Record<string, string> }) {
  // ❌ VULNERABLE: No HMAC verification — anyone can trigger webhooks
  const event = req.body;
  const eventType = req.headers["x-event-type"];
  console.log(`Processing webhook: ${eventType}`, event);
  return { processed: true, event };
}
