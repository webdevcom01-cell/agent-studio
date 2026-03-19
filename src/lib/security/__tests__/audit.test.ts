import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import {
  writeAuditLog,
  auditAgentCreate,
  auditAgentDelete,
  auditSkillAccess,
  auditExecution,
} from "../audit";

const mockPrisma = vi.mocked(prisma);

describe("writeAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes an audit entry to the database", async () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);

    await writeAuditLog({
      userId: "user-1",
      action: "CREATE",
      resourceType: "Agent",
      resourceId: "agent-1",
      after: { name: "Test Agent" },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        action: "CREATE",
        resourceType: "Agent",
        resourceId: "agent-1",
      }),
    });
  });

  it("handles database errors without throwing", async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error("DB error"));

    await expect(
      writeAuditLog({
        action: "DELETE",
        resourceType: "Agent",
        resourceId: "agent-1",
      })
    ).resolves.toBeUndefined();
  });

  it("accepts optional ipAddress and userAgent", async () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);

    await writeAuditLog({
      action: "ACCESS",
      resourceType: "Skill",
      resourceId: "skill-1",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      }),
    });
  });
});

describe("audit helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auditAgentCreate writes CREATE action", () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);
    auditAgentCreate("user-1", "agent-1", { name: "New Agent" });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("auditAgentDelete writes DELETE action", () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);
    auditAgentDelete("user-1", "agent-1", { name: "Old Agent" });
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("auditSkillAccess writes ACCESS action", () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);
    auditSkillAccess("user-1", "skill-1", "agent-1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it("auditExecution writes EXECUTE action", () => {
    mockPrisma.auditLog.create.mockResolvedValue({} as never);
    auditExecution("agent-1", "exec-1", "SUCCESS", "user-1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });
});
