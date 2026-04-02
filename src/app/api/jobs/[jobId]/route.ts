import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/queue";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { jobId } = await params;

  const status = await getJobStatus(jobId);

  if (!status) {
    return NextResponse.json(
      { success: false, error: "Job not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      jobId,
      state: status.state,
      progress: status.progress,
      result: status.state === "completed" ? status.result : undefined,
      error: status.state === "failed" ? status.failedReason : undefined,
    },
  });
}
