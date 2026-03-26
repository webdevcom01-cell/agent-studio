/**
 * POST /api/agents/[agentId]/debug/[sessionId]/control
 *
 * Send a resume command to a paused debug session.
 * Body: { action: "continue" | "step" | "stop" }
 *
 * Protected by requireAgentOwner — only the agent's owner can control
 * breakpoint sessions running on that agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import {
  sendDebugCommand,
  isDebugSessionActive,
} from "@/lib/runtime/debug-controller";
import { logger } from "@/lib/logger";

const ControlSchema = z.object({
  action: z.enum(["continue", "step", "stop"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; sessionId: string }> }
) {
  const { agentId, sessionId } = await params;

  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  // Validate session ID format (cuid-like or uuid)
  if (!sessionId || sessionId.length < 8 || sessionId.length > 64) {
    return NextResponse.json(
      { success: false, error: "Invalid session ID" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = ControlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "action must be one of: continue, step, stop" },
      { status: 422 }
    );
  }

  const { action } = parsed.data;

  // Check that the session actually exists (prevents blind commands)
  const active = await isDebugSessionActive(sessionId);
  if (!active) {
    return NextResponse.json(
      { success: false, error: "Debug session not found or already completed" },
      { status: 404 }
    );
  }

  const ok = await sendDebugCommand(sessionId, action);
  if (!ok) {
    logger.warn("sendDebugCommand returned false", { agentId, sessionId, action });
    return NextResponse.json(
      { success: false, error: "Failed to send command to debug session" },
      { status: 500 }
    );
  }

  logger.info("Debug command sent", { agentId, sessionId, action });

  return NextResponse.json({ success: true, data: { sessionId, action } });
}
