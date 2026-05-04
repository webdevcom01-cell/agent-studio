import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallMCPTool = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockSkillPermFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mcp/client", () => ({
  callMCPTool: mockCallMCPTool,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMCPServer: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    agentSkillPermission: {
      findUnique: (...args: unknown[]) => mockSkillPermFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { mcpToolHandler } from "../mcp-tool-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return {
    id: "n1",
    type: "mcp_tool",
    position: { x: 0, y: 0 },
    data,
  };
}

function makeContext(variables: Record<string, unknown> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "n1",
    variables,
    messageHistory: [],
    isNewConversation: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: agent has the MCP server linked with no tool restrictions
  mockFindUnique.mockResolvedValue({ enabledTools: null });
  // Default: no AgentSkillPermission record → backward-compatible allow
  mockSkillPermFindUnique.mockResolvedValue(null);
});

describe("mcpToolHandler", () => {
  it("returns error message when mcpServerId is missing", async () => {
    const result = await mcpToolHandler(
      makeNode({ toolName: "search" }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("not configured");
    expect(result.waitForInput).toBe(false);
  });

  it("returns error message when toolName is missing", async () => {
    const result = await mcpToolHandler(
      makeNode({ mcpServerId: "s1" }),
      makeContext(),
    );

    expect(result.messages[0].content).toContain("not configured");
  });

  it("calls MCP tool with resolved template inputs", async () => {
    mockCallMCPTool.mockResolvedValue({ temperature: 22, unit: "celsius" });

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "get_weather",
        inputMapping: { location: "{{city}}", units: "metric" },
        outputVariable: "weather",
      }),
      makeContext({ city: "Belgrade" }),
    );

    expect(mockCallMCPTool).toHaveBeenCalledWith("s1", "get_weather", {
      location: "Belgrade",
      units: "metric",
    });
    // MCP tool results are silent — stored in variables, not shown to user
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.weather).toBe('{"temperature":22,"unit":"celsius"}');
  });

  it("stores string result directly in output variable", async () => {
    mockCallMCPTool.mockResolvedValue("sunny");

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "forecast",
        inputMapping: {},
        outputVariable: "result",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.result).toBe("sunny");
    // No visible messages — result only in variables
    expect(result.messages).toHaveLength(0);
  });

  it("uses default outputVariable when not specified", async () => {
    mockCallMCPTool.mockResolvedValue("data");

    const result = await mcpToolHandler(
      makeNode({ mcpServerId: "s1", toolName: "fetch" }),
      makeContext(),
    );

    expect(result.updatedVariables?.mcp_result).toBe("data");
  });

  it("handles tool call failure gracefully without throwing", async () => {
    mockCallMCPTool.mockRejectedValue(new Error("Connection refused"));

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "broken_tool",
        inputMapping: {},
        outputVariable: "out",
      }),
      makeContext(),
    );

    // Errors are silent too — stored in output variable for AI to handle
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.out).toContain("[Error:");
    expect(result.updatedVariables?.out).toContain("Connection refused");
    expect(result.waitForInput).toBe(false);
  });

  it("handles tool not found error gracefully", async () => {
    mockCallMCPTool.mockRejectedValue(
      new Error('Tool "nonexistent" not found on server "Test"'),
    );

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "nonexistent",
        inputMapping: {},
        outputVariable: "out",
      }),
      makeContext(),
    );

    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.out).toContain("not found");
  });

  it("resolves nested template variables in input mapping", async () => {
    mockCallMCPTool.mockResolvedValue("ok");

    await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "action",
        inputMapping: { query: "{{user.name}} in {{user.city}}" },
        outputVariable: "out",
      }),
      makeContext({ user: { name: "John", city: "NYC" } }),
    );

    expect(mockCallMCPTool).toHaveBeenCalledWith("s1", "action", {
      query: "John in NYC",
    });
  });

  it("preserves existing variables when adding output", async () => {
    mockCallMCPTool.mockResolvedValue(42);

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "count",
        inputMapping: {},
        outputVariable: "total",
      }),
      makeContext({ existing: "keep" }),
    );

    expect(result.updatedVariables?.existing).toBe("keep");
    expect(result.updatedVariables?.total).toBe("42");
  });

  // ── RBAC enforcement (Phase 0.2) ──────────────────────────────────────

  describe("RBAC enforcement", () => {
    it("blocks when MCP server is not linked to agent", async () => {
      mockFindUnique.mockResolvedValueOnce(null);

      const result = await mcpToolHandler(
        makeNode({
          mcpServerId: "server-1",
          toolName: "search",
          inputMapping: {},
        }),
        makeContext(),
      );

      expect(result.updatedVariables?.mcp_result).toContain("Access denied");
      expect(result.updatedVariables?.mcp_result).toContain("not linked");
      expect(mockCallMCPTool).not.toHaveBeenCalled();
    });

    it("blocks when tool is not in enabledTools list", async () => {
      mockFindUnique.mockResolvedValueOnce({
        enabledTools: ["allowed_tool_1", "allowed_tool_2"],
      });

      const result = await mcpToolHandler(
        makeNode({
          mcpServerId: "server-1",
          toolName: "forbidden_tool",
          inputMapping: {},
        }),
        makeContext(),
      );

      expect(result.updatedVariables?.mcp_result).toContain("Access denied");
      expect(result.updatedVariables?.mcp_result).toContain("forbidden_tool");
      expect(mockCallMCPTool).not.toHaveBeenCalled();
    });

    it("allows when enabledTools is null (all tools permitted)", async () => {
      mockFindUnique.mockResolvedValueOnce({ enabledTools: null });
      mockCallMCPTool.mockResolvedValueOnce("result");

      const result = await mcpToolHandler(
        makeNode({
          mcpServerId: "server-1",
          toolName: "any_tool",
          inputMapping: {},
        }),
        makeContext(),
      );

      expect(mockCallMCPTool).toHaveBeenCalledTimes(1);
      expect(result.updatedVariables?.mcp_result).toBe("result");
    });

    it("allows when tool is in enabledTools list", async () => {
      mockFindUnique.mockResolvedValueOnce({
        enabledTools: ["search", "summarize"],
      });
      mockCallMCPTool.mockResolvedValueOnce("search results");

      const result = await mcpToolHandler(
        makeNode({
          mcpServerId: "server-1",
          toolName: "search",
          inputMapping: {},
        }),
        makeContext(),
      );

      expect(mockCallMCPTool).toHaveBeenCalledTimes(1);
      expect(result.updatedVariables?.mcp_result).toBe("search results");
    });

    it("logs warning when access is denied", async () => {
      const { logger } = await import("@/lib/logger");
      mockFindUnique.mockResolvedValueOnce(null);

      await mcpToolHandler(
        makeNode({
          mcpServerId: "server-1",
          toolName: "tool",
          inputMapping: {},
        }),
        makeContext(),
      );

      expect(logger.warn).toHaveBeenCalledWith(
        "MCP tool access denied",
        expect.objectContaining({
          agentId: "agent-1",
          mcpServerId: "server-1",
          toolName: "tool",
        }),
      );
    });
  });

  // ── AgentSkillPermission check (backward-compatible) ──────────────────────

  describe("AgentSkillPermission check", () => {
    it("allows when no AgentSkillPermission record exists (backward compat)", async () => {
      mockSkillPermFindUnique.mockResolvedValue(null);
      mockCallMCPTool.mockResolvedValue("ok");

      const result = await mcpToolHandler(
        makeNode({ mcpServerId: "server-1", toolName: "search", inputMapping: {} }),
        makeContext(),
      );

      expect(mockCallMCPTool).toHaveBeenCalledTimes(1);
      expect(result.updatedVariables?.mcp_result).toBe("ok");
    });

    it("allows when AgentSkillPermission record grants EXECUTE access", async () => {
      mockSkillPermFindUnique.mockResolvedValue({ accessLevel: "EXECUTE" });
      mockCallMCPTool.mockResolvedValue("ok");

      const result = await mcpToolHandler(
        makeNode({ mcpServerId: "server-1", toolName: "search", inputMapping: {} }),
        makeContext(),
      );

      expect(mockCallMCPTool).toHaveBeenCalledTimes(1);
      expect(result.updatedVariables?.mcp_result).toBe("ok");
    });

    it("blocks and returns Permission denied when record exists but level is below EXECUTE", async () => {
      mockSkillPermFindUnique.mockResolvedValue({ accessLevel: "READ" });

      const result = await mcpToolHandler(
        makeNode({ mcpServerId: "server-1", toolName: "search", inputMapping: {} }),
        makeContext(),
      );

      expect(mockCallMCPTool).not.toHaveBeenCalled();
      expect(result.messages[0].content).toContain("Permission denied");
      expect(result.messages[0].content).toContain("server-1");
      expect(result.waitForInput).toBe(false);
    });
  });
});
