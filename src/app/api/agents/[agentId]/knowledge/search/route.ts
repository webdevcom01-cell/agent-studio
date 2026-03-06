import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hybridSearch } from "@/lib/knowledge/search";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;
  const body = await request.json();

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { success: false, error: "Query is required" },
      { status: 400 }
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

  const results = await hybridSearch(query, agent.knowledgeBase.id, {
    topK: body.topK ?? 5,
  });

  return NextResponse.json({ success: true, data: results });
}
