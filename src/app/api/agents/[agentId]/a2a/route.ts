import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { FlowContent } from "@/types";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  id: string | number | null;
  params?: {
    taskId?: string;
    message?: {
      parts?: { type: string; text?: string }[];
    };
  };
}

function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status }
  );
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return jsonRpcError(null, -32000, "Unauthorized", 401);
    }

    const { agentId } = await params;
    const body = (await req.json()) as JsonRpcRequest;

    if (body.method !== "tasks/send") {
      return jsonRpcError(
        body.id ?? null,
        -32601,
        "Method not found",
        404
      );
    }

    const taskId = body.params?.taskId ?? generateId();
    const inputParts = body.params?.message?.parts ?? [
      { type: "text", text: "" },
    ];
    const textPart = inputParts.find((p) => p.type === "text");
    const inputMessage = textPart?.text ?? "";

    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId: session.user.id },
      include: { flow: true },
    });

    if (!agent) {
      return jsonRpcError(body.id ?? null, -32000, "Agent not found", 404);
    }

    if (!agent.flow) {
      return jsonRpcError(body.id ?? null, -32000, "Agent has no flow", 400);
    }

    await prisma.agentCallLog.create({
      data: {
        traceId: taskId,
        spanId: generateId(),
        callerAgentId: agentId,
        calleeAgentId: agentId,
        taskId,
        status: "SUBMITTED",
        inputParts,
        depth: 0,
        isParallel: false,
        externalUrl: req.headers.get("referer") ?? undefined,
      },
    });

    const { executeFlow } = await import("@/lib/runtime/engine");

    const flowContent = agent.flow.content as unknown as FlowContent;

    const conversation = await prisma.conversation.create({
      data: {
        agentId,
        status: "ACTIVE",
        variables: inputMessage ? { message: inputMessage } : {},
      },
    });

    const context = {
      conversationId: conversation.id,
      agentId,
      flowContent,
      currentNodeId: null as string | null,
      variables: inputMessage
        ? ({ message: inputMessage } as Record<string, unknown>)
        : ({} as Record<string, unknown>),
      messageHistory: [] as {
        role: "user" | "assistant" | "system";
        content: string;
      }[],
      isNewConversation: true,
    };

    const startTime = Date.now();
    const result = await executeFlow(context, inputMessage || undefined);
    const durationMs = Date.now() - startTime;

    const lastAssistant = result.messages
      .filter((m) => m.role === "assistant")
      .pop();
    const outputText = lastAssistant?.content ?? "";

    await prisma.agentCallLog
      .update({
        where: { taskId },
        data: {
          status: "COMPLETED",
          outputParts: [{ type: "text", text: outputText }],
          durationMs,
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    return NextResponse.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: {
        id: taskId,
        status: { state: "completed" },
        artifacts: [
          {
            parts: [{ type: "text", text: outputText }],
          },
        ],
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Execution failed";
    logger.error("A2A task execution failed", err, {});
    return jsonRpcError(null, -32000, message, 500);
  }
}
