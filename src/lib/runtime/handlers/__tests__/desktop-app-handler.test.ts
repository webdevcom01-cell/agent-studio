import { describe, it, expect, vi, beforeEach } from "vitest";
import { desktopAppHandler } from "../desktop-app-handler";
import type { FlowNode } from "@/types";
import type { RuntimeContext } from "../../types";

vi.mock("@/lib/mcp/client", () => ({
  callMCPTool: vi.fn(),
}));

import { callMCPTool } from "@/lib/mcp/client";
const mockCallMCPTool = vi.mocked(callMCPTool);

function makeNode(data: Record<string, unknown>): FlowNode {
  return { id: "n1", type: "desktop_app", position: { x: 0, y: 0 }, data };
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

describe("desktopAppHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when mcpServerId is missing", async () => {
    const node = makeNode({ appId: "blender", actions: [] });
    const result = await desktopAppHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no CLI bridge server configured");
  });

  it("returns error when appId is missing", async () => {
    const node = makeNode({ mcpServerId: "server-1", actions: [] });
    const result = await desktopAppHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no application selected");
  });

  it("returns error when actions array is empty", async () => {
    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      actions: [],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("no actions configured");
  });

  it("executes single action via CLI bridge", async () => {
    mockCallMCPTool.mockResolvedValueOnce({
      success: true,
      output: "Render complete",
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      actions: [
        {
          appId: "blender",
          capabilityId: "render",
          command: "render",
          parameters: { scene: "/path/to/scene.blend" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "blender_render",
      { scene: "/path/to/scene.blend" },
    );
    expect(result.updatedVariables?.desktop_result).toBeDefined();
  });

  it("executes multi-step actions in sequence", async () => {
    const callOrder: string[] = [];
    mockCallMCPTool.mockImplementation(async (_serverId, toolName) => {
      callOrder.push(toolName);
      return { success: true, output: "ok", exitCode: 0 };
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      actions: [
        {
          appId: "blender",
          capabilityId: "render",
          command: "render",
          parameters: { scene: "/scene.blend" },
        },
        {
          appId: "blender",
          capabilityId: "export",
          command: "export",
          parameters: { scene: "/scene.blend", format: "fbx", output: "/out.fbx" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(callOrder).toEqual(["blender_render", "blender_export"]);
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.desktop_result).toBeDefined();
    expect(result.updatedVariables?.desktop_result_all).toBeDefined();
  });

  it("resolves template variables in parameters", async () => {
    mockCallMCPTool.mockResolvedValue({
      success: true,
      output: "done",
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "libreoffice",
      actions: [
        {
          appId: "libreoffice",
          capabilityId: "convert",
          command: "convert-to",
          parameters: {
            input: "{{input_file}}",
            format: "{{target_format}}",
          },
        },
      ],
    });
    const result = await desktopAppHandler(
      node,
      makeContext({ input_file: "/doc.docx", target_format: "pdf" }),
    );

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "libreoffice_convert-to",
      { input: "/doc.docx", format: "pdf" },
    );
    expect(result.updatedVariables).toBeDefined();
  });

  it("handles CLI tool failure gracefully", async () => {
    mockCallMCPTool.mockRejectedValueOnce(new Error("CLI not found"));

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      actions: [
        {
          appId: "blender",
          capabilityId: "render",
          command: "render",
          parameters: { scene: "/scene.blend" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(result.updatedVariables?.desktop_result).toBe("[Error: CLI not found]");
  });

  it("uses custom output variable name", async () => {
    mockCallMCPTool.mockResolvedValueOnce({
      success: true,
      output: "exported",
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "inkscape",
      outputVariable: "svg_export",
      actions: [
        {
          appId: "inkscape",
          capabilityId: "export_png",
          command: "export-png",
          parameters: { input: "/drawing.svg", output: "/output.png" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(result.updatedVariables?.svg_export).toBeDefined();
  });

  it("passes session continue flag when sessionMode is continue", async () => {
    mockCallMCPTool.mockResolvedValueOnce({
      success: true,
      output: "ok",
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      sessionMode: "continue",
      actions: [
        {
          appId: "blender",
          capabilityId: "script",
          command: "script",
          parameters: { scriptPath: "/script.py" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "blender_script",
      { scriptPath: "/script.py", _session: "continue" },
    );
    expect(result.updatedVariables?.desktop_result).toBeDefined();
  });

  it("uses appId from action when different from node appId", async () => {
    mockCallMCPTool.mockResolvedValueOnce({
      success: true,
      output: "ok",
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "blender",
      actions: [
        {
          appId: "gimp",
          capabilityId: "convert",
          command: "convert",
          parameters: { input: "/image.png", output: "/image.jpg" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    expect(mockCallMCPTool).toHaveBeenCalledWith(
      "server-1",
      "gimp_convert",
      { input: "/image.png", output: "/image.jpg" },
    );
    expect(result.updatedVariables?.desktop_result).toBeDefined();
  });

  it("truncates large results", async () => {
    const largeOutput = "x".repeat(20_000);
    mockCallMCPTool.mockResolvedValueOnce({
      success: true,
      output: largeOutput,
      exitCode: 0,
    });

    const node = makeNode({
      mcpServerId: "server-1",
      appId: "anygen",
      actions: [
        {
          appId: "anygen",
          capabilityId: "run",
          command: "run",
          parameters: { command: "cat bigfile" },
        },
      ],
    });
    const result = await desktopAppHandler(node, makeContext());

    const output = result.updatedVariables?.desktop_result as string;
    expect(output.length).toBeLessThanOrEqual(10_000);
  });
});
