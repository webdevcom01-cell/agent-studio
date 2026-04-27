import type { NodeHandler } from "../types";
import { resolveTemplate } from "../template";
import { callMCPTool } from "@/lib/mcp/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { auditMCPToolCall } from "@/lib/security/audit";
import { enforceSkillAccess, RBACError } from "@/lib/security/rbac";
import { isECCEnabled } from "@/lib/ecc/feature-flag";
import { validateMCPInputArgs, validateNamedSchema } from "@/lib/mcp/schema-validator";

const ECC_MCP_URL = process.env.ECC_MCP_URL ?? "";

// ECC skill tools that require RBAC enforcement
const ECC_SKILL_TOOLS = new Set(["get_skill", "execute_skill", "search_skills"]);

export const mcpToolHandler: NodeHandler = async (node, context) => {
  const mcpServerId = node.data.mcpServerId as string | undefined;
  const toolName = node.data.toolName as string | undefined;
  const inputMapping = (node.data.inputMapping as Record<string, string>) ?? {};
  const outputVariable = (node.data.outputVariable as string) ?? "mcp_result";
  const inputSchemaName = node.data.inputSchema as string | undefined;
  const outputSchemaName = node.data.outputSchema as string | undefined;

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

  // Org-level RBAC: if the agent belongs to an organization and the triggering
  // user is known, verify they are at least a MEMBER of that organization.
  // Personal agents (no organizationId) and system/anonymous executions
  // (no context.userId) bypass this check.
  if (context.userId) {
    const agentOrg = await prisma.agent.findUnique({
      where: { id: context.agentId },
      select: { organizationId: true },
    });

    if (agentOrg?.organizationId) {
      const membership = await prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: context.userId,
            organizationId: agentOrg.organizationId,
          },
        },
        select: { role: true },
      });

      if (!membership) {
        logger.warn("MCP tool org RBAC denial", {
          agentId: context.agentId,
          userId: context.userId,
          organizationId: agentOrg.organizationId,
        });
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: "[Error: Access denied — User does not have permission to invoke tools for this agent]",
          },
        };
      }
    }
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

  // ── Schema enforcement: validate input args ───────────────────────────────
  // 1. Native MCP JSON Schema check (required fields + types) from toolsCache
  // 2. Named Zod schema check from node.data.inputSchema
  try {
    const toolDef = await fetchToolSchema(mcpServerId, toolName);
    if (toolDef) {
      const nativeCheck = validateMCPInputArgs(resolvedArgs, toolDef);
      if (!nativeCheck.valid) {
        logger.warn("MCP tool input failed native schema validation", {
          agentId: context.agentId,
          mcpServerId,
          toolName,
          errors: nativeCheck.errors,
        });
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: `[Error: Input validation failed — ${nativeCheck.errors.join("; ")}]`,
          },
        };
      }
    }

    const namedInputCheck = validateNamedSchema(inputSchemaName, resolvedArgs, "Input");
    if (!namedInputCheck.valid) {
      logger.warn("MCP tool input failed named schema validation", {
        agentId: context.agentId,
        mcpServerId,
        toolName,
        schema: inputSchemaName,
        errors: namedInputCheck.errors,
      });
      return {
        messages: [],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [outputVariable]: `[Error: ${namedInputCheck.errors.join("; ")}]`,
        },
      };
    }
  } catch {
    // Schema fetch/validation errors are non-fatal: log and continue
    logger.warn("MCP schema pre-validation failed, continuing", {
      agentId: context.agentId,
      mcpServerId,
      toolName,
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

  try {
    const result = await callMCPTool(mcpServerId, toolName, resolvedArgs);

    // Compliance audit — fire-and-forget, never blocks execution
    auditMCPToolCall(context.agentId, mcpServerId, toolName);

    const sanitized = typeof result === "string"
      ? result.slice(0, MAX_RESULT_LENGTH)
      : JSON.stringify(result).slice(0, MAX_RESULT_LENGTH);

    // ── Schema enforcement: validate output ─────────────────────────────────
    if (outputSchemaName) {
      const parsedResult = (() => {
        try { return typeof result === "string" ? JSON.parse(result) : result; } catch { return result; }
      })();
      const outputCheck = validateNamedSchema(outputSchemaName, parsedResult, "Output");
      if (!outputCheck.valid) {
        logger.warn("MCP tool output failed schema validation", {
          agentId: context.agentId,
          mcpServerId,
          toolName,
          schema: outputSchemaName,
          errors: outputCheck.errors,
        });
        return {
          messages: [],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [outputVariable]: `[Error: Output validation failed — ${outputCheck.errors.join("; ")}]`,
          },
        };
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

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

/**
 * Fetches the JSON Schema for a specific tool from the MCP server's toolsCache.
 * Returns null when the server or tool cannot be found — caller treats this as
 * "no schema available" and skips native validation (backward compatible).
 */
async function fetchToolSchema(
  mcpServerId: string,
  toolName: string,
): Promise<unknown | null> {
  try {
    const server = await prisma.mCPServer.findUnique({
      where: { id: mcpServerId },
      select: { toolsCache: true },
    });

    if (!server?.toolsCache || !Array.isArray(server.toolsCache)) return null;

    const tool = (server.toolsCache as { name: string; inputSchema?: unknown }[])
      .find((t) => t.name === toolName);

    return tool?.inputSchema ?? null;
  } catch {
    return null;
  }
}
