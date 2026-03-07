import { NextRequest, NextResponse } from "next/server";
import { executeFlow } from "@/lib/runtime/engine";
import { executeFlowStreaming } from "@/lib/runtime/engine-streaming";
import { loadContext } from "@/lib/runtime/context";
import { trackChatResponse } from "@/lib/analytics";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { agentId } = await params;
  const body = await request.json();

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : undefined;
  const isStreaming = body.stream === true;

  if (!message) {
    return NextResponse.json(
      { success: false, error: "Message is required" },
      { status: 400 }
    );
  }

  try {
    const startTime = Date.now();
    const context = await loadContext(agentId, conversationId);

    if (isStreaming) {
      const stream = executeFlowStreaming(context, message);
      const timeToFirstTokenMs = Date.now() - startTime;

      trackChatResponse({
        agentId,
        conversationId: context.conversationId,
        timeToFirstTokenMs,
        totalResponseTimeMs: timeToFirstTokenMs,
        isNewConversation: context.isNewConversation,
      }).catch(() => {});

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const result = await executeFlow(context, message);
    const totalResponseTimeMs = Date.now() - startTime;

    trackChatResponse({
      agentId,
      conversationId: context.conversationId,
      timeToFirstTokenMs: totalResponseTimeMs,
      totalResponseTimeMs,
      isNewConversation: context.isNewConversation,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        conversationId: context.conversationId,
        messages: result.messages,
        waitForInput: result.waitingForInput,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to process message" },
      { status: 500 }
    );
  }
}
