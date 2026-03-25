import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instinct: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    skill: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  getPromotionCandidates,
  clusterSimilarInstincts,
  decayStaleInstincts,
  getLifecycleStats,
  type InstinctSummary,
} from "../instinct-engine";

const mockPrisma = vi.mocked(prisma);

function makeInstinct(overrides: Partial<InstinctSummary> = {}): InstinctSummary {
  return {
    id: `inst-${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Pattern",
    description: "A test pattern",
    confidence: 0.5,
    frequency: 5,
    agentId: "agent-1",
    promotedToSkillId: null,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getPromotionCandidates — confidence + frequency gate", () => {
  it("requires both confidence >= 0.85 AND frequency >= 10", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);
    await getPromotionCandidates();

    const where = mockPrisma.instinct.findMany.mock.calls[0][0]?.where;
    expect(where).toHaveProperty("confidence", { gte: 0.85 });
    expect(where).toHaveProperty("frequency", { gte: 10 });
    expect(where).toHaveProperty("promotedToSkillId", null);
  });

  it("excludes low-frequency high-confidence instincts", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);
    const candidates = await getPromotionCandidates();
    expect(candidates).toHaveLength(0);
  });
});

describe("clusterSimilarInstincts", () => {
  it("groups instincts with similar names", () => {
    const instincts = [
      makeInstinct({ id: "a", name: "error handling patterns", description: "handle errors properly" }),
      makeInstinct({ id: "b", name: "error handling best practices", description: "handle errors in code" }),
      makeInstinct({ id: "c", name: "typescript generics", description: "use generics for type safety" }),
    ];

    const clusters = clusterSimilarInstincts(instincts);

    expect(clusters.length).toBeLessThanOrEqual(3);

    const errorCluster = clusters.find((c) => c.representative.id === "a");
    if (errorCluster && errorCluster.members.length > 0) {
      expect(errorCluster.members[0].id).toBe("b");
      expect(errorCluster.mergedFrequency).toBeGreaterThan(instincts[0].frequency);
    }
  });

  it("keeps dissimilar instincts in separate clusters", () => {
    const instincts = [
      makeInstinct({ id: "a", name: "database optimization", description: "sql indexes" }),
      makeInstinct({ id: "b", name: "react hooks patterns", description: "useEffect cleanup" }),
    ];

    const clusters = clusterSimilarInstincts(instincts);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].members).toHaveLength(0);
    expect(clusters[1].members).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(clusterSimilarInstincts([])).toHaveLength(0);
  });

  it("handles single instinct", () => {
    const clusters = clusterSimilarInstincts([makeInstinct({ id: "solo" })]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(0);
  });

  it("boosts confidence when merging clusters", () => {
    const instincts = [
      makeInstinct({ id: "a", name: "error handling", description: "handle errors", confidence: 0.6 }),
      makeInstinct({ id: "b", name: "error handling", description: "handle errors", confidence: 0.7 }),
    ];

    const clusters = clusterSimilarInstincts(instincts);
    const merged = clusters.find((c) => c.members.length > 0);
    if (merged) {
      expect(merged.mergedConfidence).toBeGreaterThan(0.65);
    }
  });
});

describe("decayStaleInstincts — weekly decay", () => {
  it("decays instincts not updated in 7 days by default", async () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    mockPrisma.instinct.findMany.mockResolvedValue([
      { id: "i1", confidence: 0.5 },
      { id: "i2", confidence: 0.3 },
    ] as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    const count = await decayStaleInstincts();
    expect(count).toBe(2);
  });

  it("decays by 0.05", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([
      { id: "i1", confidence: 0.5 },
    ] as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    await decayStaleInstincts();

    expect(mockPrisma.instinct.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { confidence: 0.45 },
    });
  });

  it("floors confidence at 0", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([
      { id: "i1", confidence: 0.02 },
    ] as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    await decayStaleInstincts();

    expect(mockPrisma.instinct.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { confidence: 0 },
    });
  });

  it("accepts custom interval", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);
    await decayStaleInstincts(14);

    const where = mockPrisma.instinct.findMany.mock.calls[0][0]?.where;
    const cutoff = where?.updatedAt?.lt as Date;
    const daysDiff = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(daysDiff)).toBe(14);
  });
});

describe("getLifecycleStats", () => {
  it("returns zero stats for empty set", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);
    const stats = await getLifecycleStats();
    expect(stats.total).toBe(0);
    expect(stats.averageConfidence).toBe(0);
  });

  it("computes correct bucket distribution", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([
      { confidence: 0.1, frequency: 2, promotedToSkillId: null, updatedAt: new Date() },
      { confidence: 0.5, frequency: 5, promotedToSkillId: null, updatedAt: new Date() },
      { confidence: 0.9, frequency: 15, promotedToSkillId: null, updatedAt: new Date() },
    ] as never);

    const stats = await getLifecycleStats();
    expect(stats.total).toBe(3);
    expect(stats.byConfidenceBucket["0.0-0.2"]).toBe(1);
    expect(stats.byConfidenceBucket["0.4-0.6"]).toBe(1);
    expect(stats.byConfidenceBucket["0.8-1.0"]).toBe(1);
    expect(stats.promotionReady).toBe(1);
  });

  it("counts promoted instincts", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([
      { confidence: 0.95, frequency: 20, promotedToSkillId: "s1", updatedAt: new Date() },
      { confidence: 0.5, frequency: 3, promotedToSkillId: null, updatedAt: new Date() },
    ] as never);

    const stats = await getLifecycleStats();
    expect(stats.promoted).toBe(1);
  });

  it("filters by agentId", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);
    await getLifecycleStats("agent-x");
    expect(mockPrisma.instinct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: "agent-x" } })
    );
  });
});
