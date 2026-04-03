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

    const activeVersion = flow.versions[0] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        ...flow,
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
    const { flow, version } = await prisma.$transaction(async (tx) => {
      const savedFlow = await tx.flow.upsert({
        where: { agentId },
        update: { content: JSON.parse(JSON.stringify(content)) },
        create: { agentId, content: JSON.parse(JSON.stringify(content)) },
      });

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
        latestVersion: version
          ? { id: version.id, version: version.version }
          : null,
      },
    });
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Failed to save flow");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
