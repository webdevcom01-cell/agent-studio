/**
 * Zod schemas for Schedule API request bodies.
 *
 * Used by:
 *   POST   /api/agents/[agentId]/schedules
 *   PATCH  /api/agents/[agentId]/schedules/[scheduleId]
 */

import { z } from "zod";
import {
  validateCronExpression,
  validateIntervalMinutes,
  validateTimezone,
} from "./cron-validator";

// ─── Shared field definitions ─────────────────────────────────────────────────

const scheduleTypeSchema = z.enum(["CRON", "INTERVAL", "MANUAL"], {
  errorMap: () => ({ message: "scheduleType must be CRON, INTERVAL, or MANUAL" }),
});

const _cronExpressionSchema = z
  .string()
  .trim()
  .min(1, "Cron expression is required")
  .refine(
    (expr) => validateCronExpression(expr).valid,
    (expr) => ({ message: validateCronExpression(expr).error ?? "Invalid cron expression" }),
  );

const _intervalMinutesSchema = z
  .number()
  .int("Interval must be a whole number of minutes")
  .refine(
    (m) => validateIntervalMinutes(m).valid,
    (m) => ({ message: validateIntervalMinutes(m).error ?? "Invalid interval" }),
  );

const timezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine(
    (tz) => validateTimezone(tz).valid,
    (tz) => ({ message: validateTimezone(tz).error ?? "Invalid timezone" }),
  );

const labelSchema = z
  .string()
  .trim()
  .max(120, "Label must be 120 characters or fewer")
  .optional();

// ─── Create schedule ──────────────────────────────────────────────────────────

/**
 * Validates the body of POST /api/agents/[agentId]/schedules.
 *
 * Cross-field rules:
 *   CRON     → cronExpression is required
 *   INTERVAL → intervalMinutes is required
 *   MANUAL   → neither field is required
 */
export const CreateScheduleSchema = z
  .object({
    scheduleType: scheduleTypeSchema,
    cronExpression: z.string().trim().optional(),
    intervalMinutes: z.number().int().optional(),
    timezone: timezoneSchema.default("UTC"),
    enabled: z.boolean().default(true),
    label: labelSchema,
    maxRetries: z.number().int().min(0).max(10).default(3),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleType === "CRON") {
      if (!data.cronExpression) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cronExpression"],
          message: "cronExpression is required when scheduleType is CRON",
        });
        return;
      }
      const validation = validateCronExpression(data.cronExpression);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cronExpression"],
          message: validation.error ?? "Invalid cron expression",
        });
      }
    }

    if (data.scheduleType === "INTERVAL") {
      if (data.intervalMinutes === undefined || data.intervalMinutes === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervalMinutes"],
          message: "intervalMinutes is required when scheduleType is INTERVAL",
        });
        return;
      }
      const validation = validateIntervalMinutes(data.intervalMinutes);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervalMinutes"],
          message: validation.error ?? "Invalid interval",
        });
      }
    }
  });

export type CreateScheduleInput = z.infer<typeof CreateScheduleSchema>;

// ─── Update schedule ──────────────────────────────────────────────────────────

/**
 * Validates the body of PATCH /api/agents/[agentId]/schedules/[scheduleId].
 * All fields are optional — only provided fields are updated.
 */
export const UpdateScheduleSchema = z
  .object({
    scheduleType: scheduleTypeSchema.optional(),
    cronExpression: z.string().trim().optional(),
    intervalMinutes: z.number().int().optional(),
    timezone: timezoneSchema.optional(),
    enabled: z.boolean().optional(),
    label: labelSchema,
    maxRetries: z.number().int().min(0).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    // Only validate cross-field rules when scheduleType is explicitly set
    if (data.scheduleType === "CRON" && data.cronExpression !== undefined) {
      const validation = validateCronExpression(data.cronExpression);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cronExpression"],
          message: validation.error ?? "Invalid cron expression",
        });
      }
    }

    if (data.scheduleType === "INTERVAL" && data.intervalMinutes !== undefined) {
      const validation = validateIntervalMinutes(data.intervalMinutes);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervalMinutes"],
          message: validation.error ?? "Invalid interval",
        });
      }
    }

    if (data.timezone !== undefined) {
      const validation = validateTimezone(data.timezone);
      if (!validation.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["timezone"],
          message: validation.error ?? "Invalid timezone",
        });
      }
    }
  });

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleSchema>;

// ─── Preview request ──────────────────────────────────────────────────────────

/** Used by the property panel to fetch a live cron preview. */
export const CronPreviewRequestSchema = z.object({
  scheduleType: scheduleTypeSchema,
  cronExpression: z.string().trim().optional(),
  intervalMinutes: z.number().int().optional(),
  timezone: z.string().trim().default("UTC"),
});

export type CronPreviewRequest = z.infer<typeof CronPreviewRequestSchema>;
