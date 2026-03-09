import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upsertAgentCard } from "@/lib/a2a/card-generator";
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
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  const body = await request.json();

  if (!body.content || typeof body.content !== "object") {
    return NextResponse.json(
      { success: false, error: "Flow content is required" },
      { status: 400 }
    );
  }

  const flow = await prisma.flow.upsert({
    where: { agentId },
    update: { content: body.content },
    create: { agentId, content: body.content },
  });

  const version = await VersionService.createVersion(
    flow.id,
    body.content as FlowContent,
    userId
  ).catch(() => null);

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });
  if (agent?.userId) {
    const baseUrl = new URL(request.url).origin;
    upsertAgentCard(agentId, agent.userId, baseUrl).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    data: {
      ...flow,
      latestVersion: version
        ? { id: version.id, version: version.version }
        : null,
    },
  });
}
