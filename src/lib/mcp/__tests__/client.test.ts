import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockTools = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    search: { description: "Search" },
    fetch: { description: "Fetch" },
  }),
);
const mockCreateMCPClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ tools: mockTools, close: mockClose }),
);
const mockGetOrCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ tools: mockTools, close: mockClose }),
);
const mockRemove = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockPrisma = vi.hoisted(() => ({
  agentMCPServer: { findMany: vi.fn() },
  mCPServer: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: mockCreateMCPClient,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("../pool", () => ({
  getOrCreate: mockGetOrCreate,
  remove: mockRemove,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getMCPToolsForAgent, testMCPConnection, refreshToolsCache } from "../client";

function makeMCPServerRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "s1",
    name: "Server 1",
    url: "http://localhost:3000/mcp",
    transport: "STREAMABLE_HTTP",
    headers: null,
    toolsCache: null,
    enabled: true,
    userId: "u1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAgentMCPServer(
  serverOverrides: Record<string, unknown> = {},
  linkOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "as1",
    agentId: "agent-1",
    mcpServerId: "s1",
    enabledTools: null,
    mcpServer: makeMCPServerRecord(serverOverrides),
    ...linkOverrides,
  };
}

describe("getMCPToolsForAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTools.mockResolvedValue({
      search: { description: "Search" },
      fetch: { description: "Fetch" },
    });
  });

  it("returns empty object when agent has no MCP servers", async () => {
    mockPrisma.agentMCPServer.findMany.mockResolvedValue([]);

    const tools = await getMCPToolsForAgent("agent-1");
    expect(tools).toEqual({});
  });

  it("skips disabled servers", async () => {
    mockPrisma.agentMCPServer.findMany.mockResolvedValue([
      makeAgentMCPServer({ enabled: false }),
    ]);

    const tools = await getMCPToolsForAgent("agent-1");
    expect(tools).toEqual({});
    expect(mockGetOrCreate).not.toHaveBeenCalled();
  });

  it("returns all tools when enabledTools is null", async () => {
    mockPrisma.agentMCPServer.findMany.mockResolvedValue([
      makeAgentMCPServer(),
    ]);

    const tools = await getMCPToolsForAgent("agent-1");
    expect(tools).toEqual({
      search: { description: "Search" },
      fetch: { description: "Fetch" },
    });
  });

  it("filters tools when enabledTools is specified", async () => {
    mockPrisma.agentMCPServer.findMany.mockResolvedValue([
      makeAgentMCPServer({}, { enabledTools: ["search"] }),
    ]);

    const tools = await getMCPToolsForAgent("agent-1");
    expect(tools).toEqual({ search: { description: "Search" } });
    expect(tools).not.toHaveProperty("fetch");
  });

  it("handles connection failures gracefully", async () => {
    mockGetOrCreate.mockRejectedValueOnce(new Error("Connection refused"));
    mockPrisma.agentMCPServer.findMany.mockResolvedValue([
      makeAgentMCPServer(),
    ]);

    const tools = await getMCPToolsForAgent("agent-1");
    expect(tools).toEqual({});
  });
});

describe("testMCPConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTools.mockResolvedValue({
      search: { description: "Search" },
      fetch: { description: "Fetch" },
    });
  });

  it("returns success with tool names on valid connection", async () => {
    const result = await testMCPConnection("http://localhost:3000/mcp", "STREAMABLE_HTTP");

    expect(result.success).toBe(true);
    expect(result.tools).toEqual(["search", "fetch"]);
    expect(result.error).toBeUndefined();
    expect(mockClose).toHaveBeenCalled();
  });

  it("returns failure on connection error", async () => {
    mockCreateMCPClient.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await testMCPConnection("http://bad-host:3000/mcp", "SSE");

    expect(result.success).toBe(false);
    expect(result.tools).toEqual([]);
    expect(result.error).toBe("ECONNREFUSED");
  });

  it("passes headers to transport config", async () => {
    const headers = { Authorization: "Bearer test-token" };
    await testMCPConnection("http://localhost:3000/mcp", "SSE", headers);

    expect(mockCreateMCPClient).toHaveBeenCalledWith({
      transport: {
        type: "sse",
        url: "http://localhost:3000/mcp",
        headers,
      },
    });
  });

  it("always closes client even on tools() failure", async () => {
    const clientCloseMock = vi.fn().mockResolvedValue(undefined);
    mockCreateMCPClient.mockResolvedValueOnce({
      tools: vi.fn().mockRejectedValue(new Error("tools failed")),
      close: clientCloseMock,
    });

    const result = await testMCPConnection("http://localhost:3000/mcp", "STREAMABLE_HTTP");

    expect(result.success).toBe(false);
    expect(result.error).toBe("tools failed");
    expect(clientCloseMock).toHaveBeenCalled();
  });
});

describe("refreshToolsCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTools.mockResolvedValue({
      search: { description: "Search" },
      fetch: { description: "Fetch" },
    });
  });

  it("updates toolsCache in database", async () => {
    mockPrisma.mCPServer.findUniqueOrThrow.mockResolvedValue(
      makeMCPServerRecord(),
    );
    mockPrisma.mCPServer.update.mockResolvedValue({});

    const tools = await refreshToolsCache("s1");

    expect(tools).toEqual(["search", "fetch"]);
    expect(mockPrisma.mCPServer.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { toolsCache: ["search", "fetch"] },
    });
  });

  it("throws on connection failure", async () => {
    mockPrisma.mCPServer.findUniqueOrThrow.mockResolvedValue(
      makeMCPServerRecord({ url: "http://bad-host:3000/mcp", transport: "SSE" }),
    );
    mockCreateMCPClient.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(refreshToolsCache("s1")).rejects.toThrow("ECONNREFUSED");
  });
});
