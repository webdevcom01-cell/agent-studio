import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    instinct: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    skill: {
      upsert: vi.fn(),
    },
    humanApprovalRequest: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  getPromotionCandidates,
  promoteInstinctToSkill,
  requestInstinctPromotion,
} from "../instinct-engine";

const mockPrisma = vi.mocked(prisma);

describe("getPromotionCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns instincts above promotion threshold", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([
      {
        id: "i1",
        name: "Error Handling",
        description: "Always handle errors",
        confidence: 0.9,
        frequency: 15,
        agentId: "a1",
        promotedToSkillId: null,
      },
    ] as never);

    const candidates = await getPromotionCandidates();

    expect(candidates).toHaveLength(1);
    expect(candidates[0].instinct.name).toBe("Error Handling");
    expect(candidates[0].skillSlug).toBe("instinct-error-handling");
  });

  it("filters by agentId when provided", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);

    await getPromotionCandidates("agent-123");

    const call = mockPrisma.instinct.findMany.mock.calls[0][0];
    expect(call?.where).toHaveProperty("agentId", "agent-123");
  });

  it("returns empty array when no candidates exist", async () => {
    mockPrisma.instinct.findMany.mockResolvedValue([]);

    const candidates = await getPromotionCandidates();
    expect(candidates).toHaveLength(0);
  });
});

describe("promoteInstinctToSkill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a skill and links it to the instinct", async () => {
    mockPrisma.instinct.findUniqueOrThrow.mockResolvedValue({
      id: "i1",
      name: "TDD First",
      description: "Always write tests first",
      confidence: 0.92,
      frequency: 20,
      promotedToSkillId: null,
    } as never);

    mockPrisma.skill.upsert.mockResolvedValue({ id: "s1" } as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    const result = await promoteInstinctToSkill("i1", "# TDD First\n\nContent");

    expect(result.skillId).toBe("s1");
    expect(mockPrisma.skill.upsert).toHaveBeenCalledOnce();
    expect(mockPrisma.instinct.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { promotedToSkillId: "s1" },
    });
  });

  it("returns existing skill if already promoted", async () => {
    mockPrisma.instinct.findUniqueOrThrow.mockResolvedValue({
      id: "i1",
      name: "Already Promoted",
      description: "desc",
      confidence: 0.95,
      frequency: 30,
      promotedToSkillId: "existing-skill-id",
    } as never);

    const result = await promoteInstinctToSkill("i1", "content");

    expect(result.skillId).toBe("existing-skill-id");
    expect(mockPrisma.skill.upsert).not.toHaveBeenCalled();
  });

  it("generates correct slug from instinct name", async () => {
    mockPrisma.instinct.findUniqueOrThrow.mockResolvedValue({
      id: "i2",
      name: "Error Handling Best Practices",
      description: "desc",
      confidence: 0.88,
      frequency: 10,
      promotedToSkillId: null,
    } as never);

    mockPrisma.skill.upsert.mockResolvedValue({ id: "s2" } as never);
    mockPrisma.instinct.update.mockResolvedValue({} as never);

    await promoteInstinctToSkill("i2", "content");

    const upsertCall = mockPrisma.skill.upsert.mock.calls[0][0];
    expect(upsertCall.where.slug).toBe("instinct-error-handling-best-practices");
  });
});

describe("requestInstinctPromotion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a HumanApprovalRequest and does NOT create a Skill", async () => {
    mockPrisma.instinct.findUniqueOrThrow.mockResolvedValue({
      id: "i1",
      name: "TDD First",
      description: "Always write tests first",
      confidence: 0.92,
      agentId: "a1",
    } as never);

    mockPrisma.humanApprovalRequest.create.mockResolvedValue({
      id: "req-1",
    } as never);

    const result = await requestInstinctPromotion("i1", "# TDD First\n\nContent");

    expect(result.approvalRequestId).toBe("req-1");
    expect(mockPrisma.humanApprovalRequest.create).toHaveBeenCalledOnce();
    expect(mockPrisma.skill.upsert).not.toHaveBeenCalled();
  });

  it("stores correct contextData in the approval request", async () => {
    mockPrisma.instinct.findUniqueOrThrow.mockResolvedValue({
      id: "i2",
      name: "Error Handling",
      description: "Always handle errors",
      confidence: 0.88,
      agentId: "a2",
    } as never);

    mockPrisma.humanApprovalRequest.create.mockResolvedValue({
      id: "req-2",
    } as never);

    await requestInstinctPromotion("i2", "skill-body");

    const createCall = mockPrisma.humanApprovalRequest.create.mock.calls[0][0];
    expect(createCall.data.contextData).toMatchObject({
      type: "instinct_promotion",
      instinctId: "i2",
      skillContent: "skill-body",
      confidence: 0.88,
    });
  });
});
