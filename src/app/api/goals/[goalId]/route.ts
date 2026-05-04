import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ goalId: string }>;
}

const UpdateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  successMetric: z.string().max(500).nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"]).optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

async function loadGoal(goalId: string) {
  return prisma.goal.findUnique({
    where: { id: goalId },
    select: { id: true, organizationId: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { goalId } = await params;

  const goal = await loadGoal(goalId);
  if (!goal) return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });

  const authResult = await requireOrgMember(goal.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const full = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        childGoals: { select: { id: true, title: true, status: true, priority: true } },
        agentLinks: {
          include: { agent: { select: { id: true, name: true } } },
        },
        mission: { select: { id: true, statement: true } },
      },
    });

    return NextResponse.json({ success: true, data: full });
  } catch (error) {
    logger.error("GET /api/goals/[goalId] error", { goalId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch goal" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { goalId } = await params;

  const goal = await loadGoal(goalId);
  if (!goal) return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });

  const authResult = await requireOrgMember(goal.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpdateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  try {
    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.successMetric !== undefined && { successMetric: parsed.data.successMetric }),
        ...(parsed.data.targetDate !== undefined && { targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PATCH /api/goals/[goalId] error", { goalId, error });
    return NextResponse.json({ success: false, error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { goalId } = await params;

  const goal = await loadGoal(goalId);
  if (!goal) return NextResponse.json({ success: false, error: "Goal not found" }, { status: 404 });

  const authResult = await requireOrgMember(goal.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const childCount = await prisma.goal.count({ where: { parentGoalId: goalId } });
    if (childCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete goal with ${childCount} child goal(s). Remove children first.` },
        { status: 409 },
      );
    }

    await prisma.goal.delete({ where: { id: goalId } });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/goals/[goalId] error", { goalId, error });
    return NextResponse.json({ success: false, error: "Failed to delete goal" }, { status: 500 });
  }
}
