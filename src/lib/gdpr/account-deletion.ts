/**
 * GDPR Account Deletion — soft delete with 30-day grace period.
 *
 * Flow:
 *  1. requestDeletion() — marks user for deletion, sets 30-day deadline
 *  2. cancelDeletion() — removes deletion request within grace period
 *  3. executeHardDelete() — permanently removes all user data (called by cron)
 */

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/client";
import { logger } from "@/lib/logger";

const GRACE_PERIOD_DAYS = 30;

export async function requestDeletion(userId: string): Promise<{
  scheduledFor: Date;
}> {
  const scheduledFor = new Date(
    Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: new Date(),
      deletionScheduledFor: scheduledFor,
    },
    select: { email: true, name: true },
  });

  await sendEmail({
    to: user.email,
    subject: "Account deletion requested — Agent Studio",
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #dc2626;">Account Deletion Scheduled</h1>
        <p>Hi ${user.name ?? "there"},</p>
        <p>Your account deletion has been scheduled. All your data will be permanently deleted on <strong>${scheduledFor.toLocaleDateString()}</strong>.</p>
        <p>If this was a mistake, you can cancel the deletion from your account settings before that date.</p>
        <p style="color: #888; font-size: 14px; margin-top: 32px;">— Agent Studio</p>
      </div>
    `,
  });

  logger.info("Account deletion requested", { userId, scheduledFor });

  return { scheduledFor };
}

export async function cancelDeletion(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true },
  });

  if (!user?.deletionRequestedAt) {
    return false;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: null,
      deletionScheduledFor: null,
    },
  });

  logger.info("Account deletion cancelled", { userId });
  return true;
}

export async function executeHardDelete(userId: string): Promise<{
  deletedCounts: Record<string, number>;
}> {
  const counts: Record<string, number> = {};

  // Delete in dependency order (children first)
  const agents = await prisma.agent.findMany({
    where: { userId },
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);

  if (agentIds.length > 0) {
    // Cascade handles most child records via Prisma relations
    const deleted = await prisma.agent.deleteMany({
      where: { userId },
    });
    counts.agents = deleted.count;
  }

  const mcpDeleted = await prisma.mCPServer.deleteMany({
    where: { userId },
  });
  counts.mcpServers = mcpDeleted.count;

  const cliDeleted = await prisma.cLIGeneration.deleteMany({
    where: { userId },
  });
  counts.cliGenerations = cliDeleted.count;

  const orgMembers = await prisma.organizationMember.deleteMany({
    where: { userId },
  });
  counts.orgMemberships = orgMembers.count;

  // Delete audit logs for this user
  const audits = await prisma.auditLog.deleteMany({
    where: { userId },
  });
  counts.auditLogs = audits.count;

  // Finally delete the user (cascades accounts, sessions)
  await prisma.user.delete({ where: { id: userId } });
  counts.user = 1;

  logger.info("Hard delete completed", { userId, counts });

  return { deletedCounts: counts };
}

/**
 * Find users whose grace period has expired — called by cleanup cron job.
 */
export async function findUsersScheduledForDeletion(): Promise<
  { id: string; email: string }[]
> {
  return prisma.user.findMany({
    where: {
      deletionScheduledFor: { lte: new Date() },
      deletionRequestedAt: { not: null },
    },
    select: { id: true, email: true },
  });
}
