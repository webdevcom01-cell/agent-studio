import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getTask, cancelTask } from "@/lib/managed-tasks/manager";

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/tasks/[taskId]/cancel — Cancel a managed task
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; taskId: string }> }
) {
  const { agentId, taskId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const task = await getTask(taskId);
    if (!task || task.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    const updated = await cancelTask(taskId);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to cancel task";
    // Surface domain errors (e.g. "Task already in terminal status") as 409
    if (msg.includes("terminal status")) {
      return NextResponse.json({ success: false, error: msg }, { status: 409 });
    }
    logger.error("Failed to cancel managed task", { agentId, taskId, error });
    return NextResponse.json(
      { success: false, error: "Failed to cancel task" },
      { status: 500 }
    );
  }
}
