import { createMCPClient } from "@ai-sdk/mcp";
import { dynamicTool, type ToolSet as AIToolSet, jsonSchema } from "ai";
import type { MCPTransport } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreate, remove } from "./pool";
import {
  initializeCLIBridge,
  callCLITool,
  getCLIBridgeTools,
} from "./cli-bridge/cli-mcp-server";

type MCPToolSet = Awaited<ReturnType<Awaited<ReturnType<typeof createMCPClient>>["tools"]>>;

const CLI_BRIDGE_SERVER_TYPE = "cli_bridge";

function parseHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  return headers as Record<string, string>;
}

export async function getMCPToolsForAgent(agentId: string): Promise<AIToolSet> {
  const agentServers = await prisma.agentMCPServer.findMany({
    where: { agentId },
    include: {
      mcpServer: true,
    },
  });

  const enabledServers = agentServers.filter((as) => as.mcpServer.enabled);

  if (enabledServers.length === 0) return {};

  const cliServers = enabledServers.filter((as) => as.mcpServer.serverType === CLI_BRIDGE_SERVER_TYPE);
  const mcpServers = enabledServers.filter((as) => as.mcpServer.serverType !== CLI_BRIDGE_SERVER_TYPE);

  const cliToolSets = await Promise.allSettled(
    cliServers.map((as) =>
      getCLIBridgeToolsForAgent(as.mcpServer.id, as.mcpServer.cliConfig, as.enabledTools as string[] | null),
    ),
  );

  const mcpToolSets = await Promise.allSettled(
    mcpServers.map(async (as) => {
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

      const filtered: MCPToolSet = {};
      for (const name of enabledTools) {
        if (tools[name]) {
          filtered[name] = tools[name];
        }
      }
      return filtered;
    }),
  );

  const merged: AIToolSet = {};

  for (const result of cliToolSets) {
    if (result.status === "fulfilled") {
      Object.assign(merged, result.value);
    } else {
      logger.error("Failed to load CLI bridge tools", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  for (const result of mcpToolSets) {
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

interface JsonSchemaProperty {
  type: "string" | "number" | "boolean";
  description: string;
}

function buildJsonSchema(
  params: Record<string, { type: string; description: string; required: boolean }>,
): { type: "object"; properties: Record<string, JsonSchemaProperty>; required: string[] } {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, param] of Object.entries(params)) {
    const schemaType = param.type === "boolean" ? "boolean" as const
      : param.type === "number" ? "number" as const
      : "string" as const;

    properties[key] = {
      type: schemaType,
      description: param.description,
    };
    if (param.required) {
      required.push(key);
    }
  }

  return { type: "object" as const, properties, required };
}

export async function getCLIBridgeToolsForAgent(
  serverId: string,
  cliConfig: unknown,
  enabledTools: string[] | null,
): Promise<AIToolSet> {
  const initResult = await initializeCLIBridge(serverId, cliConfig);
  if (!initResult.success) {
    logger.warn("CLI bridge initialization failed", {
      serverId,
      error: initResult.error,
    });
    return {};
  }

  const cliTools = getCLIBridgeTools(serverId);
  const tools: AIToolSet = {};

  for (const cliTool of cliTools) {
    if (enabledTools && !enabledTools.includes(cliTool.name)) continue;

    const sid = serverId;
    const tName = cliTool.name;
    const schema = buildJsonSchema(cliTool.parameters);

    tools[cliTool.name] = dynamicTool({
      description: cliTool.description,
      inputSchema: jsonSchema(schema),
      execute: async (args: unknown) => {
        const result = await callCLITool(sid, tName, (args ?? {}) as Record<string, unknown>);
        return result.output || result.error || "";
      },
    });
  }

  return tools;
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

export async function callMCPTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const server = await prisma.mCPServer.findUniqueOrThrow({
    where: { id: serverId },
  });

  if (server.serverType === CLI_BRIDGE_SERVER_TYPE) {
    const result = await callCLITool(serverId, toolName, args);
    if (!result.success) {
      throw new Error(result.error ?? `CLI tool "${toolName}" failed with exit code ${result.exitCode}`);
    }
    return result.output;
  }

  const headers = parseHeaders(server.headers);
  const client = await getOrCreate(serverId, server.url, server.transport, headers);
  const tools = await client.tools();
  const tool = tools[toolName];

  if (!tool) {
    throw new Error(`Tool "${toolName}" not found on server "${server.name}"`);
  }

  const result = await tool.execute(args, {
    toolCallId: `call_${Date.now()}`,
    messages: [],
  });
  return result;
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
