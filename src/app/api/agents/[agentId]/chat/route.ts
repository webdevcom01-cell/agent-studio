import { NextRequest, NextResponse } from "next/server";
import { executeFlow } from "@/lib/runtime/engine";
import { executeFlowStreaming } from "@/lib/runtime/engine-streaming";
import { loadContext } from "@/lib/runtime/context";
import { trackChatResponse, trackError } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseBodyWithLimit, BodyTooLargeError } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { logger } from "@/lib/logger";

const MAX_MESSAGE_LENGTH = 10_000;

// MCP tool calls (e.g. Playwright browser, web search) can take 2-3 minutes for multi-step browsing
export const maxDuration = 180;

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
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { model: true } });
    const agentModel = agent?.model;

    if (isStreaming) {
      const stream = executeFlowStreaming(context, message);
      const timeToFirstTokenMs = Date.now() - startTime;

      trackChatResponse({
        agentId,
        conversationId: context.conversationId,
        timeToFirstTokenMs,
        totalResponseTimeMs: timeToFirstTokenMs,
        isNewConversation: context.isNewConversation,
        isStreaming: true,
        model: agentModel,
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
      isStreaming: false,
      model: agentModel,
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
    trackError({
      agentId,
      errorType: "runtime",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    }).catch(() => {/* fire and forget */});

    const message = sanitizeErrorMessage(err, "Chat processing failed");
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
