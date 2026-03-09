import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { VersionService } from "@/lib/versioning/version-service";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, versionId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note : undefined;

  try {
    const deployment = await VersionService.deployVersion(
      agentId,
      versionId,
      userId,
      note
    );

    return NextResponse.json(
      { success: true, data: deployment },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to deploy version" },
      { status: 500 }
    );
  }
}
