import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    logger.error("Failed to respond to approval", err, {});
    return NextResponse.json(
      { success: false, error: "Failed to respond to approval" },
      { status: 500 }
    );
  }
}
