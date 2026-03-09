import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertAgentCard } from "@/lib/a2a/card-generator";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

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
  } catch (err) {
    logger.error("Failed to get agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to get agent" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

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

    if (agent.userId) {
      const baseUrl = new URL(request.url).origin;
      upsertAgentCard(agentId, agent.userId, baseUrl).catch(
        (err) => logger.warn("Agent card upsert failed", err)
      );
    }

    return NextResponse.json({ success: true, data: agent });
  } catch (err) {
    logger.error("Failed to update agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to update agent" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    await prisma.agent.delete({ where: { id: agentId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to delete agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
