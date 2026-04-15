/**
 * Tests for POST /api/mcp/agent-studio
 * Covers: auth, initialize, tools/list, tools/call, error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/api-key", () => ({
  validateApiKey: vi.fn(),
  hasScope: vi.fn(),
}));

vi.mock("@/lib/mcp/agent-studio-tools", () => ({
  AGENT_STUDIO_TOOLS: [
    {
      name: "list_agents",
      description: "List agents",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  callAgentStudioTool: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { validateApiKey, hasScope } from "@/lib/api/api-key";
import { callAgentStudioTool } from "@/lib/mcp/agent-studio-tools";

const mockValidateApiKey = vi.mocked(validateApiKey);
const mockHasScope = vi.mocked(hasScope);
const mockCallTool = vi.mocked(callAgentStudioTool);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, apiKey = "as_live_validkey"): NextRequest {
  return new NextRequest("http://localhost/api/mcp/agent-studio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

const validAuth = { userId: "user-1", apiKeyId: "key-1", scopes: ["agents:read", "flows:execute", "kb:read"] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/mcp/agent-studio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateApiKey.mockResolvedValue(validAuth);
    mockHasScope.mockReturnValue(true);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns error when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost/api/mcp/agent-studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32001);
  });

  it("returns error when API key is invalid", async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const req = makeRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, "as_live_bad");
    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32001);
    expect(json.error.message).toContain("Invalid or expired");
  });

  // ── initialize ────────────────────────────────────────────────────────────

  it("returns server info on initialize", async () => {
    const req = makeRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.result.serverInfo.name).toBe("agent-studio");
    expect(json.result.protocolVersion).toBe("2024-11-05");
    expect(json.result.capabilities).toEqual({ tools: {} });
  });

  it("handles notifications/initialized without error", async () => {
    const req = makeRequest({ jsonrpc: "2.0", id: null, method: "notifications/initialized" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.error).toBeUndefined();
    expect(json.result).toBeDefined();
  });

  // ── tools/list ────────────────────────────────────────────────────────────

  it("returns tool list on tools/list", async () => {
    const req = makeRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const res = await POST(req);
    const json = await res.json();

    expect(Array.isArray(json.result.tools)).toBe(true);
    expect(json.result.tools[0].name).toBe("list_agents");
  });

  // ── tools/call ────────────────────────────────────────────────────────────

  it("calls the tool and returns result", async () => {
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: '{"agents":[]}' }],
    });

    const req = makeRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_agents", arguments: {} },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(mockCallTool).toHaveBeenCalledWith("list_agents", {}, "user-1");
    expect(json.result.content[0].text).toContain("agents");
  });

  it("returns error when tool name is missing", async () => {
    const req = makeRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { arguments: {} },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32602);
  });

  it("returns error for unknown tool", async () => {
    const req = makeRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "nonexistent_tool", arguments: {} },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32601);
    expect(json.error.message).toContain("Unknown tool");
  });

  it("returns permission error when scope is missing", async () => {
    mockHasScope.mockReturnValue(false);

    const req = makeRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "list_agents", arguments: {} },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("Permission denied");
  });

  // ── Unknown method ────────────────────────────────────────────────────────

  it("returns method not found for unknown methods", async () => {
    const req = makeRequest({ jsonrpc: "2.0", id: 7, method: "unknown/method" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32601);
    expect(json.error.message).toContain("Method not found");
  });

  // ── Parse error ───────────────────────────────────────────────────────────

  it("returns parse error for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/mcp/agent-studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer as_live_validkey",
      },
      body: "not-json",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.error.code).toBe(-32700);
  });
});
