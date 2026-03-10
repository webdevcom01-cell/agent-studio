import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { VersionService } from "@/lib/versioning/version-service";
import { parseFlowContent } from "@/lib/validators/flow-content";

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

    const flow = await prisma.flow.findUnique({ where: { agentId } });
    if (!flow) {
      return NextResponse.json(
        { success: false, error: "Flow not found" },
        { status: 404 }
      );
    }

    const versions = await VersionService.listVersions(flow.id);

    return NextResponse.json({ success: true, data: versions });
  } catch (err) {
    logger.error("Failed to list versions", err);
    return NextResponse.json(
      { success: false, error: "Failed to list versions" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const flow = await prisma.flow.findUnique({ where: { agentId } });
    if (!flow) {
      return NextResponse.json(
        { success: false, error: "Flow not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label : undefined;

    const version = await VersionService.createVersion(
      flow.id,
      parseFlowContent(flow.content),
      authResult.userId,
      label
    );

    return NextResponse.json({ success: true, data: version }, { status: 201 });
  } catch (err) {
    logger.error("Failed to create version", err);
    return NextResponse.json(
      { success: false, error: "Failed to create version" },
      { status: 500 }
    );
  }
}
