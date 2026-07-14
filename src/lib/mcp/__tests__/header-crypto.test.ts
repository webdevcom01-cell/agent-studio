/**
 * F4-1 tests: MCPServer.headers encryption at rest.
 * (a) round-trip encrypt→decrypt = original
 * (b) stored value does NOT contain the plaintext token
 * (c) legacy plaintext rows still readable (graceful fallback)
 * (d) corrupted/undecryptable envelope → undefined, no throw
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  encryptMcpHeaders,
  decryptMcpHeaders,
  isMcpHeadersEncrypted,
} from "../header-crypto";

const HEADERS = { Authorization: "Bearer super-secret-token-123" };

describe("F4-1: MCP headers encryption", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("OAUTH_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
  });

  it("(a) round-trip: encrypt → decrypt returns the original headers", () => {
    const stored = encryptMcpHeaders(HEADERS);
    expect(isMcpHeadersEncrypted(stored)).toBe(true);
    expect(decryptMcpHeaders(stored)).toEqual(HEADERS);
  });

  it("(b) stored value does not contain the plaintext token", () => {
    const stored = encryptMcpHeaders(HEADERS);
    const raw = JSON.stringify(stored);
    expect(raw).not.toContain("super-secret-token-123");
    expect(raw).not.toContain("Bearer");
  });

  it("(c) legacy plaintext row is returned as-is (graceful fallback)", () => {
    expect(decryptMcpHeaders(HEADERS)).toEqual(HEADERS);
    expect(isMcpHeadersEncrypted(HEADERS)).toBe(false);
  });

  it("(c2) null / non-object → undefined", () => {
    expect(decryptMcpHeaders(null)).toBeUndefined();
    expect(decryptMcpHeaders("x")).toBeUndefined();
    expect(decryptMcpHeaders(undefined)).toBeUndefined();
  });

  it("(d) corrupted envelope → undefined, without throw", () => {
    expect(decryptMcpHeaders({ __enc: "garbage-not-decryptable" })).toBeUndefined();
  });

  it("(d2) envelope encrypted with a DIFFERENT key → undefined, without throw", () => {
    const stored = encryptMcpHeaders(HEADERS);
    vi.stubEnv("OAUTH_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
    expect(decryptMcpHeaders(stored)).toBeUndefined();
  });

  it("key not configured → plaintext fallback with warning (create never blocked)", () => {
    vi.stubEnv("OAUTH_ENCRYPTION_KEY", "");
    const stored = encryptMcpHeaders(HEADERS);
    expect(stored).toEqual(HEADERS);
  });
});
