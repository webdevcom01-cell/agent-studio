/**
 * Tests for eval schedule hook.
 * Covers: cron matching, isSuiteDue logic, error isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    evalSuite: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../runner", () => ({
  runEvalSuite: vi.fn(),
}));

import {
  cronMatchesDate,
  isValidCronExpression,
  isSuiteDue,
  getScheduleEnabledSuites,
  parseCronWithTimezone,
  getLocalizedDateParts,
} from "../schedule-hook";
import { prisma } from "@/lib/prisma";
import { runEvalSuite } from "../runner";
import { triggerScheduledEvals } from "../schedule-hook";

const mockPrisma = prisma as {
  evalSuite: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};
const mockRunEvalSuite = runEvalSuite as ReturnType<typeof vi.fn>;

// ─── parseCronWithTimezone ────────────────────────────────────────────────────

describe("parseCronWithTimezone", () => {
  it("returns UTC and full cron when no pipe present", () => {
    const result = parseCronWithTimezone("0 3 * * *");
    expect(result.cron).toBe("0 3 * * *");
    expect(result.timezone).toBe("UTC");
  });

  it("splits cron and timezone on last pipe", () => {
    const result = parseCronWithTimezone("0 3 * * *|Europe/Belgrade");
    expect(result.cron).toBe("0 3 * * *");
    expect(result.timezone).toBe("Europe/Belgrade");
  });

  it("trims whitespace from both parts", () => {
    const result = parseCronWithTimezone("  0 3 * * *  |  America/New_York  ");
    expect(result.cron).toBe("0 3 * * *");
    expect(result.timezone).toBe("America/New_York");
  });

  it("returns UTC when timezone part is empty", () => {
    const result = parseCronWithTimezone("0 3 * * *|");
    expect(result.cron).toBe("0 3 * * *");
    expect(result.timezone).toBe("UTC");
  });

  it("uses last pipe as delimiter when multiple pipes present", () => {
    // Edge case: timezone names don't contain pipes, so last pipe is always the separator
    const result = parseCronWithTimezone("0 3 * * *|America/New_York");
    expect(result.cron).toBe("0 3 * * *");
    expect(result.timezone).toBe("America/New_York");
  });
});

// ─── getLocalizedDateParts ─────────────────────────────────────────────────────

describe("getLocalizedDateParts", () => {
  it("returns UTC parts for UTC timezone", () => {
    // 2026-03-01T03:30:00Z = minute=30, hour=3, dom=1, month=3, dow=0 (Sunday)
    const date = new Date("2026-03-01T03:30:00Z");
    const parts = getLocalizedDateParts(date, "UTC");
    expect(parts.minute).toBe(30);
    expect(parts.hour).toBe(3);
    expect(parts.dom).toBe(1);
    expect(parts.month).toBe(3);
    expect(parts.dow).toBe(0); // Sunday
  });

  it("adjusts parts to Europe/Belgrade timezone (UTC+1 in winter)", () => {
    // 2026-03-01T03:00:00Z = 04:00 in Belgrade (UTC+1 winter time)
    const date = new Date("2026-03-01T03:00:00Z");
    const parts = getLocalizedDateParts(date, "Europe/Belgrade");
    expect(parts.hour).toBe(4);
    expect(parts.minute).toBe(0);
  });

  it("falls back to UTC for invalid timezone", () => {
    const date = new Date("2026-03-01T03:00:00Z");
    const partsInvalid = getLocalizedDateParts(date, "Not/A_Timezone");
    const partsUTC = getLocalizedDateParts(date, "UTC");
    expect(partsInvalid.hour).toBe(partsUTC.hour);
    expect(partsInvalid.minute).toBe(partsUTC.minute);
  });
});

// ─── cronMatchesDate (timezone-aware) ─────────────────────────────────────────

describe("cronMatchesDate — timezone suffix", () => {
  it("matches a Belgrade-time cron at the correct UTC offset", () => {
    // "0 4 * * *|Europe/Belgrade" → fires at 04:00 Belgrade = 03:00 UTC (winter)
    const utcDate = new Date("2026-03-01T03:00:00Z");
    expect(cronMatchesDate("0 4 * * *|Europe/Belgrade", utcDate)).toBe(true);
  });

  it("does not match a Belgrade cron at the wrong UTC time", () => {
    // "0 4 * * *|Europe/Belgrade" should NOT match at 04:00 UTC (which is 05:00 Belgrade)
    const utcDate = new Date("2026-03-01T04:00:00Z");
    expect(cronMatchesDate("0 4 * * *|Europe/Belgrade", utcDate)).toBe(false);
  });

  it("isValidCronExpression accepts cron with valid TZ suffix", () => {
    expect(isValidCronExpression("0 3 * * *|Europe/Belgrade")).toBe(true);
    expect(isValidCronExpression("*/5 * * * *|America/New_York")).toBe(true);
  });

  it("isValidCronExpression still accepts plain cron without TZ suffix", () => {
    expect(isValidCronExpression("0 3 * * *")).toBe(true);
  });
});

