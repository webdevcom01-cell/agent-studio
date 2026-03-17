import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  cLIGeneration: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  mCPServer: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerCLIBridgeAsMCP } from "../mcp-registration";

describe("registerCLIBridgeAsMCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates MCP server for completed generation with files", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "Blender",
      status: "COMPLETED",
      generatedFiles: {
        "main.py": "import click\n@click.command('render')\ndef render(): pass",
        "bridge.py": "import subprocess",
      },
    });
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mCPServer.create.mockResolvedValueOnce({
      id: "mcp-1",
      name: "CLI Bridge - Blender",
    });

    const result = await registerCLIBridgeAsMCP("gen-1", "user-1");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("mcp-1");
    expect(mockPrisma.mCPServer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "CLI Bridge - Blender",
          userId: "user-1",
          serverType: "cli-bridge",
        }),
      }),
    );
  });

  it("returns existing server when name already exists (deduplication)", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "Blender",
      status: "COMPLETED",
      generatedFiles: { "main.py": "content" },
    });
    const existingServer = { id: "mcp-existing", name: "CLI Bridge - Blender" };
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(existingServer);

    const result = await registerCLIBridgeAsMCP("gen-1", "user-1");

    expect(result).toEqual(existingServer);
    expect(mockPrisma.mCPServer.create).not.toHaveBeenCalled();
  });

  it("returns null when generation not found", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce(null);

    const result = await registerCLIBridgeAsMCP("gen-missing", "user-1");

    expect(result).toBeNull();
  });

  it("returns null when generation is not completed", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "Blender",
      status: "ANALYZING",
      generatedFiles: null,
    });

    const result = await registerCLIBridgeAsMCP("gen-1", "user-1");

    expect(result).toBeNull();
    expect(mockPrisma.mCPServer.create).not.toHaveBeenCalled();
  });

  it("returns null and logs error on Prisma failure", async () => {
    mockPrisma.cLIGeneration.findUnique.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    const result = await registerCLIBridgeAsMCP("gen-1", "user-1");

    expect(result).toBeNull();
  });

  it("never throws", async () => {
    mockPrisma.cLIGeneration.findUnique.mockRejectedValueOnce(
      new Error("Unexpected error"),
    );

    await expect(
      registerCLIBridgeAsMCP("gen-1", "user-1"),
    ).resolves.toBeNull();
  });

  it("extracts click commands as tools", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "GIMP",
      status: "COMPLETED",
      generatedFiles: {
        "main.py": `import click
@click.command('resize')
def resize(): pass

@click.command('convert')
def convert(): pass`,
      },
    });
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mCPServer.create.mockResolvedValueOnce({
      id: "mcp-2",
      name: "CLI Bridge - GIMP",
    });

    await registerCLIBridgeAsMCP("gen-1", "user-1");

    const createCall = mockPrisma.mCPServer.create.mock.calls[0][0];
    const toolsCache = createCall.data.toolsCache as Array<{ name: string }>;
    expect(toolsCache).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "resize" }),
        expect.objectContaining({ name: "convert" }),
      ]),
    );
  });

  it("links generation to created MCP server", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "FFmpeg",
      status: "COMPLETED",
      generatedFiles: { "main.py": "pass" },
    });
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mCPServer.create.mockResolvedValueOnce({
      id: "mcp-3",
      name: "CLI Bridge - FFmpeg",
    });

    await registerCLIBridgeAsMCP("gen-1", "user-1");

    expect(mockPrisma.cLIGeneration.update).toHaveBeenCalledWith({
      where: { id: "gen-1" },
      data: { mcpServerId: "mcp-3" },
    });
  });

  // ─── TypeScript target: registerTool() extraction ─────────────────────────

  it("extracts tools from TypeScript server.registerTool() calls", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "Inkscape",
      status: "COMPLETED",
      generatedFiles: {
        "server.ts": `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "inkscape", version: "1.0.0" });
server.registerTool("inkscape_export", {
  title: "Export SVG",
  description: "Export SVG to PNG format",
  inputSchema: { file: z.string() },
}, async ({ file }) => ({ content: [] }));
server.registerTool("inkscape_convert", {
  title: "Convert Format",
  description: "Convert between vector formats",
  inputSchema: { input: z.string(), output: z.string() },
}, async (args) => ({ content: [] }));`,
        "bridge.ts": `export class Bridge {}`,
      },
    });
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mCPServer.create.mockResolvedValueOnce({
      id: "mcp-ts-1",
      name: "CLI Bridge - Inkscape",
    });

    await registerCLIBridgeAsMCP("gen-ts", "user-1");

    const createCall = mockPrisma.mCPServer.create.mock.calls[0][0];
    const toolsCache = createCall.data.toolsCache as Array<{ name: string; description: string }>;
    expect(toolsCache).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "inkscape_export" }),
        expect.objectContaining({ name: "inkscape_convert" }),
      ]),
    );
  });

  it("ignores .test.ts files when extracting TypeScript tools", async () => {
    mockPrisma.cLIGeneration.findUnique.mockResolvedValueOnce({
      applicationName: "TestApp",
      status: "COMPLETED",
      generatedFiles: {
        "server.ts": `server.registerTool("real_tool", { description: "Real" }, async () => ({ content: [] }));`,
        "server.test.ts": `server.registerTool("fake_tool", { description: "Test artifact" }, async () => ({ content: [] }));`,
      },
    });
    mockPrisma.mCPServer.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mCPServer.create.mockResolvedValueOnce({
      id: "mcp-ts-2",
      name: "CLI Bridge - TestApp",
    });

    await registerCLIBridgeAsMCP("gen-ts2", "user-1");

    const createCall = mockPrisma.mCPServer.create.mock.calls[0][0];
    const toolsCache = createCall.data.toolsCache as Array<{ name: string }>;
    const names = toolsCache.map((t) => t.name);
    expect(names).toContain("real_tool");
    expect(names).not.toContain("fake_tool");
  });
});
