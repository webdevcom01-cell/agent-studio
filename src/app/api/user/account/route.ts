import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import {
  requestDeletion,
  cancelDeletion,
} from "@/lib/gdpr/account-deletion";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/user/account — Request account deletion (30-day grace period)
 */
export async function DELETE(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const { scheduledFor } = await requestDeletion(authResult.userId);

    return NextResponse.json({
      success: true,
      data: {
        message: "Account deletion scheduled",
        scheduledFor: scheduledFor.toISOString(),
        gracePeriodDays: 30,
      },
    });
  } catch (error) {
    logger.error("Failed to schedule account deletion", { userId: authResult.userId, error });
    return NextResponse.json(
      { success: false, error: "Failed to schedule account deletion" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/user/account — Cancel pending account deletion
 */
export async function POST(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const cancelled = await cancelDeletion(authResult.userId);

    if (!cancelled) {
      return NextResponse.json(
        { success: false, error: "No pending deletion request found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "Account deletion cancelled" },
    });
  } catch (error) {
    logger.error("Failed to cancel account deletion", { userId: authResult.userId, error });
    return NextResponse.json(
      { success: false, error: "Failed to cancel account deletion" },
      { status: 500 },
    );
  }
}
