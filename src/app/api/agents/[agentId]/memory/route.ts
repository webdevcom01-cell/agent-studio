import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/agents/[agentId]/memory — List all memories (paginated)
 * Query params: ?page=1&limit=50&category=general&sort=importance
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const category = url.searchParams.get("category") || undefined;
    const sort = url.searchParams.get("sort") || "accessedAt";

    const where = {
      agentId,
      ...(category ? { category } : {}),
    };

    const orderBy = sort === "importance"
      ? { importance: "desc" as const }
      : sort === "key"
        ? { key: "asc" as const }
        : sort === "createdAt"
          ? { createdAt: "desc" as const }
          : { accessedAt: "desc" as const };

    const [memories, total] = await Promise.all([
      prisma.agentMemory.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          key: true,
          value: true,
          category: true,
          importance: true,
          accessCount: true,
          accessedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.agentMemory.count({ where }),
    ]);

    // Get unique categories for filter UI
    const categories = await prisma.agentMemory.findMany({
      where: { agentId },
      select: { category: true },
      distinct: ["category"],
    });

    return NextResponse.json({
      success: true,
      data: {
        memories,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        categories: categories.map((c) => c.category),
      },
    });
  } catch (error) {
    logger.error("Failed to list memories", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to list memories" },
      { status: 500 },
    );
  }
}
