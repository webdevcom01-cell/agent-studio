import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { runEvalSuite } from "@/lib/evals/runner";
import { CompareEvalRunSchema } from "@/lib/evals/schemas";
import type { EvalRunSummary } from "@/lib/evals/runner";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string }>;
}

export interface ComparisonDelta {
  scoreDiff: number;        // runA.score - runB.score (positive = A wins)
  latencyDiffMs: number;    // avg latency A - avg latency B
  aWins: number;            // test cases where A scored higher
  bWins: number;            // test cases where B scored higher
  ties: number;             // test cases with equal scores
  winner: "a" | "b" | "tie";
}

export interface CompareResult {
  runA: EvalRunSummary & { runId: string };
  runB: EvalRunSummary & { runId: string };
  labelA: string;
  labelB: string;
  delta: ComparisonDelta;
}

/**
 * POST /api/agents/[agentId]/evals/[suiteId]/compare
 * Run a head-to-head A/B comparison between two flow versions or two models.
 * Runs A then B sequentially, links them via comparisonRunId, returns delta.
 *
 * Body: { type: "version" | "model", a: string, b: string }
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Verify suite exists and has test cases
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
        { success: false, error: "Cannot compare — suite has no test cases" },
        { status: 422 },
      );
    }

    // Validate body
    const body = await request.json().catch(() => ({}));
    const parsed = CompareEvalRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    const { type, a, b } = parsed.data;

    // Validate version IDs when comparing by version
    let labelA = a;
    let labelB = b;

    if (type === "version") {
      const [versionA, versionB] = await Promise.all([
        prisma.flowVersion.findFirst({
          where: { id: a, flow: { agentId } },
          select: { id: true, label: true, createdAt: true },
        }),
        prisma.flowVersion.findFirst({
          where: { id: b, flow: { agentId } },
          select: { id: true, label: true, createdAt: true },
        }),
      ]);

      if (!versionA) {
        return NextResponse.json(
          { success: false, error: "Flow version A not found" },
          { status: 404 },
        );
      }
      if (!versionB) {
        return NextResponse.json(
          { success: false, error: "Flow version B not found" },
          { status: 404 },
        );
      }

      labelA = versionA.label ?? `v${versionA.createdAt.toISOString().split("T")[0]}`;
      labelB = versionB.label ?? `v${versionB.createdAt.toISOString().split("T")[0]}`;
    }

    // Determine base URL + auth for internal chat calls
    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") ?? "http";
    const baseUrl = `${protocol}://${host}`;
    const cookieHeader = request.headers.get("cookie") ?? undefined;

    logger.info("eval_compare_started", { suiteId, agentId, type, labelA, labelB });

    // Run A first — pass flowVersionId or modelOverride based on type
    const summaryA = await runEvalSuite(suiteId, agentId, {
      baseUrl,
      triggeredBy: "compare",
      authHeader: cookieHeader,
      ...(type === "version" ? { flowVersionId: a } : { modelOverride: a }),
    });

    // Run B — using the runId from A as comparisonRunId for A
    // We'll link them after both runs complete
    const summaryB = await runEvalSuite(suiteId, agentId, {
      baseUrl,
      triggeredBy: "compare",
      authHeader: cookieHeader,
      ...(type === "version" ? { flowVersionId: b } : { modelOverride: b }),
      comparisonRunId: summaryA.runId,
    });

    // Link A → B as well (mutual reference)
    await prisma.$executeRaw`
      UPDATE "EvalRun"
      SET "comparisonRunId" = ${summaryB.runId}
      WHERE id = ${summaryA.runId}
    `.catch((err: unknown) => {
      // Non-fatal: linking is cosmetic, runs already complete
      logger.warn("eval_compare: failed to link runA comparisonRunId", { err });
    });

    // Calculate delta from per-case results
    const delta = calculateDelta(summaryA, summaryB);

    logger.info("eval_compare_completed", {
      suiteId,
      agentId,
      runAId: summaryA.runId,
      runBId: summaryB.runId,
      scoreA: summaryA.score,
      scoreB: summaryB.score,
      winner: delta.winner,
    });

    const result: CompareResult = {
      runA: { ...summaryA, runId: summaryA.runId },
      runB: { ...summaryB, runId: summaryB.runId },
      labelA,
      labelB,
      delta,
    };

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err) {
    logger.error("Failed to run eval comparison", err);
    return NextResponse.json(
      { success: false, error: "Failed to run comparison" },
      { status: 500 },
    );
  }
}

// ─── Delta calculator ─────────────────────────────────────────────────────────

function calculateDelta(
  summaryA: EvalRunSummary,
  summaryB: EvalRunSummary,
): ComparisonDelta {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  // Compare per-case scores
  const casesA = summaryA.results;
  const casesB = summaryB.results;

  const maxLen = Math.max(casesA.length, casesB.length);
  for (let i = 0; i < maxLen; i++) {
    const scoreA = casesA[i]?.score ?? 0;
    const scoreB = casesB[i]?.score ?? 0;
    if (scoreA > scoreB) aWins++;
    else if (scoreB > scoreA) bWins++;
    else ties++;
  }

  // Average latency
  const avgLatencyA =
    casesA.length > 0
      ? casesA.reduce((acc, c) => acc + c.latencyMs, 0) / casesA.length
      : 0;
  const avgLatencyB =
    casesB.length > 0
      ? casesB.reduce((acc, c) => acc + c.latencyMs, 0) / casesB.length
      : 0;

  const scoreDiff = summaryA.score - summaryB.score;
  const winner: "a" | "b" | "tie" =
    aWins > bWins ? "a" : bWins > aWins ? "b" : "tie";

  return {
    scoreDiff: Math.round(scoreDiff * 1000) / 1000,
    latencyDiffMs: Math.round(avgLatencyA - avgLatencyB),
    aWins,
    bWins,
    ties,
    winner,
  };
}
