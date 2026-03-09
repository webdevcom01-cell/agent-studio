import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VersionService } from "@/lib/versioning/version-service";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { versionId } = await params;
  const compareWith = request.nextUrl.searchParams.get("compareWith");

  const currentVersion = await prisma.flowVersion.findUnique({
    where: { id: versionId },
  });

  if (!currentVersion) {
    return NextResponse.json(
      { success: false, error: "Version not found" },
      { status: 404 }
    );
  }

  let compareVersionId = compareWith;

  if (!compareVersionId) {
    const previousVersion = await prisma.flowVersion.findFirst({
      where: {
        flowId: currentVersion.flowId,
        version: currentVersion.version - 1,
      },
    });

    if (!previousVersion) {
      return NextResponse.json(
        { success: false, error: "No previous version to compare with" },
        { status: 404 }
      );
    }

    compareVersionId = previousVersion.id;
  }

  const diff = await VersionService.diffVersions(
    compareVersionId,
    versionId
  );

  return NextResponse.json({ success: true, data: diff });
}
