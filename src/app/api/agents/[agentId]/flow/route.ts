/**
 * NOTE: This route uses raw SQL for lockVersion operations because the Prisma
 * generated client is regenerated on deploy. After pulling this commit, run:
 *   pnpm db:push && pnpm db:generate
 * to apply the new `lockVersion Int @default(1)` field on the Flow model.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sentinel thrown inside the transaction when a lock conflict is detected. */
class LockConflictError extends Error {
  constructor(public readonly serverLockVersion: number) {
    super("lock_conflict");
    this.name = "LockConflictError";
  }
}

/** Read the current lockVersion for a flow. Returns null if the flow doesn't exist yet. */
async function readLockVersion(
  agentId: string,
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
): Promise<number | null> {
  const rows = await tx.$queryRaw<Array<{ lockVersion: number }>>(
    Prisma.sql`SELECT "lockVersion" FROM "Flow" WHERE "agentId" = ${agentId} LIMIT 1`
  );
  return rows.length > 0 ? rows[0].lockVersion : null;
}

/** Increment lockVersion by 1, return the new value. */
async function incrementLockVersion(
  agentId: string,
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
): Promise<number> {
  await tx.$executeRaw(
    Prisma.sql`UPDATE "Flow" SET "lockVersion" = "lockVersion" + 1 WHERE "agentId" = ${agentId}`
  );
  const rows = await tx.$queryRaw<Array<{ lockVersion: number }>>(
    Prisma.sql`SELECT "lockVersion" FROM "Flow" WHERE "agentId" = ${agentId} LIMIT 1`
  );
  return rows[0]?.lockVersion ?? 1;
}

// ── GET ───────────────────────────────────────────────────────────────────────

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

    // Read lockVersion via raw SQL so we don't depend on regenerated Prisma client
    const lockVersion = await readLockVersion(agentId, prisma);
    const activeVersion = flow.versions[0] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        ...flow,
        lockVersion: lockVersion ?? 1,
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

// ── PUT ───────────────────────────────────────────────────────────────────────

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

    // Optional optimistic-lock token sent by the client.
    // Absence = backward-compatible path (old clients, embed widget, API users).
    const clientLockVersion =
      typeof body.clientLockVersion === "number" ? body.clientLockVersion : undefined;

    let newLockVersion = 1;

    try {
      const { flow, version } = await prisma.$transaction(async (tx) => {
        // ── 1. Optimistic lock check ──────────────────────────────────────────
        if (clientLockVersion !== undefined) {
          const serverLockVersion = await readLockVersion(agentId, tx);
          if (serverLockVersion !== null && serverLockVersion !== clientLockVersion) {
            logger.warn("Flow lock conflict detected", {
              agentId,
              clientLockVersion,
              serverLockVersion,
            });
            throw new LockConflictError(serverLockVersion);
          }
        }

        // ── 2. Upsert flow content ────────────────────────────────────────────
        const savedFlow = await tx.flow.upsert({
          where: { agentId },
          update: { content: JSON.parse(JSON.stringify(content)) },
          create: { agentId, content: JSON.parse(JSON.stringify(content)) },
        });

        // ── 3. Increment lockVersion (create path starts at default 1 → 2) ───
        newLockVersion = await incrementLockVersion(agentId, tx);

        // ── 4. Create flow version snapshot ──────────────────────────────────
        const savedVersion = await VersionService.createVersion(
          savedFlow.id,
          content as FlowContent,
          authResult.userId,
          undefined,
          tx
        ).catch(() => null);

        return { flow: savedFlow, version: savedVersion };
      });

      const baseUrl = new URL(request.url).origin;
      upsertAgentCard(agentId, authResult.userId, baseUrl).catch(
        (err) => logger.warn("Agent card upsert failed", err)
      );

      return NextResponse.json({
        success: true,
        data: {
          ...flow,
          lockVersion: newLockVersion,
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
            error: "Flow was modified in another session. Reload to continue editing.",
            serverLockVersion: err.serverLockVersion,
          },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Failed to save flow");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
