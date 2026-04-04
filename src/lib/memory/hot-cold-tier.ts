import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { RuntimeContext } from "@/lib/runtime/types";

/**
 * Hot/Cold Memory Tier System
 *
 * Hot memory = recently accessed OR high importance OR frequently used.
 * Cold memory = everything else (retrieved on-demand via semantic search).
 *
 * Hot criteria (any one qualifies):
 *   - accessedAt within last 24 hours
 *   - importance > 0.8
 *   - accessCount > 10
 */

const HOT_RECENCY_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOT_IMPORTANCE_THRESHOLD = 0.8;
const HOT_ACCESS_COUNT_THRESHOLD = 10;
const DEFAULT_HOT_LIMIT = 10;

interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  category: string;
  importance: number;
  accessCount: number;
  accessedAt: Date;
  createdAt: Date;
}

/**
 * Compute a composite score for ranking hot memories.
 * Score = importance * 0.4 + recencyScore * 0.35 + frequencyScore * 0.25
 */
function computeHotScore(memory: MemoryEntry): number {
  const now = Date.now();
  const ageMs = now - memory.accessedAt.getTime();

  // Recency: 1.0 for just accessed, decaying to 0.0 at 7 days
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recencyScore = Math.max(0, 1 - ageMs / sevenDaysMs);

  // Frequency: log scale, capped at 1.0
  const frequencyScore = Math.min(1, Math.log10(memory.accessCount + 1) / 2);

  return memory.importance * 0.4 + recencyScore * 0.35 + frequencyScore * 0.25;
}

/**
 * Get top N hot memories for an agent, ranked by composite score.
 */
export async function getHotMemories(
  agentId: string,
  limit: number = DEFAULT_HOT_LIMIT,
): Promise<MemoryEntry[]> {
  const cutoff = new Date(Date.now() - HOT_RECENCY_MS);

  // Fetch memories matching any hot criterion
  const memories = await prisma.agentMemory.findMany({
    where: {
      agentId,
      OR: [
        { accessedAt: { gte: cutoff } },
        { importance: { gt: HOT_IMPORTANCE_THRESHOLD } },
        { accessCount: { gt: HOT_ACCESS_COUNT_THRESHOLD } },
      ],
    },
    select: {
      id: true,
      key: true,
      value: true,
      category: true,
      importance: true,
      accessCount: true,
      accessedAt: true,
      createdAt: true,
    },
  });

  // Rank by composite score and take top N
  const scored = memories.map((m) => ({
    ...m,
    _score: computeHotScore(m),
  }));
  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, limit).map(({ _score: _, ...rest }) => rest);
}

/**
 * Get cold memories via semantic search (delegate to pgvector).
 * Cold = memories NOT in the hot set.
 */
export async function getColdMemories(
  agentId: string,
  query: string,
  topK: number = 5,
): Promise<Array<MemoryEntry & { similarity: number }>> {
  try {
    const { getEmbeddingModel } = await import("@/lib/ai");
    const { embed } = await import("ai");
    const embeddingModel = getEmbeddingModel();

    const { embedding } = await embed({
      model: embeddingModel,
      value: query,
    });

    const vectorStr = `[${embedding.join(",")}]`;

    await prisma.$executeRawUnsafe("SET LOCAL hnsw.ef_search = 40");

    const results = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        key: string;
        value: unknown;
        category: string;
        importance: number;
        accessCount: number;
        accessedAt: Date;
        createdAt: Date;
        similarity: number;
      }>
    >(
      `SELECT id, key, value, category, importance, "accessCount", "accessedAt", "createdAt",
              1 - (embedding <=> $1::vector) as similarity
       FROM "AgentMemory"
       WHERE "agentId" = $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      agentId,
      topK,
    );

    return results.filter((r) => r.similarity > 0.3);
  } catch (error) {
    logger.warn("Cold memory search failed, returning empty", { agentId, error });
    return [];
  }
}

/**
 * Format hot memories as a concise text block for system prompt injection.
 */
export function formatHotMemoryForContext(memories: MemoryEntry[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => {
    const value = typeof m.value === "string"
      ? m.value
      : JSON.stringify(m.value);
    const truncated = value.length > 200 ? value.slice(0, 197) + "..." : value;
    return `- **${m.key}** [${m.category}]: ${truncated}`;
  });

  return [
    "## Agent Memory (active context)",
    "The following are your remembered facts and context from previous interactions:",
    ...lines,
  ].join("\n");
}

/**
 * Inject hot memory summary into runtime context as a system-level variable.
 * Called once at flow start, before the first AI node executes.
 *
 * Sets context.variables.__hot_memory with the formatted text, which
 * ai-response handlers can prepend to the system prompt.
 */
export async function injectHotMemoryIntoContext(
  context: RuntimeContext,
): Promise<void> {
  // Skip if already injected (e.g. resuming a flow)
  if (context.variables.__hot_memory) return;

  try {
    const memories = await getHotMemories(context.agentId);
    if (memories.length === 0) return;

    const memoryText = formatHotMemoryForContext(memories);
    context.variables.__hot_memory = memoryText;

    logger.info("Hot memory injected into context", {
      agentId: context.agentId,
      memoryCount: memories.length,
    });
  } catch (error) {
    // Never block flow execution if memory fails
    logger.warn("Hot memory injection failed", { agentId: context.agentId, error });
  }
}
