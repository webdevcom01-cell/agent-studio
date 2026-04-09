/**
 * POST /api/agents/[agentId]/trigger/[webhookId]
 *
 * PUBLIC endpoint — no session auth required.
 * Authentication is entirely via HMAC-SHA256 webhook signature.
 *
 * This is the URL that external systems (Slack, GitHub, Stripe, etc.) POST to
 * in order to trigger an agent flow execution.
 *
 * Standard Webhooks spec headers required:
 *   x-webhook-id        — unique event ID (idempotency key)
 *   x-webhook-timestamp — Unix timestamp (seconds)
 *   x-webhook-signature — v1,<base64-hmac-sha256>
 *
 * Special case — Slack URL verification challenge:
 *   If body is { type: "url_verification", challenge: "xxx" }, responds with
 *   { challenge: "xxx" } and status 200 WITHOUT executing the flow.
 *
 * Responses:
 *   200 — Flow executed successfully
 *   200 — Slack challenge response
 *   400 — Invalid or missing signature
 *   404 — Webhook not found or disabled
 *   409 — Event already processed (idempotent, safe to retry)
 *   429 — Rate limit exceeded
 *   500 — Flow execution error
 */

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { executeWebhookTrigger } from "@/lib/webhooks/execute";

// Allow longer execution for flows with AI steps or MCP tool calls
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const pathname = request.nextUrl.pathname;

  try {
    // ── Read raw body (MUST happen before any parsing — signature verification needs raw bytes)
    const rawBody = await request.text();

    // ── Slack URL verification challenge ─────────────────────────────────────
    // Slack sends this when you first register a webhook URL.
    // Respond immediately without signature verification or flow execution.
    if (rawBody.includes('"url_verification"')) {
      try {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        if (parsed.type === "url_verification" && typeof parsed.challenge === "string") {
          const response = NextResponse.json({ challenge: parsed.challenge });
          applySecurityHeaders(response, pathname);
          return response;
        }
      } catch {
        // Not valid JSON — fall through to normal processing
      }
    }

    // ── Build headers map for verify/execute ─────────────────────────────────
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // ── Source IP ─────────────────────────────────────────────────────────────
    const sourceIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    // ── Execute ───────────────────────────────────────────────────────────────
    const result = await executeWebhookTrigger({
      agentId,
      webhookId,
      rawBody,
      headers,
      sourceIp,
    });

    if (result.skipped) {
      if (result.status === 409) {
        // Idempotent — already processed, return 409 with previous execution data
        const response = NextResponse.json(
          {
            success: true,
            message: "Event already processed",
            executionId: result.executionId,
            conversationId: result.conversationId,
          },
          { status: 409 }
        );
        applySecurityHeaders(response, pathname);
        return response;
      }
      // Event type not in filter list — silently skip with 200
      const response = NextResponse.json(
        { success: true, skipped: true },
        { status: 200 }
      );
      applySecurityHeaders(response, pathname);
      return response;
    }

    // v2: Async dispatch — job enqueued, worker will execute the flow
    if (result.queued) {
      const response = NextResponse.json(
        {
          success: true,
          queued: true,
          executionId: result.executionId,
          message: "Webhook accepted — execution queued",
        },
        { status: 202 }
      );
      applySecurityHeaders(response, pathname);
      return response;
    }

    const response = NextResponse.json(
      {
        success: result.success,
        ...(result.success
          ? {
              executionId: result.executionId,
              conversationId: result.conversationId,
            }
          : { error: result.error }),
      },
      { status: result.status }
    );

    // Rate limit headers
    if (result.status === 429) {
      response.headers.set("Retry-After", "60");
    }

    applySecurityHeaders(response, pathname);
    return response;
  } catch (error) {
    logger.error("Webhook trigger endpoint failed", error, { agentId, webhookId });

    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, pathname);
    return response;
  }
}
