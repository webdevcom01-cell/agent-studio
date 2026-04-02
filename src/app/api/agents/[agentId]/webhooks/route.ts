/**
 * GET  /api/agents/[agentId]/webhooks — list all webhook configs for agent
 * POST /api/agents/[agentId]/webhooks — create a new webhook config
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import { applySecurityHeaders } from "@/lib/api/security-headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/verify";
import { auditWebhookCreate } from "@/lib/security/audit";

const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  eventFilters: z.array(z.string().min(1).max(100)).max(50).optional().default([]),
  bodyMappings: z
    .array(
      z.object({
        jsonPath: z.string().min(1),
        variableName: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
        type: z.enum(["string", "number", "boolean", "object"]).optional(),
      })
    )
    .max(20)
    .optional()
    .default([]),
  headerMappings: z
    .array(
      z.object({
        headerName: z.string().min(1),
        variableName: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
      })
    )
    .max(20)
    .optional()
    .default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const webhooks = await prisma.webhookConfig.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        triggerCount: true,
        failureCount: true,
        lastTriggeredAt: true,
        nodeId: true,
        eventFilters: true,
        bodyMappings: true,
        headerMappings: true,
        createdAt: true,
        updatedAt: true,
        // Secret intentionally omitted — revealed only in detail endpoint
        _count: { select: { executions: true } },
      },
    });

    const response = NextResponse.json({ success: true, data: webhooks });
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to list webhook configs", error, { agentId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<NextResponse> {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const raw = await parseBodyWithLimit(request);
    const parsed = CreateWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      const response = NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 422 }
      );
      applySecurityHeaders(response, request.nextUrl.pathname);
      return response;
    }

    const { name, description, eventFilters, bodyMappings, headerMappings } = parsed.data;

    const plaintextSecret = generateWebhookSecret();
    const { encrypted, isEncrypted } = encryptWebhookSecret(plaintextSecret);

    const webhook = await prisma.webhookConfig.create({
      data: {
        agentId,
        name,
        description,
        secret: encrypted,
        secretEncrypted: isEncrypted,
        eventFilters,
        bodyMappings,
        headerMappings,
      },
      select: {
        id: true,
        name: true,
        description: true,
        enabled: true,
        eventFilters: true,
        bodyMappings: true,
        headerMappings: true,
        createdAt: true,
      },
    });

    logger.info("Webhook config created", { agentId, webhookId: webhook.id });

    // Compliance audit — fire-and-forget
    auditWebhookCreate(authResult.userId, webhook.id, agentId);

    // Return plaintext secret ONCE — never stored in plaintext if encryption is configured
    const response = NextResponse.json(
      { success: true, data: { ...webhook, secret: plaintextSecret } },
      { status: 201 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  } catch (error) {
    logger.error("Failed to create webhook config", error, { agentId });
    const response = NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
    applySecurityHeaders(response, request.nextUrl.pathname);
    return response;
  }
}
