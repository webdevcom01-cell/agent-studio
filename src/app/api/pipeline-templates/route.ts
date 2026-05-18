/**
 * GET /api/pipeline-templates
 *
 * Public, read-only endpoint — returns the list of available SDLC pipeline
 * templates. No auth required (templates are public product content).
 *
 * Templates are seeded in the PipelineTemplate table at deploy time.
 * Returns all templates ordered by category, then name.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(): Promise<NextResponse> {
  try {
    const templates = await prisma.pipelineTemplate.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        icon: true,
        agentSlugs: true,
        webhookPreset: true,
        webhookSettings: true,
        pipelineDefaults: true,
        isBuiltIn: true,
        usageCount: true,
        // setupGuide and pipelineSteps omitted from list — fetched on deploy
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    logger.error("Failed to list pipeline templates", { error });
    return NextResponse.json(
      { success: false, error: "Failed to list pipeline templates" },
      { status: 500 }
    );
  }
}
