import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") ?? "";
    const language = searchParams.get("language") ?? "";
    const category = searchParams.get("category") ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
    );

    const where: Record<string, unknown> = {};

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { tags: { has: query.toLowerCase() } },
      ];
    }
    if (language) {
      where.language = language;
    }
    if (category) {
      where.category = category;
    }

    const [skills, total, languageFacets, categoryFacets] = await Promise.all([
      prisma.skill.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          version: true,
          description: true,
          tags: true,
          category: true,
          language: true,
          eccOrigin: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.skill.count({ where }),
      prisma.skill.groupBy({
        by: ["language"],
        _count: { language: true },
        where: { language: { not: null } },
      }),
      prisma.skill.groupBy({
        by: ["category"],
        _count: { category: true },
        where: { category: { not: null } },
      }),
    ]);

    // compositionLayer is in schema.prisma + DB but not in generated types yet.
    // Fetched via raw query and merged into skill objects.
    const skillIds = skills.map((s) => s.id);
    const layerRows = skillIds.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; compositionLayer: string }>>(
          Prisma.sql`SELECT id, "compositionLayer" FROM "Skill" WHERE id = ANY(${skillIds}::text[])`,
        )
      : [];
    const layerMap = new Map(layerRows.map((r) => [r.id, r.compositionLayer]));
    const augmentedSkills = skills.map((s) => ({
      ...s,
      compositionLayer: layerMap.get(s.id) ?? "execution",
    }));

    return NextResponse.json({
      success: true,
      data: {
        skills: augmentedSkills,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        facets: {
          languages: languageFacets.map((f) => ({
            value: f.language,
            count: f._count.language,
          })),
          categories: categoryFacets.map((f) => ({
            value: f.category,
            count: f._count.category,
          })),
        },
      },
    });
  } catch (err) {
    logger.error("Failed to fetch skills", err, {});
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
