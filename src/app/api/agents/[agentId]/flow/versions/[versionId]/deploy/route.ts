import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { VersionService } from "@/lib/versioning/version-service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { triggerDeployEvals } from "@/lib/evals/deploy-hook";

interface RouteParams {
  params: Promise<{ agentId: string; versionId: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { agentId, versionId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  const rateResult = checkRateLimit(`deploy:${authResult.userId}`, 5);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note : undefined;

  try {
    const deployment = await VersionService.deployVersion(
      agentId,
      versionId,
      authResult.userId,
      note
    );

    // Fire-and-forget: run eval suites with runOnDeploy:true.
    // Extract base URL and auth cookie from the incoming request so the
    // internal chat API call is authenticated as the same user.
    const origin = request.headers.get("origin") ?? request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") ?? undefined;
    triggerDeployEvals(agentId, {
      baseUrl: origin,
      authHeader: cookieHeader,
    });

    return NextResponse.json(
      { success: true, data: deployment },
      { status: 201 }
    );
  } catch (err) {
    logger.error("Failed to deploy version", err);
    return NextResponse.json(
      { success: false, error: "Failed to deploy version" },
      { status: 500 }
    );
  }
}
