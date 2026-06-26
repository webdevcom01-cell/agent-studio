import { z } from "zod";
import { withAdminBypass } from "@/lib/api/tenant-context";
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
      await withAdminBypass((db) => db.pipelineMemory.create({
        data: {
          runId,
          agentId,
          category: memory.category as MemoryCategory,
          content: memory.content,
        },
      }));
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

export async function loadRelevantMemory(agentId: string, taskDescription?: string): Promise<string> {
  try {
    // Load more records than we'll use so we can filter by relevance
    const allRecords = await withAdminBypass((db) => db.pipelineMemory.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { category: true, content: true },
    }));

    if (allRecords.length === 0) return "";

    let records: typeof allRecords;

    if (taskDescription) {
      // Keyword scoring — rank memories by how many task keywords they contain
      const keywords = taskDescription
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);

      if (keywords.length > 0) {
        const scored = allRecords.map((r) => ({
          record: r,
          score: keywords.filter(
            (kw) => r.content.toLowerCase().includes(kw) || r.category.toLowerCase().includes(kw),
          ).length,
        }));

        const relevant = scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_MEMORIES_LOADED)
          .map((s) => s.record);

        // Fallback: if no keyword matches, use most recent entries
        records = relevant.length > 0 ? relevant : allRecords.slice(0, 5);
      } else {
        records = allRecords.slice(0, MAX_MEMORIES_LOADED);
      }
    } else {
      records = allRecords.slice(0, MAX_MEMORIES_LOADED);
    }

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
