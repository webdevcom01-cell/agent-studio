import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { VersionService } from "@/lib/versioning/version-service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, versionId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  const rateResult = checkRateLimit(`deploy:${authResult.userId}`, 5);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const flow = await prisma.flow.findUnique({ where: { agentId } });
  if (!flow) {
    return NextResponse.json(
      { success: false, error: "Flow not found" },
      { status: 404 }
    );
  }

  try {
    const newVersion = await VersionService.rollbackToVersion(
      flow.id,
      versionId,
      authResult.userId
    );

    const deployment = await VersionService.deployVersion(
      agentId,
      newVersion.id,
      authResult.userId,
      `Rollback to v${newVersion.label?.replace("Rollback to v", "") ?? "?"}`
    );

    return NextResponse.json(
      { success: true, data: { version: newVersion, deployment } },
      { status: 201 }
    );
  } catch (err) {
    logger.error("Failed to rollback version", err);
    return NextResponse.json(
      { success: false, error: "Failed to rollback" },
      { status: 500 }
    );
  }
}
