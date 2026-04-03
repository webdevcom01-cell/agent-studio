import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { runEvalSuite, failEvalRun } from "@/lib/evals/runner";
import { TriggerEvalRunSchema } from "@/lib/evals/schemas";
import { addEvalJob } from "@/lib/queue";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string }>;
}

// Max concurrent runs per agent (prevent parallel spam)
const MAX_ACTIVE_RUNS = 1;

/**
 * POST /api/agents/[agentId]/evals/[suiteId]/run
 * Trigger a new eval run for the suite.
 * Runs synchronously — returns when all test cases are evaluated.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Check suite exists
    const suite = await prisma.evalSuite.findUnique({
      where: { id: suiteId, agentId },
      include: { _count: { select: { testCases: true } } },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    if (suite._count.testCases === 0) {
      return NextResponse.json(
        { success: false, error: "Cannot run an empty eval suite — add at least one test case" },
        { status: 422 },
      );
    }

    // Prevent multiple concurrent runs for the same suite
    const activeRuns = await prisma.evalRun.count({
      where: { suiteId, status: "RUNNING" },
    });
    if (activeRuns >= MAX_ACTIVE_RUNS) {
      return NextResponse.json(
        { success: false, error: "An eval run is already in progress for this suite" },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = TriggerEvalRunSchema.safeParse(body);
    const triggeredBy = parsed.success ? parsed.data.triggeredBy : "manual";

    // Determine base URL for internal chat API calls
    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") ?? "http";
    const baseUrl = `${protocol}://${host}`;

    // Pass auth cookie so the internal chat API call is authenticated
    const cookieHeader = request.headers.get("cookie") ?? undefined;

    logger.info("eval_run_triggered", { suiteId, agentId, triggeredBy });

    // Try to enqueue via BullMQ (non-blocking). Falls back to sync if Redis unavailable.
    try {
      const jobId = await addEvalJob({
        suiteId,
        agentId,
        triggeredBy,
        baseUrl,
        authHeader: cookieHeader,
      });

      logger.info("eval_run_queued", { suiteId, agentId, jobId });
      return NextResponse.json(
        { success: true, data: { queued: true, jobId } },
        { status: 202 },
      );
    } catch {
      // Redis unavailable — run synchronously as fallback
      logger.warn("eval queue unavailable, running synchronously", { suiteId, agentId });
    }

    // Synchronous fallback
    let summary;
    try {
      summary = await runEvalSuite(suiteId, agentId, {
        baseUrl,
        triggeredBy,
        authHeader: cookieHeader,
      });
    } catch (runErr) {
      // The runner creates the EvalRun before starting — mark it failed
      const failedRun = await prisma.evalRun.findFirst({
        where: { suiteId, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
      });
      if (failedRun) {
        await failEvalRun(failedRun.id, runErr instanceof Error ? runErr.message : "Unknown error");
      }
      throw runErr;
    }

    return NextResponse.json({ success: true, data: summary }, { status: 200 });
  } catch (err) {
    logger.error("Failed to trigger eval run", err);
    return NextResponse.json(
      { success: false, error: "Failed to run eval suite" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/agents/[agentId]/evals/[suiteId]/run
 * List run history for a suite with pagination.
 * Query params: limit (default 10, max 50), offset (default 0)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await prisma.evalSuite.findUnique({
      where: { id: suiteId, agentId },
      select: { id: true },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const [runs, total] = await Promise.all([
      prisma.evalRun.findMany({
        where: { suiteId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          status: true,
          score: true,
          passedCases: true,
          failedCases: true,
          totalCases: true,
          durationMs: true,
          triggeredBy: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.evalRun.count({ where: { suiteId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { runs, total, limit, offset },
    });
  } catch (err) {
    logger.error("Failed to list eval runs", err);
    return NextResponse.json(
      { success: false, error: "Failed to list eval runs" },
      { status: 500 },
    );
  }
}
