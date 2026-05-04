import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { renewCheckout } from "@/lib/tasks/atomic-checkout";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

const RenewSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  ttlSeconds: z.number().int().min(1).max(86400).optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { taskId } = await params;

  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = RenewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { agentId, sessionId, ttlSeconds } = parsed.data;

  const renewed = await renewCheckout(taskId, agentId, sessionId, ttlSeconds);

  if (!renewed) {
    logger.warn("Checkout renew failed — not owner or expired", { taskId, agentId });
    return NextResponse.json(
      { success: false, error: "Not the lock owner or lock has expired" },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true, data: { taskId, agentId, sessionId } });
}
