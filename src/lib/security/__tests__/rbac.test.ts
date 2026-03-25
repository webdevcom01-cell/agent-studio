import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentSkillPermission: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { checkSkillAccess, grantSkillAccess, revokeSkillAccess, getAgentSkills } from "../rbac";

const mockPrisma = vi.mocked(prisma);

describe("checkSkillAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when granted level meets required level", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "EXECUTE",
    } as never);

    expect(await checkSkillAccess("a1", "s1", "READ")).toBe(true);
    expect(await checkSkillAccess("a1", "s1", "EXECUTE")).toBe(true);
  });

  it("returns false when granted level is below required", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "READ",
    } as never);

    expect(await checkSkillAccess("a1", "s1", "EXECUTE")).toBe(false);
    expect(await checkSkillAccess("a1", "s1", "ADMIN")).toBe(false);
  });

  it("returns false when no permission exists", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue(null);

    expect(await checkSkillAccess("a1", "s1", "READ")).toBe(false);
  });

  it("ADMIN access satisfies all levels", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "ADMIN",
    } as never);

    expect(await checkSkillAccess("a1", "s1", "READ")).toBe(true);
    expect(await checkSkillAccess("a1", "s1", "EXECUTE")).toBe(true);
    expect(await checkSkillAccess("a1", "s1", "ADMIN")).toBe(true);
  });
});

describe("grantSkillAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts permission record", async () => {
    mockPrisma.agentSkillPermission.upsert.mockResolvedValue({} as never);

    await grantSkillAccess("a1", "s1", "EXECUTE");

    expect(mockPrisma.agentSkillPermission.upsert).toHaveBeenCalledWith({
      where: { agentId_skillId: { agentId: "a1", skillId: "s1" } },
      create: { agentId: "a1", skillId: "s1", accessLevel: "EXECUTE" },
      update: { accessLevel: "EXECUTE" },
    });
  });
});

describe("revokeSkillAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes permission record", async () => {
    mockPrisma.agentSkillPermission.deleteMany.mockResolvedValue({ count: 1 } as never);

    await revokeSkillAccess("a1", "s1");

    expect(mockPrisma.agentSkillPermission.deleteMany).toHaveBeenCalledWith({
      where: { agentId: "a1", skillId: "s1" },
    });
  });
});

describe("getAgentSkills", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all skill permissions for an agent", async () => {
    mockPrisma.agentSkillPermission.findMany.mockResolvedValue([
      { skillId: "s1", accessLevel: "READ" },
      { skillId: "s2", accessLevel: "EXECUTE" },
    ] as never);

    const skills = await getAgentSkills("a1");
    expect(skills).toHaveLength(2);
    expect(skills[0].skillId).toBe("s1");
  });
});
