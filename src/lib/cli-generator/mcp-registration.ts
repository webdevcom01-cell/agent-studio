import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { MCPServer } from "@/generated/prisma";

interface ToolCacheEntry {
  name: string;
  description: string;
}

function extractToolsFromFiles(
  files: Record<string, string>,
): ToolCacheEntry[] {
  const tools: ToolCacheEntry[] = [];

  for (const [filename, content] of Object.entries(files)) {
    if (!filename.endsWith(".py")) continue;

    const clickMatches = content.matchAll(
      /@click\.command\(\s*["']([^"']+)["'](?:.*?)?\)/g,
    );
    for (const match of clickMatches) {
      tools.push({
        name: match[1],
        description: `CLI command: ${match[1]}`,
      });
    }

    const defMatches = content.matchAll(
      /def\s+([\w]+)\s*\([^)]*\)\s*(?:->.*?)?:\s*\n\s*"""([^"]*?)"""/g,
    );
    for (const match of defMatches) {
      const name = match[1];
      if (name.startsWith("test_") || name.startsWith("_")) continue;
      if (tools.some((t) => t.name === name)) continue;
      tools.push({
        name,
        description: match[2].trim().split("\n")[0],
      });
    }
  }

  return tools;
}

export async function registerCLIBridgeAsMCP(
  generationId: string,
  userId: string,
): Promise<MCPServer | null> {
  try {
    const generation = await prisma.cLIGeneration.findUnique({
      where: { id: generationId },
      select: {
        applicationName: true,
        status: true,
        generatedFiles: true,
      },
    });

    if (!generation) {
      logger.warn("MCP registration: generation not found", { generationId });
      return null;
    }

    if (generation.status !== "COMPLETED") {
      logger.warn("MCP registration: generation not completed", {
        generationId,
        status: generation.status,
      });
      return null;
    }

    const serverName = `CLI Bridge - ${generation.applicationName}`;

    const existing = await prisma.mCPServer.findFirst({
      where: { name: serverName, userId },
    });

    if (existing) {
      logger.info("MCP registration: server already exists", {
        generationId,
        serverId: existing.id,
      });
      return existing;
    }

    const files = (generation.generatedFiles ?? {}) as Record<string, string>;
    const tools = extractToolsFromFiles(files);

    const mcpServer = await prisma.mCPServer.create({
      data: {
        name: serverName,
        url: `cli-bridge://${generationId}`,
        transport: "STREAMABLE_HTTP",
        serverType: "cli-bridge",
        userId,
        toolsCache: tools.length > 0
          ? JSON.parse(JSON.stringify(tools))
          : undefined,
      },
    });

    await prisma.cLIGeneration.update({
      where: { id: generationId },
      data: { mcpServerId: mcpServer.id },
    });

    logger.info("MCP registration: server created", {
      generationId,
      serverId: mcpServer.id,
      toolCount: tools.length,
    });

    return mcpServer;
  } catch (err) {
    logger.error("MCP registration failed", {
      generationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
