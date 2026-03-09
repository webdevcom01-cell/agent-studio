import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { VersionService } from "@/lib/versioning/version-service";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, versionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

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
      userId
    );

    const deployment = await VersionService.deployVersion(
      agentId,
      newVersion.id,
      userId,
      `Rollback to v${newVersion.label?.replace("Rollback to v", "") ?? "?"}`
    );

    return NextResponse.json(
      { success: true, data: { version: newVersion, deployment } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to rollback" },
      { status: 500 }
    );
  }
}
