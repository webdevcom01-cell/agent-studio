/**
 * POST /api/agents/[agentId]/evals/generate
 *
 * AI-powered eval suite generator.
 * Reads agent context from DB (name, systemPrompt, category, KB samples),
 * calls the generator pipeline, and persists the resulting suite + test cases.
 *
 * Request body (all fields optional except agentName is filled from DB):
 *   GenerateEvalSuiteRequest — targetCount, runOnDeploy, kbSamples override
 *
 * Response:
 *   { success: true, data: GeneratedSuiteResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { generateEvalSuite } from "@/lib/evals/generator";
import { GenerateEvalSuiteRequestSchema } from "@/lib/evals/generator-schemas";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

// Hard cap: max suites per agent (same as POST /evals)
const MAX_SUITES_PER_AGENT = 20;

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    // Enforce suite limit
    const suiteCount = await prisma.evalSuite.count({ where: { agentId } });
    if (suiteCount >= MAX_SUITES_PER_AGENT) {
      return NextResponse.json(
        { success: false, error: `Maximum of ${MAX_SUITES_PER_AGENT} eval suites per agent reached` },
        { status: 422 },
      );
    }

    // Parse + validate request body
    const body = await request.json().catch(() => ({}));
    const parsed = GenerateEvalSuiteRequestSchema.partial({
      agentName: true, // filled from DB below
    }).safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    // Load agent from DB for context
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        name: true,
        description: true,
        systemPrompt: true,
        category: true,
        knowledgeBase: {
          select: {
            sources: {
              where: { status: "READY" },
              take: 3,
              select: {
                chunks: {
                  take: 2,
                  select: { content: true },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 },
      );
    }

    // Build KB samples from first chunks of each READY source (up to 3)
    const kbSamplesFromDB = agent.knowledgeBase?.sources
      .flatMap((s) => s.chunks.map((c) => c.content))
      .slice(0, 3) ?? [];

    // Merge: request-provided kbSamples override DB samples if provided
    const kbSamples =
      parsed.data.kbSamples && parsed.data.kbSamples.length > 0
        ? parsed.data.kbSamples
        : kbSamplesFromDB;

    // Build final request, filling in agent context from DB
    const generatorRequest = {
      agentName: agent.name,
      systemPrompt: agent.systemPrompt ?? undefined,
      category: agent.category ?? undefined,
      kbSamples: kbSamples.length > 0 ? kbSamples : undefined,
      targetCount: parsed.data.targetCount ?? 5,
      runOnDeploy: parsed.data.runOnDeploy ?? true,
    };

    const result = await generateEvalSuite(agentId, generatorRequest);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eval generation failed";
    logger.error("eval_generator_route_error", err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}

// Vercel: allow up to 120s for AI generation
export const maxDuration = 120;
