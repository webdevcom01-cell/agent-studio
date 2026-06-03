import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import { handleAuthorize } from "../oauth.js";

const ALLOWED_URI = "https://claude.ai/api/mcp/auth/callback";
const ALLOWED_URI_2 = "https://claude.ai/oauth/callback";

function createTestApp(): express.Application {
  const app = express();
  app.get("/authorize", handleAuthorize);
  return app;
}

describe("/authorize handler", () => {
  let savedAllowlist: string | undefined;

  beforeEach(() => {
    savedAllowlist = process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = ALLOWED_URI;
  });

  afterEach(() => {
    if (savedAllowlist === undefined) {
      delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
    } else {
      process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = savedAllowlist;
    }
  });

  it("redirects 302 with code for valid redirect_uri in allowlist", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent(ALLOWED_URI)}&state=abc123`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain(ALLOWED_URI);
    expect(res.headers["location"]).toContain("code=");
    expect(res.headers["location"]).toContain("state=abc123");
  });

  it("redirects 302 without state when state is omitted", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent(ALLOWED_URI)}`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("code=");
    expect(res.headers["location"]).not.toContain("state=");
  });

  it("accepts multiple allowlist entries — redirects to second allowed URI", async () => {
    process.env.MCP_OAUTH_REDIRECT_ALLOWLIST = `${ALLOWED_URI},${ALLOWED_URI_2}`;
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent(ALLOWED_URI_2)}`);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain(ALLOWED_URI_2);
  });

  it("returns 400 when redirect_uri is array — type confusion ([]= notation)", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri[]=${encodeURIComponent(ALLOWED_URI)}&redirect_uri[]=${encodeURIComponent("https://evil.com")}`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 400 when redirect_uri is object notation — type confusion ([key]= notation)", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri[scheme]=https&redirect_uri[host]=evil.com`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 400 when state is array — type confusion", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent(ALLOWED_URI)}&state[]=a&state[]=b`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 400 when redirect_uri is not in allowlist — open redirect blocked", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent("https://attacker.com/callback")}`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("redirect_uri not allowed");
  });

  it("returns 400 when redirect_uri is not in allowlist — subdomain bypass blocked", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent("https://claude.ai.attacker.com/api/mcp/auth/callback")}`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("redirect_uri not allowed");
  });

  it("returns 400 when redirect_uri is missing", async () => {
    const res = await supertest(createTestApp()).get("/authorize");
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
  });

  it("returns 400 when redirect_uri is not a valid URL", async () => {
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=not-a-url`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("invalid_request");
  });

  it("returns 400 when allowlist env var is not set — strict mode", async () => {
    delete process.env.MCP_OAUTH_REDIRECT_ALLOWLIST;
    const res = await supertest(createTestApp())
      .get(`/authorize?redirect_uri=${encodeURIComponent(ALLOWED_URI)}`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.body.error).toBe("OAuth redirect allowlist not configured");
  });
});
