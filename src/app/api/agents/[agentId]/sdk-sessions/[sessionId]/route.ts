import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import {
  loadSdkSession,
  updateSdkSession,
  deleteSdkSession,
} from "@/lib/sdk-sessions/persistence";

type RouteParams = { params: Promise<{ agentId: string; sessionId: string }> };

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/sdk-sessions/[sessionId]
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { agentId, sessionId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const session = await loadSdkSession(sessionId);
    if (!session || session.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    logger.error("Failed to load SDK session", { agentId, sessionId, error });
    return NextResponse.json(
      { success: false, error: "Failed to load session" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[agentId]/sdk-sessions/[sessionId]
// ---------------------------------------------------------------------------

const UpdateSessionSchema = z.object({
  title: z.string().max(200).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ABANDONED"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { agentId, sessionId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // Verify ownership
    const existing = await loadSdkSession(sessionId);
    if (!existing || existing.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    const body: unknown = await req.json();
    const parsed = UpdateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 }
      );
    }

    const updated = await updateSdkSession(sessionId, {
      title: parsed.data.title,
      status: parsed.data.status,
      metadata: parsed.data.metadata,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("Failed to update SDK session", { agentId, sessionId, error });
    return NextResponse.json(
      { success: false, error: "Failed to update session" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[agentId]/sdk-sessions/[sessionId]
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { agentId, sessionId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const existing = await loadSdkSession(sessionId);
    if (!existing || existing.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    await deleteSdkSession(sessionId);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Failed to delete SDK session", { agentId, sessionId, error });
    return NextResponse.json(
      { success: false, error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
