import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ policyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { policyId } = await params;
  const status = request.nextUrl.searchParams.get("status") ?? undefined;

  const policy = await prisma.approvalPolicy.findUnique({
    where: { id: policyId },
    select: { id: true, organizationId: true },
  });
  if (!policy) return NextResponse.json({ success: false, error: "Policy not found" }, { status: 404 });

  const authResult = await requireOrgMember(policy.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const decisions = await prisma.policyDecision.findMany({
      where: {
        policyId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: decisions });
  } catch (error) {
    logger.error("GET /api/policies/[policyId]/decisions error", { policyId, error });
    return NextResponse.json({ success: false, error: "Failed to list decisions" }, { status: 500 });
  }
}
