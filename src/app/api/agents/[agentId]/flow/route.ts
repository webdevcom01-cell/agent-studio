import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
  });

  if (!flow) {
    return NextResponse.json(
      { success: false, error: "Flow not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: flow });
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
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

  return NextResponse.json({ success: true, data: flow });
}
