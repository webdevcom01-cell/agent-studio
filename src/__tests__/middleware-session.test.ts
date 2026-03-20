import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/security-headers", () => ({
  applySecurityHeaders: vi.fn(),
}));

import { middleware } from "../middleware";
import { NextRequest } from "next/server";

function makeRequest(
  path: string,
  cookies: Record<string, string> = {},
  method = "GET"
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url, { method });
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("middleware — session cookie detection (P2-T2)", () => {
  describe("primary cookie names", () => {
    it("allows access with authjs.session-token cookie", () => {
      const req = makeRequest("/", { "authjs.session-token": "jwt-value" });
      const res = middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with __Secure-authjs.session-token cookie", () => {
      const req = makeRequest("/", { "__Secure-authjs.session-token": "jwt-value" });
      const res = middleware(req);
      expect(res.status).not.toBe(307);
    });
  });

  describe("fallback cookie detection", () => {
    it("allows access with next-auth.session-token (v4 style)", () => {
      const req = makeRequest("/", { "next-auth.session-token": "jwt-value" });
      const res = middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with __Secure-next-auth.session-token", () => {
      const req = makeRequest("/", { "__Secure-next-auth.session-token": "jwt-value" });
      const res = middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with hypothetical future session_token name", () => {
      const req = makeRequest("/", { "authjs.session_token": "jwt-value" });
      const res = middleware(req);
      expect(res.status).not.toBe(307);
    });
  });

  describe("no session cookie", () => {
    it("redirects to login when no session cookie present", () => {
      const req = makeRequest("/");
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects with callbackUrl", () => {
      const req = makeRequest("/builder/agent-123");
      const res = middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("callbackUrl=%2Fbuilder%2Fagent-123");
    });

    it("does not redirect for unrelated cookies", () => {
      const req = makeRequest("/", { "theme": "dark", "lang": "en" });
      const res = middleware(req);
      expect(res.status).toBe(307);
    });
  });

  describe("public paths bypass session check", () => {
    it("allows /login without session", () => {
      const req = makeRequest("/login");
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /api/health without session", () => {
      const req = makeRequest("/api/health");
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /embed/agent-id without session", () => {
      const req = makeRequest("/embed/agent-123");
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /api/cron/* without session", () => {
      const req = makeRequest("/api/cron/trigger-scheduled-flows");
      const res = middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows webhook trigger without session", () => {
      const req = makeRequest("/api/agents/agent-123/trigger/webhook-456");
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });
});
