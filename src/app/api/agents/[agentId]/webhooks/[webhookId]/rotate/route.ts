/**
 * POST /api/agents/[agentId]/webhooks/[webhookId]/rotate
 *
 * Rotates the webhook signing secret.
 * The new secret is returned once — it cannot be retrieved again (only re-rotated).
 * Old secret is invalidated immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateWebhookSecret } from "@/lib/webhooks/verify";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const existing = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, agentId },
      select: { id: true },
    });

    if (!existing) {
      const response = NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const newSecret = generateWebhookSecret();

    await prisma.webhookConfig.update({
      where: { id: webhookId },
      data: { secret: newSecret },
    });

    logger.info("Webhook secret rotated", { agentId, webhookId });

    // Return the new secret — this is the ONLY time it will be shown in plaintext
    const response = NextResponse.json({
      success: true,
      data: { secret: newSecret },
    });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to rotate webhook secret", error, { agentId, webhookId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}
