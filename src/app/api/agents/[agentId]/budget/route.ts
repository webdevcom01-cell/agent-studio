import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const UpsertBudgetSchema = z.object({
  hardLimitUsd: z.number().min(0).optional(),
  softLimitUsd: z.number().min(0).optional(),
  alertThreshold: z.number().min(0).max(1).optional(),
  isHardStop: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const budget = await prisma.agentBudget.findUnique({
      where: { agentId },
      include: { _count: { select: { costEvents: true, alerts: true } } },
    });
    return NextResponse.json({ success: true, data: budget });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/budget error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpsertBudgetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { hardLimitUsd, softLimitUsd, alertThreshold, isHardStop } = parsed.data;

  try {
    const budget = await prisma.agentBudget.upsert({
      where: { agentId },
      create: {
        agentId,
        hardLimitUsd: hardLimitUsd ?? 0,
        softLimitUsd: softLimitUsd ?? 0,
        alertThreshold: alertThreshold ?? 0.8,
        isHardStop: isHardStop ?? true,
      },
      update: {
        ...(hardLimitUsd !== undefined && { hardLimitUsd }),
        ...(softLimitUsd !== undefined && { softLimitUsd }),
        ...(alertThreshold !== undefined && { alertThreshold }),
        ...(isHardStop !== undefined && { isHardStop }),
      },
    });
    return NextResponse.json({ success: true, data: budget }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/budget error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to upsert budget" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    await prisma.agentBudget.delete({ where: { agentId } });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/agents/[agentId]/budget error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to delete budget" }, { status: 500 });
  }
}
