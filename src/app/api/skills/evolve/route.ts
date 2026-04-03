import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  getPromotionCandidates,
  requestInstinctPromotion,
  decayStaleInstincts,
} from "@/lib/ecc/instinct-engine";

export const maxDuration = 300;

const EvolveRequestSchema = z.object({
  agentId: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

function verifyCronSecret(req: NextRequest): boolean {
  const env = getEnv();
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronSecret(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const parsed = EvolveRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 422 }
      );
    }

    const candidates = await getPromotionCandidates(parsed.data.agentId);

    if (parsed.data.dryRun) {
      return NextResponse.json({
        success: true,
        data: {
          dryRun: true,
          candidates: candidates.map((c) => ({
            instinctId: c.instinct.id,
            name: c.instinct.name,
            confidence: c.instinct.confidence,
            frequency: c.instinct.frequency,
            skillSlug: c.skillSlug,
          })),
        },
      });
    }

    // Cron evolve uses requestInstinctPromotion (human-in-the-loop gate).
    // Actual Skill creation happens when an admin approves via POST /api/approvals/:id/respond.
    const promoted: { instinctId: string; approvalRequestId: string; slug: string }[] = [];
    const errors: { instinctId: string; error: string }[] = [];

    for (const candidate of candidates) {
      try {
        const skillContent = await generateSkillContent(candidate.instinct);
        const result = await requestInstinctPromotion(
          candidate.instinct.id,
          skillContent,
        );
        promoted.push({
          instinctId: candidate.instinct.id,
          approvalRequestId: result.approvalRequestId,
          slug: candidate.skillSlug,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ instinctId: candidate.instinct.id, error: message });
        logger.error("Failed to request instinct promotion", err, {
          instinctId: candidate.instinct.id,
        });
      }
    }

    const decayed = await decayStaleInstincts();

    return NextResponse.json({
      success: true,
      data: {
        promoted,
        errors,
        decayed,
        candidatesEvaluated: candidates.length,
      },
    });
  } catch (err) {
    logger.error("Evolve endpoint failed", err, {});
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
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
