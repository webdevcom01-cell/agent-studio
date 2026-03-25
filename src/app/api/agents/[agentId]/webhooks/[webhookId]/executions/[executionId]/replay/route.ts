/**
 * POST /api/agents/[agentId]/webhooks/[webhookId]/executions/[executionId]/replay
 *
 * Re-runs a previously executed webhook using its stored raw payload and
 * sanitized headers.  Useful for debugging failed executions without having
 * to re-send an external event.
 *
 * Auth:   requireAgentOwner — only the agent owner may replay executions.
 * Safety: signature verification is skipped (replays use stored body, so
 *         no live HMAC is available).  A fresh idempotency key is generated so
 *         the replay never collides with the original execution record.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { executeWebhookTrigger } from "@/lib/webhooks/execute";

interface RouteParams {
  params: Promise<{
    agentId: string;
    webhookId: string;
    executionId: string;
  }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { agentId, webhookId, executionId } = await params;

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const auth = await requireAgentOwner(agentId);
  if (isAuthError(auth)) return auth;

  try {
    // ── Load original execution ──────────────────────────────────────────────
    const original = await prisma.webhookExecution.findFirst({
      where: {
        id: executionId,
        webhookConfigId: webhookId,
        webhookConfig: { agentId },
      },
      select: {
        id: true,
        rawPayload: true,
        rawHeaders: true,
        eventType: true,
        sourceIp: true,
      },
    });

    if (!original) {
      return NextResponse.json(
        { success: false, error: "Execution not found" },
        { status: 404 }
      );
    }

    if (original.rawPayload === null) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This execution has no stored payload. Replay is only available for executions captured after replay support was enabled.",
        },
        { status: 422 }
      );
    }

    // ── Reconstruct headers from stored sanitized copy ───────────────────────
    // rawHeaders is a sanitized Record<string, string> (signatures are redacted,
    // secrets are removed).  We pass it as-is; signature verification is skipped
    // for replay executions.
    const storedHeaders = (original.rawHeaders as Record<string, string>) ?? {};

    logger.info("Replaying webhook execution", {
      agentId,
      webhookId,
      executionId,
      originalEventType: original.eventType,
    });

    // ── Execute ───────────────────────────────────────────────────────────────
    const result = await executeWebhookTrigger({
      agentId,
      webhookId,
      rawBody: original.rawPayload,
      headers: storedHeaders,
      sourceIp: original.sourceIp ?? undefined,
      isReplay: true,
      replayOf: original.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Replay execution failed" },
        { status: result.status >= 400 ? result.status : 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          executionId: result.executionId,
          conversationId: result.conversationId,
          replayOf: executionId,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Webhook replay route error", error, {
      agentId,
      webhookId,
      executionId,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
