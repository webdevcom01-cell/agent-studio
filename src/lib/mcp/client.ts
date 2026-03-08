import { createMCPClient } from "@ai-sdk/mcp";
import type { MCPTransport } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreate, remove } from "./pool";

type ToolSet = Awaited<ReturnType<Awaited<ReturnType<typeof createMCPClient>>["tools"]>>;

function parseHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  return headers as Record<string, string>;
}

export async function getMCPToolsForAgent(agentId: string): Promise<ToolSet> {
  const agentServers = await prisma.agentMCPServer.findMany({
    where: { agentId },
    include: {
      mcpServer: true,
    },
  });

  const enabledServers = agentServers.filter((as) => as.mcpServer.enabled);

  if (enabledServers.length === 0) return {};

  const toolSets = await Promise.allSettled(
    enabledServers.map(async (as) => {
      const { mcpServer } = as;
      const headers = parseHeaders(mcpServer.headers);

      const client = await getOrCreate(
        mcpServer.id,
        mcpServer.url,
        mcpServer.transport,
        headers,
      );

      const tools = await client.tools();

      const enabledTools = as.enabledTools as string[] | null;
      if (!enabledTools) return tools;

      const filtered: ToolSet = {};
      for (const name of enabledTools) {
        if (tools[name]) {
          filtered[name] = tools[name];
        }
      }
      return filtered;
    }),
  );

  const merged: ToolSet = {};
  for (const result of toolSets) {
    if (result.status === "fulfilled") {
      Object.assign(merged, result.value);
    } else {
      logger.error("Failed to load MCP tools", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return merged;
}

interface TestConnectionResult {
  success: boolean;
  tools: string[];
  error?: string;
}

export async function testMCPConnection(
  url: string,
  transport: MCPTransport,
  headers?: Record<string, string>,
): Promise<TestConnectionResult> {
  let client: Awaited<ReturnType<typeof createMCPClient>> | null = null;

  try {
    const type = transport === "SSE" ? "sse" : "http";
    const transportConfig = headers
      ? { type, url, headers } as const
      : { type, url } as const;

    client = await createMCPClient({ transport: transportConfig });
    const tools = await client.tools();
    const toolNames = Object.keys(tools);

    return { success: true, tools: toolNames };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, tools: [], error: message };
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
}

export async function refreshToolsCache(serverId: string): Promise<string[]> {
  const server = await prisma.mCPServer.findUniqueOrThrow({
    where: { id: serverId },
  });

  await remove(serverId);

  const result = await testMCPConnection(
    server.url,
    server.transport,
    parseHeaders(server.headers),
  );

  if (!result.success) {
    throw new Error(result.error ?? "Failed to connect to MCP server");
  }

  await prisma.mCPServer.update({
    where: { id: serverId },
    data: { toolsCache: result.tools },
  });

  return result.tools;
}
