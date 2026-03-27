/**
 * Agent Discovery API
 *
 * Provides a searchable, filterable catalog of agents for the marketplace.
 * Supports full-text search, category/tag filtering, and multiple sort modes.
 *
 * GET /api/agents/discover
 *   ?q=string          — search name + description (case-insensitive)
 *   ?category=string   — filter by category
 *   ?tags=a,b          — filter: agent must have ALL listed tags
 *   ?model=string      — filter by model ID
 *   ?sort=popular|newest|name|most_used  — sort order (default: popular)
 *   ?limit=number      — page size (default: 24, max: 100)
 *   ?offset=number     — pagination offset (default: 0)
 *   ?scope=public|mine|all — visibility scope (default: all)
 *
 * Returns enriched agent data including conversation count, skill count,
 * A2A call stats, and category/tag metadata.
 *
 * NOTE: Uses `as any` casts on Prisma where clauses for new schema fields
 * (category, tags, isPublic) until `pnpm db:generate` is re-run by the developer.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";
import { prismaRead } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

const discoverSchema = z.object({
  q: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  tags: z.string().max(500).optional(),
  model: z.string().max(100).optional(),
  sort: z.enum(["popular", "newest", "name", "most_used"]).optional().default("popular"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  offset: z.coerce.number().int().min(0).optional().default(0),
  scope: z.enum(["public", "mine", "all"]).optional().default("all"),
});

export interface DiscoverAgent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  category: string | null;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  stats: {
    conversationCount: number;
    skillCount: number;
    callsReceived: number;
    hasKnowledgeBase: boolean;
    hasMCPTools: boolean;
  };
  owner: {
    name: string | null;
    image: string | null;
  } | null;
}

export interface DiscoverResponse {
  agents: DiscoverAgent[];
  total: number;
  categories: { name: string; count: number }[];
  popularTags: { name: string; count: number }[];
}

/**
 * Extended agent type including new schema fields that may not yet be in
 * the generated Prisma client. After `pnpm db:generate`, these casts can
 * be removed.
 */
interface AgentWithExtras {
  id: string;
  name: string;
  description: string | null;
  model: string;
  category?: string | null;
  tags?: string[];
  isPublic?: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { name: string | null; image: string | null } | null;
  agentCard: { skills: unknown } | null;
  knowledgeBase: { id: string } | null;
  _count: {
    conversations: number;
    calleeCallLogs: number;
    mcpServers: number;
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const params = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = discoverSchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { q, category, tags, model, sort, limit, offset, scope } = parsed.data;
    const tagList = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [];

    const where: Prisma.AgentWhereInput = {};

    // Scope filter
    if (scope === "mine") {
      where.userId = authResult.userId;
    } else if (scope === "public") {
      where.isPublic = true;
    } else {
      // "all" — show user's own agents + public agents + unowned
      where.OR = [
        { userId: authResult.userId },
        { isPublic: true },
        { userId: null },
      ];
    }

    // Must have a flow (functional agents only)
    where.flow = { isNot: null };

    // Category filter
    if (category) {
      where.category = category;
    }

    // Tag filter (agent must have ALL specified tags)
    if (tagList.length > 0) {
      where.tags = { hasEvery: tagList };
    }

    // Model filter
    if (model) {
      where.model = model;
    }

    // Text search (name + description)
    if (q) {
      const existingAnd = Array.isArray(where.AND)
        ? (where.AND as Prisma.AgentWhereInput[])
        : where.AND
          ? [where.AND as Prisma.AgentWhereInput]
          : [];
      where.AND = [
        ...existingAnd,
        {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
      ];
    }

    let orderBy: Prisma.AgentOrderByWithRelationInput;
    switch (sort) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "name":
        orderBy = { name: "asc" };
        break;
      case "most_used":
      case "popular":
      default:
        orderBy = { updatedAt: "desc" };
        break;
    }

    // Execute queries in parallel
    const findManyArgs: Parameters<typeof prismaRead.agent.findMany>[0] = {
      where,
      orderBy,
      skip: offset,
      take: limit,
      include: {
        user: { select: { name: true, image: true } },
        agentCard: { select: { skills: true } },
        knowledgeBase: { select: { id: true } },
        _count: {
          select: {
            conversations: true,
            calleeCallLogs: true,
            mcpServers: true,
          },
        },
      },
    };

    // Category stats query — group by category
    const groupByArgs: Parameters<typeof prismaRead.agent.groupBy>[0] = {
      by: ["category"],
      where: {
        OR: [
          { userId: authResult.userId },
          { isPublic: true },
          { userId: null },
        ],
        flow: { isNot: null },
        category: { not: null },
      },
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
    };

    // Tags query — find all agents with tags
    const tagsQueryArgs: Parameters<typeof prismaRead.agent.findMany>[0] = {
      where: {
        OR: [
          { userId: authResult.userId },
          { isPublic: true },
          { userId: null },
        ],
        flow: { isNot: null },
        tags: { isEmpty: false },
      },
      select: { tags: true },
    };

    const [agents, total, categoryStats, allTagAgents] = await Promise.all([
      prismaRead.agent.findMany(findManyArgs) as unknown as Promise<AgentWithExtras[]>,
      prismaRead.agent.count({ where }),
      prismaRead.agent.groupBy(groupByArgs).catch(() => []) as Promise<
        { category: string | null; _count: { category: number } }[]
      >,
      prismaRead.agent.findMany(tagsQueryArgs).catch(() => []) as Promise<
        { tags: string[] }[]
      >,
    ]);

    // Aggregate tag counts
    const tagCounts = new Map<string, number>();
    for (const agent of allTagAgents) {
      if (!agent.tags) continue;
      for (const tag of agent.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const popularTags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Transform to response shape
    const enrichedAgents: DiscoverAgent[] = agents.map((agent) => {
      const skills = agent.agentCard?.skills;
      const skillCount = Array.isArray(skills) ? skills.length : 0;

      return {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        model: agent.model,
        category: agent.category ?? null,
        tags: agent.tags ?? [],
        isPublic: agent.isPublic ?? false,
        createdAt: agent.createdAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
        stats: {
          conversationCount: agent._count.conversations,
          skillCount,
          callsReceived: agent._count.calleeCallLogs,
          hasKnowledgeBase: agent.knowledgeBase !== null,
          hasMCPTools: agent._count.mcpServers > 0,
        },
        owner: agent.user
          ? { name: agent.user.name, image: agent.user.image }
          : null,
      };
    });

    // Client-side re-sort for popularity and most_used (can't do in Prisma orderBy)
    if (sort === "popular") {
      enrichedAgents.sort(
        (a, b) =>
          b.stats.conversationCount + b.stats.callsReceived -
          (a.stats.conversationCount + a.stats.callsReceived)
      );
    } else if (sort === "most_used") {
      enrichedAgents.sort(
        (a, b) => b.stats.callsReceived - a.stats.callsReceived
      );
    }

    // Build categories response
    const categories = categoryStats
      .filter(
        (c): c is typeof c & { category: string } => c.category !== null
      )
      .map((c) => ({
        name: c.category,
        count: c._count.category,
      }));

    const response: DiscoverResponse = {
      agents: enrichedAgents,
      total,
      categories,
      popularTags,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    logger.error("Agent discovery failed", err);
    return NextResponse.json(
      { success: false, error: "Failed to load agent catalog" },
      { status: 500 }
    );
  }
}

