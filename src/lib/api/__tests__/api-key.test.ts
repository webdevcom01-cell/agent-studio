import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  generateApiKey,
  hashApiKey,
  validateApiKey,
  hasScope,
  requiresScope,
  ApiKeyScopeError,
} from "../api-key";

const mockPrisma = vi.mocked(prisma);

// ── generateApiKey ────────────────────────────────────────────────────────────

describe("generateApiKey", () => {
  it("generates key with as_live_ prefix", () => {
    const { key } = generateApiKey();
    expect(key).toMatch(/^as_live_/);
  });

  it("key length is at least 50 chars (prefix + 43 base64url chars)", () => {
    const { key } = generateApiKey();
    expect(key.length).toBeGreaterThanOrEqual(50);
  });

  it("each call produces a unique key", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it("keyPrefix is first 12 chars of raw key", () => {
    const { key, keyPrefix } = generateApiKey();
    expect(keyPrefix).toBe(key.slice(0, 12));
  });

  it("keyHash is hex string of length 64 (SHA-256)", () => {
    const { keyHash } = generateApiKey();
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── hashApiKey ────────────────────────────────────────────────────────────────

describe("hashApiKey", () => {
  it("produces deterministic output", () => {
    expect(hashApiKey("test-key")).toBe(hashApiKey("test-key"));
  });

  it("different inputs produce different hashes", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });

  it("hash is 64 hex chars", () => {
    expect(hashApiKey("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── validateApiKey ────────────────────────────────────────────────────────────

describe("validateApiKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for keys without as_live_ prefix", async () => {
    const result = await validateApiKey("invalid-key");
    expect(result).toBeNull();
    expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when key not found in DB", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue(null);

    const { key } = generateApiKey();
    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });

  it("returns null for revoked key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: ["agents:read"],
      expiresAt: null,
      revokedAt: new Date(),
    } as never);

    const { key } = generateApiKey();
    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });

  it("returns null for expired key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: ["agents:read"],
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    } as never);
    mockPrisma.apiKey.update.mockResolvedValue({} as never);

    const { key } = generateApiKey();
    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });

  it("returns auth result for valid key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: ["agents:read", "flows:execute"],
      expiresAt: null,
      revokedAt: null,
    } as never);
    mockPrisma.apiKey.update.mockResolvedValue({} as never);

    const { key } = generateApiKey();
    const result = await validateApiKey(key);

    expect(result).not.toBeNull();
    expect(result?.userId).toBe("u1");
    expect(result?.apiKeyId).toBe("k1");
    expect(result?.scopes).toEqual(["agents:read", "flows:execute"]);
  });

  it("updates lastUsedAt fire-and-forget on valid key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "k1",
      userId: "u1",
      scopes: [],
      expiresAt: null,
      revokedAt: null,
    } as never);
    mockPrisma.apiKey.update.mockResolvedValue({} as never);

    const { key } = generateApiKey();
    await validateApiKey(key);

    // Fire-and-forget — update is called but we don't await it
    await vi.waitFor(() => {
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "k1" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  it("returns null (not throws) when DB lookup fails", async () => {
    mockPrisma.apiKey.findUnique.mockRejectedValue(new Error("DB error"));

    const { key } = generateApiKey();
    const result = await validateApiKey(key);
    expect(result).toBeNull();
  });
});

// ── hasScope ──────────────────────────────────────────────────────────────────

describe("hasScope", () => {
  it("returns true when exact scope is present", () => {
    expect(hasScope(["agents:read", "flows:execute"], "agents:read")).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(hasScope(["agents:read"], "agents:write")).toBe(false);
  });

  it("admin scope grants everything", () => {
    expect(hasScope(["admin"], "agents:delete")).toBe(true);
    expect(hasScope(["admin"], "evals:run")).toBe(true);
  });

  it("empty scopes returns false", () => {
    expect(hasScope([], "agents:read")).toBe(false);
  });
});

// ── requiresScope ─────────────────────────────────────────────────────────────

describe("requiresScope", () => {
  it("does not throw when scope is present", () => {
    expect(() => requiresScope(["agents:read"], "agents:read")).not.toThrow();
  });

  it("throws ApiKeyScopeError when scope is missing", () => {
    expect(() => requiresScope(["agents:read"], "agents:write")).toThrow(
      ApiKeyScopeError,
    );
  });

  it("ApiKeyScopeError has correct fields", () => {
    try {
      requiresScope(["agents:read"], "flows:execute");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiKeyScopeError);
      const e = err as ApiKeyScopeError;
      expect(e.required).toBe("flows:execute");
      expect(e.granted).toEqual(["agents:read"]);
    }
  });
});
