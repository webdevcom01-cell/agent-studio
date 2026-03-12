import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  agent: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/auth-guard", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));

import { GET, AGENT_CATEGORIES } from "../route";
import { NextRequest } from "next/server";

function makeRequest(queryParams: Record<string, string> = {}): NextRequest {
  const url = new URL("http://localhost:3000/api/agents/discover");
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, val);
  }
  return new NextRequest(url);
}

const mockAgents = [
  {
    id: "agent-1",
    name: "Research Bot",
    description: "Searches the web for information",
    model: "gpt-4o-mini",
    category: "research",
    tags: ["search", "web"],
    isPublic: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-06-01"),
    user: { name: "Alice", image: "https://example.com/alice.png" },
    agentCard: { skills: [{ id: "s1", name: "search" }, { id: "s2", name: "summarize" }] },
    knowledgeBase: { id: "kb-1" },
    _count: { conversations: 42, calleeCallLogs: 10, mcpServers: 2 },
  },
  {
    id: "agent-2",
    name: "Writer Agent",
    description: "Writes articles and blog posts",
    model: "deepseek-chat",
    category: "writing",
    tags: ["content", "blog"],
    isPublic: false,
    createdAt: new Date("2025-03-01"),
    updatedAt: new Date("2025-05-01"),
    user: { name: "Bob", image: null },
    agentCard: null,
    knowledgeBase: null,
    _count: { conversations: 5, calleeCallLogs: 0, mcpServers: 0 },
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: "user-1" });
  mockIsAuthError.mockReturnValue(false);
  mockPrisma.agent.findMany.mockResolvedValue(mockAgents);
  mockPrisma.agent.count.mockResolvedValue(2);
  mockPrisma.agent.groupBy.mockResolvedValue([
    { category: "research", _count: { category: 1 } },
    { category: "writing", _count: { category: 1 } },
  ]);
});

describe("GET /api/agents/discover", () => {
  it("returns enriched agent catalog with defaults", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.agents).toHaveLength(2);
    expect(json.data.total).toBe(2);
    expect(json.data.categories).toHaveLength(2);
  });

  it("enriches agent data with stats", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    const agent = json.data.agents.find(
      (a: Record<string, unknown>) => a.id === "agent-1"
    );
    expect(agent.stats.conversationCount).toBe(42);
    expect(agent.stats.skillCount).toBe(2);
    expect(agent.stats.callsReceived).toBe(10);
    expect(agent.stats.hasKnowledgeBase).toBe(true);
    expect(agent.stats.hasMCPTools).toBe(true);
    expect(agent.owner).toEqual({
      name: "Alice",
      image: "https://example.com/alice.png",
    });
  });

  it("handles agent without card or KB", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    const agent = json.data.agents.find(
      (a: Record<string, unknown>) => a.id === "agent-2"
    );
    expect(agent.stats.skillCount).toBe(0);
    expect(agent.stats.hasKnowledgeBase).toBe(false);
    expect(agent.stats.hasMCPTools).toBe(false);
  });

  it("applies text search filter", async () => {
    const req = makeRequest({ q: "research" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  name: { contains: "research", mode: "insensitive" },
                }),
              ]),
            }),
          ]),
        }),
      })
    );
  });

  it("applies category filter", async () => {
    const req = makeRequest({ category: "coding" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: "coding",
        }),
      })
    );
  });

  it("applies scope=mine filter", async () => {
    const req = makeRequest({ scope: "mine" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
        }),
      })
    );
  });

  it("applies scope=public filter", async () => {
    const req = makeRequest({ scope: "public" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublic: true,
        }),
      })
    );
  });

  it("sorts by newest when requested", async () => {
    const req = makeRequest({ sort: "newest" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("sorts by name when requested", async () => {
    const req = makeRequest({ sort: "name" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
      })
    );
  });

  it("applies pagination (limit + offset)", async () => {
    const req = makeRequest({ limit: "10", offset: "20" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 20,
      })
    );
  });

  it("validates invalid limit", async () => {
    const req = makeRequest({ limit: "200" });
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const mockRes = { status: 401 };
    mockRequireAuth.mockResolvedValue(mockRes);
    mockIsAuthError.mockReturnValue(true);

    const res = await GET(makeRequest());

    expect(res).toBe(mockRes);
  });

  it("returns category distribution in response", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.categories).toEqual([
      { name: "research", count: 1 },
      { name: "writing", count: 1 },
    ]);
  });

  it("aggregates popular tags from agents", async () => {
    // The fourth findMany call is for tags
    mockPrisma.agent.findMany
      .mockResolvedValueOnce(mockAgents) // main query
      .mockResolvedValueOnce([ // tags query
        { tags: ["search", "web", "ai"] },
        { tags: ["search", "content"] },
      ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.data.popularTags).toBeDefined();
    expect(Array.isArray(json.data.popularTags)).toBe(true);
  });

  it("applies tag filter (hasEvery)", async () => {
    const req = makeRequest({ tags: "search,web" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { hasEvery: ["search", "web"] },
        }),
      })
    );
  });

  it("applies model filter", async () => {
    const req = makeRequest({ model: "gpt-4o" });
    await GET(req);

    expect(mockPrisma.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          model: "gpt-4o",
        }),
      })
    );
  });

  it("handles database error gracefully", async () => {
    mockPrisma.agent.findMany.mockRejectedValue(new Error("DB down"));

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.success).toBe(false);
    expect(res.status).toBe(500);
  });

  it("re-sorts popular results by conversation + call count", async () => {
    const agents = [
      {
        ...mockAgents[1],
        _count: { conversations: 100, calleeCallLogs: 50, mcpServers: 0 },
      },
      {
        ...mockAgents[0],
        _count: { conversations: 1, calleeCallLogs: 0, mcpServers: 0 },
      },
    ];
    mockPrisma.agent.findMany.mockResolvedValue(agents);

    const res = await GET(makeRequest({ sort: "popular" }));
    const json = await res.json();

    // Agent with more conversations should come first
    expect(json.data.agents[0].id).toBe("agent-2");
    expect(json.data.agents[1].id).toBe("agent-1");
  });

  it("exports AGENT_CATEGORIES constant", () => {
    expect(AGENT_CATEGORIES).toContain("research");
    expect(AGENT_CATEGORIES).toContain("coding");
    expect(AGENT_CATEGORIES).toContain("writing");
    expect(AGENT_CATEGORIES.length).toBeGreaterThanOrEqual(10);
  });
});
