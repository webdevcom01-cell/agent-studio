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

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      flow: true,
      knowledgeBase: {
        include: {
          sources: { orderBy: { createdAt: "desc" } },
        },
      },
      _count: { select: { conversations: true } },
    },
  });

  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data: agent });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  if (typeof body.name === "string") updateData.name = body.name.trim();
  if (typeof body.description === "string") updateData.description = body.description;
  if (typeof body.systemPrompt === "string") updateData.systemPrompt = body.systemPrompt;
  if (typeof body.model === "string") updateData.model = body.model;

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: agent });
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;

  await prisma.agent.delete({ where: { id: agentId } });

  return NextResponse.json({ success: true });
}