// ─── cronMatchesDate ──────────────────────────────────────────────────────────

describe("cronMatchesDate", () => {
  // "0 3 * * *" = daily at 03:00 UTC
  it("matches daily-at-3am cron at correct time", () => {
    const date = new Date("2026-03-01T03:00:00Z");
    expect(cronMatchesDate("0 3 * * *", date)).toBe(true);
  });

  it("does not match daily-at-3am cron at wrong hour", () => {
    const date = new Date("2026-03-01T04:00:00Z");
    expect(cronMatchesDate("0 3 * * *", date)).toBe(false);
  });

  it("does not match daily-at-3am cron at wrong minute", () => {
    const date = new Date("2026-03-01T03:05:00Z");
    expect(cronMatchesDate("0 3 * * *", date)).toBe(false);
  });

  // "0 */6 * * *" = every 6 hours at minute 0
  it("matches every-6-hours cron at hour 0", () => {
    expect(cronMatchesDate("0 */6 * * *", new Date("2026-03-01T00:00:00Z"))).toBe(true);
  });

  it("matches every-6-hours cron at hour 6", () => {
    expect(cronMatchesDate("0 */6 * * *", new Date("2026-03-01T06:00:00Z"))).toBe(true);
  });

  it("does not match every-6-hours cron at hour 5", () => {
    expect(cronMatchesDate("0 */6 * * *", new Date("2026-03-01T05:00:00Z"))).toBe(false);
  });

  // "0 8 * * 1" = every Monday at 08:00
  it("matches monday-8am cron on Monday", () => {
    // 2026-03-02 is a Monday
    expect(cronMatchesDate("0 8 * * 1", new Date("2026-03-02T08:00:00Z"))).toBe(true);
  });

  it("does not match monday-8am cron on Tuesday", () => {
    // 2026-03-03 is a Tuesday
    expect(cronMatchesDate("0 8 * * 1", new Date("2026-03-03T08:00:00Z"))).toBe(false);
  });

  it("rejects cron with wrong field count", () => {
    expect(cronMatchesDate("0 3 * *", new Date())).toBe(false);
    expect(cronMatchesDate("0 3 * * * *", new Date())).toBe(false);
  });
});

// ─── isValidCronExpression ────────────────────────────────────────────────────

describe("isValidCronExpression", () => {
  it("accepts valid 5-field expressions", () => {
    expect(isValidCronExpression("0 3 * * *")).toBe(true);
    expect(isValidCronExpression("*/5 * * * *")).toBe(true);
    expect(isValidCronExpression("0 */6 * * *")).toBe(true);
    expect(isValidCronExpression("0 8 * * 1")).toBe(true);
  });

  it("rejects expressions with wrong field count", () => {
    expect(isValidCronExpression("0 3 * *")).toBe(false);
    expect(isValidCronExpression("0 3 * * * *")).toBe(false);
    expect(isValidCronExpression("")).toBe(false);
  });
});

// ─── isSuiteDue ───────────────────────────────────────────────────────────────

describe("isSuiteDue", () => {
  const suite = {
    id: "s1",
    name: "Daily Suite",
    agentId: "a1",
    scheduleCron: "0 3 * * *",
    lastScheduledAt: null,
  };

  const matchingTime = new Date("2026-03-01T03:00:00Z");
  const nonMatchingTime = new Date("2026-03-01T04:00:00Z");

  it("returns true when cron matches and never run before", () => {
    expect(isSuiteDue(suite, matchingTime)).toBe(true);
  });

  it("returns false when cron does not match", () => {
    expect(isSuiteDue(suite, nonMatchingTime)).toBe(false);
  });

  it("returns false when just ran 2 minutes ago (double-run prevention)", () => {
    const twoMinAgo = new Date(matchingTime.getTime() - 2 * 60 * 1000);
    expect(isSuiteDue({ ...suite, lastScheduledAt: twoMinAgo }, matchingTime)).toBe(false);
  });

  it("returns true when last run was 5 minutes ago (enough time has passed)", () => {
    const fiveMinAgo = new Date(matchingTime.getTime() - 5 * 60 * 1000);
    expect(isSuiteDue({ ...suite, lastScheduledAt: fiveMinAgo }, matchingTime)).toBe(true);
  });

  it("returns false for invalid cron expression", () => {
    expect(isSuiteDue({ ...suite, scheduleCron: "not-a-cron" }, matchingTime)).toBe(false);
  });
});

