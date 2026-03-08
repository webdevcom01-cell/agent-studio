import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_LIMIT = 100;
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
    const status = searchParams.get("status") ?? "pending";
    const limitParam = parseInt(searchParams.get("limit") ?? "", 10);
    const limit = Number.isNaN(limitParam)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(limitParam, 1), MAX_LIMIT);

    const requests = await prisma.humanApprovalRequest.findMany({
      where: {
        userId: session.user.id,
        ...(status !== "all" ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        agent: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    logger.error("Failed to list approval requests", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to list approval requests" },
      { status: 500 }
    );
  }
}
