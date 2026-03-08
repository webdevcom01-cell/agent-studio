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
});

describe("GET /api/mcp-servers", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns list of servers for authenticated user", async () => {
    const servers = [
      { id: "s1", name: "Server 1", url: "http://localhost/mcp", _count: { agents: 2 } },
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
    const res = await POST(makeRequest({ name: "Test", url: "http://localhost/mcp" }));
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
    const created = { id: "s1", name: "Test", url: "http://localhost/mcp", transport: "STREAMABLE_HTTP" };
    mockPrisma.mCPServer.create.mockResolvedValue(created);

    const res = await POST(makeRequest({ name: "Test", url: "http://localhost/mcp" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(created);
    expect(mockPrisma.mCPServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Test",
        url: "http://localhost/mcp",
        transport: "STREAMABLE_HTTP",
        userId: "u1",
      }),
    });
  });

  it("accepts SSE transport", async () => {
    mockPrisma.mCPServer.create.mockResolvedValue({ id: "s1" });

    await POST(makeRequest({ name: "SSE Server", url: "http://localhost/sse", transport: "SSE" }));

    expect(mockPrisma.mCPServer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transport: "SSE" }),
    });
  });
});
