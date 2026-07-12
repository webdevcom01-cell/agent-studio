import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { parseSkillMd, slugify, ingestSkills, vectorizeSkills } from "@/lib/ecc";
import { requireCronSecret } from "@/lib/api/auth-guard";
import type { ParsedSkill } from "@/lib/ecc";

export const maxDuration = 300;

const SkillEntrySchema = z.object({
  slug: z.string().min(1),
  content: z.string().min(10),
});

const IngestRequestSchema = z.object({
  skills: z.array(SkillEntrySchema).min(1).max(500),
  vectorize: z.boolean().optional().default(false),
  batchSize: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Fail-closed cron auth (F1.1): 503 in production when CRON_SECRET unset,
  // 401 on missing/wrong Bearer token. Never falls through unauthenticated.
  const authError = requireCronSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = IngestRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        { status: 422 }
      );
    }

    const parsedSkills: ParsedSkill[] = [];
    const parseErrors: { slug: string; error: string }[] = [];

    for (const entry of parsed.data.skills) {
      try {
        const skill = parseSkillMd(entry.content, slugify(entry.slug));
        parsedSkills.push(skill);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        parseErrors.push({ slug: entry.slug, error: message });
      }
    }

    const ingestResult = await ingestSkills(parsedSkills);

    let vectorResult = null;
    if (parsed.data.vectorize) {
      vectorResult = await vectorizeSkills(
        parsed.data.batchSize ? { batchSize: parsed.data.batchSize } : undefined
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ingestion: ingestResult,
        parseErrors,
        vectorization: vectorResult,
      },
    });
  } catch (err) {
    logger.error("Skill ingestion failed", err, {});
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
