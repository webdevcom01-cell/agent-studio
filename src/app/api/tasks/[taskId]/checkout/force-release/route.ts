import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isAuthError } from "@/lib/api/auth-guard";
import { forceRelease } from "@/lib/tasks/atomic-checkout";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { taskId } = await params;

  const authResult = await requireAdmin(request);
  if (isAuthError(authResult)) return authResult;

  const released = await forceRelease(taskId);

  logger.info("Force-release requested", { taskId, released, adminId: authResult.userId });

  return NextResponse.json({ success: true, data: { taskId, released } });
}
