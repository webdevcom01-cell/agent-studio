import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditMCPToolCall } from "@/lib/security/audit";
import { enforceSkillAccess, RBACError } from "@/lib/security/rbac";
import { isECCEnabled } from "@/lib/ecc/feature-flag";

const ECC_MCP_URL = process.env.ECC_MCP_URL ?? "";

// ECC skill tools that require RBAC enforcement
const ECC_SKILL_TOOLS = new Set(["get_skill", "execute_skill", "search_skills"]);

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

  // ECC Skill RBAC enforcement — if this is the ECC MCP server and a skill tool, enforce RBAC
  if (isECCEnabled() && ECC_MCP_URL && ECC_SKILL_TOOLS.has(toolName)) {
    const server = await prisma.mCPServer.findUnique({
      where: { id: mcpServerId },
      select: { url: true },
    });

    if (server?.url === ECC_MCP_URL) {
      // Extract skill name from args — `get_skill` and `execute_skill` use a `name` param
      const skillName = typeof resolvedArgs.name === "string" ? resolvedArgs.name : null;

      if (skillName) {
        const skill = await prisma.skill.findUnique({
          where: { slug: skillName },
          select: { id: true },
        });

        if (skill) {
          const requiredLevel = toolName === "execute_skill" ? "EXECUTE" : "READ";
          try {
            await enforceSkillAccess(context.agentId, skill.id, requiredLevel);
          } catch (rbacErr) {
            if (rbacErr instanceof RBACError) {
              logger.warn("ECC skill RBAC denial in mcp_tool node", {
                agentId: context.agentId,
                skillName,
                toolName,
                requiredLevel,
              });
              return {
                messages: [],
                nextNodeId: null,
                waitForInput: false,
                updatedVariables: {
                  ...context.variables,
                  [outputVariable]: `[Error: Skill access denied — ${rbacErr.message}]`,
                },
              };
            }
            throw rbacErr;
          }
        }
      }
    }
  }

  const MAX_RESULT_LENGTH = 10_000;

  try {
    const result = await callMCPTool(mcpServerId, toolName, resolvedArgs);

    // Compliance audit — fire-and-forget, never blocks execution
    auditMCPToolCall(context.agentId, mcpServerId, toolName);

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
