/**
 * syncSchedulesFromFlow
 *
 * Called automatically after a flow is deployed. Scans the deployed FlowContent
 * for `schedule_trigger` nodes and keeps the FlowSchedule table in sync:
 *
 *   • UPSERT  — creates or updates a FlowSchedule for each schedule_trigger node
 *               (matched by agentId + nodeId via raw SQL until prisma generate runs)
 *   • DISABLE — disables schedules whose nodeId no longer exists in the flow
 *               (soft-delete: keeps history, just sets enabled=false)
 *
 * Schedules created manually via API (nodeId = null) are never touched.
 *
 * Note: nodeId is a new column added in the latest schema migration.
 * Raw SQL is used for nodeId reads/writes because the local generated Prisma
 * client won't include it until `prisma generate` runs on Vercel deploy.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { computeNextRunAt } from "./cron-validator";
import type { FlowContent } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleNodeData {
  scheduleType?: string;
  cronExpression?: string;
  intervalMinutes?: number;
  timezone?: string;
  enabled?: boolean;
  label?: string;
  maxRetries?: number;
}

interface ExistingScheduleRow {
  id: string;
  node_id: string;
  schedule_type: string;
  cron_expression: string | null;
  interval_minutes: number | null;
  timezone: string;
  enabled: boolean;
  label: string | null;
  max_retries: number;
}

interface SyncResult {
  created: number;
  updated: number;
  disabled: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type ValidScheduleType = "CRON" | "INTERVAL" | "MANUAL";

const SCHEDULE_TYPE_MAP: Record<string, ValidScheduleType> = {
  cron: "CRON",
  interval: "INTERVAL",
  manual: "MANUAL",
  CRON: "CRON",
  INTERVAL: "INTERVAL",
  MANUAL: "MANUAL",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNodeData(raw: unknown): ScheduleNodeData {
  if (!raw || typeof raw !== "object") return {};
  return raw as ScheduleNodeData;
}

function normalizeScheduleType(raw: unknown): ValidScheduleType {
  return SCHEDULE_TYPE_MAP[String(raw ?? "")] ?? "MANUAL";
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Sync FlowSchedule records for an agent based on the deployed flow content.
 * Uses raw SQL for nodeId operations (new column not yet in generated types).
 */
export async function syncSchedulesFromFlow(
  agentId: string,
  flowContent: FlowContent,
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, disabled: 0 };

  // ── Find all schedule_trigger nodes ────────────────────────────────────────
  const scheduleNodes = flowContent.nodes.filter(
    (n) => n.type === "schedule_trigger",
  );

  // ── Load existing node-linked schedules via raw SQL ────────────────────────
  const existing = await prisma.$queryRaw<ExistingScheduleRow[]>(
    Prisma.sql`
      SELECT id, "nodeId" AS node_id, "scheduleType" AS schedule_type,
             "cronExpression" AS cron_expression, "intervalMinutes" AS interval_minutes,
             timezone, enabled, label, "maxRetries" AS max_retries
      FROM "FlowSchedule"
      WHERE "agentId" = ${agentId} AND "nodeId" IS NOT NULL
    `,
  );

  const existingByNodeId = new Map(existing.map((s) => [s.node_id, s]));
  const processedNodeIds = new Set<string>();

  // ── Upsert each schedule_trigger node ──────────────────────────────────────
  for (const node of scheduleNodes) {
    const nodeId = node.id;
    const raw = parseNodeData(node.data);
    const scheduleType = normalizeScheduleType(raw.scheduleType);
    const timezone = raw.timezone || "UTC";
    const cronExpression =
      scheduleType === "CRON" ? (raw.cronExpression ?? null) : null;
    const intervalMinutes =
      scheduleType === "INTERVAL" ? (Number(raw.intervalMinutes) || 60) : null;
    const enabled = raw.enabled !== false;
    const label = raw.label ?? null;
    const maxRetries = Number(raw.maxRetries ?? 3);

    const nextRunAt = computeNextRunAt({
      scheduleType,
      cronExpression,
      intervalMinutes,
      timezone,
    });

    processedNodeIds.add(nodeId);
    const existingRecord = existingByNodeId.get(nodeId);

    if (!existingRecord) {
      // CREATE via raw SQL to include nodeId
      try {
        await prisma.$executeRaw`
          INSERT INTO "FlowSchedule" (
            "id", "agentId", "nodeId", "scheduleType", "cronExpression",
            "intervalMinutes", "timezone", "enabled", "label", "maxRetries",
            "nextRunAt", "failureCount", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid()::text, ${agentId}, ${nodeId}, ${scheduleType}::"ScheduleType",
            ${cronExpression}, ${intervalMinutes}, ${timezone}, ${enabled},
            ${label}, ${maxRetries}, ${nextRunAt}, 0, NOW(), NOW()
          )
          ON CONFLICT ("agentId", "nodeId") DO NOTHING
        `;
        result.created++;
        logger.info("schedule_sync_created", { agentId, nodeId, scheduleType });
      } catch (err) {
        logger.warn("schedule_sync_create_failed", { agentId, nodeId, err });
      }
    } else {
      // UPDATE — only if something meaningful changed
      const configChanged =
        existingRecord.schedule_type !== scheduleType ||
        existingRecord.cron_expression !== cronExpression ||
        existingRecord.interval_minutes !== intervalMinutes ||
        existingRecord.timezone !== timezone ||
        existingRecord.label !== label ||
        existingRecord.max_retries !== maxRetries;

      const enabledChanged = existingRecord.enabled !== enabled;

      if (configChanged || enabledChanged) {
        const failureReset = enabledChanged && enabled ? 0 : undefined;
        await prisma.$executeRaw`
          UPDATE "FlowSchedule"
          SET "scheduleType" = ${scheduleType}::"ScheduleType",
              "cronExpression" = ${cronExpression},
              "intervalMinutes" = ${intervalMinutes},
              "timezone" = ${timezone},
              "label" = ${label},
              "maxRetries" = ${maxRetries},
              "enabled" = ${enabled},
              "nextRunAt" = CASE WHEN ${configChanged} THEN ${nextRunAt} ELSE "nextRunAt" END,
              "failureCount" = CASE WHEN ${failureReset !== undefined} THEN 0 ELSE "failureCount" END,
              "updatedAt" = NOW()
          WHERE id = ${existingRecord.id}
        `;
        result.updated++;
        logger.info("schedule_sync_updated", { agentId, nodeId, scheduleType });
      }
    }
  }

  // ── Disable node-linked schedules whose node was removed ───────────────────
  for (const [nodeId, record] of existingByNodeId) {
    if (!processedNodeIds.has(nodeId) && record.enabled) {
      await prisma.$executeRaw`
        UPDATE "FlowSchedule" SET "enabled" = false, "updatedAt" = NOW()
        WHERE id = ${record.id}
      `;
      result.disabled++;
      logger.info("schedule_sync_disabled", { agentId, nodeId });
    }
  }

  logger.info("schedule_sync_complete", { agentId, ...result });
  return result;
}
