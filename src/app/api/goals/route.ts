import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CreateGoalSchema = z.object({
  organizationId: z.string().cuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  successMetric: z.string().max(500).optional(),
  targetDate: z.string().datetime().optional(),
  parentGoalId: z.string().cuid().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  missionId: z.string().cuid().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const parentGoalId = request.nextUrl.searchParams.get("parentGoalId") ?? undefined;

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId query param required" }, { status: 400 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const goals = await prisma.goal.findMany({
      where: {
        organizationId: orgId,
        ...(status && { status }),
        ...(parentGoalId !== undefined && { parentGoalId: parentGoalId || null }),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { childGoals: true, agentLinks: true } },
      },
    });

    return NextResponse.json({ success: true, data: goals });
  } catch (error) {
    logger.error("GET /api/goals error", { orgId, error });
    return NextResponse.json({ success: false, error: "Failed to list goals" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = CreateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { organizationId, title, description, successMetric, targetDate, parentGoalId, priority, missionId } = parsed.data;

  const authResult = await requireOrgMember(organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const goal = await prisma.goal.create({
      data: {
        organizationId,
        title,
        description,
        successMetric,
        targetDate: targetDate ? new Date(targetDate) : null,
        parentGoalId: parentGoalId ?? null,
        priority: priority ?? 50,
        missionId: missionId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: goal }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/goals error", { organizationId, error });
    return NextResponse.json({ success: false, error: "Failed to create goal" }, { status: 500 });
  }
}
