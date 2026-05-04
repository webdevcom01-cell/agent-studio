import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveDecision } from "@/lib/governance/approval-engine";

interface RouteParams {
  params: Promise<{ decisionId: string }>;
}

const ResolveDecisionSchema = z.object({
  resolution: z.enum(["APPROVED", "REJECTED"]),
  resolverNote: z.string().max(2000).optional(),
});

async function loadDecision(decisionId: string) {
  return prisma.policyDecision.findUnique({
    where: { id: decisionId },
    select: { id: true, organizationId: true, status: true },
  });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { decisionId } = await params;

  const decision = await loadDecision(decisionId);
  if (!decision) return NextResponse.json({ success: false, error: "Decision not found" }, { status: 404 });

  const authResult = await requireOrgMember(decision.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const full = await prisma.policyDecision.findUnique({
      where: { id: decisionId },
      include: { policy: { select: { id: true, name: true, actionPattern: true, approverIds: true } } },
    });
    return NextResponse.json({ success: true, data: full });
  } catch (error) {
    logger.error("GET /api/decisions/[decisionId] error", { decisionId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch decision" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { decisionId } = await params;

  const decision = await loadDecision(decisionId);
  if (!decision) return NextResponse.json({ success: false, error: "Decision not found" }, { status: 404 });

  if (decision.status !== "PENDING") {
    return NextResponse.json(
      { success: false, error: `Decision is already ${decision.status}` },
      { status: 409 },
    );
  }

  const authResult = await requireOrgMember(decision.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  const userAuthResult = await requireAuth(request);
  if (isAuthError(userAuthResult)) return userAuthResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ResolveDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  try {
    const { decision: resolved } = await resolveDecision(
      decisionId,
      parsed.data.resolution,
      userAuthResult.userId,
      parsed.data.resolverNote,
    );
    return NextResponse.json({ success: true, data: resolved });
  } catch (error) {
    logger.error("POST /api/decisions/[decisionId] error", { decisionId, error });
    return NextResponse.json({ success: false, error: "Failed to resolve decision" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { decisionId } = await params;

  const decision = await loadDecision(decisionId);
  if (!decision) return NextResponse.json({ success: false, error: "Decision not found" }, { status: 404 });

  const authResult = await requireOrgMember(decision.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    if (decision.status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Cannot cancel decision in ${decision.status} state` },
        { status: 409 },
      );
    }

    const cancelled = await prisma.policyDecision.update({
      where: { id: decisionId },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    return NextResponse.json({ success: true, data: cancelled });
  } catch (error) {
    logger.error("DELETE /api/decisions/[decisionId] error", { decisionId, error });
    return NextResponse.json({ success: false, error: "Failed to cancel decision" }, { status: 500 });
  }
}
