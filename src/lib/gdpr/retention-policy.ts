/**
 * GDPR Retention Policy — automated cleanup of stale data.
 *
 * Policies:
 *  - Conversations: delete after 90 days of inactivity
 *  - Execution logs (WebhookExecution): delete after 30 days
 *  - Audit logs: archive after 1 year (delete after 2 years)
 *
 * Called by weekly BullMQ cron job.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CONVERSATION_RETENTION_DAYS = 90;
const EXECUTION_RETENTION_DAYS = 30;
const AUDIT_RETENTION_DAYS = 730; // 2 years

interface RetentionResult {
  conversations: number;
  executions: number;
  auditLogs: number;
}

export async function runRetentionCleanup(): Promise<RetentionResult> {
  const now = new Date();

  // Stale conversations (no messages in 90 days)
  const conversationCutoff = new Date(
    now.getTime() - CONVERSATION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const staleConversations = await prisma.conversation.deleteMany({
    where: {
      updatedAt: { lt: conversationCutoff },
      status: { not: "ACTIVE" },
    },
  });

  // Old webhook executions
  const executionCutoff = new Date(
    now.getTime() - EXECUTION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const oldExecutions = await prisma.webhookExecution.deleteMany({
    where: {
      triggeredAt: { lt: executionCutoff },
    },
  });

  // Very old audit logs
  const auditCutoff = new Date(
    now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const oldAudits = await prisma.auditLog.deleteMany({
    where: {
      timestamp: { lt: auditCutoff },
    },
  });

  const result: RetentionResult = {
    conversations: staleConversations.count,
    executions: oldExecutions.count,
    auditLogs: oldAudits.count,
  };

  logger.info("Retention cleanup completed", {
    conversations: result.conversations,
    executions: result.executions,
    auditLogs: result.auditLogs,
  });

  return result;
}

export { CONVERSATION_RETENTION_DAYS, EXECUTION_RETENTION_DAYS, AUDIT_RETENTION_DAYS };
