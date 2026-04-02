import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockDeleteMany = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    agent: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    mCPServer: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cLIGeneration: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    organizationMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    conversation: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    webhookExecution: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
  },
}));

vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  requestDeletion,
  cancelDeletion,
  executeHardDelete,
  findUsersScheduledForDeletion,
} from "../account-deletion";
import { runRetentionCleanup } from "../retention-policy";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Account Deletion", () => {
  it("requestDeletion sets 30-day deadline and sends email", async () => {
    mockUpdate.mockResolvedValueOnce({ email: "user@test.com", name: "Alice" });

    const result = await requestDeletion("user-1");

    expect(result.scheduledFor).toBeInstanceOf(Date);
    const daysDiff = (result.scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBeGreaterThan(29);
    expect(daysDiff).toBeLessThan(31);
  });

  it("cancelDeletion clears deletion fields", async () => {
    mockFindUnique.mockResolvedValueOnce({ deletionRequestedAt: new Date() });
    mockUpdate.mockResolvedValueOnce({});

    const result = await cancelDeletion("user-1");
    expect(result).toBe(true);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { deletionRequestedAt: null, deletionScheduledFor: null },
      }),
    );
  });

  it("cancelDeletion returns false when no pending request", async () => {
    mockFindUnique.mockResolvedValueOnce({ deletionRequestedAt: null });

    const result = await cancelDeletion("user-1");
    expect(result).toBe(false);
  });

  it("executeHardDelete removes all user data", async () => {
    mockDelete.mockResolvedValueOnce({});

    const result = await executeHardDelete("user-1");

    expect(result.deletedCounts.user).toBe(1);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("findUsersScheduledForDeletion queries expired grace periods", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "u1", email: "a@b.com" }]);

    const users = await findUsersScheduledForDeletion();
    expect(users).toHaveLength(1);
  });
});

describe("Retention Policy", () => {
  it("cleans up stale conversations, executions, and audit logs", async () => {
    const result = await runRetentionCleanup();

    expect(result.conversations).toBe(3);
    expect(result.executions).toBe(5);
    expect(result.auditLogs).toBe(0);
  });
});
