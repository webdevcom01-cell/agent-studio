import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallMCPTool = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockMCPServerFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mcp/client", () => ({
  callMCPTool: mockCallMCPTool,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMCPServer: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    mCPServer: { findUnique: (...args: unknown[]) => mockMCPServerFindUnique(...args) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { mcpToolHandler } from "../mcp-tool-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "mcp_tool", position: { x: 0, y: 0 }, data };
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
  mockFindUnique.mockResolvedValue({ enabledTools: null });
  mockMCPServerFindUnique.mockResolvedValue(null);
});

describe("mcpToolHandler — schema enforcement", () => {
  it("proceeds normally when no inputSchema/outputSchema configured (backward compat)", async () => {
    mockCallMCPTool.mockResolvedValue("result");

    const result = await mcpToolHandler(
      makeNode({ mcpServerId: "s1", toolName: "search", outputVariable: "out" }),
      makeContext(),
    );

    expect(result.updatedVariables?.out).toBe("result");
    expect(mockCallMCPTool).toHaveBeenCalledOnce();
  });

  it("rejects call when input args fail native MCP JSON Schema validation", async () => {
    mockMCPServerFindUnique.mockResolvedValue({
      toolsCache: [
        {
          name: "search",
          inputSchema: {
            type: "object",
            required: ["query"],
            properties: { query: { type: "string" } },
          },
        },
      ],
    });

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "search",
        inputMapping: {},
        outputVariable: "out",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.out).toContain("[Error: Input validation failed");
    expect(result.updatedVariables?.out).toContain('"query"');
    expect(mockCallMCPTool).not.toHaveBeenCalled();
  });

  it("passes when args satisfy native JSON Schema", async () => {
    mockMCPServerFindUnique.mockResolvedValue({
      toolsCache: [
        {
          name: "search",
          inputSchema: {
            type: "object",
            required: ["query"],
            properties: { query: { type: "string" } },
          },
        },
      ],
    });
    mockCallMCPTool.mockResolvedValue("ok");

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "search",
        inputMapping: { query: "hello" },
        outputVariable: "out",
      }),
      makeContext(),
    );

    expect(mockCallMCPTool).toHaveBeenCalledOnce();
    expect(result.updatedVariables?.out).toBe("ok");
  });

  it("rejects call when inputSchema named schema validation fails", async () => {
    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "codegen",
        inputMapping: {},
        inputSchema: "CodeGenOutput",
        outputVariable: "out",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.out).toContain("[Error:");
    expect(result.updatedVariables?.out).toContain("CodeGenOutput");
    expect(mockCallMCPTool).not.toHaveBeenCalled();
  });

  it("rejects output when outputSchema validation fails", async () => {
    mockCallMCPTool.mockResolvedValue({ bad: "shape" });

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "codegen",
        inputMapping: {},
        outputSchema: "PRGateOutput",
        outputVariable: "out",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.out).toContain("[Error: Output validation failed");
    expect(result.updatedVariables?.out).toContain("PRGateOutput");
  });

  it("passes output when it matches the outputSchema", async () => {
    const validPRGate = {
      decision: "APPROVE",
      compositeScore: 90,
      securityScore: 95,
      qualityScore: 85,
      issues: [],
      summary: "Looks good",
    };
    mockCallMCPTool.mockResolvedValue(validPRGate);

    const result = await mcpToolHandler(
      makeNode({
        mcpServerId: "s1",
        toolName: "pr-gate",
        inputMapping: {},
        outputSchema: "PRGateOutput",
        outputVariable: "gateResult",
      }),
      makeContext(),
    );

    expect(result.updatedVariables?.gateResult).toContain("APPROVE");
  });

  it("continues when native schema fetch throws (non-fatal)", async () => {
    mockMCPServerFindUnique.mockRejectedValue(new Error("DB error"));
    mockCallMCPTool.mockResolvedValue("result");

    const result = await mcpToolHandler(
      makeNode({ mcpServerId: "s1", toolName: "search", outputVariable: "out" }),
      makeContext(),
    );

    expect(result.updatedVariables?.out).toBe("result");
  });
});
