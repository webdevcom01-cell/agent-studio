import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
  },
  agentCard: {
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { generateAgentCard, upsertAgentCard } from "../card-generator";

const BASE_URL = "https://test.example.com";
const USER_ID = "user-1";
const AGENT_ID = "agent-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateAgentCard", () => {
  it("generates a valid A2A card for an agent with no MCP servers", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "Test Agent",
      description: "A test agent",
      mcpServers: [],
    });

    const card = await generateAgentCard(AGENT_ID, USER_ID, BASE_URL);

    expect(card.name).toBe("Test Agent");
    expect(card.description).toBe("A test agent");
    expect(card.url).toBe(`${BASE_URL}/api/agents/${AGENT_ID}/a2a`);
    expect(card.version).toBe("1.0");
    expect(card.authentication.schemes).toContain("bearer");
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].id).toBe("run_flow");
  });

  it("includes MCP tool skills when agent has MCP servers with cached tools", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "MCP Agent",
      description: null,
      mcpServers: [
        {
          mcpServer: {
            id: "srv-1",
            name: "Weather",
            enabled: true,
            toolsCache: [
              { name: "get_weather", description: "Get current weather" },
              { name: "get_forecast", description: "Get forecast" },
            ],
          },
        },
      ],
    });

    const card = await generateAgentCard(AGENT_ID, USER_ID, BASE_URL);

    expect(card.skills).toHaveLength(3);
    expect(card.skills[0].id).toBe("run_flow");
    expect(card.skills[1].id).toBe("mcp_srv-1_get_weather");
    expect(card.skills[1].source).toBe("mcp");
    expect(card.skills[1].mcpServerId).toBe("srv-1");
    expect(card.skills[2].name).toBe("get_forecast");
  });

  it("throws when agent not found or wrong userId", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue(null);

    await expect(
      generateAgentCard("nonexistent", USER_ID, BASE_URL)
    ).rejects.toThrow("Agent not found");
  });

  it("base skill run_flow always present", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "Minimal",
      description: null,
      mcpServers: [],
    });

    const card = await generateAgentCard(AGENT_ID, USER_ID, BASE_URL);

    const runFlow = card.skills.find((s) => s.id === "run_flow");
    expect(runFlow).toBeDefined();
    expect(runFlow?.source).toBe("flow");
    expect(runFlow?.inputModes).toContain("text");
    expect(runFlow?.outputModes).toContain("text");
  });

  it("uses agent name in description fallback when description is null", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "My Bot",
      description: null,
      mcpServers: [],
    });

    const card = await generateAgentCard(AGENT_ID, USER_ID, BASE_URL);

    expect(card.description).toBeUndefined();
    expect(card.skills[0].description).toContain("My Bot");
  });

  it("handles MCP servers with null toolsCache", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "Agent",
      description: null,
      mcpServers: [
        {
          mcpServer: {
            id: "srv-1",
            name: "Empty",
            enabled: true,
            toolsCache: null,
          },
        },
      ],
    });

    const card = await generateAgentCard(AGENT_ID, USER_ID, BASE_URL);

    expect(card.skills).toHaveLength(1);
  });
});

describe("upsertAgentCard", () => {
  it("upserts the agent card in the database", async () => {
    mockPrisma.agent.findFirst.mockResolvedValue({
      id: AGENT_ID,
      name: "Test",
      description: null,
      mcpServers: [],
    });
    mockPrisma.agentCard.upsert.mockResolvedValue({});

    await upsertAgentCard(AGENT_ID, USER_ID, BASE_URL);

    expect(mockPrisma.agentCard.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: AGENT_ID },
        create: expect.objectContaining({ agentId: AGENT_ID }),
        update: expect.objectContaining({ skills: expect.any(Array) }),
      })
    );
  });
});
