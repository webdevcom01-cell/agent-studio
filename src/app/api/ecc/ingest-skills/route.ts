import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { parseSkillMd, slugify, ingestSkills, vectorizeSkills } from "@/lib/ecc";
import type { ParsedSkill } from "@/lib/ecc";

export const maxDuration = 300;

const SkillEntrySchema = z.object({
  slug: z.string().min(1),
  content: z.string().min(10),
});

const IngestRequestSchema = z.object({
  skills: z.array(SkillEntrySchema).min(1).max(500),
  vectorize: z.boolean().optional().default(false),
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
      vectorResult = await vectorizeSkills();
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
