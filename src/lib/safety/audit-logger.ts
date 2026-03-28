import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface AuditEntry {
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Writes an entry to the AuditLog table for EU AI Act compliance.
 * Fire-and-forget — never blocks the calling flow.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<string | null> {
  try {
    const record = await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        before: entry.before
          ? (JSON.parse(JSON.stringify(entry.before)) as Record<string, string>)
          : undefined,
        after: entry.after
          ? (JSON.parse(JSON.stringify(entry.after)) as Record<string, string>)
          : undefined,
        timestamp: new Date(),
      },
    });

    return record.id;
  } catch (err) {
    logger.warn("Audit log write failed", {
      error: err instanceof Error ? err.message : String(err),
      action: entry.action,
    });
    return null;
  }
}
