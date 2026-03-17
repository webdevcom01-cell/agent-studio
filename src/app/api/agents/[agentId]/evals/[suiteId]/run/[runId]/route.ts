import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string; runId: string }>;
}

/**
 * GET /api/agents/[agentId]/evals/[suiteId]/run/[runId]
 * Full run detail with per-test-case results and assertion breakdowns.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId, runId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Verify suite belongs to agent
    const suite = await prisma.evalSuite.findUnique({
      where: { id: suiteId, agentId },
      select: { id: true, name: true },
    });
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const run = await prisma.evalRun.findUnique({
      where: { id: runId, suiteId },
      include: {
        results: {
          orderBy: { createdAt: "asc" },
          include: {
            testCase: {
              select: {
                id: true,
                label: true,
                input: true,
                tags: true,
                order: true,
              },
            },
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { success: false, error: "Eval run not found" },
        { status: 404 },
      );
    }

    // Shape the response for easy UI consumption
    const data = {
      id: run.id,
      suiteId: run.suiteId,
      suiteName: suite.name,
      status: run.status,
      score: run.score,
      passedCases: run.passedCases,
      failedCases: run.failedCases,
      totalCases: run.totalCases,
      durationMs: run.durationMs,
      triggeredBy: run.triggeredBy,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      results: run.results.map((r) => ({
        id: r.id,
        testCase: r.testCase,
        status: r.status,
        agentOutput: r.agentOutput,
        score: r.score,
        latencyMs: r.latencyMs,
        assertions: r.assertions,  // AssertionResult[]
        tokensUsed: r.tokensUsed,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (err) {
    logger.error("Failed to get eval run detail", err);
    return NextResponse.json(
      { success: false, error: "Failed to get eval run detail" },
      { status: 500 },
    );
  }
}
