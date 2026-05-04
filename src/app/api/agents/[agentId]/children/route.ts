import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const AssignChildSchema = z.object({
  childAgentId: z.string().cuid(),
});

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const children = await prisma.agent.findMany({
      where: { parentAgentId: agentId },
      select: { id: true, name: true, model: true, description: true, departmentId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: children });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/children error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to list child agents" }, { status: 500 });
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

  const parsed = AssignChildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { childAgentId } = parsed.data;

  if (childAgentId === agentId) {
    return NextResponse.json({ success: false, error: "An agent cannot be its own child" }, { status: 422 });
  }

  try {
    const child = await prisma.agent.findUnique({
      where: { id: childAgentId },
      select: { id: true, userId: true, organizationId: true },
    });

    if (!child) {
      return NextResponse.json({ success: false, error: "Child agent not found" }, { status: 404 });
    }

    const updated = await prisma.agent.update({
      where: { id: childAgentId },
      data: { parentAgentId: agentId },
      select: { id: true, name: true, parentAgentId: true },
    });

    return NextResponse.json({ success: true, data: updated }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/children error", { agentId, childAgentId, error });
    return NextResponse.json({ success: false, error: "Failed to assign child agent" }, { status: 500 });
  }
}
