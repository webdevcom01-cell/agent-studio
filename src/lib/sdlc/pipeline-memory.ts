import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_MEMORIES_LOADED = 10;
const MAX_MEMORY_CHARS_TOTAL = 2000;
const MAX_CONTENT_PER_ENTRY = 500;
const MEMORY_CATEGORIES = ["architecture", "conventions", "errors", "patterns"] as const;

type MemoryCategory = typeof MEMORY_CATEGORIES[number];

const MemoryExtractionSchema = z.object({
  memories: z
    .array(
      z.object({
        category: z.enum(MEMORY_CATEGORIES),
        content: z.string().max(MAX_CONTENT_PER_ENTRY),
      }),
    )
    .max(5),
});

export async function extractAndSaveMemory(
  runId: string,
  agentId: string,
  taskDescription: string,
  stepOutputs: string[],
): Promise<void> {
  try {
    const { getModel } = await import("@/lib/ai");
    const { generateObject } = await import("ai");

    const combinedOutputs = stepOutputs.join("\n\n---\n\n").slice(0, 4000 - taskDescription.length);

    const prompt = `You are analyzing a completed software development pipeline run.

Task: ${taskDescription}

Step outputs:
${combinedOutputs}

Extract up to 5 specific, actionable learnings from this pipeline run. Each learning should be:
- Specific and concrete (not generic advice)
- Directly derived from what happened in this run
- Useful for future pipeline runs on the same codebase

Categories:
- architecture: decisions about structure, patterns, or design
- conventions: naming, style, or formatting patterns observed
- errors: specific mistakes made and how they were fixed
- patterns: reusable implementation patterns that worked well`;

    const model = getModel("gpt-4o-mini");
    const result = await generateObject({
      model,
      prompt,
      schema: MemoryExtractionSchema,
    });

    for (const memory of result.object.memories) {
      await prisma.pipelineMemory.create({
        data: {
          runId,
          agentId,
          category: memory.category as MemoryCategory,
          content: memory.content,
        },
      });
    }

    logger.info("pipeline-memory: memories saved", {
      runId,
      agentId,
      count: result.object.memories.length,
    });
  } catch (err) {
    logger.warn("pipeline-memory: extraction or save failed, skipping", {
      runId,
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function loadRelevantMemory(agentId: string): Promise<string> {
  try {
    const records = await prisma.pipelineMemory.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: MAX_MEMORIES_LOADED,
      select: { category: true, content: true },
    });

    if (records.length === 0) return "";

    const header = "## Prior Knowledge (from previous runs)";
    let result = header + "\n";

    for (const record of records) {
      const line = `- [${record.category}] ${record.content}\n`;
      if (result.length + line.length > MAX_MEMORY_CHARS_TOTAL) break;
      result += line;
    }

    return result;
  } catch (err) {
    logger.warn("pipeline-memory: load failed, continuing without prior knowledge", {
      agentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}
