import { prisma, prismaRead } from "@/lib/prisma";

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  inputModes: ("text" | "file" | "data")[];
  outputModes: ("text" | "file" | "data")[];
  source: "flow" | "mcp";
  mcpServerId?: string;
}

export interface AgentCardSchema {
  name: string;
  description?: string;
  url: string;
  version: string;
  skills: A2ASkill[];
  authentication: {
    schemes: ("bearer" | "none")[];
  };
}

export async function generateAgentCard(
  agentId: string,
  userId: string,
  baseUrl: string
): Promise<AgentCardSchema> {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
    include: {
      mcpServers: {
        include: { mcpServer: true },
        where: { mcpServer: { enabled: true } },
      },
    },
  });

  if (!agent) throw new Error("Agent not found");

  const skills: A2ASkill[] = [
    {
      id: "run_flow",
      name: "Run Agent Flow",
      description: agent.description ?? `Execute the ${agent.name} agent flow`,
      inputModes: ["text", "data"],
      outputModes: ["text", "data"],
      source: "flow",
    },
  ];

  for (const agentMcp of agent.mcpServers) {
    const server = agentMcp.mcpServer;
    const cachedTools = server.toolsCache as
      | { name: string; description?: string }[]
      | null;

    if (cachedTools && Array.isArray(cachedTools)) {
      for (const tool of cachedTools) {
        skills.push({
          id: `mcp_${server.id}_${tool.name}`,
          name: tool.name,
          description: tool.description ?? `MCP tool: ${tool.name}`,
          inputModes: ["data"],
          outputModes: ["data"],
          source: "mcp",
          mcpServerId: server.id,
        });
      }
    }
  }

  return {
    name: agent.name,
    description: agent.description ?? undefined,
    url: `${baseUrl}/api/agents/${agentId}/a2a`,
    version: "1.0",
    skills,
    authentication: {
      schemes: ["bearer"],
    },
  };
}

// ── A2A v0.3 JSON-LD format ────────────────────────────────────────────────

export interface A2ACardV03 {
  "@context": "https://schema.org";
  "@type": "SoftwareAgent";
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: {
    id: string;
    name: string;
    description: string;
    inputModes: string[];
    outputModes: string[];
  }[];
  authentication: {
    schemes: string[];
  };
}

/**
 * Generates an A2A v0.3 JSON-LD agent card for a public agent.
 * Does NOT require userId — reads from public agent data only.
 * Throws if the agent does not exist or is not public.
 */
export async function generateAgentCardV03(
  agentId: string,
  baseUrl: string,
): Promise<A2ACardV03> {
  const agent = await prismaRead.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      agentCard: { select: { skills: true } },
    },
  });

  if (!agent) throw new Error("Agent not found");
  if (!agent.isPublic) throw new Error("Agent card not public");

  const cachedSkills = Array.isArray(agent.agentCard?.skills)
    ? (agent.agentCard.skills as { id: string; name: string; description?: string }[])
    : [];

  const skills: A2ACardV03["skills"] =
    cachedSkills.length > 0
      ? cachedSkills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? s.name,
          inputModes: ["text"],
          outputModes: ["text"],
        }))
      : [
          {
            id: "chat",
            name: `Chat with ${agent.name}`,
            description: agent.description ?? `Interact with ${agent.name}`,
            inputModes: ["text"],
            outputModes: ["text"],
          },
        ];

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareAgent",
    name: agent.name,
    description: agent.description ?? `${agent.name} agent`,
    url: `${baseUrl}/api/agents/${agent.id}/a2a`,
    version: "0.3",
    capabilities: {
      streaming: true,
      pushNotifications: false,
    },
    skills,
    authentication: {
      schemes: ["none"],
    },
  };
}

/**
 * Returns minimal card stubs for all public agents — used by the discovery endpoint.
 */
export async function listPublicAgentCards(
  baseUrl: string,
): Promise<{ name: string; description: string; cardUrl: string }[]> {
  const agents = await prismaRead.agent.findMany({
    where: { isPublic: true },
    select: { id: true, name: true, description: true },
    orderBy: { name: "asc" },
  });

  return agents.map((agent) => ({
    name: agent.name,
    description: agent.description ?? `${agent.name} agent`,
    cardUrl: `${baseUrl}/api/a2a/${agent.id}/agent-card`,
  }));
}

export async function upsertAgentCard(
  agentId: string,
  userId: string,
  baseUrl: string
): Promise<void> {
  const card = await generateAgentCard(agentId, userId, baseUrl);

  await prisma.agentCard.upsert({
    where: { agentId },
    create: {
      agentId,
      skills: JSON.parse(JSON.stringify(card.skills)),
      isPublic: false,
    },
    update: {
      skills: JSON.parse(JSON.stringify(card.skills)),
    },
  });
}
