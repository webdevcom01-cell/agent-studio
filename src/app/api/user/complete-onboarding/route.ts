import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    await prisma.user.update({
      where: { id: authResult.userId },
      data: { onboardingCompletedAt: new Date() },
    });

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("Failed to complete onboarding", { userId: authResult.userId, error });
    return NextResponse.json(
      { success: false, error: "Failed to complete onboarding" },
      { status: 500 },
    );
  }
}
