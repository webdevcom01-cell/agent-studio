import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  mCPServer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
// In-memory rate limiter would return 429 after 10 POSTs across this file
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));
// F4-4: SSRF guard resolves hostnames — keep tests hermetic (public IP)
const mockDnsLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup: mockDnsLookup }));

import { GET, POST } from "../route";

const SESSION = { user: { id: "u1", email: "test@test.com" } };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/mcp-servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

describe("GET /api/mcp-servers", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of servers for authenticated user", async () => {
    const servers = [
      { id: "s1", name: "Server 1", url: "https://mcp.example.com/mcp", _count: { agents: 2 } },
    ];
    mockPrisma.mCPServer.findMany.mockResolvedValue(servers);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(servers);
    expect(mockPrisma.mCPServer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
  });
});

describe("POST /api/mcp-servers", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ name: "Test", url: "https://mcp.example.com/mcp" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makeRequest({ name: "" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("returns 400 for invalid URL", async () => {
    const res = await POST(makeRequest({ name: "Test", url: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("creates server with valid data", async () => {
    const created = { id: "s1", name: "Test", url: "https://mcp.example.com/mcp", transport: "STREAMABLE_HTTP" };
    mockPrisma.mCPServer.create.mockResolvedValue(created);

    const res = await POST(makeRequest({ name: "Test", url: "https://mcp.example.com/mcp" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(created);
    expect(mockPrisma.mCPServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Test",
        url: "https://mcp.example.com/mcp",
        transport: "STREAMABLE_HTTP",
        userId: "u1",
      }),
    });
  });

  it("accepts SSE transport", async () => {
    mockPrisma.mCPServer.create.mockResolvedValue({ id: "s1" });

    await POST(makeRequest({ name: "SSE Server", url: "https://mcp.example.com/sse", transport: "SSE" }));

    expect(mockPrisma.mCPServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transport: "SSE" }),
    });
  });

  it("rejects invalid transport value with 400", async () => {
    const res = await POST(makeRequest({ name: "Test", url: "https://mcp.example.com/mcp", transport: "WEBSOCKET" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("rejects name exceeding 100 characters with 400", async () => {
    const res = await POST(makeRequest({ name: "a".repeat(101), url: "https://mcp.example.com/mcp" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("rejects URL exceeding 2000 characters with 400", async () => {
    const longUrl = "http://localhost/" + "a".repeat(2000);
    const res = await POST(makeRequest({ name: "Test", url: longUrl }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("rejects missing name with 400", async () => {
    const res = await POST(makeRequest({ url: "https://mcp.example.com/mcp" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("rejects missing url with 400", async () => {
    const res = await POST(makeRequest({ name: "Test" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ─── F4-1: headers se enkriptuju pre upisa, plaintext se ne vraća ────────────

describe("F4-1: MCPServer.headers encryption at rest", () => {
  const PLAIN = { Authorization: "Bearer plain-secret-xyz" };

  beforeEach(async () => {
    const { randomBytes } = await import("crypto");
    vi.stubEnv("OAUTH_ENCRYPTION_KEY", randomBytes(32).toString("base64url"));
  });

  it("POST: prisma.create ne sme dobiti plaintext token (enkriptovan envelope)", async () => {
    mockPrisma.mCPServer.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({ id: "s1", ...args.data }),
    );

    const res = await POST(
      makeRequest({ name: "Enc Test", url: "https://enc.example/mcp", headers: PLAIN }),
    );
    expect(res.status).toBe(201);

    const data = mockPrisma.mCPServer.create.mock.calls[0][0].data as {
      headers: unknown;
    };
    expect(JSON.stringify(data.headers)).not.toContain("plain-secret-xyz");
    expect((data.headers as { __enc?: string }).__enc).toBeTypeOf("string");
  });

  it("POST: odgovor ne sme sadržati plaintext token", async () => {
    mockPrisma.mCPServer.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({ id: "s1", ...args.data }),
    );

    const res = await POST(
      makeRequest({ name: "Enc Test 2", url: "https://enc2.example/mcp", headers: PLAIN }),
    );
    expect(res.status).toBe(201);
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("plain-secret-xyz");
    expect(raw).not.toContain("__enc");
  });
});

// ─── F4-4: SSRF guard na registraciji ────────────────────────────────────────

describe("F4-4: SSRF guard on MCPServer.url", () => {
  beforeEach(() => {
    mockPrisma.mCPServer.create.mockResolvedValue({ id: "s1" });
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:8000/mcp",
    "http://10.0.0.5/mcp",
    "http://192.168.1.1/mcp",
    "http://[::1]:9000/mcp",
  ])("POST odbija privatni/metadata URL sa 400: %s", async (url) => {
    const res = await POST(makeRequest({ name: "SSRF", url, headers: undefined }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mCPServer.create).not.toHaveBeenCalled();
  });

  it("POST dozvoljava *.railway.internal (ECC allowlist)", async () => {
    const res = await POST(
      makeRequest({ name: "ECC", url: "http://positive-inspiration.railway.internal:8000" }),
    );
    expect(res.status).toBe(201);
  });

  it("POST odbija hostname koji se rezolvuje u privatnu adresu", async () => {
    mockDnsLookup.mockResolvedValue([{ address: "10.0.0.9", family: 4 }]);
    const res = await POST(makeRequest({ name: "Rebind", url: "https://rebind.example.com/mcp" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.mCPServer.create).not.toHaveBeenCalled();
  });
});
