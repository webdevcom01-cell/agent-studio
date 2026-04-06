import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertAgentCard } from "@/lib/a2a/card-generator";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { parseBodyWithLimit, BodyTooLargeError } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { VersionService } from "@/lib/versioning/version-service";
import { validateFlowContent } from "@/lib/validators/flow-content";
import type { FlowContent } from "@/types";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

class LockConflictError extends Error {
  readonly serverLockVersion: number;
  constructor(serverLockVersion: number) {
    super("Flow was modified in another session");
    this.serverLockVersion = serverLockVersion;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const flow = await prisma.flow.findUnique({
      where: { agentId },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    if (!flow) {
      return NextResponse.json(
        { success: false, error: "Flow not found" },
        { status: 404 }
      );
    }

    const lockRows = await prisma.$queryRaw<{ lockVersion: number }[]>`
      SELECT "lockVersion" FROM "Flow" WHERE "agentId" = ${agentId}
    `;
    const lockVersion = lockRows[0]?.lockVersion ?? 1;

    const activeVersion = flow.versions[0] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        ...flow,
        lockVersion,
        activeVersion: activeVersion
          ? { id: activeVersion.id, version: activeVersion.version }
          : null,
      },
    });
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Failed to get flow");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    let body: Record<string, unknown>;
    try {
      body = await parseBodyWithLimit(request) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        return NextResponse.json(
          { success: false, error: "Request body too large" },
          { status: 413 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 }
      );
    }

    const validation = validateFlowContent(body.content);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const content = validation.data;
    const clientLockVersion =
      typeof body.clientLockVersion === "number" ? body.clientLockVersion : undefined;

    const { flow, version } = await prisma.$transaction(async (tx) => {
      if (clientLockVersion !== undefined) {
        const lockRows = await tx.$queryRaw<{ lockVersion: number }[]>`
          SELECT "lockVersion" FROM "Flow" WHERE "agentId" = ${agentId}
        `;
        if (lockRows.length > 0 && lockRows[0].lockVersion !== clientLockVersion) {
          throw new LockConflictError(lockRows[0].lockVersion);
        }
      }

      const savedFlow = await tx.flow.upsert({
        where: { agentId },
        update: { content: JSON.parse(JSON.stringify(content)) },
        create: { agentId, content: JSON.parse(JSON.stringify(content)) },
      });

      await tx.$executeRaw`
        UPDATE "Flow" SET "lockVersion" = COALESCE("lockVersion", 0) + 1 WHERE "agentId" = ${agentId}
      `;

      const newLockRows = await tx.$queryRaw<{ lockVersion: number }[]>`
        SELECT "lockVersion" FROM "Flow" WHERE "agentId" = ${agentId}
      `;
      const newLockVersion = newLockRows[0]?.lockVersion ?? 1;

      const savedVersion = await VersionService.createVersion(
        savedFlow.id,
        content as FlowContent,
        authResult.userId,
        undefined,
        tx
      ).catch(() => null);

      return { flow: { ...savedFlow, lockVersion: newLockVersion }, version: savedVersion };
    });

    const baseUrl = new URL(request.url).origin;
    upsertAgentCard(agentId, authResult.userId, baseUrl).catch(
      (err) => logger.warn("Agent card upsert failed", err)
    );

    return NextResponse.json({
      success: true,
      data: {
        ...flow,
        latestVersion: version
          ? { id: version.id, version: version.version }
          : null,
      },
    });
  } catch (err) {
    if (err instanceof LockConflictError) {
      return NextResponse.json(
        {
          success: false,
          error: "Flow was modified in another session",
          serverLockVersion: err.serverLockVersion,
        },
        { status: 409 }
      );
    }
    const message = sanitizeErrorMessage(err, "Failed to save flow");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
