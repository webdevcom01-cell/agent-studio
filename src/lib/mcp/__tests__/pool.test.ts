import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockClose = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockTools = vi.hoisted(() => vi.fn().mockResolvedValue({ tool_a: {} }));
const mockCreateMCPClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ tools: mockTools, close: mockClose }),
);

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: mockCreateMCPClient,
}));

import { getOrCreate, remove, getPoolSize, clearPool } from "../pool";

describe("MCP connection pool", () => {
  beforeEach(() => {
    clearPool();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearPool();
  });

  it("creates a new client on first call", async () => {
    const client = await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");
    expect(client).toBeDefined();
    expect(getPoolSize()).toBe(1);
  });

  it("reuses existing client on subsequent calls", async () => {
    const first = await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");
    const second = await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");

    expect(first).toBe(second);
    expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
    expect(getPoolSize()).toBe(1);
  });

  it("creates separate clients for different server IDs", async () => {
    await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");
    await getOrCreate("s2", "http://localhost:3001/mcp", "SSE");

    expect(getPoolSize()).toBe(2);
  });

  it("removes a client from the pool", async () => {
    await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");
    expect(getPoolSize()).toBe(1);

    await remove("s1");
    expect(getPoolSize()).toBe(0);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("remove is a no-op for unknown server IDs", async () => {
    await remove("unknown");
    expect(getPoolSize()).toBe(0);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("clearPool closes all clients", async () => {
    await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");
    await getOrCreate("s2", "http://localhost:3001/mcp", "SSE");
    expect(getPoolSize()).toBe(2);

    clearPool();
    expect(getPoolSize()).toBe(0);
    expect(mockClose).toHaveBeenCalledTimes(2);
  });

  it("passes SSE transport type correctly", async () => {
    await getOrCreate("s1", "http://localhost:3000/sse", "SSE", { Authorization: "Bearer tok" });

    expect(mockCreateMCPClient).toHaveBeenCalledWith({
      transport: {
        type: "sse",
        url: "http://localhost:3000/sse",
        headers: { Authorization: "Bearer tok" },
      },
    });
  });

  it("passes HTTP transport type correctly", async () => {
    await getOrCreate("s1", "http://localhost:3000/mcp", "STREAMABLE_HTTP");

    expect(mockCreateMCPClient).toHaveBeenCalledWith({
      transport: {
        type: "http",
        url: "http://localhost:3000/mcp",
      },
    });
  });
});
