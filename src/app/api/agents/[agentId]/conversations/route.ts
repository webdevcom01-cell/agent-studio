import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId } = await params;

  try {
    const conversations = await prisma.conversation.findMany({
      where: { agentId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        messages: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { content: true, role: true },
        },
      },
    });

    const data = conversations.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      status: c.status,
      preview: c.messages[0]?.content?.slice(0, 80) ?? "",
    }));

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load conversations" },
      { status: 500 }
    );
  }
}
