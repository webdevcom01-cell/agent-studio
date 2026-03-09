import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  agent: {
    findUnique: vi.fn(),
  },
  agentMCPServer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  mCPServer: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET, POST, DELETE } from "../route";

const SESSION = { user: { id: "u1", email: "test@test.com" } };
const PARAMS = { params: Promise.resolve({ agentId: "a1" }) };

function makeRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/agents/a1/mcp", {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockPrisma.agent.findUnique.mockResolvedValue({ userId: "u1" });
});

describe("GET /api/agents/[agentId]/mcp", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns linked MCP servers", async () => {
    const links = [
      { id: "l1", mcpServer: { id: "s1", name: "Server 1", toolsCache: ["search"] } },
    ];
    mockPrisma.agentMCPServer.findMany.mockResolvedValue(links);

    const res = await GET(makeRequest("GET"), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(links);
  });
});

describe("POST /api/agents/[agentId]/mcp", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", { mcpServerId: "s1" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing mcpServerId", async () => {
    const res = await POST(makeRequest("POST", {}), PARAMS);
    expect(res.status).toBe(400);
  });

  it("returns 404 when server not owned by user", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue(null);
    const res = await POST(makeRequest("POST", { mcpServerId: "s1" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("creates link successfully", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    const link = { id: "l1", agentId: "a1", mcpServerId: "s1", mcpServer: { id: "s1", name: "Server" } };
    mockPrisma.agentMCPServer.create.mockResolvedValue(link);

    const res = await POST(makeRequest("POST", { mcpServerId: "s1" }), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual(link);
  });

  it("creates link with enabledTools filter", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    mockPrisma.agentMCPServer.create.mockResolvedValue({ id: "l1" });

    await POST(makeRequest("POST", { mcpServerId: "s1", enabledTools: ["search"] }), PARAMS);

    expect(mockPrisma.agentMCPServer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabledTools: ["search"] }),
      }),
    );
  });

  it("returns 409 on duplicate link", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue({ id: "s1" });
    const prismaError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    mockPrisma.agentMCPServer.create.mockRejectedValue(prismaError);

    const res = await POST(makeRequest("POST", { mcpServerId: "s1" }), PARAMS);
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/agents/[agentId]/mcp", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE", { mcpServerId: "s1" }), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 404 when link not found", async () => {
    mockPrisma.agentMCPServer.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeRequest("DELETE", { mcpServerId: "s1" }), PARAMS);
    expect(res.status).toBe(404);
  });

  it("deletes link successfully", async () => {
    mockPrisma.agentMCPServer.findUnique.mockResolvedValue({ id: "l1" });
    mockPrisma.agentMCPServer.delete.mockResolvedValue({});

    const res = await DELETE(makeRequest("DELETE", { mcpServerId: "s1" }), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
