import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { EvalTestCaseInputSchema } from "@/lib/evals/schemas";

interface RouteParams {
  params: Promise<{ agentId: string; suiteId: string }>;
}

// Max test cases per suite
const MAX_TEST_CASES = 50;

const BulkUpdateSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string(),
      label: z.string().min(1).max(255).optional(),
      input: z.string().min(1).optional(),
      assertions: z.array(z.unknown()).optional(),
      tags: z.array(z.string()).optional(),
      order: z.number().int().optional(),
    }),
  ).min(1),
});

const DeleteCaseSchema = z.object({
  id: z.string().min(1),
});

async function getSuiteOrNull(suiteId: string, agentId: string) {
  return prisma.evalSuite.findUnique({ where: { id: suiteId, agentId } });
}

/**
 * GET /api/agents/[agentId]/evals/[suiteId]/cases
 * List all test cases for a suite, ordered by `order` field.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await getSuiteOrNull(suiteId, agentId);
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const cases = await prisma.evalTestCase.findMany({
      where: { suiteId },
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
            agentOutput: true,
            assertions: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: cases });
  } catch (err) {
    logger.error("Failed to list eval test cases", err);
    return NextResponse.json(
      { success: false, error: "Failed to list eval test cases" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/agents/[agentId]/evals/[suiteId]/cases
 * Add a single new test case to the suite.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await getSuiteOrNull(suiteId, agentId);
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    // Enforce per-suite case limit
    const existingCount = await prisma.evalTestCase.count({ where: { suiteId } });
    if (existingCount >= MAX_TEST_CASES) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_TEST_CASES} test cases per suite reached` },
        { status: 422 },
      );
    }

    const body = await request.json();
    const parsed = EvalTestCaseInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // Auto-set order to end of list if not provided
    const maxOrder = await prisma.evalTestCase.aggregate({
      where: { suiteId },
      _max: { order: true },
    });
    const nextOrder = parsed.data.order ?? (maxOrder._max.order ?? -1) + 1;

    const testCase = await prisma.evalTestCase.create({
      data: {
        suiteId,
        label: parsed.data.label,
        input: parsed.data.input,
        assertions: parsed.data.assertions,
        tags: parsed.data.tags,
        order: nextOrder,
      },
    });

    // Update suite's updatedAt
    await prisma.evalSuite.update({
      where: { id: suiteId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ success: true, data: testCase }, { status: 201 });
  } catch (err) {
    logger.error("Failed to create eval test case", err);
    return NextResponse.json(
      { success: false, error: "Failed to create eval test case" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/agents/[agentId]/evals/[suiteId]/cases
 * Bulk update test cases (reorder, edit labels, edit assertions).
 * Used by drag-and-drop reordering in the UI.
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await getSuiteOrNull(suiteId, agentId);
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = BulkUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // Verify all case IDs belong to this suite
    const caseIds = parsed.data.cases.map((c) => c.id);
    const existingCases = await prisma.evalTestCase.findMany({
      where: { id: { in: caseIds }, suiteId },
      select: { id: true },
    });
    if (existingCases.length !== caseIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more test case IDs not found in this suite" },
        { status: 404 },
      );
    }

    // Run all updates in a transaction
    const updates = await prisma.$transaction(
      parsed.data.cases.map((c) =>
        prisma.evalTestCase.update({
          where: { id: c.id },
          data: {
            ...(c.label !== undefined && { label: c.label }),
            ...(c.input !== undefined && { input: c.input }),
            ...(c.assertions !== undefined && { assertions: c.assertions as import("@/generated/prisma/runtime/library").InputJsonValue }),
            ...(c.tags !== undefined && { tags: c.tags }),
            ...(c.order !== undefined && { order: c.order }),
          },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: updates });
  } catch (err) {
    logger.error("Failed to bulk update eval test cases", err);
    return NextResponse.json(
      { success: false, error: "Failed to update test cases" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/agents/[agentId]/evals/[suiteId]/cases
 * Delete a single test case by ID (passed in request body).
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId, suiteId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const suite = await getSuiteOrNull(suiteId, agentId);
    if (!suite) {
      return NextResponse.json(
        { success: false, error: "Eval suite not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = DeleteCaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Test case ID is required" },
        { status: 400 },
      );
    }

    const testCase = await prisma.evalTestCase.findUnique({
      where: { id: parsed.data.id, suiteId },
    });
    if (!testCase) {
      return NextResponse.json(
        { success: false, error: "Test case not found" },
        { status: 404 },
      );
    }

    await prisma.evalTestCase.delete({ where: { id: parsed.data.id } });

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to delete eval test case", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete test case" },
      { status: 500 },
    );
  }
}
