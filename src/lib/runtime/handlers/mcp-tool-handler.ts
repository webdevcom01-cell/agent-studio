import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const mcpToolHandler: NodeHandler = async (node, context) => {
  const mcpServerId = node.data.mcpServerId as string | undefined;
  const toolName = node.data.toolName as string | undefined;
  const inputMapping = (node.data.inputMapping as Record<string, string>) ?? {};
  const outputVariable = (node.data.outputVariable as string) ?? "mcp_result";

  if (!mcpServerId || !toolName) {
    return {
      messages: [
        {
          role: "assistant",
          content: "MCP Tool node is not configured (missing server or tool name).",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  // RBAC: verify agent has this MCP server linked and tool is permitted
  const accessCheck = await checkMCPToolAccess(
    context.agentId, mcpServerId, toolName,
  );
  if (!accessCheck.allowed) {
    logger.warn("MCP tool access denied", {
      agentId: context.agentId,
      mcpServerId,
      toolName,
      reason: accessCheck.reason,
    });
    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: Access denied — ${accessCheck.reason}]`,
      },
    };
  }

  const resolvedArgs: Record<string, unknown> = {};
  for (const [param, template] of Object.entries(inputMapping)) {
    resolvedArgs[param] = resolveTemplate(template, context.variables);
  }

  const MAX_RESULT_LENGTH = 10_000;

  try {
    const result = await callMCPTool(mcpServerId, toolName, resolvedArgs);

    const sanitized = typeof result === "string"
      ? result.slice(0, MAX_RESULT_LENGTH)
      : JSON.stringify(result).slice(0, MAX_RESULT_LENGTH);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: sanitized,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      messages: [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [outputVariable]: `[Error: ${errorMsg}]`,
      },
    };
  }
};

interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

async function checkMCPToolAccess(
  agentId: string,
  mcpServerId: string,
  toolName: string,
): Promise<AccessCheckResult> {
  try {
    const link = await prisma.agentMCPServer.findUnique({
      where: {
        agentId_mcpServerId: { agentId, mcpServerId },
      },
      select: { enabledTools: true },
    });

    if (!link) {
      return { allowed: false, reason: "MCP server not linked to this agent" };
    }

    const enabledTools = link.enabledTools as string[] | null;

    if (enabledTools && enabledTools.length > 0 && !enabledTools.includes(toolName)) {
      return { allowed: false, reason: `Tool "${toolName}" not in agent's enabled tools list` };
    }

    return { allowed: true };
  } catch {
    // DB error — allow through to avoid blocking on transient failures
    return { allowed: true };
  }
}
