import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGoalLinkFindMany,
  mockAgentFindUnique,
  mockMissionFindUnique,
  mockGetAgentAncestors,
} = vi.hoisted(() => ({
  mockGoalLinkFindMany: vi.fn(),
  mockAgentFindUnique: vi.fn(),
  mockMissionFindUnique: vi.fn(),
  mockGetAgentAncestors: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentGoalLink: { findMany: mockGoalLinkFindMany },
    agent: { findUnique: mockAgentFindUnique },
    companyMission: { findUnique: mockMissionFindUnique },
  },
}));

vi.mock("@/lib/org-chart/hierarchy", () => ({
  getAgentAncestors: mockGetAgentAncestors,
}));

import { getAgentGoals, buildGoalPrompt, getMissionForOrg } from "../goal-context";

const makeGoalLink = (goalId: string, title: string, priority = 50, status = "ACTIVE", role = "CONTRIBUTOR") => ({
  goalId,
  role,
  goal: { id: goalId, title, description: null, successMetric: null, priority, status },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAgentAncestors.mockResolvedValue([]);
});

describe("getAgentGoals", () => {
  it("returns empty array when agent has no goal links", async () => {
    mockGoalLinkFindMany.mockResolvedValue([]);

    const result = await getAgentGoals("agent-1");

    expect(result).toEqual([]);
  });

  it("returns own goals with inherited=false", async () => {
    mockGoalLinkFindMany.mockResolvedValue([
      makeGoalLink("goal-1", "Increase retention"),
    ]);

    const result = await getAgentGoals("agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].inherited).toBe(false);
    expect(result[0].title).toBe("Increase retention");
  });

  it("includes parent agent goals with inherited=true", async () => {
    mockGetAgentAncestors.mockResolvedValue(["parent-1"]);
    mockGoalLinkFindMany
      .mockResolvedValueOnce([makeGoalLink("goal-1", "Own goal")]) // agent-1's links
      .mockResolvedValueOnce([makeGoalLink("goal-2", "Parent goal")]); // parent-1's links

    const result = await getAgentGoals("agent-1");

    expect(result).toHaveLength(2);
    const parentGoal = result.find((g) => g.goalId === "goal-2");
    expect(parentGoal?.inherited).toBe(true);
    expect(parentGoal?.inheritedFrom).toBe("parent-1");
  });

  it("excludes COMPLETED and CANCELLED goals (DB-level filter)", async () => {
    // Active goals are filtered at DB level; mock returns only what passes the filter
    mockGoalLinkFindMany.mockResolvedValue([makeGoalLink("goal-1", "Active goal", 50, "ACTIVE")]);

    const result = await getAgentGoals("agent-1");

    // The where clause on the mock is what counts; verify it was called with status filter
    expect(mockGoalLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          goal: expect.objectContaining({ status: "ACTIVE" }),
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});

describe("buildGoalPrompt", () => {
  it("returns empty string when no goals", async () => {
    mockGoalLinkFindMany.mockResolvedValue([]);
    mockAgentFindUnique.mockResolvedValue({ organizationId: "org-1" });
    mockMissionFindUnique.mockResolvedValue(null);

    const result = await buildGoalPrompt("agent-1");

    expect(result).toBe("");
  });

  it("formats own goals correctly with priority label", async () => {
    mockGoalLinkFindMany.mockResolvedValue([
      { ...makeGoalLink("goal-1", "Boost revenue", 80, "ACTIVE", "OWNER"), goal: { id: "goal-1", title: "Boost revenue", description: null, successMetric: "ARR > $1M", priority: 80 } },
    ]);
    mockAgentFindUnique.mockResolvedValue({ organizationId: null });

    const result = await buildGoalPrompt("agent-1");

    expect(result).toContain("--- Company Goals & Objectives ---");
    expect(result).toContain("[HIGH] Boost revenue (OWNER)");
    expect(result).toContain("Metric: ARR > $1M");
    expect(result).toContain("---");
  });

  it("includes mission statement when available", async () => {
    mockGoalLinkFindMany.mockResolvedValue([makeGoalLink("goal-1", "Some goal")]);
    mockAgentFindUnique.mockResolvedValue({ organizationId: "org-1" });
    mockMissionFindUnique.mockResolvedValue({
      id: "mission-1",
      organizationId: "org-1",
      statement: "Build the best AI platform",
      vision: null,
      values: [],
    });

    const result = await buildGoalPrompt("agent-1");

    expect(result).toContain("Mission: Build the best AI platform");
  });

  it("includes Inherited Goals section when parent goals present", async () => {
    mockGetAgentAncestors.mockResolvedValue(["parent-1"]);
    mockGoalLinkFindMany
      .mockResolvedValueOnce([makeGoalLink("goal-1", "Own goal", 60)])
      .mockResolvedValueOnce([makeGoalLink("goal-2", "Parent goal", 50)]);
    mockAgentFindUnique.mockResolvedValue({ organizationId: null });

    const result = await buildGoalPrompt("agent-1");

    expect(result).toContain("Your Goals:");
    expect(result).toContain("Inherited Goals (from parent agent):");
    expect(result).toContain("[MEDIUM] Parent goal");
  });
});

describe("getMissionForOrg", () => {
  it("returns null when no mission configured", async () => {
    mockMissionFindUnique.mockResolvedValue(null);

    const result = await getMissionForOrg("org-1");

    expect(result).toBeNull();
  });

  it("returns mission when configured", async () => {
    const mission = { id: "m1", organizationId: "org-1", statement: "Our mission", vision: null, values: [] };
    mockMissionFindUnique.mockResolvedValue(mission);

    const result = await getMissionForOrg("org-1");

    expect(result).toEqual(mission);
    expect(mockMissionFindUnique).toHaveBeenCalledWith({ where: { organizationId: "org-1" } });
  });
});
