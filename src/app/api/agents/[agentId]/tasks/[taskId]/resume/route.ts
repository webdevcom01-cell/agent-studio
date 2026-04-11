import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { getTask, requestResume } from "@/lib/managed-tasks/manager";
import { addManagedTaskJob } from "@/lib/queue";

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/tasks/[taskId]/resume — Resume a paused task
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; taskId: string }> }
) {
  const { agentId, taskId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const task = await getTask(taskId);
    if (!task || task.agentId !== agentId) {
      return NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      );
    }

    // requestResume sets status back to PENDING
    const updated = await requestResume(taskId);

    // Re-enqueue so the worker picks it up again
    await addManagedTaskJob({
      taskId,
      agentId,
      userId,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to resume task";
    if (msg.includes("Cannot resume task")) {
      return NextResponse.json({ success: false, error: msg }, { status: 409 });
    }
    logger.error("Failed to resume managed task", { agentId, taskId, error });
    return NextResponse.json(
      { success: false, error: "Failed to resume task" },
      { status: 500 }
    );
  }
}
