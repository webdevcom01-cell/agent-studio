import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface TemplatePayload {
  version: string;
  exportedAt: string;
  sourceOrganizationId: string;
  agent: {
    name: string;
    description: string | null;
    systemPrompt: string | null;
    modelId: string | null;
    maxTokens: number | null;
    temperature: number | null;
    tags: string[];
  };
  flows: Array<{
    name: string;
    description: string | null;
    definition: unknown;
  }>;
  mcpServers: Array<{
    name: string;
    url: string;
    description: string | null;
  }>;
  heartbeatConfig?: {
    cronExpression: string;
    timezone: string;
    systemPrompt: string | null;
    maxContextItems: number;
  };
  goals: Array<{
    title: string;
    description: string | null;
    successMetric: string | null;
    priority: number;
  }>;
}

const SAFE_DOMAINS = ["vercel.app", "anthropic.com", "openai.com"];
const API_KEY_PATTERN = /^(sk-|key-|pk_|sk_)[a-zA-Z0-9]{8,}/;
const URL_PATTERN = /https?:\/\/[^\s"']+/g;

function isSafeDomain(url: string): boolean {
  return SAFE_DOMAINS.some((d) => url.includes(d));
}

/**
 * Recursively scrub secrets from any JSON value.
 */
export function scrubSecrets(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (API_KEY_PATTERN.test(value)) return "{API_KEY_REDACTED}";

    return value.replace(URL_PATTERN, (url) => {
      if (isSafeDomain(url)) return url;
      return "{URL_REDACTED}";
    });
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) return value.map(scrubSecrets);

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = scrubSecrets(v);
    }
    return result;
  }

  return value;
}

function computeChecksum(payload: TemplatePayload): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Validate a template payload has the required fields.
 */
export function validateTemplatePayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Payload must be an object"] };
  }

  const p = payload as Record<string, unknown>;

  if (!p.version || typeof p.version !== "string") errors.push("Missing required field: version");
  if (!p.exportedAt || typeof p.exportedAt !== "string") errors.push("Missing required field: exportedAt");
  if (!p.sourceOrganizationId || typeof p.sourceOrganizationId !== "string")
    errors.push("Missing required field: sourceOrganizationId");

  if (!p.agent || typeof p.agent !== "object") {
    errors.push("Missing required field: agent");
  } else {
    const agent = p.agent as Record<string, unknown>;
    if (!agent.name || typeof agent.name !== "string") errors.push("Missing required field: agent.name");
  }

  if (!Array.isArray(p.flows)) errors.push("Missing required field: flows (must be array)");
  if (!Array.isArray(p.mcpServers)) errors.push("Missing required field: mcpServers (must be array)");
  if (!Array.isArray(p.goals)) errors.push("Missing required field: goals (must be array)");

  return { valid: errors.length === 0, errors };
}

/**
 * Export an agent and its associated resources as a scrubbed template payload.
 */
export async function exportTemplate(
  agentId: string,
  organizationId: string,
): Promise<{ payload: TemplatePayload; checksum: string }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      flow: true,
      mcpServers: { include: { mcpServer: true } },
      heartbeatConfig: true,
      goalLinks: {
        where: { goal: { status: "ACTIVE" } },
        include: { goal: true },
      },
    },
  });

  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const mcpServers = agent.mcpServers.map((link) => {
    const safeName = link.mcpServer.name.toUpperCase().replace(/\s+/g, "_");
    return {
      name: link.mcpServer.name,
      url: `\${MCP_SERVER_${safeName}_URL}`,
      description: null as string | null,
    };
  });

  const flows = agent.flow
    ? [
        {
          name: agent.flow.name,
          description: null as string | null,
          definition: scrubSecrets(agent.flow.content),
        },
      ]
    : [];

  const heartbeatConfig = agent.heartbeatConfig
    ? {
        cronExpression: agent.heartbeatConfig.cronExpression,
        timezone: agent.heartbeatConfig.timezone,
        systemPrompt: agent.heartbeatConfig.systemPrompt,
        maxContextItems: agent.heartbeatConfig.maxContextItems,
      }
    : undefined;

  const goals = agent.goalLinks.map((link) => ({
    title: link.goal.title,
    description: link.goal.description,
    successMetric: link.goal.successMetric,
    priority: link.goal.priority,
  }));

  const payload: TemplatePayload = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    sourceOrganizationId: organizationId.slice(0, 8),
    agent: {
      name: agent.name,
      description: agent.description ?? null,
      systemPrompt: agent.systemPrompt ? (scrubSecrets(agent.systemPrompt) as string) : null,
      modelId: agent.model ?? null,
      maxTokens: null,
      temperature: agent.temperature ?? null,
      tags: agent.tags ?? [],
    },
    flows,
    mcpServers,
    heartbeatConfig,
    goals,
  };

  const checksum = computeChecksum(payload);

  logger.info("Template exported", { agentId, organizationId, flows: flows.length });

  return { payload, checksum };
}

