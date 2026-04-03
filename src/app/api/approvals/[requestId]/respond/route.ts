import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { promoteInstinctToSkill } from "@/lib/ecc/instinct-engine";

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

const respondSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  response: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { requestId } = await params;
    const body = await request.json();
    const parsed = respondSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const approvalRequest = await prisma.humanApprovalRequest.findFirst({
      where: {
        id: requestId,
        userId: authResult.userId,
        status: "pending",
      },
    });

    if (!approvalRequest) {
      return NextResponse.json(
        { success: false, error: "Approval request not found or already resolved" },
        { status: 404 }
      );
    }

    const updated = await prisma.humanApprovalRequest.update({
      where: { id: requestId },
      data: {
        status: parsed.data.decision,
        response: parsed.data.response ?? null,
        resolvedAt: new Date(),
      },
    });

    // If this was an instinct promotion approval, trigger the actual Skill creation
    let promotionResult: { skillId: string } | null = null;
    if (
      parsed.data.decision === "approved" &&
      approvalRequest.contextData !== null
    ) {
      const ctx = approvalRequest.contextData as Record<string, unknown>;
      if (
        ctx.type === "instinct_promotion" &&
        typeof ctx.instinctId === "string" &&
        typeof ctx.skillContent === "string"
      ) {
        try {
          promotionResult = await promoteInstinctToSkill(ctx.instinctId, ctx.skillContent);
          logger.info("Instinct promoted after approval", {
            requestId,
            instinctId: ctx.instinctId,
            skillId: promotionResult.skillId,
          });
        } catch (promoteErr) {
          logger.error("Failed to promote instinct after approval", promoteErr, {
            requestId,
            instinctId: ctx.instinctId,
          });
          // Don't fail the approval response — admin decision is already recorded
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...updated, promotionResult },
    });
  } catch (err) {
    logger.error("Failed to respond to approval", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to respond to approval" },
      { status: 500 }
    );
  }
}
