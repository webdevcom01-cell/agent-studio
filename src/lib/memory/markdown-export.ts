import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface MemoryRecord {
  id: string;
  key: string;
  value: unknown;
  category: string;
  importance: number;
  accessCount: number;
  accessedAt: Date;
  createdAt: Date;
}

const HOT_RECENCY_MS = 24 * 60 * 60 * 1000;
const HOT_IMPORTANCE_THRESHOLD = 0.8;
const HOT_ACCESS_COUNT_THRESHOLD = 10;

function isHot(memory: MemoryRecord): boolean {
  const cutoff = Date.now() - HOT_RECENCY_MS;
  return (
    memory.accessedAt.getTime() > cutoff ||
    memory.importance > HOT_IMPORTANCE_THRESHOLD ||
    memory.accessCount > HOT_ACCESS_COUNT_THRESHOLD
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function truncate(text: string, maxLen: number = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

/**
 * Export all agent memories as a single MEMORY.md Markdown document.
 *
 * Format:
 * ```
 * # Agent Memory — {agentName}
 * > Exported: {date} | Total: {count} memories
 *
 * ## Hot (active context)
 * - **key**: summary (importance: 0.9, accessed: 2h ago)
 *
 * ## Categories
 * ### general
 * - **key**: truncated value
 * ### context_compaction
 * - **key**: truncated value
 * ```
 */
export async function exportAgentMemoryAsMarkdown(agentId: string): Promise<string> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { name: true },
  });

  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: [{ category: "asc" }, { importance: "desc" }],
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

  const agentName = agent?.name ?? agentId;
  const lines: string[] = [];

  lines.push(`# Agent Memory — ${agentName}`);
  lines.push(`> Exported: ${new Date().toISOString()} | Total: ${memories.length} memories`);
  lines.push("");

  // Hot section
  const hot = memories.filter(isHot);
  if (hot.length > 0) {
    lines.push("## Hot (active context)");
    lines.push("");
    for (const m of hot) {
      const ago = formatTimeAgo(m.accessedAt);
      const val = truncate(formatValue(m.value));
      lines.push(`- **${m.key}** [${m.category}]: ${val} _(importance: ${m.importance}, accessed: ${ago})_`);
    }
    lines.push("");
  }

  // Group by category
  const categories = new Map<string, MemoryRecord[]>();
  for (const m of memories) {
    const existing = categories.get(m.category) ?? [];
    existing.push(m);
    categories.set(m.category, existing);
  }

  lines.push("## Categories");
  lines.push("");

  for (const [category, mems] of categories) {
    lines.push(`### ${category}`);
    lines.push("");
    for (const m of mems) {
      const val = truncate(formatValue(m.value));
      lines.push(`- **${m.key}**: ${val}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Export per-category shard files for detailed view.
 * Returns a map of filename → content.
 */
export async function exportMemoryShards(
  agentId: string,
): Promise<Map<string, string>> {
  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: { importance: "desc" },
    select: {
      key: true,
      value: true,
      category: true,
      importance: true,
      accessCount: true,
      accessedAt: true,
      createdAt: true,
    },
  });

  const categories = new Map<string, typeof memories>();
  for (const m of memories) {
    const existing = categories.get(m.category) ?? [];
    existing.push(m);
    categories.set(m.category, existing);
  }

  const shards = new Map<string, string>();

  for (const [category, mems] of categories) {
    const lines: string[] = [];
    lines.push(`# Memory Shard — ${category}`);
    lines.push(`> ${mems.length} entries`);
    lines.push("");

    for (const m of mems) {
      lines.push(`## ${m.key}`);
      lines.push("");
      lines.push(`- **Importance:** ${m.importance}`);
      lines.push(`- **Access count:** ${m.accessCount}`);
      lines.push(`- **Last accessed:** ${m.accessedAt.toISOString()}`);
      lines.push(`- **Created:** ${m.createdAt.toISOString()}`);
      lines.push("");
      lines.push("```");
      lines.push(formatValue(m.value));
      lines.push("```");
      lines.push("");
    }

    shards.set(`memory-${category}.md`, lines.join("\n"));
  }

  return shards;
}

/**
 * Parse a MEMORY.md file and return structured memory entries.
 *
 * Expected format per entry:
 * - **key**: value
 * OR under Categories/### heading:
 * - **key**: value
 *
 * Returns entries ready for upsert into AgentMemory.
 */
export function parseMemoryMarkdown(
  markdown: string,
): Array<{ key: string; value: string; category: string; importance: number }> {
  const entries: Array<{ key: string; value: string; category: string; importance: number }> = [];
  let currentCategory = "general";
  let inHotSection = false;

  const lines = markdown.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    if (trimmed.startsWith("## Hot")) {
      inHotSection = true;
      currentCategory = "general";
      continue;
    }
    if (trimmed.startsWith("## Categories")) {
      inHotSection = false;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      currentCategory = trimmed.slice(4).trim();
      inHotSection = false;
      continue;
    }

    // Parse memory entry: - **key**: value or - **key** [category]: value
    const entryMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*(?:\s*\[([^\]]+)\])?\s*:\s*(.+)/);
    if (entryMatch) {
      const key = entryMatch[1];
      const category = entryMatch[2] ?? currentCategory;
      let rawValue = entryMatch[3];

      // Strip trailing importance/accessed metadata: _(importance: 0.9, accessed: 2h ago)_
      rawValue = rawValue.replace(/\s*_\(importance:.*?\)_\s*$/, "").trim();

      // Try to detect importance from hot section metadata
      let importance = 0.5;
      if (inHotSection) {
        const impMatch = entryMatch[3].match(/importance:\s*([\d.]+)/);
        if (impMatch) importance = parseFloat(impMatch[1]);
      }

      entries.push({ key, value: rawValue, category, importance });
    }
  }

  return entries;
}

/**
 * Import memories from parsed markdown into AgentMemory (upsert).
 */
export async function importMemoryFromMarkdown(
  agentId: string,
  markdown: string,
): Promise<{ imported: number; skipped: number }> {
  const entries = parseMemoryMarkdown(markdown);
  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    try {
      await prisma.agentMemory.upsert({
        where: {
          agentId_key: {
            agentId,
            key: entry.key,
          },
        },
        create: {
          agentId,
          key: entry.key,
          value: entry.value,
          category: entry.category,
          importance: entry.importance,
        },
        update: {
          value: entry.value,
          category: entry.category,
          importance: entry.importance,
        },
      });
      imported++;
    } catch (error) {
      logger.warn("Memory import: failed to upsert entry", { key: entry.key, error });
      skipped++;
    }
  }

  return { imported, skipped };
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
