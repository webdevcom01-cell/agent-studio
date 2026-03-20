import { prisma } from "@/lib/prisma";
import { PrismaClient } from "@/generated/prisma";
import { generateChangesSummary, computeFlowDiff } from "./diff-engine";
import type { FlowContent } from "@/types";
import { parseFlowContent } from "@/lib/validators/flow-content";
import { syncSchedulesFromFlow } from "@/lib/scheduler/sync";
import { syncWebhooksFromFlow } from "@/lib/webhooks/sync";
import { logger } from "@/lib/logger";
import type { FlowDiff } from "./diff-engine";
import type {
  FlowVersion,
  FlowDeployment,
  FlowVersionStatus,
} from "@/generated/prisma";

type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const MIN_VERSION_INTERVAL_MS = 30_000;

export class VersionService {
  static async createVersion(
    flowId: string,
    content: FlowContent,
    userId?: string,
    label?: string,
    tx?: TransactionClient
  ): Promise<FlowVersion> {
    const db = tx ?? prisma;
    const lastVersion = await db.flowVersion.findFirst({
      where: { flowId },
      orderBy: { version: "desc" },
    });

    if (lastVersion) {
      const timeSinceLast =
        Date.now() - lastVersion.createdAt.getTime();
      const lastContent = parseFlowContent(lastVersion.content);
      const hasChanges =
        JSON.stringify(lastContent) !== JSON.stringify(content);

      if (timeSinceLast < MIN_VERSION_INTERVAL_MS && !hasChanges) {
        return lastVersion;
      }
    }

    const nextVersion = (lastVersion?.version ?? 0) + 1;

    const changesSummary = lastVersion
      ? generateChangesSummary(
          parseFlowContent(lastVersion.content),
          content
        )
      : null;

    return db.flowVersion.create({
      data: {
        flowId,
        version: nextVersion,
        label: label ?? null,
        content: JSON.parse(JSON.stringify(content)),
        status: "DRAFT",
        changesSummary: changesSummary
          ? JSON.parse(JSON.stringify(changesSummary))
          : undefined,
        createdById: userId ?? null,
      },
    });
  }

  static async listVersions(flowId: string): Promise<FlowVersion[]> {
    return prisma.flowVersion.findMany({
      where: { flowId },
      orderBy: { version: "desc" },
      include: {
        _count: { select: { deployments: true, conversations: true } },
      },
    });
  }

  static async getVersion(versionId: string): Promise<FlowVersion | null> {
    return prisma.flowVersion.findUnique({
      where: { id: versionId },
    });
  }

  static async diffVersions(
    versionId1: string,
    versionId2: string
  ): Promise<FlowDiff> {
    const [v1, v2] = await Promise.all([
      prisma.flowVersion.findUniqueOrThrow({ where: { id: versionId1 } }),
      prisma.flowVersion.findUniqueOrThrow({ where: { id: versionId2 } }),
    ]);

    return computeFlowDiff(
      parseFlowContent(v1.content),
      parseFlowContent(v2.content)
    );
  }

  static async rollbackToVersion(
    flowId: string,
    targetVersionId: string,
    userId?: string
  ): Promise<FlowVersion> {
    const targetVersion = await prisma.flowVersion.findUniqueOrThrow({
      where: { id: targetVersionId },
    });

    const content = parseFlowContent(targetVersion.content);

    return VersionService.createVersion(
      flowId,
      content,
      userId,
      `Rollback to v${targetVersion.version}`
    );
  }

  static async deployVersion(
    agentId: string,
    versionId: string,
    userId?: string,
    note?: string
  ): Promise<FlowDeployment> {
    const version = await prisma.flowVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { flow: true },
    });

    const content = parseFlowContent(version.content);

    return prisma.$transaction(async (tx) => {
      await tx.flowVersion.updateMany({
        where: {
          flowId: version.flowId,
          status: "PUBLISHED" as FlowVersionStatus,
        },
        data: { status: "ARCHIVED" as FlowVersionStatus },
      });

      await tx.flowVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED" as FlowVersionStatus },
      });

      await tx.flow.update({
        where: { id: version.flowId },
        data: {
          activeVersionId: versionId,
          content: JSON.parse(JSON.stringify(content)),
        },
      });

      return tx.flowDeployment.create({
        data: {
          agentId,
          flowVersionId: versionId,
          deployedById: userId ?? null,
          note: note ?? null,
        },
      });
    }).then((deployment) => {
      // Fire-and-forget: sync FlowSchedule records from deployed flow nodes.
      // Runs after the transaction commits so it never blocks the deploy response.
      syncSchedulesFromFlow(agentId, content).catch((err) =>
        logger.warn("schedule_sync_error_on_deploy", { agentId, versionId, err }),
      );
      // Fire-and-forget: sync WebhookConfig records from deployed webhook_trigger nodes.
      syncWebhooksFromFlow(agentId, content).catch((err) =>
        logger.warn("webhook_sync_error_on_deploy", { agentId, versionId, err }),
      );
      return deployment;
    });
  }

  /**
   * Deletes ARCHIVED FlowVersions older than `retentionDays`.
   * PUBLISHED and DRAFT versions are never deleted.
   * Returns the count of deleted versions.
   *
   * @param retentionDays - Days to retain archived versions (default 90)
   * @param dryRun - If true, returns count without deleting
   */
  static async cleanupArchivedVersions(
    retentionDays = 90,
    dryRun = false
  ): Promise<{ deleted: number; dryRun: boolean }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const candidates = await prisma.flowVersion.findMany({
      where: {
        status: "ARCHIVED" as FlowVersionStatus,
        createdAt: { lt: cutoff },
      },
      select: { id: true, flowId: true, version: true, createdAt: true },
    });

    if (dryRun || candidates.length === 0) {
      return { deleted: candidates.length, dryRun };
    }

    const candidateIds = candidates.map((v) => v.id);

    const result = await prisma.flowVersion.deleteMany({
      where: { id: { in: candidateIds } },
    });

    logger.info("FlowVersion cleanup complete", {
      deleted: result.count,
      retentionDays,
      cutoffDate: cutoff.toISOString(),
    });

    return { deleted: result.count, dryRun: false };
  }

  static async getActiveVersion(
    agentId: string
  ): Promise<FlowVersion | null> {
    const flow = await prisma.flow.findUnique({
      where: { agentId },
      select: { activeVersionId: true },
    });

    if (!flow?.activeVersionId) return null;

    return prisma.flowVersion.findUnique({
      where: { id: flow.activeVersionId },
    });
  }
}
