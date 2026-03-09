import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { upsertAgentCard } from "@/lib/a2a/card-generator";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

const VALID_MODELS = ["deepseek-chat", "gpt-4o-mini", "gpt-4o", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] as const;

const updateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  model: z.enum(VALID_MODELS).optional(),
  temperature: z.number().min(0).max(2).optional(),
}).strict();

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
    const parsed = updateAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.update({
      where: { id: agentId },
      data: parsed.data,
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
