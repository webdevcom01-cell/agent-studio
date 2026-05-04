import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ policyId: string }>;
}

const UpdatePolicySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  actionPattern: z.string().min(1).max(200).optional(),
  approverIds: z.array(z.string()).min(1).max(50).optional(),
  timeoutSeconds: z.number().int().min(1).max(604800).nullable().optional(),
  timeoutApprove: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

async function loadPolicy(policyId: string) {
  return prisma.approvalPolicy.findUnique({
    where: { id: policyId },
    select: { id: true, organizationId: true },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { policyId } = await params;

  const policy = await loadPolicy(policyId);
  if (!policy) return NextResponse.json({ success: false, error: "Policy not found" }, { status: 404 });

  const authResult = await requireOrgMember(policy.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const full = await prisma.approvalPolicy.findUnique({
      where: { id: policyId },
      include: { _count: { select: { decisions: true } } },
    });
    return NextResponse.json({ success: true, data: full });
  } catch (error) {
    logger.error("GET /api/policies/[policyId] error", { policyId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch policy" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { policyId } = await params;

  const policy = await loadPolicy(policyId);
  if (!policy) return NextResponse.json({ success: false, error: "Policy not found" }, { status: 404 });

  const authResult = await requireOrgMember(policy.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpdatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  try {
    const updated = await prisma.approvalPolicy.update({
      where: { id: policyId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.actionPattern !== undefined && { actionPattern: parsed.data.actionPattern }),
        ...(parsed.data.approverIds !== undefined && { approverIds: parsed.data.approverIds }),
        ...(parsed.data.timeoutSeconds !== undefined && { timeoutSeconds: parsed.data.timeoutSeconds }),
        ...(parsed.data.timeoutApprove !== undefined && { timeoutApprove: parsed.data.timeoutApprove }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PATCH /api/policies/[policyId] error", { policyId, error });
    return NextResponse.json({ success: false, error: "Failed to update policy" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { policyId } = await params;

  const policy = await loadPolicy(policyId);
  if (!policy) return NextResponse.json({ success: false, error: "Policy not found" }, { status: 404 });

  const authResult = await requireOrgMember(policy.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const pendingCount = await prisma.policyDecision.count({ where: { policyId, status: "PENDING" } });
    if (pendingCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete policy with ${pendingCount} pending decision(s).` },
        { status: 409 },
      );
    }

    await prisma.approvalPolicy.delete({ where: { id: policyId } });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/policies/[policyId] error", { policyId, error });
    return NextResponse.json({ success: false, error: "Failed to delete policy" }, { status: 500 });
  }
}
