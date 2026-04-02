/**
 * Route-level tests for:
 *   GET  /api/api-keys
 *   POST /api/api-keys
 *   PATCH  /api/api-keys/[keyId]
 *   DELETE /api/api-keys/[keyId]
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  apiKey: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
}));
const mockGenerateApiKey = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    key: "as_live_testkey123456789012345678901234567",
    keyHash: "abc123hash",
    keyPrefix: "as_live_tes",
  }),
);
const mockWriteAuditLog = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockValidateApiKey = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api/api-key", () => ({
  generateApiKey: mockGenerateApiKey,
  hashApiKey: (k: string) => `hash_${k}`,
  validateApiKey: mockValidateApiKey,
  API_KEY_SCOPES: [
    "agents:read",
    "agents:write",
    "agents:delete",
    "flows:read",
    "flows:execute",
    "kb:read",
    "kb:write",
    "evals:read",
    "evals:run",
    "webhooks:read",
    "admin",
  ],
}));
vi.mock("@/lib/security/audit", () => ({ writeAuditLog: mockWriteAuditLog }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(
  url: string,
  method: string,
  body?: Record<string, unknown>,
): NextRequest {
  const opts: RequestInit & { headers?: Record<string, string> } = { method };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), opts);
}

const AUTHENTICATED_SESSION = { user: { id: "user_1" } };

// ── GET /api/api-keys ─────────────────────────────────────────────────────────

describe("GET /api/api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(makeReq("/api/api-keys", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no keys", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findMany.mockResolvedValue([]);

    const { GET } = await import("../route");
    const res = await GET(makeReq("/api/api-keys", "GET"));
    const json = await res.json() as { success: boolean; data: unknown[] };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it("returns list of active keys (no keyHash exposed)", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const mockKeys = [
      {
        id: "key_1",
        keyPrefix: "as_live_tes",
        name: "CI pipeline",
        scopes: ["agents:read"],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date("2026-01-01"),
      },
    ];
    mockPrisma.apiKey.findMany.mockResolvedValue(mockKeys);

    const { GET } = await import("../route");
    const res = await GET(makeReq("/api/api-keys", "GET"));
    const json = await res.json() as { success: boolean; data: typeof mockKeys };

    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].name).toBe("CI pipeline");
    // keyHash must NEVER appear in response
    expect(JSON.stringify(json.data)).not.toContain("keyHash");
  });
});

// ── POST /api/api-keys ────────────────────────────────────────────────────────

describe("POST /api/api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeReq("/api/api-keys", "POST", { name: "test", scopes: ["agents:read"] }));
    expect(res.status).toBe(401);
  });

  it("returns 422 for missing name", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const { POST } = await import("../route");
    const res = await POST(makeReq("/api/api-keys", "POST", { scopes: ["agents:read"] }));
    expect(res.status).toBe(422);
  });

  it("returns 422 for empty scopes array", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const { POST } = await import("../route");
    const res = await POST(makeReq("/api/api-keys", "POST", { name: "Test", scopes: [] }));
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid scope value", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    const { POST } = await import("../route");
    const res = await POST(makeReq("/api/api-keys", "POST", { name: "Test", scopes: ["invalid:scope"] }));
    expect(res.status).toBe(422);
  });

  it("returns 429 when 20-key limit reached", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.count.mockResolvedValue(20);
    const { POST } = await import("../route");
    const res = await POST(
      makeReq("/api/api-keys", "POST", { name: "One too many", scopes: ["agents:read"] }),
    );
    expect(res.status).toBe(429);
  });

  it("creates key successfully and returns raw key ONCE", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.count.mockResolvedValue(3);
    mockPrisma.apiKey.create.mockResolvedValue({
      id: "key_new",
      keyPrefix: "as_live_tes",
      name: "My key",
      scopes: ["agents:read", "flows:execute"],
      expiresAt: null,
      createdAt: new Date(),
    });

    const { POST } = await import("../route");
    const res = await POST(
      makeReq("/api/api-keys", "POST", {
        name: "My key",
        scopes: ["agents:read", "flows:execute"],
      }),
    );
    const json = await res.json() as { success: boolean; data: { key: string; id: string } };

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    // Raw key must be present on creation response
    expect(json.data.key).toBe("as_live_testkey123456789012345678901234567");
    // Audit log should have been called
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", resourceType: "ApiKey" }),
    );
  });

  it("creates key with expiry when expiresInDays is provided", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.count.mockResolvedValue(0);
    mockPrisma.apiKey.create.mockResolvedValue({
      id: "key_exp",
      keyPrefix: "as_live_tes",
      name: "Expiring key",
      scopes: ["agents:read"],
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      createdAt: new Date(),
    });

    const { POST } = await import("../route");
    const res = await POST(
      makeReq("/api/api-keys", "POST", {
        name: "Expiring key",
        scopes: ["agents:read"],
        expiresInDays: 30,
      }),
    );

    expect(res.status).toBe(201);
    // Verify create was called with an expiresAt date
    const createCall = mockPrisma.apiKey.create.mock.calls[0] as [{ data: { expiresAt: Date | null } }][];
    expect(createCall[0].data.expiresAt).not.toBeNull();
  });
});

// ── PATCH /api/api-keys/[keyId] ───────────────────────────────────────────────

describe("PATCH /api/api-keys/[keyId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { PATCH } = await import("../[keyId]/route");
    const res = await PATCH(
      makeReq("/api/api-keys/key_1", "PATCH", { name: "New name" }),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when key not found or not owned", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const { PATCH } = await import("../[keyId]/route");
    const res = await PATCH(
      makeReq("/api/api-keys/key_999", "PATCH", { name: "New name" }),
      { params: Promise.resolve({ keyId: "key_999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("renames key successfully", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key_1", name: "Old", scopes: ["agents:read"] });
    mockPrisma.apiKey.update.mockResolvedValue({
      id: "key_1",
      keyPrefix: "as_live_tes",
      name: "New name",
      scopes: ["agents:read"],
      expiresAt: null,
      updatedAt: new Date(),
    });

    const { PATCH } = await import("../[keyId]/route");
    const res = await PATCH(
      makeReq("/api/api-keys/key_1", "PATCH", { name: "New name" }),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );
    const json = await res.json() as { success: boolean; data: { name: string } };

    expect(res.status).toBe(200);
    expect(json.data.name).toBe("New name");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", resourceType: "ApiKey" }),
    );
  });

  it("updates scopes successfully", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key_1", name: "Key", scopes: ["agents:read"] });
    mockPrisma.apiKey.update.mockResolvedValue({
      id: "key_1",
      keyPrefix: "as_live_tes",
      name: "Key",
      scopes: ["agents:read", "flows:execute"],
      expiresAt: null,
      updatedAt: new Date(),
    });

    const { PATCH } = await import("../[keyId]/route");
    const res = await PATCH(
      makeReq("/api/api-keys/key_1", "PATCH", { scopes: ["agents:read", "flows:execute"] }),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );

    expect(res.status).toBe(200);
  });

  it("returns 422 for invalid scope in update", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key_1", name: "Key", scopes: ["agents:read"] });
    const { PATCH } = await import("../[keyId]/route");
    const res = await PATCH(
      makeReq("/api/api-keys/key_1", "PATCH", { scopes: ["hacker:steal"] }),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );
    expect(res.status).toBe(422);
  });
});

// ── DELETE /api/api-keys/[keyId] ──────────────────────────────────────────────

describe("DELETE /api/api-keys/[keyId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const { DELETE } = await import("../[keyId]/route");
    const res = await DELETE(
      makeReq("/api/api-keys/key_1", "DELETE"),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when key not found", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);
    const { DELETE } = await import("../[keyId]/route");
    const res = await DELETE(
      makeReq("/api/api-keys/key_999", "DELETE"),
      { params: Promise.resolve({ keyId: "key_999" }) },
    );
    expect(res.status).toBe(404);
  });

  it("revokes key with soft delete (sets revokedAt)", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    mockPrisma.apiKey.findFirst.mockResolvedValue({ id: "key_1", name: "CI pipeline", scopes: [] });
    mockPrisma.apiKey.update.mockResolvedValue({ id: "key_1", revokedAt: new Date() });

    const { DELETE } = await import("../[keyId]/route");
    const res = await DELETE(
      makeReq("/api/api-keys/key_1", "DELETE"),
      { params: Promise.resolve({ keyId: "key_1" }) },
    );
    const json = await res.json() as { success: boolean; data: { revoked: boolean } };

    expect(res.status).toBe(200);
    expect(json.data.revoked).toBe(true);
    // Verify soft delete: revokedAt is set, NOT a hard delete
    expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", resourceType: "ApiKey" }),
    );
  });

  it("cannot revoke a key owned by another user", async () => {
    mockAuth.mockResolvedValue(AUTHENTICATED_SESSION);
    // getOwnedKey uses userId filter — returns null for another user's key
    mockPrisma.apiKey.findFirst.mockResolvedValue(null);

    const { DELETE } = await import("../[keyId]/route");
    const res = await DELETE(
      makeReq("/api/api-keys/key_other", "DELETE"),
      { params: Promise.resolve({ keyId: "key_other" }) },
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
  });
});
