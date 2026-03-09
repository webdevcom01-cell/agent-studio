import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { VersionService } from "@/lib/versioning/version-service";
import type { FlowContent } from "@/types";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;

  const flow = await prisma.flow.findUnique({ where: { agentId } });
  if (!flow) {
    return NextResponse.json(
      { success: false, error: "Flow not found" },
      { status: 404 }
    );
  }

  const versions = await VersionService.listVersions(flow.id);

  return NextResponse.json({ success: true, data: versions });
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const session = await auth();
  const userId = session?.user?.id;

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
    flow.content as unknown as FlowContent,
    userId,
    label
  );

  return NextResponse.json({ success: true, data: version }, { status: 201 });
}
