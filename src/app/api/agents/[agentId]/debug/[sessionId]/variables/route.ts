/**
 * POST /api/agents/[agentId]/debug/[sessionId]/variables
 *
 * Store variable overrides for the paused debug session.
 * These values will be merged into context.variables when the flow resumes.
 *
 * Body: { variables: Record<string, unknown> }
 *
 * Protected by requireAgentOwner.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import {
  isDebugSessionActive,
  setVariableOverrides,
} from "@/lib/runtime/debug-controller";
import { logger } from "@/lib/logger";

// Max variables payload: 50 entries, each value limited by Zod's passthrough
const VariablesSchema = z.object({
  variables: z.record(z.string(), z.unknown()).refine(
    (v) => Object.keys(v).length <= 50,
    "Maximum 50 variable overrides per request"
  ),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; sessionId: string }> }
) {
  const { agentId, sessionId } = await params;

  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

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

  const parsed = VariablesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 422 }
    );
  }

  // Validate session exists (must be currently paused/active)
  const active = await isDebugSessionActive(sessionId);
  if (!active) {
    return NextResponse.json(
      { success: false, error: "Debug session not found or already completed" },
      { status: 404 }
    );
  }

  await setVariableOverrides(sessionId, parsed.data.variables);

  logger.info("Variable overrides stored", {
    agentId,
    sessionId,
    count: Object.keys(parsed.data.variables).length,
  });

  return NextResponse.json({
    success: true,
    data: { sessionId, count: Object.keys(parsed.data.variables).length },
  });
}
