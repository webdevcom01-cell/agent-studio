import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { CreateEvalSuiteSchema } from "@/lib/evals/schemas";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

// Max suites per agent — prevent abuse
const MAX_SUITES_PER_AGENT = 20;

/**
 * GET /api/agents/[agentId]/evals
 * List all eval suites for an agent with test case counts and last run summary.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suites = await prisma.evalSuite.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { testCases: true, runs: true } },
        runs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            score: true,
            passedCases: true,
            failedCases: true,
            totalCases: true,
            createdAt: true,
          },
        },
      },
    });

    const data = suites.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isDefault: s.isDefault,
      runOnDeploy: s.runOnDeploy,
      testCaseCount: s._count.testCases,
      runCount: s._count.runs,
      lastRun: s.runs[0] ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (err) {
    logger.error("Failed to list eval suites", err);
    return NextResponse.json(
      { success: false, error: "Failed to list eval suites" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/agents/[agentId]/evals
 * Create a new eval suite for an agent.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Enforce per-agent suite limit
    const existingCount = await prisma.evalSuite.count({ where: { agentId } });
    if (existingCount >= MAX_SUITES_PER_AGENT) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_SUITES_PER_AGENT} eval suites per agent reached` },
        { status: 422 },
      );
    }

    const body = await request.json();
    const parsed = CreateEvalSuiteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // If marking as default, clear existing default first
    if (parsed.data.isDefault) {
      await prisma.evalSuite.updateMany({
        where: { agentId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const suite = await prisma.evalSuite.create({
      data: {
        agentId,
        name: parsed.data.name,
        description: parsed.data.description,
        isDefault: parsed.data.isDefault ?? false,
        runOnDeploy: parsed.data.runOnDeploy ?? false,
      },
      include: {
        _count: { select: { testCases: true, runs: true } },
      },
    });

    logger.info("eval_suite_created", { suiteId: suite.id, agentId });
    return NextResponse.json({ success: true, data: suite }, { status: 201 });
  } catch (err) {
    logger.error("Failed to create eval suite", err);
    return NextResponse.json(
      { success: false, error: "Failed to create eval suite" },
      { status: 500 },
    );
  }
}
