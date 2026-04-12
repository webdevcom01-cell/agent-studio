import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { createPipelineRun, listPipelineRuns } from "@/lib/sdlc/pipeline-manager";
import { analyzeTask, buildPipelineConfig } from "@/lib/ecc/meta-orchestrator";
import { addPipelineRunJob } from "@/lib/queue";
import type { PipelineRunStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/pipelines — List pipeline runs
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as PipelineRunStatus | null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await listPipelineRuns(agentId, {
      status: status ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to list pipeline runs", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to list pipeline runs" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/pipelines — Analyze task, create + enqueue run
// ---------------------------------------------------------------------------

const CreatePipelineRunSchema = z.object({
  /** The task description to analyze and run through the SDLC pipeline */
  taskDescription: z.string().min(1).max(5000),
  /**
   * Optional pipeline override — skip meta-orchestrator analysis and use
   * this exact list of step IDs. Useful for testing or fixed pipelines.
   */
  pipelineOverride: z.array(z.string().min(1)).optional(),
  /** Optional Claude model to use for agent steps */
  modelId: z.string().optional(),
  /**
   * Force keyword-based analysis instead of LLM classification.
   * Faster and free — useful when cost matters more than accuracy.
   */
  useLLMAnalysis: z.boolean().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  try {
    const body: unknown = await req.json();
    const parsed = CreatePipelineRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 },
      );
    }

    const { taskDescription, pipelineOverride, modelId, useLLMAnalysis } = parsed.data;

    // Step 1: Analyze the task to determine pipeline (unless overridden)
    let taskType: string;
    let complexity: string;
    let pipeline: string[];

    if (pipelineOverride && pipelineOverride.length > 0) {
      taskType = "custom";
      complexity = "moderate";
      pipeline = pipelineOverride;
    } else {
      const analysis = await analyzeTask(taskDescription, { useLLM: useLLMAnalysis });
      taskType = analysis.taskType;
      complexity = analysis.complexity;
      pipeline = analysis.pipeline;
    }

    // Step 2: Enrich pipeline into structured steps (validates step IDs)
    buildPipelineConfig(pipeline); // validates + enriches — we store raw pipeline array

    // Step 3: Create DB record
    const run = await createPipelineRun({
      taskDescription,
      taskType,
      complexity,
      pipeline,
      agentId,
      userId,
    });

    // Step 4: Enqueue the pipeline runner job
    const jobId = await addPipelineRunJob({
      pipelineRunId: run.id,
      agentId,
      userId,
      modelId,
    });

    logger.info("Pipeline run created and enqueued", {
      runId: run.id,
      jobId,
      agentId,
      taskType,
      steps: pipeline.length,
    });

    return NextResponse.json({ success: true, data: run }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create pipeline run", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to create pipeline run" },
      { status: 500 },
    );
  }
}
