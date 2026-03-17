/**
 * Cron Validator & Utilities
 *
 * Provides validation, human-readable descriptions, and next-run computation
 * for schedule_trigger nodes.
 *
 * Libraries:
 *   cron-parser  — parses cron expressions, computes next/prev dates with TZ
 *   cronstrue    — converts cron expressions to human-readable English
 *
 * Timezone handling: uses IANA timezone strings (e.g. "Europe/Belgrade").
 * Validation uses the Intl API (Node.js 18+, no extra dependency).
 */

import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";
import type { ScheduleType } from "@/generated/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface ScheduleConfig {
  scheduleType: ScheduleType;
  cronExpression?: string | null;
  intervalMinutes?: number | null;
  timezone?: string | null;
}

export interface CronPreview {
  /** Human-readable description, e.g. "At 09:00 AM, only on Monday" */
  description: string;
  /** Next 3 upcoming run times in the schedule's timezone (ISO strings) */
  nextRuns: string[];
  /** Whether the expression parsed successfully */
  valid: boolean;
  error?: string;
}

// ─── Timezone validation ──────────────────────────────────────────────────────

/**
 * Validates an IANA timezone string using the built-in Intl API.
 * No external dependency required — works in Node.js 18+.
 */
export function validateTimezone(tz: string): ValidationResult {
  if (!tz || tz.trim() === "") {
    return { valid: false, error: "Timezone is required." };
  }
  try {
    // This throws a RangeError if the timezone is invalid
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: `"${tz}" is not a valid IANA timezone (e.g. "Europe/Belgrade", "America/New_York", "UTC").`,
    };
  }
}

/**
 * Returns a list of common IANA timezones for the UI autocomplete.
 * Uses Intl.supportedValuesOf if available (Node.js 18+), with a safe fallback.
 */
export function getSupportedTimezones(): string[] {
  try {
    return (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf?.("timeZone") ?? TIMEZONE_FALLBACK;
  } catch {
    return TIMEZONE_FALLBACK;
  }
}

/** Common timezones fallback (used if Intl.supportedValuesOf is unavailable) */
const TIMEZONE_FALLBACK = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Belgrade",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// ─── Cron expression validation ───────────────────────────────────────────────

/**
 * Validates a cron expression using cron-parser.
 * Supports standard 5-field cron (minute hour day month weekday).
 * Rejects expressions with seconds field (6-field) for simplicity.
 */
export function validateCronExpression(expr: string): ValidationResult {
  if (!expr || expr.trim() === "") {
    return { valid: false, error: "Cron expression is required." };
  }

  const trimmed = expr.trim();
  const fields = trimmed.split(/\s+/);

  if (fields.length !== 5) {
    return {
      valid: false,
      error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}. Example: "0 9 * * 1"`,
    };
  }

  try {
    CronExpressionParser.parse(trimmed);
    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid cron expression: ${msg}` };
  }
}

/**
 * Validates an interval in minutes.
 * Range: 1–10080 (1 minute to 1 week).
 */
export function validateIntervalMinutes(minutes: number): ValidationResult {
  if (!Number.isInteger(minutes) || minutes < 1) {
    return { valid: false, error: "Interval must be at least 1 minute." };
  }
  if (minutes > 10_080) {
    return { valid: false, error: "Interval cannot exceed 10,080 minutes (1 week)." };
  }
  return { valid: true };
}

// ─── Human-readable description ───────────────────────────────────────────────

/**
 * Converts a cron expression to a human-readable English description.
 * Returns null if the expression is invalid.
 */
export function formatCronHuman(expr: string): string | null {
  if (!validateCronExpression(expr).valid) return null;
  try {
    return cronstrue.toString(expr.trim(), {
      use24HourTimeFormat: false,
      verbose: false,
    });
  } catch {
    return null;
  }
}

/**
 * Converts an interval in minutes to a human-readable string.
 * Examples: 1 → "Every minute", 60 → "Every hour", 1440 → "Every day"
 */
export function formatIntervalHuman(minutes: number): string {
  if (minutes === 1) return "Every minute";
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes < 1440) {
    const hours = minutes / 60;
    return Number.isInteger(hours)
      ? `Every ${hours} hour${hours !== 1 ? "s" : ""}`
      : `Every ${minutes} minutes`;
  }
  if (minutes === 1440) return "Every day";
  if (minutes < 10_080) {
    const days = minutes / 1440;
    return Number.isInteger(days)
      ? `Every ${days} day${days !== 1 ? "s" : ""}`
      : `Every ${minutes} minutes`;
  }
  if (minutes === 10_080) return "Every week";
  return `Every ${minutes} minutes`;
}

// ─── Next run computation ─────────────────────────────────────────────────────

/**
 * Computes the next N run times for a schedule configuration.
 * Returns UTC Date objects.
 */
export function computeNextRuns(
  config: ScheduleConfig,
  count = 3,
  from = new Date(),
): Date[] {
  const tz = config.timezone ?? "UTC";

  if (config.scheduleType === "CRON" && config.cronExpression) {
    if (!validateCronExpression(config.cronExpression).valid) return [];
    try {
      const interval = CronExpressionParser.parse(config.cronExpression.trim(), {
        currentDate: from,
        tz,
      });
      const runs: Date[] = [];
      for (let i = 0; i < count; i++) {
        runs.push(interval.next().toDate());
      }
      return runs;
    } catch {
      return [];
    }
  }

  if (config.scheduleType === "INTERVAL" && config.intervalMinutes) {
    const { valid } = validateIntervalMinutes(config.intervalMinutes);
    if (!valid) return [];
    const ms = config.intervalMinutes * 60_000;
    return Array.from({ length: count }, (_, i) => new Date(from.getTime() + ms * (i + 1)));
  }

  return []; // MANUAL — no automatic runs
}

/**
 * Computes the single next run time (UTC Date) for a schedule.
 * Returns null if the schedule is MANUAL or the configuration is invalid.
 */
export function computeNextRunAt(config: ScheduleConfig, from = new Date()): Date | null {
  const runs = computeNextRuns(config, 1, from);
  return runs[0] ?? null;
}

/**
 * Generates a full preview for the UI property panel:
 * human-readable description + next 3 run ISO strings.
 */
export function buildCronPreview(config: ScheduleConfig): CronPreview {
  if (config.scheduleType === "MANUAL") {
    return {
      description: "Triggered manually only — no automatic runs.",
      nextRuns: [],
      valid: true,
    };
  }

  if (config.scheduleType === "INTERVAL") {
    const minutes = config.intervalMinutes ?? 0;
    const validation = validateIntervalMinutes(minutes);
    if (!validation.valid) {
      return { description: "", nextRuns: [], valid: false, error: validation.error };
    }
    const nextRuns = computeNextRuns(config, 3).map((d) => d.toISOString());
    return {
      description: formatIntervalHuman(minutes),
      nextRuns,
      valid: true,
    };
  }

  // CRON
  const expr = config.cronExpression ?? "";
  const validation = validateCronExpression(expr);
  if (!validation.valid) {
    return { description: "", nextRuns: [], valid: false, error: validation.error };
  }

  const tzValidation = validateTimezone(config.timezone ?? "UTC");
  if (!tzValidation.valid) {
    return { description: "", nextRuns: [], valid: false, error: tzValidation.error };
  }

  const description = formatCronHuman(expr) ?? "";
  const nextRuns = computeNextRuns(config, 3).map((d) => d.toISOString());

  return { description, nextRuns, valid: true };
}
