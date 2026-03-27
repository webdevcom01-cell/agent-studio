/**
 * Eval Schedule Hook
 *
 * Identifies eval suites that are due for a scheduled run and triggers them.
 * Called from the cron endpoint (POST /api/evals/scheduled) every 5 minutes.
 *
 * Cron matching strategy:
 *   - Parse scheduleCron using manual cron field matching (no external deps)
 *   - Suite is "due" when: scheduleEnabled=true, has test cases, and
 *     the current time falls within the cron schedule window
 *     (haven't run since the last expected occurrence)
 *
 * Design decisions:
 *   - Fire-and-forget: same pattern as deploy-hook (void runScheduledEvals)
 *   - Sequential suites: avoid parallel rate-limit pressure
 *   - Error isolation: one suite failure never blocks the rest
 *   - "schedule" triggeredBy label: visible in run history
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runEvalSuite } from "./runner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleHookOptions {
  /** Full base URL for internal chat API calls */
  baseUrl: string;
  /** Auth cookie forwarded from the cron request */
  authHeader?: string;
  /** Override "now" for testing */
  now?: Date;
}

export interface EligibleSuite {
  id: string;
  name: string;
  agentId: string;
  scheduleCron: string;
  lastScheduledAt: Date | null;
}

// ─── Cron matching ─────────────────────────────────────────────────────────────

/**
 * Parse a cron field string (e.g. star/5, "3", "1-5", "*") and check
 * if a given numeric value matches.
 */
function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  // Step values: */n
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Range: n-m
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    if (isNaN(start) || isNaN(end)) return false;
    return value >= start && value <= end;
  }

  // List: n,m,k
  if (field.includes(",")) {
    return field.split(",").map(Number).includes(value);
  }

  // Single value
  const num = parseInt(field, 10);
  return !isNaN(num) && num === value;
}

/**
 * Check if a cron expression matches a given Date.
 * Supports: minute, hour, day-of-month, month, day-of-week (5-field standard cron).
 * Does NOT support seconds or named months/weekdays.
 */
export function cronMatchesDate(cron: string, date: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minuteField, hourField, domField, monthField, dowField] = fields as [
    string, string, string, string, string,
  ];

  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const dom = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // 1-12
  const dow = date.getUTCDay(); // 0=Sunday

  return (
    matchesCronField(minuteField, minute) &&
    matchesCronField(hourField, hour) &&
    matchesCronField(domField, dom) &&
    matchesCronField(monthField, month) &&
    matchesCronField(dowField, dow)
  );
}

/**
 * Validate a cron expression string (5 fields, basic syntax).
 * Returns true if the expression is syntactically valid.
 */
export function isValidCronExpression(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, month, dow] = fields;
  // Each field must be non-empty
  return Boolean(min && hour && dom && month && dow);
}

/**
 * Determine if a suite is due for a scheduled run.
 * A suite is due when:
 *   1. scheduleEnabled is true
 *   2. scheduleCron matches the current minute window
 *   3. lastScheduledAt is null OR was more than 55 minutes ago (for hourly+),
 *      or more than 4 minutes ago (for sub-hourly), to prevent double-runs.
 *
 * In practice, the cron service calls every 5 minutes, so we check if the
 * cron expression fires at the current UTC time. If so — and we haven't run
 * in at least (interval - 5 min) — we run.
 */
export function isSuiteDue(suite: EligibleSuite, now: Date): boolean {
  if (!isValidCronExpression(suite.scheduleCron)) return false;
  if (!cronMatchesDate(suite.scheduleCron, now)) return false;

  // If never run, it's definitely due
  if (!suite.lastScheduledAt) return true;

  // Prevent double-run: must be at least 4 minutes since last run
  // (the cron service fires every 5 min — 1 min buffer)
  const msSinceLastRun = now.getTime() - suite.lastScheduledAt.getTime();
  return msSinceLastRun >= 4 * 60 * 1000;
}

// ─── Suite query ──────────────────────────────────────────────────────────────

/**
 * Get all eval suites that are schedule-enabled and have at least one test case.
 * Exported for unit testing.
 */
// Internal shape returned by the Prisma query
interface RawScheduledSuite {
  id: string;
  name: string;
  agentId: string;
  scheduleCron: string | null;
  lastScheduledAt: Date | null;
  _count: { testCases: number };
}

export async function getScheduleEnabledSuites(): Promise<EligibleSuite[]> {
  const suites = (await prisma.evalSuite.findMany({
    where: {
      scheduleEnabled: true,
      scheduleCron: { not: null },
    },
    select: {
      id: true,
      name: true,
      agentId: true,
      scheduleCron: true,
      lastScheduledAt: true,
      _count: { select: { testCases: true } },
    },
  })) as RawScheduledSuite[];

  // Filter to suites that actually have test cases + valid cron
  return suites
    .filter(
      (s) =>
        s._count.testCases > 0 &&
        s.scheduleCron !== null &&
        isValidCronExpression(s.scheduleCron),
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      agentId: s.agentId,
      scheduleCron: s.scheduleCron as string,
      lastScheduledAt: s.lastScheduledAt,
    }));
}

// ─── Runner ───────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: trigger scheduled eval runs for all due suites.
 * Returns immediately — all work happens asynchronously.
 */
export function triggerScheduledEvals(options: ScheduleHookOptions): void {
  void runScheduledEvals(options);
}

async function runScheduledEvals({
  baseUrl,
  authHeader,
  now = new Date(),
}: ScheduleHookOptions): Promise<void> {
  let suites: EligibleSuite[];
  try {
    suites = await getScheduleEnabledSuites();
  } catch (err) {
    logger.error("schedule-hook: failed to query scheduled suites", { err });
    return;
  }

  const due = suites.filter((s) => isSuiteDue(s, now));

  if (due.length === 0) {
    logger.info("schedule-hook: no suites due at this time", { checkedCount: suites.length });
    return;
  }

  logger.info("schedule-hook: starting scheduled eval runs", {
    dueCount: due.length,
    totalEnabled: suites.length,
  });

  for (const suite of due) {
    try {
      logger.info("schedule-hook: running suite", {
        suiteId: suite.id,
        suiteName: suite.name,
        agentId: suite.agentId,
        cron: suite.scheduleCron,
      });

      const summary = await runEvalSuite(suite.id, suite.agentId, {
        baseUrl,
        triggeredBy: "schedule",
        authHeader,
      });

      // Update lastScheduledAt after successful run
      await prisma.evalSuite.update({
        where: { id: suite.id },
        data: { lastScheduledAt: now },
      });

      logger.info("schedule-hook: suite finished", {
        suiteId: suite.id,
        runId: summary.runId,
        score: summary.score,
        passed: summary.passedCases,
        failed: summary.failedCases,
      });
    } catch (err) {
      // Never let one suite failure block the next
      logger.error("schedule-hook: suite run failed", {
        suiteId: suite.id,
        agentId: suite.agentId,
        err,
      });
    }
  }

  logger.info("schedule-hook: all scheduled suites processed", { dueCount: due.length });
}
