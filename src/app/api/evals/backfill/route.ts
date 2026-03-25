/**
 * POST /api/evals/backfill
 *
 * Generates AI eval suites for all of the current user's agents that
 * don't yet have any eval suite. Processes sequentially (one agent at a time)
 * to avoid rate-limit spikes on the AI provider.
 *
 * Safety caps:
 *   - Processes at most 20 agents per call
 *   - Skips agents that already have ≥1 suite
 *
 * Response:
 *   { success: true, data: { processed, skipped, failed, total } }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { generateEvalSuite } from "@/lib/evals/generator";

// Hard cap — backfill is best-effort, not a bulk job endpoint
const MAX_AGENTS_PER_BACKFILL = 20;

export async function POST(): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;
    const { userId } = authResult;

    // Find agents that belong to this user and have no eval suites yet
    const agentsWithoutSuites = await prisma.agent.findMany({
      where: {
        userId,
        evalSuites: { none: {} },
      },
      select: {
        id: true,
        name: true,
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
      take: MAX_AGENTS_PER_BACKFILL,
      orderBy: { createdAt: "asc" },
    });

    const total = agentsWithoutSuites.length;

    if (total === 0) {
      return NextResponse.json({
        success: true,
        data: {
          processed: 0,
          failed: 0,
          total: 0,
          message: "All agents already have eval suites.",
        },
      });
    }

    const results = { processed: 0, failed: 0 };

    for (const agent of agentsWithoutSuites) {
      // Build KB samples from first chunks of each READY source
      const kbSamples = agent.knowledgeBase?.sources
        .flatMap((s) => s.chunks.map((c) => c.content))
        .slice(0, 3) ?? [];

      try {
        await generateEvalSuite(agent.id, {
          agentName: agent.name,
          systemPrompt: agent.systemPrompt ?? undefined,
          category: agent.category ?? undefined,
          kbSamples: kbSamples.length > 0 ? kbSamples : undefined,
          targetCount: 5,
          runOnDeploy: true,
        });
        results.processed++;

        logger.info("eval_backfill_agent_done", {
          agentId: agent.id,
          agentName: agent.name,
        });
      } catch (err) {
        results.failed++;
        logger.warn("eval_backfill_agent_failed", {
          agentId: agent.id,
          agentName: agent.name,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue — don't let one failure abort the whole batch
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: results.processed,
        failed: results.failed,
        total,
      },
    });
  } catch (err) {
    logger.error("eval_backfill_route_error", err);
    return NextResponse.json(
      { success: false, error: "Backfill failed" },
      { status: 500 },
    );
  }
}

// Vercel: backfill can take up to 5 minutes for 20 agents × ~10s each
export const maxDuration = 300;
