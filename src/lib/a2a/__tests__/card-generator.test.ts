import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  agentCard: {
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
  prismaRead: mockPrisma,
}));

import { generateAgentCard, upsertAgentCard, generateAgentCardV03, listPublicAgentCards } from "../card-generator";

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

describe("generateAgentCardV03", () => {
  it("returns A2A v0.3 JSON-LD card for a public agent", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: AGENT_ID,
      name: "Public Agent",
      description: "Does things",
      isPublic: true,
      agentCard: null,
    });

    const card = await generateAgentCardV03(AGENT_ID, BASE_URL);

    expect(card["@context"]).toBe("https://schema.org");
    expect(card["@type"]).toBe("SoftwareAgent");
    expect(card.name).toBe("Public Agent");
    expect(card.description).toBe("Does things");
    expect(card.version).toBe("0.3");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.url).toBe(`${BASE_URL}/api/agents/${AGENT_ID}/a2a`);
    expect(card.authentication.schemes).toContain("none");
  });

  it("throws when agent is not found", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue(null);

    await expect(generateAgentCardV03("nonexistent", BASE_URL)).rejects.toThrow(
      "Agent not found",
    );
  });

  it("throws when agent is not public", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: AGENT_ID,
      name: "Private Agent",
      description: null,
      isPublic: false,
      agentCard: null,
    });

    await expect(generateAgentCardV03(AGENT_ID, BASE_URL)).rejects.toThrow(
      "Agent card not public",
    );
  });

  it("falls back to chat skill when no agentCard skills cached", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: AGENT_ID,
      name: "No Skills Agent",
      description: null,
      isPublic: true,
      agentCard: null,
    });

    const card = await generateAgentCardV03(AGENT_ID, BASE_URL);

    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].id).toBe("chat");
    expect(card.skills[0].name).toContain("No Skills Agent");
  });

  it("uses cached agentCard skills when available", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: AGENT_ID,
      name: "Skilled Agent",
      description: "Has skills",
      isPublic: true,
      agentCard: {
        skills: [
          { id: "run_flow", name: "Run Flow", description: "Execute agent flow" },
          { id: "mcp_srv-1_search", name: "search", description: "Web search" },
        ],
      },
    });

    const card = await generateAgentCardV03(AGENT_ID, BASE_URL);

    expect(card.skills).toHaveLength(2);
    expect(card.skills[0].id).toBe("run_flow");
    expect(card.skills[1].id).toBe("mcp_srv-1_search");
  });

  it("uses agent name as description fallback when description is null", async () => {
    mockPrisma.agent.findUnique.mockResolvedValue({
      id: AGENT_ID,
      name: "My Agent",
      description: null,
      isPublic: true,
      agentCard: null,
    });

    const card = await generateAgentCardV03(AGENT_ID, BASE_URL);

    expect(card.description).toContain("My Agent");
  });
});

describe("listPublicAgentCards", () => {
  it("returns card stubs for all public agents", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "agent-1", name: "Agent One", description: "First" },
      { id: "agent-2", name: "Agent Two", description: null },
    ]);

    const cards = await listPublicAgentCards(BASE_URL);

    expect(cards).toHaveLength(2);
    expect(cards[0].name).toBe("Agent One");
    expect(cards[0].description).toBe("First");
    expect(cards[0].cardUrl).toBe(`${BASE_URL}/api/a2a/agent-1/agent-card`);
    expect(cards[1].description).toContain("Agent Two");
  });

  it("returns empty array when no public agents", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([]);

    const cards = await listPublicAgentCards(BASE_URL);

    expect(cards).toHaveLength(0);
  });

  it("uses agent name as description fallback", async () => {
    mockPrisma.agent.findMany.mockResolvedValue([
      { id: "agent-1", name: "Bot", description: null },
    ]);

    const [card] = await listPublicAgentCards(BASE_URL);

    expect(card.description).toContain("Bot");
  });
});
