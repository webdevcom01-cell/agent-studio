import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { generateAgentCard } from "@/lib/a2a/card-generator";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const agents = await prisma.agent.findMany({
      where: { userId: authResult.userId },
      select: { id: true },
    });

    const baseUrl = new URL(req.url).origin;

    const cards = await Promise.all(
      agents.map((agent) =>
        generateAgentCard(agent.id, authResult.userId, baseUrl).catch(
          (err) => {
            logger.error("Failed to generate card for agent", err, {
              agentId: agent.id,
            });
            return null;
          }
        )
      )
    );

    return NextResponse.json({
      success: true,
      data: cards.filter(Boolean),
    });
  } catch (err) {
    logger.error("Failed to list A2A agents", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to list agents" },
      { status: 500 }
    );
  }
}
