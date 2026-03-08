import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const limitParam = parseInt(searchParams.get("limit") ?? "", 10);
    const limit = Number.isNaN(limitParam)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(limitParam, 1), MAX_LIMIT);

    const logs = await prisma.agentCallLog.findMany({
      where: {
        callerAgent: { userId: session.user.id },
        ...(agentId ? { callerAgentId: agentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        callerAgent: { select: { id: true, name: true } },
        calleeAgent: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (err) {
    logger.error("Failed to list agent call logs", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to list agent call logs" },
      { status: 500 }
    );
  }
}
