import { prisma } from "@/lib/prisma";
import { withTenant, withAdminBypass } from "@/lib/api/tenant-context";
import { withOrgContext } from "@/lib/db/rls-middleware";
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
    tx?: TransactionClient,
    organizationId?: string | null
  ): Promise<FlowVersion> {
    // When not already inside a caller's transaction, establish org context so
    // the version insert satisfies RLS under enforcement. (Inside a tx, the
    // caller is responsible for having set org context.)
    if (!tx) {
      return withOrgContext(prisma, organizationId ?? null, (txx) =>
        VersionService.createVersion(
          flowId, content, userId, label, txx as unknown as TransactionClient,
        ),
      );
    }
    const db = tx;
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

  static async listVersions(
    flowId: string,
    organizationId: string | null = null
  ): Promise<FlowVersion[]> {
    return withOrgContext(prisma, organizationId, (tx) =>
      tx.flowVersion.findMany({
        where: { flowId },
        orderBy: { version: "desc" },
        include: {
          _count: { select: { deployments: true, conversations: true } },
        },
      }),
    );
  }

  static async getVersion(
    versionId: string,
    organizationId: string | null = null
  ): Promise<FlowVersion | null> {
    return withOrgContext(prisma, organizationId, (tx) =>
      tx.flowVersion.findUnique({
        where: { id: versionId },
      }),
    );
  }

  static async diffVersions(
    versionId1: string,
    versionId2: string,
    organizationId: string | null = null
  ): Promise<FlowDiff> {
    const [v1, v2] = await withOrgContext(prisma, organizationId, (tx) =>
      Promise.all([
        tx.flowVersion.findUniqueOrThrow({ where: { id: versionId1 } }),
        tx.flowVersion.findUniqueOrThrow({ where: { id: versionId2 } }),
      ]),
    );

    return computeFlowDiff(
      parseFlowContent(v1.content),
      parseFlowContent(v2.content)
    );
  }

  static async rollbackToVersion(
    flowId: string,
    targetVersionId: string,
    userId?: string,
    organizationId: string | null = null
  ): Promise<FlowVersion> {
    const targetVersion = await withOrgContext(prisma, organizationId, (tx) =>
      tx.flowVersion.findUniqueOrThrow({
        where: { id: targetVersionId },
      }),
    );

    const content = parseFlowContent(targetVersion.content);

    return VersionService.createVersion(
      flowId,
      content,
      userId,
      `Rollback to v${targetVersion.version}`,
      undefined,
      organizationId
    );
  }

  static async deployVersion(
    agentId: string,
    versionId: string,
    userId?: string,
    note?: string,
    organizationId: string | null = null
  ): Promise<FlowDeployment> {
    const version = await withOrgContext(prisma, organizationId, (tx) =>
      tx.flowVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: { flow: true },
      }),
    );

    const content = parseFlowContent(version.content);

    return withTenant(async (tx) => {
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
    }, organizationId).then((deployment) => {
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

    // Cross-tenant system sweep (cron/cleanup) — spans all orgs, so it runs
    // on the admin (BYPASSRLS) client rather than a single-org context.
    const candidates = await withAdminBypass((db) =>
      db.flowVersion.findMany({
        where: {
          status: "ARCHIVED" as FlowVersionStatus,
          createdAt: { lt: cutoff },
        },
        select: { id: true, flowId: true, version: true, createdAt: true },
      }),
    );

    if (dryRun || candidates.length === 0) {
      return { deleted: candidates.length, dryRun };
    }

    const candidateIds = candidates.map((v) => v.id);

    const result = await withAdminBypass((db) =>
      db.flowVersion.deleteMany({
        where: { id: { in: candidateIds } },
      }),
    );

    logger.info("FlowVersion cleanup complete", {
      deleted: result.count,
      retentionDays,
      cutoffDate: cutoff.toISOString(),
    });

    return { deleted: result.count, dryRun: false };
  }

  static async getActiveVersion(
    agentId: string,
    organizationId: string | null = null
  ): Promise<FlowVersion | null> {
    const flow = await withOrgContext(prisma, organizationId, (tx) =>
      tx.flow.findUnique({
        where: { agentId },
        select: { activeVersionId: true },
      }),
    );

    if (!flow?.activeVersionId) return null;

    return withOrgContext(prisma, organizationId, (tx) =>
      tx.flowVersion.findUnique({
        where: { id: flow.activeVersionId as string },
      }),
    );
  }
}
