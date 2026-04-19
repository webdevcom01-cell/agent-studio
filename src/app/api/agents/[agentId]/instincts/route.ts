/**
 * GET /api/agents/[agentId]/instincts
 *
 * Returns instinct lifecycle stats, promotion candidates, and the full
 * instinct list for an agent. Used by the ECC dashboard UI.
 *
 * Protected: agent owner only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import {
  getLifecycleStats,
  getPromotionCandidates,
} from "@/lib/ecc/instinct-engine";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Verify agent exists and fetch eccEnabled flag
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, eccEnabled: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
    }

    const [stats, candidates, instincts] = await Promise.all([
      getLifecycleStats(agentId),
      getPromotionCandidates(agentId),
      prisma.instinct.findMany({
        where: { agentId },
        orderBy: { confidence: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          confidence: true,
          frequency: true,
          promotedToSkillId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    logger.info("Fetched instinct data for agent", {
      agentId,
      total: stats.total,
      promotionCandidates: candidates.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        eccEnabled: agent.eccEnabled,
        stats,
        promotionCandidates: candidates,
        instincts,
      },
    });
  } catch (err) {
    logger.error("Failed to fetch instincts", { error: err });
    return NextResponse.json(
      { success: false, error: "Failed to fetch instincts" },
      { status: 500 },
    );
  }
}
