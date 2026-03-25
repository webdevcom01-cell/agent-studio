import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/traces/[traceId] — full trace with nodeTraces payload
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; traceId: string }> }
) {
  const { agentId, traceId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trace = await (prisma as any).flowTrace.findFirst({
      where: { id: traceId, agentId },
    });

    if (!trace) {
      return NextResponse.json(
        { success: false, error: "Trace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: trace });
  } catch (error) {
    logger.error("Failed to get trace", { agentId, traceId, error });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[agentId]/traces/[traceId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; traceId: string }> }
) {
  const { agentId, traceId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).flowTrace.findFirst({
      where: { id: traceId, agentId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Trace not found" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).flowTrace.delete({ where: { id: traceId } });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    logger.error("Failed to delete trace", { agentId, traceId, error });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
