import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { UpdateEvalSuiteSchema } from "@/lib/evals/schemas";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string }>;
}

async function getSuiteOrNotFound(suiteId: string, agentId: string) {
  const suite = await prisma.evalSuite.findUnique({
    where: { id: suiteId, agentId },
  });
  return suite;
}

/**
 * GET /api/agents/[agentId]/evals/[suiteId]
 * Get suite detail including all test cases and recent runs.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await prisma.evalSuite.findUnique({
      where: { id: suiteId, agentId },
      include: {
        testCases: {
          orderBy: { order: "asc" },
          include: {
            results: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                score: true,
                latencyMs: true,
                createdAt: true,
              },
            },
          },
        },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            score: true,
            passedCases: true,
            failedCases: true,
            totalCases: true,
            durationMs: true,
            triggeredBy: true,
            createdAt: true,
            completedAt: true,
          },
        },
        _count: { select: { testCases: true, runs: true } },
      },
    });

    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: suite });
  } catch (err) {
    logger.error("Failed to get eval suite", err);
    return NextResponse.json(
      { success: false, error: "Failed to get eval suite" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/agents/[agentId]/evals/[suiteId]
 * Update suite name, description, or isDefault flag.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const existing = await getSuiteOrNotFound(suiteId, agentId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = UpdateEvalSuiteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // If marking as default, clear existing default first
    if (parsed.data.isDefault === true) {
      await prisma.evalSuite.updateMany({
        where: { agentId, isDefault: true, id: { not: suiteId } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.evalSuite.update({
      where: { id: suiteId },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    logger.error("Failed to update eval suite", err);
    return NextResponse.json(
      { success: false, error: "Failed to update eval suite" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/agents/[agentId]/evals/[suiteId]
 * Delete suite + all test cases + all runs (cascade via Prisma schema).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const existing = await getSuiteOrNotFound(suiteId, agentId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    await prisma.evalSuite.delete({ where: { id: suiteId } });

    logger.info("eval_suite_deleted", { suiteId, agentId });
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to delete eval suite", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete eval suite" },
      { status: 500 },
    );
  }
}
