import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  mockValidateApiKey,
  mockApiFindUnique,
  mockApiUpdate,
  mockHashApiKey,
} = vi.hoisted(() => ({
  mockValidateApiKey: vi.fn(),
  mockApiFindUnique: vi.fn(),
  mockApiUpdate: vi.fn(),
  mockHashApiKey: vi.fn(),
}));

vi.mock("@/lib/api/api-key", () => ({
  validateApiKey: mockValidateApiKey,
  hashApiKey: mockHashApiKey,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findUnique: mockApiFindUnique,
      update: mockApiUpdate,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "../validate/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/keys/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHashApiKey.mockImplementation((key: string) => `hash_of_${key}`);
});

const makeKeyRecord = (orgId: string | null = "org-1") => ({
  id: "key-1",
  user: {
    orgMemberships: orgId ? [{ organizationId: orgId }] : [],
  },
});

describe("POST /api/keys/validate", () => {
  it("returns { valid: true, userId, organizationId, scopes } for a valid API key", async () => {
    mockValidateApiKey.mockResolvedValue({ userId: "user-1", apiKeyId: "key-1", scopes: ["agents:read"] });
    mockApiFindUnique.mockResolvedValue(makeKeyRecord("org-1"));

    const res = await POST(makeRequest({ apiKey: "as_live_validkey123" }));
    const body = await res.json();

    expect(body.valid).toBe(true);
    expect(body.userId).toBe("user-1");
    expect(body.organizationId).toBe("org-1");
    expect(body.scopes).toContain("agents:read");
  });

  it("returns organizationId=null when user has no org membership", async () => {
    mockValidateApiKey.mockResolvedValue({ userId: "user-1", apiKeyId: "key-1", scopes: [] });
    mockApiFindUnique.mockResolvedValue(makeKeyRecord(null));

    const res = await POST(makeRequest({ apiKey: "as_live_validkey123" }));
    const body = await res.json();

    expect(body.valid).toBe(true);
    expect(body.organizationId).toBeNull();
  });

  it("returns { valid: false } for an expired key", async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const res = await POST(makeRequest({ apiKey: "as_live_expiredkey" }));
    const body = await res.json();

    expect(body.valid).toBe(false);
    expect(body.userId).toBeUndefined();
  });

  it("returns { valid: false } for an unknown key", async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const res = await POST(makeRequest({ apiKey: "as_live_unknownkey" }));
    const body = await res.json();

    expect(body.valid).toBe(false);
  });

  it("returns 400 when apiKey field is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/keys/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json at all {{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("calls validateApiKey with the provided key", async () => {
    mockValidateApiKey.mockResolvedValue(null);

    await POST(makeRequest({ apiKey: "as_live_testkey123" }));

    expect(mockValidateApiKey).toHaveBeenCalledWith("as_live_testkey123");
  });
});
