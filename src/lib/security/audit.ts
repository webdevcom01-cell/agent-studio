import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "EXECUTE" | "ACCESS";

interface AuditEntry {
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        before: entry.before ? JSON.parse(JSON.stringify(entry.before)) : undefined,
        after: entry.after ? JSON.parse(JSON.stringify(entry.after)) : undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("Failed to write audit log", err, {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
    });
  }
}

export function auditAgentCreate(
  userId: string,
  agentId: string,
  agentData: unknown,
  req?: { ip?: string; userAgent?: string }
): void {
  writeAuditLog({
    userId,
    action: "CREATE",
    resourceType: "Agent",
    resourceId: agentId,
    after: agentData,
    ipAddress: req?.ip,
    userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditAgentDelete(
  userId: string,
  agentId: string,
  agentData: unknown,
  req?: { ip?: string; userAgent?: string }
): void {
  writeAuditLog({
    userId,
    action: "DELETE",
    resourceType: "Agent",
    resourceId: agentId,
    before: agentData,
    ipAddress: req?.ip,
    userAgent: req?.userAgent,
  }).catch(() => {});
}

export function auditSkillAccess(
  userId: string,
  skillId: string,
  agentId: string
): void {
  writeAuditLog({
    userId,
    action: "ACCESS",
    resourceType: "Skill",
    resourceId: skillId,
    after: { agentId },
  }).catch(() => {});
}

export function auditExecution(
  agentId: string,
  executionId: string,
  status: string,
  userId?: string
): void {
  writeAuditLog({
    userId,
    action: "EXECUTE",
    resourceType: "AgentExecution",
    resourceId: executionId,
    after: { agentId, status },
  }).catch(() => {});
}
