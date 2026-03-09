import { prisma } from "@/lib/prisma";
import { generateChangesSummary, computeFlowDiff } from "./diff-engine";
import type { FlowContent } from "@/types";
import type { FlowDiff } from "./diff-engine";
import type {
  FlowVersion,
  FlowDeployment,
  FlowVersionStatus,
} from "@/generated/prisma";

const MIN_VERSION_INTERVAL_MS = 30_000;

export class VersionService {
  static async createVersion(
    flowId: string,
    content: FlowContent,
    userId?: string,
    label?: string
  ): Promise<FlowVersion> {
    const lastVersion = await prisma.flowVersion.findFirst({
      where: { flowId },
      orderBy: { version: "desc" },
    });

    if (lastVersion) {
      const timeSinceLast =
        Date.now() - lastVersion.createdAt.getTime();
      const lastContent = lastVersion.content as unknown as FlowContent;
      const hasChanges =
        JSON.stringify(lastContent) !== JSON.stringify(content);

      if (timeSinceLast < MIN_VERSION_INTERVAL_MS && !hasChanges) {
        return lastVersion;
      }
    }

    const nextVersion = (lastVersion?.version ?? 0) + 1;

    const changesSummary = lastVersion
      ? generateChangesSummary(
          lastVersion.content as unknown as FlowContent,
          content
        )
      : null;

    return prisma.flowVersion.create({
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
      v1.content as unknown as FlowContent,
      v2.content as unknown as FlowContent
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

    const content = targetVersion.content as unknown as FlowContent;

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

    const content = version.content as unknown as FlowContent;

    await prisma.$transaction([
      prisma.flowVersion.updateMany({
        where: {
          flowId: version.flowId,
          status: "PUBLISHED" as FlowVersionStatus,
        },
        data: { status: "ARCHIVED" as FlowVersionStatus },
      }),

      prisma.flowVersion.update({
        where: { id: versionId },
        data: { status: "PUBLISHED" as FlowVersionStatus },
      }),

      prisma.flow.update({
        where: { id: version.flowId },
        data: {
          activeVersionId: versionId,
          content: JSON.parse(JSON.stringify(content)),
        },
      }),
    ]);

    return prisma.flowDeployment.create({
      data: {
        agentId,
        flowVersionId: versionId,
        deployedById: userId ?? null,
        note: note ?? null,
      },
    });
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
