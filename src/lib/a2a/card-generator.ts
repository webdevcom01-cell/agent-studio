import { prisma } from "@/lib/prisma";

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
