import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { checkoutTask, releaseCheckout, getCheckout } from "@/lib/tasks/atomic-checkout";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

const CheckoutSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  ttlSeconds: z.number().int().min(1).max(86400).optional(),
});

const ReleaseSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
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

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { agentId, sessionId, ttlSeconds } = parsed.data;

  const checkout = await checkoutTask(taskId, agentId, sessionId, ttlSeconds);

  if (!checkout) {
    const current = await getCheckout(taskId);
    logger.info("Task checkout conflict", { taskId, requestedBy: agentId, heldBy: current?.agentId });
    return NextResponse.json(
      { success: false, error: "Task is already checked out", data: current },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, data: checkout });
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { taskId } = await params;

  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = ReleaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { agentId, sessionId } = parsed.data;

  const released = await releaseCheckout(taskId, agentId, sessionId);

  if (!released) {
    return NextResponse.json(
      { success: false, error: "Not the lock owner or lock has expired" },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true, data: null });
}
