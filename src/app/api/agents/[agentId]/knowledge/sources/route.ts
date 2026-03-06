import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestSource } from "@/lib/knowledge/ingest";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;

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

  const sources = await prisma.kBSource.findMany({
    where: { knowledgeBaseId: agent.knowledgeBase.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });

  return NextResponse.json({ success: true, data: sources });
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;

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
    (err) => console.error("Ingest error:", err)
  );

  return NextResponse.json({ success: true, data: source }, { status: 201 });
}
