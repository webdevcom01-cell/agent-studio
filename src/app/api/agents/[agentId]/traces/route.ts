import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/api/sanitize-error";
import type { FlowTraceCreateInput } from "@/lib/types/flow-trace";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateTraceSchema = z.object({
  conversationId: z.string().optional(),
  testInput: z.string().max(10_000).optional(),
  status: z.enum(["RUNNING", "COMPLETED", "FAILED"]).default("RUNNING"),
  totalDurationMs: z.number().int().nonnegative().optional(),
  nodesExecuted: z.number().int().nonnegative().optional(),
  nodesFailed: z.number().int().nonnegative().optional(),
  executionPath: z.array(z.string()).default([]),
  nodeTraces: z.record(z.unknown()).default({}),
  edgeTraces: z.record(z.unknown()).default({}),
  flowSummary: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/agents/[agentId]/traces — list last 20 traces (summary only)
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces = await (prisma as any).flowTrace.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        agentId: true,
        testInput: true,
        status: true,
        totalDurationMs: true,
        nodesExecuted: true,
        nodesFailed: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: traces });
  } catch (error) {
    logger.error("Failed to list traces", { agentId, error });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[agentId]/traces — create a new trace
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const parsed = CreateTraceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 422 }
      );
    }

    const input: FlowTraceCreateInput = {
      agentId,
      ...parsed.data,
      nodeTraces: parsed.data.nodeTraces as Record<string, unknown>,
      edgeTraces: parsed.data.edgeTraces as Record<string, unknown>,
      flowSummary: parsed.data.flowSummary as Record<string, unknown> | undefined,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trace = await (prisma as any).flowTrace.create({ data: input });

    return NextResponse.json({ success: true, data: trace }, { status: 201 });
  } catch (error) {
    logger.error("Failed to create trace", { agentId, error });
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
