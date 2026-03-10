import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestSource } from "@/lib/knowledge/ingest";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(searchParams.get("limit")) || DEFAULT_PAGE_SIZE)
    );
    const skip = (page - 1) * limit;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { knowledgeBase: { select: { id: true } } },
    });

    if (!agent?.knowledgeBase) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const where = { knowledgeBaseId: agent.knowledgeBase.id };

    const [sources, total] = await Promise.all([
      prisma.kBSource.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { chunks: true } } },
        skip,
        take: limit,
      }),
      prisma.kBSource.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: sources,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Failed to list knowledge sources");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const rateResult = checkRateLimit(`kb-source:${authResult.userId}`, 10);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { knowledgeBase: { select: { id: true } } },
    });

    if (!agent?.knowledgeBase) {
      return NextResponse.json(
        { success: false, error: "Knowledge base not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const type = body.type as string;
    const name = typeof body.name === "string" ? body.name : "Untitled";

    const validTypes = ["TEXT", "URL", "SITEMAP", "FILE"] as const;
    type ValidType = (typeof validTypes)[number];

    if (!validTypes.includes(type as ValidType)) {
      return NextResponse.json(
        { success: false, error: "Invalid source type" },
        { status: 400 }
      );
    }

    if ((type === "URL" || type === "SITEMAP") && typeof body.url === "string") {
      try {
        const parsed = new URL(body.url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return NextResponse.json(
            { success: false, error: "URL must use http or https protocol" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid URL format" },
          { status: 400 }
        );
      }
    }

    const source = await prisma.kBSource.create({
      data: {
        name,
        type: type as ValidType,
        url: type === "URL" || type === "SITEMAP" ? body.url : null,
        rawContent: type === "TEXT" ? body.content : null,
        knowledgeBaseId: agent.knowledgeBase.id,
        status: "PENDING",
      },
    });

    ingestSource(source.id, type === "TEXT" ? body.content : undefined).catch(
      (err) => logger.error("Background ingest failed", err)
    );

    return NextResponse.json({ success: true, data: source }, { status: 201 });
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Failed to create knowledge source");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
