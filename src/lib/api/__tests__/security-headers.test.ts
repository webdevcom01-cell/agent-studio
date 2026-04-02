import { describe, it, expect } from "vitest";
import { applySecurityHeaders } from "../security-headers";

function makeResponse(): Response {
  return new Response(null, { status: 200 });
}

describe("applySecurityHeaders", () => {
  it("sets X-Content-Type-Options: nosniff", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/api/agents");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-XSS-Protection: 0", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/api/agents");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/api/agents");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy to deny camera, mic, geo", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/api/agents");
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("sets X-Frame-Options: DENY for API routes", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/api/agents");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Frame-Options: DENY for non-embed page routes", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/builder/abc123");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Frame-Options: SAMEORIGIN for embed routes", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/embed/abc123");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("sets X-Frame-Options: SAMEORIGIN for /embed root", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/embed");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  // ── CSP (Phase 3.1) ─────────────────────────────────────────────────────

  it("sets Content-Security-Policy header", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/dashboard");
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });

  it("uses self + unsafe-inline for script-src (no strict-dynamic)", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/dashboard");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("strict-dynamic");
  });

  it("does not set x-csp-nonce header", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/dashboard");
    expect(res.headers.get("x-csp-nonce")).toBeNull();
  });

  it("CSP allows frame-ancestors * for embed pages", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/embed/agent-123");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors *");
  });

  it("CSP restricts frame-ancestors to self for non-embed", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/builder/agent-123");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it("CSP blocks object-src", () => {
    const res = makeResponse();
    applySecurityHeaders(res, "/");
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("object-src 'none'");
  });
});
