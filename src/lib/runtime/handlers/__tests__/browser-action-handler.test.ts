import { describe, it, expect, vi, beforeEach } from "vitest";
import { browserActionHandler } from "../browser-action-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/mcp/client", () => ({
  callMCPTool: vi.fn(),
}));

import { callMCPTool } from "@/lib/mcp/client";
const mockCallMCPTool = vi.mocked(callMCPTool);

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "browser_action", position: { x: 0, y: 0 }, data };
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

describe("browserActionHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when mcpServerId is missing", async () => {
    const node = makeNode({ actions: [{ action: "navigate", url: "https://example.com" }] });
    const result = await browserActionHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no MCP server configured");
  });

  it("returns error when actions array is empty", async () => {
    const node = makeNode({ mcpServerId: "server-1", actions: [] });
    const result = await browserActionHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no actions configured");
  });

  it("executes single navigate action", async () => {
    mockCallMCPTool.mockResolvedValueOnce({ success: true });

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [{ action: "navigate", url: "https://example.com" }],
    });
    const result = await browserActionHandler(node, makeContext());

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "browser_navigate",
      { url: "https://example.com" },
    );
    expect(result.updatedVariables?.browser_result).toBeDefined();
  });

  it("executes multi-step sequence in order", async () => {
    const callOrder: string[] = [];
    mockCallMCPTool.mockImplementation(async (_serverId, toolName) => {
      callOrder.push(toolName);
      return { success: true };
    });

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [
        { action: "navigate", url: "https://example.com" },
        { action: "click", selector: "#login" },
        { action: "type", selector: "#email", text: "test@test.com" },
        { action: "snapshot" },
      ],
    });
    const result = await browserActionHandler(node, makeContext());

    expect(callOrder).toEqual([
      "browser_navigate",
      "browser_click",
      "browser_type",
      "browser_snapshot",
    ]);
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.browser_result).toBeDefined();
    expect(result.updatedVariables?.browser_result_all).toBeDefined();
  });

  it("resolves template variables in URLs and text", async () => {
    mockCallMCPTool.mockResolvedValue({ success: true });

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [
        { action: "navigate", url: "https://{{site}}/login" },
        { action: "type", selector: "#email", text: "{{user_email}}" },
      ],
    });
    const result = await browserActionHandler(
      node,
      makeContext({ site: "example.com", user_email: "user@test.com" }),
    );

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "browser_navigate",
      { url: "https://example.com/login" },
    );
    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "browser_type",
      { ref: "#email", text: "user@test.com" },
    );
    expect(result.updatedVariables).toBeDefined();
  });

  it("handles MCP tool call failure gracefully", async () => {
    mockCallMCPTool.mockRejectedValueOnce(new Error("Connection refused"));

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [{ action: "navigate", url: "https://example.com" }],
    });
    const result = await browserActionHandler(node, makeContext());

    expect(result.updatedVariables?.browser_result).toBe("[Error: Connection refused]");
  });

  it("handles unknown action gracefully", async () => {
    mockCallMCPTool.mockResolvedValue({ success: true });

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [
        { action: "unknown_action" },
        { action: "snapshot" },
      ],
    });
    const result = await browserActionHandler(node, makeContext());

    expect(mockCallMCPTool).toHaveBeenCalledTimes(1);
    expect(mockCallMCPTool).toHaveBeenCalledWith("server-1", "browser_snapshot", {});
  });

  it("uses custom output variable name", async () => {
    mockCallMCPTool.mockResolvedValueOnce("page content");

    const node = makeNode({
      mcpServerId: "server-1",
      actions: [{ action: "snapshot" }],
      outputVariable: "page_snapshot",
    });
    const result = await browserActionHandler(node, makeContext());

    expect(result.updatedVariables?.page_snapshot).toBeDefined();
  });
});
