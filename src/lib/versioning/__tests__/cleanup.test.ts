import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    flowVersion: {
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    flow: { findUnique: vi.fn() },
    flowDeployment: { create: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../diff-engine", () => ({
  generateChangesSummary: vi.fn(),
  computeFlowDiff: vi.fn(),
}));

vi.mock("@/lib/validators/flow-content", () => ({
  parseFlowContent: vi.fn((c: unknown) => c),
}));

vi.mock("@/lib/scheduler/sync", () => ({
  syncSchedulesFromFlow: vi.fn(),
}));

vi.mock("@/lib/webhooks/sync", () => ({
  syncWebhooksFromFlow: vi.fn(),
}));

import { VersionService } from "../version-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VersionService.cleanupArchivedVersions", () => {
  it("deletes ARCHIVED versions older than retention period", async () => {
    const oldVersions = [
      { id: "v1", flowId: "f1", version: 1, createdAt: new Date("2025-01-01") },
      { id: "v2", flowId: "f1", version: 2, createdAt: new Date("2025-06-01") },
    ];
    mockFindMany.mockResolvedValue(oldVersions);
    mockDeleteMany.mockResolvedValue({ count: 2 });

    const result = await VersionService.cleanupArchivedVersions(90);

    expect(result.deleted).toBe(2);
    expect(result.dryRun).toBe(false);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["v1", "v2"] } },
    });
  });

  it("only queries ARCHIVED status", async () => {
    mockFindMany.mockResolvedValue([]);

    await VersionService.cleanupArchivedVersions(90);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ARCHIVED",
        }),
      })
    );
  });

  it("uses correct cutoff date", async () => {
    mockFindMany.mockResolvedValue([]);

    const before = Date.now();
    await VersionService.cleanupArchivedVersions(30);
    const after = Date.now();

    const where = mockFindMany.mock.calls[0][0].where;
    const cutoff = where.createdAt.lt.getTime();
    const expected30Days = 30 * 24 * 60 * 60 * 1000;

    expect(before - cutoff).toBeGreaterThanOrEqual(expected30Days - 100);
    expect(after - cutoff).toBeLessThanOrEqual(expected30Days + 100);
  });

  it("returns count without deleting in dry-run mode", async () => {
    mockFindMany.mockResolvedValue([
      { id: "v1", flowId: "f1", version: 1, createdAt: new Date("2025-01-01") },
    ]);

    const result = await VersionService.cleanupArchivedVersions(90, true);

    expect(result.deleted).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 0 when no versions match", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await VersionService.cleanupArchivedVersions(90);

    expect(result.deleted).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("respects custom retention days", async () => {
    mockFindMany.mockResolvedValue([]);

    await VersionService.cleanupArchivedVersions(180);

    const where = mockFindMany.mock.calls[0][0].where;
    const cutoff = where.createdAt.lt.getTime();
    const expected180Days = 180 * 24 * 60 * 60 * 1000;

    expect(Math.abs(Date.now() - cutoff - expected180Days)).toBeLessThan(200);
  });

  it("never deletes PUBLISHED or DRAFT versions", async () => {
    mockFindMany.mockResolvedValue([]);
    await VersionService.cleanupArchivedVersions(90);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe("ARCHIVED");
  });
});
