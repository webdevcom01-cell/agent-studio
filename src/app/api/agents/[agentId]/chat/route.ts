import { NextRequest, NextResponse } from "next/server";
import { executeFlow } from "@/lib/runtime/engine";
import { executeFlowStreaming } from "@/lib/runtime/engine-streaming";
import { loadContext } from "@/lib/runtime/context";
import { trackChatResponse, trackError } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { parseBodyWithLimit, BodyTooLargeError } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";

const MAX_MESSAGE_LENGTH = 10_000;

// Multi-agent pipelines (10-20 sequential sub-agents) can take 20+ minutes on Railway
// maxDuration is a Vercel hint (ignored on Railway); client timeout in useStreamingChat is the real limit
export const maxDuration = 900;

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
  const rateResult = await checkRateLimitAsync(rateKey);

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
  // Eval compare: optional flow version override (only used for head-to-head eval runs)
  const evalFlowVersionId =
    typeof body.flowVersionId === "string" && body.flowVersionId.length > 0
      ? body.flowVersionId
      : undefined;
  // Eval compare: optional model override for comparing different models
  const evalModelOverride =
    typeof body.modelOverride === "string" && body.modelOverride.length > 0
      ? body.modelOverride
      : undefined;
  // Debug mode: only allowed for authenticated agent owners
  const isDebug = body.debug === true;
  // Breakpoints: array of nodeIds to pause at (Phase 6)
  const rawBreakpoints = Array.isArray(body.breakpoints) ? (body.breakpoints as unknown[]) : [];
  const breakpointSet: Set<string> = new Set(
    rawBreakpoints.filter((b): b is string => typeof b === "string" && b.length > 0)
  );
  // Debug session ID for pause/resume coordination (Phase 6)
  const debugSessionId =
    typeof body.debugSessionId === "string" && body.debugSessionId.length > 0
      ? body.debugSessionId
      : undefined;

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

  // Debug mode, eval overrides, and breakpoints require authentication
  // — verify ownership before exposing internal state or allowing flow/model overrides
  if (isDebug || evalFlowVersionId || evalModelOverride) {
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;
  }

  try {
    const startTime = Date.now();
    const context = await loadContext(agentId, conversationId);

    // Optionally inject userId from session — needed for human_approval node
    // Chat endpoint is public (for embed), so we use auth() non-blocking here
    const session = await auth().catch(() => null);
    if (session?.user?.id) {
      context.userId = session.user.id;
    }

    // Inject debug flag + breakpoints into context
    if (isDebug) {
      context.debugMode = true;
      if (breakpointSet.size > 0) {
        context.breakpoints = breakpointSet;
      }
      if (debugSessionId) {
        context.debugSessionId = debugSessionId;
      }
    }

    // Head-to-head eval compare: override flow content with a specific version
    if (evalFlowVersionId) {
      const version = await prisma.flowVersion.findFirst({
        where: { id: evalFlowVersionId, flow: { agentId } },
        select: { content: true },
      });
      if (version?.content) {
        // Replace the flow content in context with the versioned snapshot
        context.flowContent = version.content as unknown as typeof context.flowContent;
      }
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { model: true } });
    // Head-to-head eval compare: override model if specified
    // Injects modelOverride into all ai_response nodes in the flow content
    if (evalModelOverride && context.flowContent?.nodes) {
      context.flowContent = {
        ...context.flowContent,
        nodes: context.flowContent.nodes.map((n) =>
          n.type === "ai_response"
            ? { ...n, data: { ...n.data, model: evalModelOverride } }
            : n,
        ),
      };
    }
    const agentModel = evalModelOverride ?? agent?.model;

    if (isStreaming) {
      const innerStream = executeFlowStreaming(context, message);
      const timeToFirstTokenMs = Date.now() - startTime;

      // Wrap stream to track total duration after completion.
      // reader is declared outside start() so cancel() can propagate to innerStream.
      const reader = innerStream.getReader();
      const trackingStream = new ReadableStream({
        async start(controller) {
          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            controller.error(err);
          } finally {
            controller.close();
            const totalResponseTimeMs = Date.now() - startTime;
            trackChatResponse({
              agentId,
              conversationId: context.conversationId,
              timeToFirstTokenMs,
              totalResponseTimeMs,
              isNewConversation: context.isNewConversation,
              isStreaming: true,
              model: agentModel,
            }).catch((err) => logger.warn("Analytics tracking failed", err));
          }
        },
        cancel() {
          // Propagate client disconnect to the inner engine stream so sub-agents
          // stop executing and stop consuming tokens.
          reader.cancel().catch(() => { /* ignore */ });
        },
      });

      return new Response(trackingStream, {
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
