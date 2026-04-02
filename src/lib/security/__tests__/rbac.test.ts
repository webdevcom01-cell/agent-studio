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

vi.mock("@/lib/security/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import {
  checkSkillAccess,
  enforceSkillAccess,
  withSkillAccess,
  listAccessibleSkills,
  grantSkillAccess,
  revokeSkillAccess,
  getAgentSkills,
  RBACError,
} from "../rbac";

const mockPrisma = vi.mocked(prisma);

// ── checkSkillAccess ─────────────────────────────────────────────────────────

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

// ── enforceSkillAccess ───────────────────────────────────────────────────────

describe("enforceSkillAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves silently when access is granted", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "EXECUTE",
    } as never);

    await expect(
      enforceSkillAccess("a1", "s1", "READ"),
    ).resolves.toBeUndefined();
  });

  it("throws RBACError when no permission exists", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue(null);

    await expect(
      enforceSkillAccess("a1", "s1", "READ"),
    ).rejects.toThrow(RBACError);
  });

  it("throws RBACError with correct fields", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "READ",
    } as never);

    try {
      await enforceSkillAccess("agent-1", "skill-1", "EXECUTE", "user-1");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RBACError);
      const rbacErr = err as RBACError;
      expect(rbacErr.agentId).toBe("agent-1");
      expect(rbacErr.skillId).toBe("skill-1");
      expect(rbacErr.requiredLevel).toBe("EXECUTE");
      expect(rbacErr.grantedLevel).toBe("READ");
    }
  });

  it("RBACError.name is 'RBACError'", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue(null);

    await expect(
      enforceSkillAccess("a1", "s1", "READ"),
    ).rejects.toMatchObject({ name: "RBACError" });
  });

  it("resolves when ADMIN is granted for EXECUTE requirement", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "ADMIN",
    } as never);

    await expect(
      enforceSkillAccess("a1", "s1", "EXECUTE"),
    ).resolves.toBeUndefined();
  });
});

// ── withSkillAccess ──────────────────────────────────────────────────────────

describe("withSkillAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes wrapped function when access granted", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "EXECUTE",
    } as never);

    const fn = vi.fn().mockResolvedValue("result");
    const result = await withSkillAccess("a1", "s1", "READ", fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe("result");
  });

  it("does NOT call wrapped function when access denied", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue(null);

    const fn = vi.fn().mockResolvedValue("result");

    await expect(
      withSkillAccess("a1", "s1", "READ", fn),
    ).rejects.toThrow(RBACError);

    expect(fn).not.toHaveBeenCalled();
  });

  it("propagates wrapped function errors", async () => {
    mockPrisma.agentSkillPermission.findUnique.mockResolvedValue({
      accessLevel: "ADMIN",
    } as never);

    const fn = vi.fn().mockRejectedValue(new Error("fn error"));

    await expect(
      withSkillAccess("a1", "s1", "READ", fn),
    ).rejects.toThrow("fn error");
  });
});

// ── listAccessibleSkills ─────────────────────────────────────────────────────

describe("listAccessibleSkills", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only skills at or above minimum level", async () => {
    mockPrisma.agentSkillPermission.findMany.mockResolvedValue([
      { skillId: "s1", accessLevel: "READ" },
      { skillId: "s2", accessLevel: "EXECUTE" },
      { skillId: "s3", accessLevel: "ADMIN" },
    ] as never);

    const skills = await listAccessibleSkills("a1", "EXECUTE");

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.skillId)).toEqual(["s2", "s3"]);
  });

  it("defaults to READ minimum and returns all", async () => {
    mockPrisma.agentSkillPermission.findMany.mockResolvedValue([
      { skillId: "s1", accessLevel: "READ" },
      { skillId: "s2", accessLevel: "EXECUTE" },
    ] as never);

    const skills = await listAccessibleSkills("a1");

    expect(skills).toHaveLength(2);
  });

  it("returns empty array when agent has no permissions", async () => {
    mockPrisma.agentSkillPermission.findMany.mockResolvedValue([] as never);

    const skills = await listAccessibleSkills("a1");
    expect(skills).toHaveLength(0);
  });
});

// ── grantSkillAccess ─────────────────────────────────────────────────────────

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

// ── revokeSkillAccess ────────────────────────────────────────────────────────

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

// ── getAgentSkills ───────────────────────────────────────────────────────────

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

// ── RBACError class ──────────────────────────────────────────────────────────

describe("RBACError", () => {
  it("is an instance of Error", () => {
    const err = new RBACError("a1", "s1", "EXECUTE", "READ");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RBACError);
  });

  it("message includes agent, skill and levels", () => {
    const err = new RBACError("my-agent", "my-skill", "ADMIN", null);
    expect(err.message).toContain("my-agent");
    expect(err.message).toContain("my-skill");
    expect(err.message).toContain("ADMIN");
  });

  it("grantedLevel is null when no permission", () => {
    const err = new RBACError("a1", "s1", "READ", null);
    expect(err.grantedLevel).toBeNull();
  });
});
