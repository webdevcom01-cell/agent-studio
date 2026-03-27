import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";

interface RouteParams {
  params: Promise<{ agentId: string; conversationId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, conversationId } = await params;

  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, agentId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
          select: { role: true, content: true, createdAt: true },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: conversation });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to load conversation" },
      { status: 500 }
    );
  }
}
