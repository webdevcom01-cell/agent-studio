import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getContext, setContext } from "@/lib/heartbeat/context-manager";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const SetContextSchema = z.object({
  key: z.string().min(1).max(200).regex(/^[a-zA-Z_][a-zA-Z0-9_.]*$/),
  value: z.unknown(),
  ttlSeconds: z.number().int().positive().optional(),
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
    const context = await getContext(agentId);
    return NextResponse.json({ success: true, data: context });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/heartbeat/context error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch context" }, { status: 500 });
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

  const parsed = SetContextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { key, value, ttlSeconds, organizationId } = parsed.data;

  try {
    await setContext(agentId, organizationId, key, value, ttlSeconds);
    return NextResponse.json({ success: true, data: { key } }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/heartbeat/context error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to set context" }, { status: 500 });
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
    const result = await prisma.heartbeatContext.deleteMany({ where: { agentId } });
    return NextResponse.json({ success: true, data: { deletedCount: result.count } });
  } catch (error) {
    logger.error("DELETE /api/agents/[agentId]/heartbeat/context error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to clear context" }, { status: 500 });
  }
}
