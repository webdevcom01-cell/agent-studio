import { NextRequest, NextResponse } from "next/server";
import { executeFlow } from "@/lib/runtime/engine";
import { executeFlowStreaming } from "@/lib/runtime/engine-streaming";
import { loadContext } from "@/lib/runtime/context";
import { trackChatResponse } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseBodyWithLimit, BodyTooLargeError, InvalidJsonError } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { logger } from "@/lib/logger";

const MAX_MESSAGE_LENGTH = 10_000;

// MCP tool calls (e.g. NotebookLM) can take 30-60s
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<Response> {
  const { agentId } = await params;

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rateKey = `chat:${agentId}:${clientIp}`;
  const rateResult = checkRateLimit(rateKey);

  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateResult.retryAfterMs / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await parseBodyWithLimit(request) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json(
        { success: false, error: "Request body too large" },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

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

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` },
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
      }).catch((err) => logger.warn("Analytics tracking failed", err));

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
    }).catch((err) => logger.warn("Analytics tracking failed", err));

    return NextResponse.json({
      success: true,
      data: {
        conversationId: context.conversationId,
        messages: result.messages,
        waitForInput: result.waitingForInput,
      },
    });
  } catch (err) {
    const message = sanitizeErrorMessage(err, "Chat processing failed");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
