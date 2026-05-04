import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CreatePolicySchema = z.object({
  agentId: z.string().cuid(),
  organizationId: z.string().cuid(),
  name: z.string().min(1).max(200),
  actionPattern: z.string().min(1).max(200),
  approverIds: z.array(z.string()).min(1).max(50),
  timeoutSeconds: z.number().int().min(1).max(604800).nullable().optional(),
  timeoutApprove: z.boolean().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const orgId = request.nextUrl.searchParams.get("orgId");
  const agentId = request.nextUrl.searchParams.get("agentId") ?? undefined;

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId query param required" }, { status: 400 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const policies = await prisma.approvalPolicy.findMany({
      where: {
        organizationId: orgId,
        ...(agentId && { agentId }),
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { decisions: true } } },
    });

    return NextResponse.json({ success: true, data: policies });
  } catch (error) {
    logger.error("GET /api/policies error", { orgId, error });
    return NextResponse.json({ success: false, error: "Failed to list policies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = CreatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { agentId, organizationId, name, actionPattern, approverIds, timeoutSeconds, timeoutApprove } = parsed.data;

  const authResult = await requireOrgMember(organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
    if (!agent) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const policy = await prisma.approvalPolicy.create({
      data: {
        agentId,
        organizationId,
        name,
        actionPattern,
        approverIds,
        timeoutSeconds: timeoutSeconds ?? null,
        timeoutApprove: timeoutApprove ?? false,
      },
    });

    return NextResponse.json({ success: true, data: policy }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/policies error", { agentId, organizationId, error });
    return NextResponse.json({ success: false, error: "Failed to create policy" }, { status: 500 });
  }
}
