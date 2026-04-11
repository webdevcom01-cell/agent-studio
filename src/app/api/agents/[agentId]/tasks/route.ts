import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { createTask, listTasks } from "@/lib/managed-tasks/manager";
import { addManagedTaskJob } from "@/lib/queue";
import type { ManagedTaskStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/tasks — List managed tasks
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as ManagedTaskStatus | null;
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "20", 10),
      100
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await listTasks(agentId, {
      status: status ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to list managed tasks", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to list tasks" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/tasks — Create + enqueue a managed task
// ---------------------------------------------------------------------------

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  callbackUrl: z.string().url().optional(),
  input: z.object({
    task: z.string().min(1),
    model: z.string().optional(),
    maxSteps: z.number().int().min(1).max(200).optional(),
    enableMCP: z.boolean().optional(),
    enableSubAgents: z.boolean().optional(),
    sdkSessionId: z.string().optional(),
    outputVariable: z.string().optional(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const body: unknown = await req.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 }
      );
    }

    const task = await createTask({
      name: parsed.data.name,
      description: parsed.data.description,
      agentId,
      userId,
      input: parsed.data.input,
      callbackUrl: parsed.data.callbackUrl,
    });

    // Enqueue the task job (fire-and-forget — task is already PENDING in DB)
    const jobId = await addManagedTaskJob({
      taskId: task.id,
      agentId,
      userId,
    });

    logger.info("Managed task created and enqueued", {
      taskId: task.id,
      jobId,
      agentId,
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create managed task", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to create task" },
      { status: 500 }
    );
  }
}