const PLACEHOLDER_PATTERN = /\$\{[^}]+\}/;

/**
 * Import a template payload into an organization, creating all resources.
 */
export async function importTemplate(
  payload: TemplatePayload,
  checksum: string,
  organizationId: string,
): Promise<{
  agentId: string;
  flowIds: string[];
  mcpServerIds: string[];
  warnings: string[];
}> {
  const { valid, errors } = validateTemplatePayload(payload);
  if (!valid) throw new Error(`Invalid template payload: ${errors.join(", ")}`);

  const recomputedChecksum = computeChecksum(payload);
  if (recomputedChecksum !== checksum) {
    throw new Error("Template checksum mismatch — payload may have been tampered with");
  }

  const warnings: string[] = [];

  const agent = await prisma.agent.create({
    data: {
      name: payload.agent.name,
      description: payload.agent.description,
      systemPrompt: payload.agent.systemPrompt,
      model: payload.agent.modelId ?? "deepseek-chat",
      temperature: payload.agent.temperature ?? 0.7,
      tags: payload.agent.tags ?? [],
      organizationId,
    },
  });

  const flowIds: string[] = [];
  for (const flowDef of payload.flows) {
    const flow = await prisma.flow.create({
      data: {
        agentId: agent.id,
        name: flowDef.name,
        content: (flowDef.definition as object) ?? { nodes: [], edges: [], variables: [] },
      },
    });
    flowIds.push(flow.id);
  }

  const mcpServerIds: string[] = [];
  for (const mcp of payload.mcpServers) {
    if (PLACEHOLDER_PATTERN.test(mcp.url)) {
      warnings.push(`MCP server "${mcp.name}" has a placeholder URL (${mcp.url}) — update before use`);
    }
    const server = await prisma.mCPServer.create({
      data: {
        name: mcp.name,
        url: mcp.url,
        userId: organizationId,
      },
    });
    await prisma.agentMCPServer.create({
      data: { agentId: agent.id, mcpServerId: server.id },
    });
    mcpServerIds.push(server.id);
  }

  if (payload.heartbeatConfig) {
    await prisma.heartbeatConfig.create({
      data: {
        agentId: agent.id,
        organizationId,
        cronExpression: payload.heartbeatConfig.cronExpression,
        timezone: payload.heartbeatConfig.timezone,
        systemPrompt: payload.heartbeatConfig.systemPrompt,
        maxContextItems: payload.heartbeatConfig.maxContextItems,
      },
    });
  }

  for (const goal of payload.goals) {
    const created = await prisma.goal.create({
      data: {
        organizationId,
        title: goal.title,
        description: goal.description,
        successMetric: goal.successMetric,
        priority: goal.priority,
      },
    });
    await prisma.agentGoalLink.create({
      data: { agentId: agent.id, goalId: created.id, role: "CONTRIBUTOR" },
    });
  }

  logger.info("Template imported", {
    agentId: agent.id,
    organizationId,
    flowIds,
    mcpServerIds,
    warnings: warnings.length,
  });

  return { agentId: agent.id, flowIds, mcpServerIds, warnings };
}
