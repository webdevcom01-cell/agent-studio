import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { generateUserExport } from "@/lib/gdpr/data-export";
import { logger } from "@/lib/logger";

/**
 * POST /api/user/export — Generate data export (JSON download)
 */
export async function POST(): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const exportData = await generateUserExport(authResult.userId);

    return NextResponse.json({
      success: true,
      data: exportData,
    });
  } catch (err) {
    logger.error("Data export failed", err, { userId: authResult.userId });
    return NextResponse.json(
      { success: false, error: "Export generation failed" },
      { status: 500 },
    );
  }
}
