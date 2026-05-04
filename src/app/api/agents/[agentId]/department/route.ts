import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const AssignDepartmentSchema = z.object({
  departmentId: z.string().cuid(),
});

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        departmentId: true,
        department: { select: { id: true, name: true, description: true, parentId: true } },
      },
    });
    if (!agent) return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: agent.department });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/department error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch department" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = AssignDepartmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { departmentId } = parsed.data;

  try {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { departmentId },
      select: { id: true, name: true, departmentId: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/department error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to assign department" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { departmentId: null },
      select: { id: true, name: true, departmentId: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("DELETE /api/agents/[agentId]/department error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to remove department" }, { status: 500 });
  }
}
