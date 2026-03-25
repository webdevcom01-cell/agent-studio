import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  mCPServer: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
const mockTestMCPConnection = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/mcp/client", () => ({
  testMCPConnection: mockTestMCPConnection,
}));

import { POST } from "../route";

const SESSION = { user: { id: "u1", email: "test@test.com" } };
const PARAMS = { params: Promise.resolve({ serverId: "s1" }) };

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/mcp-servers/s1/test", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
});

describe("POST /api/mcp-servers/[serverId]/test", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 404 when server not found", async () => {
    mockPrisma.mCPServer.findFirst.mockResolvedValue(null);
    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
  });

  it("returns test result on success and updates toolsCache", async () => {
    const server = {
      id: "s1",
      url: "http://localhost/mcp",
      transport: "STREAMABLE_HTTP",
      headers: null,
    };
    mockPrisma.mCPServer.findFirst.mockResolvedValue(server);
    mockTestMCPConnection.mockResolvedValue({
      success: true,
      tools: ["search", "fetch"],
    });
    mockPrisma.mCPServer.update.mockResolvedValue({});

    const res = await POST(makeRequest(), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.success).toBe(true);
    expect(body.data.tools).toEqual(["search", "fetch"]);
    expect(mockPrisma.mCPServer.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { toolsCache: ["search", "fetch"] },
    });
  });

  it("does not update toolsCache on failure", async () => {
    const server = {
      id: "s1",
      url: "http://localhost/mcp",
      transport: "SSE",
      headers: { Authorization: "Bearer tok" },
    };
    mockPrisma.mCPServer.findFirst.mockResolvedValue(server);
    mockTestMCPConnection.mockResolvedValue({
      success: false,
      tools: [],
      error: "ECONNREFUSED",
    });

    const res = await POST(makeRequest(), PARAMS);
    const body = await res.json();

    expect(body.data.success).toBe(false);
    expect(mockPrisma.mCPServer.update).not.toHaveBeenCalled();
    expect(mockTestMCPConnection).toHaveBeenCalledWith(
      "http://localhost/mcp",
      "SSE",
      { Authorization: "Bearer tok" },
    );
  });
});
