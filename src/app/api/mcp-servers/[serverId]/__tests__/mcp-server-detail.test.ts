import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  mCPServer: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET, PATCH, DELETE } from "../route";

const SESSION = { user: { id: "u1", email: "test@test.com" } };
const PARAMS = { params: Promise.resolve({ serverId: "s1" }) };

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/mcp-servers/s1", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
});

describe("GET /api/mcp-servers/[serverId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found or not owned", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns server details", async () => {
    const server = { id: "s1", name: "Test", agents: [] };
    mockPrisma.mCPServer.findFirst.mockResolvedValue(server);

    const res = await GET(makeRequest("GET"), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(server);
  });
});

describe("PATCH /api/mcp-servers/[serverId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { name: "New" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue(null);
    const res = await PATCH(makeRequest("PATCH", { name: "New" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("updates server fields", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.mCPServer.update.mockResolvedValue({ id: "s1", name: "Updated" });

    const res = await PATCH(makeRequest("PATCH", { name: "Updated", enabled: false }), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.mCPServer.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { name: "Updated", enabled: false },
    });
  });

  it("returns 400 for invalid URL", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    const res = await PATCH(makeRequest("PATCH", { url: "bad" }), PARAMS);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/mcp-servers/[serverId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE"), PARAMS);
    expect(res.status).toBe(404);
  });

  it("deletes server", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.mCPServer.delete.mockResolvedValue({});

    const res = await DELETE(makeRequest("DELETE"), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.mCPServer.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });
});
