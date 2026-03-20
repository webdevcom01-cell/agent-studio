/**
 * GET    /api/agents/[agentId]/webhooks/[webhookId] — get detail + recent executions
 * PATCH  /api/agents/[agentId]/webhooks/[webhookId] — update name, description, enabled, mappings
 * DELETE /api/agents/[agentId]/webhooks/[webhookId] — delete webhook config
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  eventFilters: z.array(z.string().min(1).max(100)).max(50).optional(),
  bodyMappings: z
    .array(
      z.object({
        jsonPath: z.string().min(1),
        variableName: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        type: z.enum(["string", "number", "boolean", "object"]).optional(),
      })
    )
    .max(20)
    .optional(),
  headerMappings: z
    .array(
      z.object({
        headerName: z.string().min(1),
        variableName: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      })
    )
    .max(20)
    .optional(),
});

async function resolveWebhook(agentId: string, webhookId: string) {
  return prisma.webhookConfig.findFirst({ where: { id: webhookId, agentId } });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: webhookId, agentId },
      include: {
        executions: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            status: true,
            triggeredAt: true,
            completedAt: true,
            durationMs: true,
            eventType: true,
            sourceIp: true,
            conversationId: true,
            errorMessage: true,
            // Replay support: expose whether a stored payload exists and replay metadata
            rawPayload: true,
            isReplay: true,
            replayOf: true,
          },
        },
      },
    });

    if (!webhook) {
      const response = NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    // Never expose the raw or encrypted secret in GET responses.
    // Secret is only returned on creation and rotation.
    const { secret: _secret, secretEncrypted: _flag, ...safeWebhook } = webhook;
    const response = NextResponse.json({ success: true, data: safeWebhook });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to get webhook config", error, { agentId, webhookId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const existing = await resolveWebhook(agentId, webhookId);
    if (!existing) {
      const response = NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const raw = await parseBodyWithLimit(request);
    const parsed = UpdateWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      const response = NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 422 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const updated = await prisma.webhookConfig.update({
      where: { id: webhookId },
      data: parsed.data,
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        eventFilters: true,
        bodyMappings: true,
        headerMappings: true,
        updatedAt: true,
      },
    });

    const response = NextResponse.json({ success: true, data: updated });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to update webhook config", error, { agentId, webhookId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; webhookId: string }> }
): Promise<NextResponse> {
  const { agentId, webhookId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const existing = await resolveWebhook(agentId, webhookId);
    if (!existing) {
      const response = NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    await prisma.webhookConfig.delete({ where: { id: webhookId } });

    logger.info("Webhook config deleted", { agentId, webhookId });

    const response = NextResponse.json({ success: true, data: { deleted: true } });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to delete webhook config", error, { agentId, webhookId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}
