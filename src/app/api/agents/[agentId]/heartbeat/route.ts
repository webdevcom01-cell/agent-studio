import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { validateCronExpression, validateTimezone } from "@/lib/scheduler/cron-validator";
import { scheduleHeartbeat, unscheduleHeartbeat } from "@/lib/heartbeat/heartbeat-scheduler";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const UpsertHeartbeatSchema = z.object({
  cronExpression: z.string().min(1),
  timezone: z.string().optional(),
  systemPrompt: z.string().max(10_000).optional().nullable(),
  maxContextItems: z.number().int().min(1).max(500).optional(),
  enabled: z.boolean().optional(),
  organizationId: z.string().cuid(),
});

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const config = await prisma.heartbeatConfig.findUnique({
      where: { agentId },
      include: { _count: { select: { runs: true } } },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/heartbeat error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch heartbeat config" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpsertHeartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { cronExpression, timezone = "UTC", systemPrompt, maxContextItems, enabled = true, organizationId } = parsed.data;

  const cronValidation = validateCronExpression(cronExpression);
  if (!cronValidation.valid) {
    return NextResponse.json({ success: false, error: `Invalid cron expression: ${cronValidation.error}` }, { status: 422 });
  }

  const tzValidation = validateTimezone(timezone);
  if (!tzValidation.valid) {
    return NextResponse.json({ success: false, error: `Invalid timezone: ${tzValidation.error}` }, { status: 422 });
  }

  try {
    const config = await prisma.heartbeatConfig.upsert({
      where: { agentId },
      update: {
        cronExpression,
        timezone,
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(maxContextItems !== undefined && { maxContextItems }),
        enabled,
      },
      create: { agentId, organizationId, cronExpression, timezone, systemPrompt, maxContextItems: maxContextItems ?? 50, enabled },
    });

    await scheduleHeartbeat(config.id);

    return NextResponse.json({ success: true, data: config }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/heartbeat error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to save heartbeat config" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const config = await prisma.heartbeatConfig.findUnique({ where: { agentId }, select: { id: true } });

    if (!config) {
      return NextResponse.json({ success: false, error: "Heartbeat config not found" }, { status: 404 });
    }

    await unscheduleHeartbeat(config.id);

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/agents/[agentId]/heartbeat error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to disable heartbeat" }, { status: 500 });
  }
}
