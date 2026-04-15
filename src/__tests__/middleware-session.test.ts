import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/security-headers", () => ({
  applySecurityHeaders: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: vi.fn().mockResolvedValue(null),
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
    it("allows access with authjs.session-token cookie", async () => {
      const req = makeRequest("/", { "authjs.session-token": "jwt-value" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with __Secure-authjs.session-token cookie", async () => {
      const req = makeRequest("/", { "__Secure-authjs.session-token": "jwt-value" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });
  });

  describe("fallback cookie detection", () => {
    it("allows access with next-auth.session-token (v4 style)", async () => {
      const req = makeRequest("/", { "next-auth.session-token": "jwt-value" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with __Secure-next-auth.session-token", async () => {
      const req = makeRequest("/", { "__Secure-next-auth.session-token": "jwt-value" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });

    it("allows access with hypothetical future session_token name", async () => {
      const req = makeRequest("/", { "authjs.session_token": "jwt-value" });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });
  });

  describe("no session cookie", () => {
    it("redirects to login when no session cookie present", async () => {
      const req = makeRequest("/");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("redirects with callbackUrl", async () => {
      const req = makeRequest("/builder/agent-123");
      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("callbackUrl=%2Fbuilder%2Fagent-123");
    });

    it("does not redirect for unrelated cookies", async () => {
      const req = makeRequest("/", { "theme": "dark", "lang": "en" });
      const res = await middleware(req);
      expect(res.status).toBe(307);
    });
  });

  describe("public paths bypass session check", () => {
    it("allows /login without session", async () => {
      const req = makeRequest("/login");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /api/health without session", async () => {
      const req = makeRequest("/api/health");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /embed/agent-id without session", async () => {
      const req = makeRequest("/embed/agent-123");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows /api/cron/* without session", async () => {
      const req = makeRequest("/api/cron/trigger-scheduled-flows");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it("allows webhook trigger without session", async () => {
      const req = makeRequest("/api/agents/agent-123/trigger/webhook-456");
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });
});
