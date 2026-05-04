import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getAgentGoals } from "@/lib/goals/goal-context";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const LinkGoalSchema = z.object({
  goalId: z.string().cuid(),
  role: z.enum(["OWNER", "CONTRIBUTOR", "OBSERVER"]).optional(),
});

const UnlinkGoalSchema = z.object({
  goalId: z.string().cuid(),
});

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const goals = await getAgentGoals(agentId);
    return NextResponse.json({ success: true, data: goals });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/goals error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch agent goals" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = LinkGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { goalId, role = "CONTRIBUTOR" } = parsed.data;

  try {
    const goal = await prisma.goal.findUnique({ where: { id: goalId }, select: { id: true } });
    if (!goal) {
      return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });
    }

    const link = await prisma.agentGoalLink.upsert({
      where: { agentId_goalId: { agentId, goalId } },
      update: { role },
      create: { agentId, goalId, role },
    });

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/goals error", { agentId, goalId, error });
    return NextResponse.json({ success: false, error: "Failed to link goal" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UnlinkGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { goalId } = parsed.data;

  try {
    await prisma.agentGoalLink.delete({
      where: { agentId_goalId: { agentId, goalId } },
    });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/agents/[agentId]/goals error", { agentId, goalId, error });
    return NextResponse.json({ success: false, error: "Failed to unlink goal" }, { status: 500 });
  }
}
