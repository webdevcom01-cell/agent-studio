import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const agents = await prisma.agent.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      flow: { select: { id: true } },
      knowledgeBase: { select: { id: true } },
      _count: { select: { conversations: true } },
    },
  });

  return NextResponse.json({ success: true, data: agents });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Name is required" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.create({
    data: {
      name,
      description: typeof body.description === "string" ? body.description : "",
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : "You are a helpful assistant.",
      model: typeof body.model === "string" ? body.model : "deepseek-chat",
      flow: {
        create: {
          content: {
            nodes: [
              {
                id: "start",
                type: "ai_response",
                position: { x: 250, y: 100 },
                data: { label: "AI Response", prompt: "", model: "deepseek-chat" },
              },
            ],
            edges: [],
            variables: [],
          },
        },
      },
      knowledgeBase: {
        create: {
          name: `${name} KB`,
        },
      },
    },
    include: {
      flow: { select: { id: true } },
      knowledgeBase: { select: { id: true } },
    },
  });

  return NextResponse.json({ success: true, data: agent }, { status: 201 });
}
