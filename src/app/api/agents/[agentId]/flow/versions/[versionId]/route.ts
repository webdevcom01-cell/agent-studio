import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { VersionService } from "@/lib/versioning/version-service";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId, versionId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const version = await VersionService.getVersion(versionId);
    if (!version) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: version });
  } catch (err) {
    logger.error("Failed to get version", err);
    return NextResponse.json(
      { success: false, error: "Failed to get version" },
      { status: 500 }
    );
  }
}
