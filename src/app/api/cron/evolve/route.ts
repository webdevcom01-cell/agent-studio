/**
 * POST /api/cron/evolve
 *
 * Daily cron job (3AM) — processes all agents with eccEnabled=true:
 * 1. Cluster similar instincts (Jaccard similarity)
 * 2. Merge clusters into representative instincts
 * 3. Promote instincts with confidence >= 0.85 AND frequency >= 10
 * 4. Decay stale instincts (confidence -= 0.05 per week of inactivity)
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import {
  evolveAgentInstincts,
  promoteInstinctToSkill,
  decayStaleInstincts,
} from "@/lib/ecc/instinct-engine";
import { isECCEnabled } from "@/lib/ecc";

export const maxDuration = 300;

function verifyCronSecret(req: NextRequest): boolean {
  const env = getEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isECCEnabled()) {
    return NextResponse.json({ success: true, data: { skipped: true, reason: "ECC disabled" } });
  }

  try {
    const agents = await prisma.agent.findMany({
      where: { eccEnabled: true },
      select: { id: true, name: true },
    });

    let totalClustered = 0;
    let totalPromoted = 0;
    const errors: { agentId: string; error: string }[] = [];

    for (const agent of agents) {
      try {
        const { clusters, candidates } = await evolveAgentInstincts(agent.id);

        const clusteredCount = clusters.filter((c) => c.members.length > 0).length;
        totalClustered += clusteredCount;

        for (const candidate of candidates) {
          try {
            const content = await generateSkillContent(candidate.instinct);
            await promoteInstinctToSkill(candidate.instinct.id, content);
            totalPromoted++;
          } catch (err) {
            errors.push({
              agentId: agent.id,
              error: `Promotion failed for ${candidate.instinct.name}: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      } catch (err) {
        errors.push({
          agentId: agent.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const decayed = await decayStaleInstincts();

    logger.info("Evolve cron complete", {
      agentsProcessed: agents.length,
      clustered: totalClustered,
      promoted: totalPromoted,
      decayed,
      errors: errors.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        agentsProcessed: agents.length,
        clustered: totalClustered,
        promoted: totalPromoted,
        decayed,
        errors,
      },
    });
  } catch (err) {
    logger.error("Evolve cron failed", err, {});
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

async function generateSkillContent(instinct: {
  name: string;
  description: string;
  confidence: number;
  frequency: number;
}): Promise<string> {
  const { text } = await generateText({
    model: getModel("deepseek-chat"),
    maxOutputTokens: 1024,
    prompt: `Generate a concise SKILL.md body (no frontmatter) for a development skill that was learned from repeated successful patterns.

Skill name: ${instinct.name}
Description: ${instinct.description}
Confidence: ${instinct.confidence}
Times observed: ${instinct.frequency}

Write practical, actionable content with:
1. When to activate this skill
2. Key rules and patterns
3. A brief code example if applicable

Keep it under 500 words. No YAML frontmatter — just the markdown body.`,
  });

  return text;
}