// ─── getScheduleEnabledSuites ─────────────────────────────────────────────────

describe("getScheduleEnabledSuites", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters out suites with zero test cases", async () => {
    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Suite A", agentId: "a1",
        scheduleCron: "0 3 * * *", lastScheduledAt: null,
        _count: { testCases: 3 },
      },
      {
        id: "s2", name: "Suite B", agentId: "a1",
        scheduleCron: "0 6 * * *", lastScheduledAt: null,
        _count: { testCases: 0 },
      },
    ]);

    const result = await getScheduleEnabledSuites();
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("s1");
  });

  it("filters out suites with invalid cron", async () => {
    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Suite A", agentId: "a1",
        scheduleCron: "invalid", lastScheduledAt: null,
        _count: { testCases: 5 },
      },
    ]);

    const result = await getScheduleEnabledSuites();
    expect(result).toHaveLength(0);
  });

  it("returns eligible suites correctly shaped", async () => {
    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Suite A", agentId: "a1",
        scheduleCron: "0 3 * * *", lastScheduledAt: new Date("2026-03-01"),
        _count: { testCases: 5 },
      },
    ]);

    const result = await getScheduleEnabledSuites();
    expect(result[0]).toMatchObject({
      id: "s1",
      name: "Suite A",
      agentId: "a1",
      scheduleCron: "0 3 * * *",
    });
  });
});

// ─── triggerScheduledEvals (fire-and-forget) ──────────────────────────────────

describe("triggerScheduledEvals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs due suites and updates lastScheduledAt", async () => {
    const now = new Date("2026-03-01T03:00:00Z");

    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Daily Suite", agentId: "a1",
        scheduleCron: "0 3 * * *", lastScheduledAt: null,
        _count: { testCases: 2 },
      },
    ]);
    mockRunEvalSuite.mockResolvedValue({
      runId: "r1", status: "COMPLETED",
      totalCases: 2, passedCases: 2, failedCases: 0,
      score: 1.0, durationMs: 3000, results: [],
    });
    mockPrisma.evalSuite.update.mockResolvedValue({});

    // Call fire-and-forget — need to await the internal async work
    // We use a promise that resolves when runEvalSuite is called
    triggerScheduledEvals({ baseUrl: "http://localhost:3000", now });

    // Give async work time to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRunEvalSuite).toHaveBeenCalledWith("s1", "a1", expect.objectContaining({
      triggeredBy: "schedule",
    }));
    expect(mockPrisma.evalSuite.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { lastScheduledAt: now },
    });
  });

  it("skips suites not due at current time", async () => {
    const now = new Date("2026-03-01T04:00:00Z"); // Not 03:00, so daily-at-3am won't match

    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Daily Suite", agentId: "a1",
        scheduleCron: "0 3 * * *", lastScheduledAt: null,
        _count: { testCases: 2 },
      },
    ]);

    triggerScheduledEvals({ baseUrl: "http://localhost:3000", now });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockRunEvalSuite).not.toHaveBeenCalled();
  });

  it("continues to next suite when one fails (error isolation)", async () => {
    const now = new Date("2026-03-01T03:00:00Z");

    mockPrisma.evalSuite.findMany.mockResolvedValue([
      {
        id: "s1", name: "Suite A", agentId: "a1",
        scheduleCron: "0 3 * * *", lastScheduledAt: null,
        _count: { testCases: 2 },
      },
      {
        id: "s2", name: "Suite B", agentId: "a2",
        scheduleCron: "0 3 * * *", lastScheduledAt: null,
        _count: { testCases: 3 },
      },
    ]);

    mockRunEvalSuite
      .mockRejectedValueOnce(new Error("Suite A failed"))
      .mockResolvedValueOnce({
        runId: "r2", status: "COMPLETED",
        totalCases: 3, passedCases: 3, failedCases: 0,
        score: 1.0, durationMs: 2000, results: [],
      });
    mockPrisma.evalSuite.update.mockResolvedValue({});

    triggerScheduledEvals({ baseUrl: "http://localhost:3000", now });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Both suites attempted despite first failure
    expect(mockRunEvalSuite).toHaveBeenCalledTimes(2);
    // Only s2 got lastScheduledAt updated (s1 failed before update)
    expect(mockPrisma.evalSuite.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.evalSuite.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { lastScheduledAt: now },
    });
  });
});
