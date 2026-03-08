import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAgentCard } from "@/lib/a2a/card-generator";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const agents = await prisma.agent.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });

    const baseUrl = new URL(req.url).origin;

    const cards = await Promise.all(
      agents.map((agent) =>
        generateAgentCard(agent.id, session.user!.id!, baseUrl).catch(
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
