import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getTask } from "@/lib/managed-tasks/manager";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/tasks/[taskId] — Get a single managed task
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; taskId: string }> }
) {
  const { agentId, taskId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const task = await getTask(taskId);
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    // Verify the task belongs to this agent
    if (task.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    logger.error("Failed to get managed task", { agentId, taskId, error });
    return NextResponse.json(
      { success: false, error: "Failed to get task" },
      { status: 500 }
    );
  }
}
