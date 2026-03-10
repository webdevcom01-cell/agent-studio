import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { executeFlow } from "@/lib/runtime/engine";
import { parseFlowContent } from "@/lib/validators/flow-content";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const executeSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { agentId } = await params;

    const body = await request.json();
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId: authResult.userId },
      include: { flow: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    if (!agent.flow) {
      return NextResponse.json(
        { success: false, error: "Agent has no flow" },
        { status: 400 }
      );
    }

    const flowContent = parseFlowContent(agent.flow.content);
    const inputVars = parsed.data.input as Record<string, unknown>;

    const conversation = await prisma.conversation.create({
      data: {
        agentId,
        status: "ACTIVE",
        variables: inputVars as object,
      },
    });

    const context = {
      conversationId: conversation.id,
      agentId,
      flowContent,
      currentNodeId: null as string | null,
      variables: { ...inputVars },
      messageHistory: [] as {
        role: "user" | "assistant" | "system";
        content: string;
      }[],
      isNewConversation: true,
    };

    const startTime = Date.now();
    const result = await executeFlow(context);
    const durationMs = Date.now() - startTime;

    const lastAssistant = result.messages
      .filter((m) => m.role === "assistant")
      .pop();

    return NextResponse.json({
      success: true,
      data: {
        conversationId: conversation.id,
        status: "COMPLETED",
        output: lastAssistant?.content ?? null,
        durationMs,
      },
    });
  } catch (err) {
    logger.error("Execution failed", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json(
      { success: false, error: "Execution failed" },
      { status: 500 }
    );
  }
}
