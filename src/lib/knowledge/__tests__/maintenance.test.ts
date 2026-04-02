import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  kBSource: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({ logger: mockLogger }));

import { resetStuckSources } from "../maintenance";

// ── resetStuckSources ─────────────────────────────────────────────────────────

describe("resetStuckSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros and empty list when no stuck sources exist", async () => {
    mockPrisma.kBSource.findMany.mockResolvedValueOnce([]);

    const result = await resetStuckSources();

    expect(result).toEqual({ resetCount: 0, sourceIds: [] });
    expect(mockPrisma.kBSource.updateMany).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it("resets stuck sources and returns their IDs", async () => {
    const stuckIds = ["src-1", "src-2", "src-3"];
    mockPrisma.kBSource.findMany.mockResolvedValueOnce(
      stuckIds.map((id) => ({ id }))
    );
    mockPrisma.kBSource.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await resetStuckSources();

    expect(result.resetCount).toBe(3);
    expect(result.sourceIds).toEqual(stuckIds);

    expect(mockPrisma.kBSource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: stuckIds } },
      data: {
        status: "FAILED",
        errorMsg: "Ingest timed out — please retry",
      },
    });
  });

  it("queries with the correct PROCESSING status filter and cutoff date", async () => {
    mockPrisma.kBSource.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    await resetStuckSources(15);
    const after = Date.now();

    const call = mockPrisma.kBSource.findMany.mock.calls[0][0] as {
      where: {
        status: string;
        updatedAt: { lt: Date };
      };
    };

    expect(call.where.status).toBe("PROCESSING");

    const cutoff = call.where.updatedAt.lt.getTime();
    // Cutoff should be ~15 minutes ago
    const expectedMinMs = before - 15 * 60 * 1000 - 100;
    const expectedMaxMs = after - 15 * 60 * 1000 + 100;
    expect(cutoff).toBeGreaterThanOrEqual(expectedMinMs);
    expect(cutoff).toBeLessThanOrEqual(expectedMaxMs);
  });

  it("uses the default 10-minute window when no argument is provided", async () => {
    mockPrisma.kBSource.findMany.mockResolvedValueOnce([]);

    const before = Date.now();
    await resetStuckSources();
    const after = Date.now();

    const call = mockPrisma.kBSource.findMany.mock.calls[0][0] as {
      where: { updatedAt: { lt: Date } };
    };

    const cutoff = call.where.updatedAt.lt.getTime();
    const expectedMinMs = before - 10 * 60 * 1000 - 100;
    const expectedMaxMs = after - 10 * 60 * 1000 + 100;
    expect(cutoff).toBeGreaterThanOrEqual(expectedMinMs);
    expect(cutoff).toBeLessThanOrEqual(expectedMaxMs);
  });

  it("logs correctly when sources are reset", async () => {
    mockPrisma.kBSource.findMany.mockResolvedValueOnce([{ id: "abc" }]);
    mockPrisma.kBSource.updateMany.mockResolvedValueOnce({ count: 1 });

    await resetStuckSources(5);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Stuck KB sources reset to FAILED",
      expect.objectContaining({
        resetCount: 1,
        sourceIds: ["abc"],
        olderThanMinutes: 5,
      })
    );
  });

  it("propagates Prisma errors without swallowing them", async () => {
    mockPrisma.kBSource.findMany.mockRejectedValueOnce(
      new Error("DB connection failed")
    );

    await expect(resetStuckSources()).rejects.toThrow("DB connection failed");
  });
});
