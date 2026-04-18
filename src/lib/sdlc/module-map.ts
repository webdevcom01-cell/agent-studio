import { createHash } from "node:crypto";
import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { cacheGet, cacheSet } from "@/lib/redis";
import { logger } from "@/lib/logger";
import type { FileSignature } from "./ast-analyzer";

export interface ModuleEntry {
  path: string;
  purpose: string;
  exports: string[];
  types: string[];
}

const SUMMARY_MODEL = "gpt-4.1-mini";
const MAX_MODULES_TO_ENRICH = 10;
const SUMMARY_CACHE_TTL = 86_400; // 24 hours

function buildCacheKey(sig: FileSignature): string {
  const content = `module:${sig.path}:${sig.exports.slice().sort().join(",")}`;
  return createHash("sha256").update(content).digest("hex").slice(0, 24);
}

async function enrichSingle(sig: FileSignature): Promise<ModuleEntry> {
  const cacheKey = buildCacheKey(sig);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    return { path: sig.path, purpose: cached, exports: sig.exports, types: sig.types };
  }
  try {
    const model = getModel(SUMMARY_MODEL);
    const { text } = await generateText({
      model,
      prompt: `Summarize this TypeScript module in one sentence (max 120 chars).\nPath: ${sig.path}\nExports: ${sig.exports.join(", ")}`,
      maxOutputTokens: 80,
    });
    const purpose = text.trim().slice(0, 120);
    await cacheSet(cacheKey, purpose, SUMMARY_CACHE_TTL);
    return { path: sig.path, purpose, exports: sig.exports, types: sig.types };
  } catch (err) {
    logger.warn("enrichSingle failed", { path: sig.path, error: err instanceof Error ? err.message : String(err) });
    return { path: sig.path, purpose: "", exports: sig.exports, types: sig.types };
  }
}

export async function enrichWithSemanticSummaries(
  signatures: FileSignature[],
): Promise<ModuleEntry[]> {
  const top = [...signatures]
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, MAX_MODULES_TO_ENRICH);
  const results = await Promise.allSettled(top.map(enrichSingle));
  return results
    .filter((r): r is PromiseFulfilledResult<ModuleEntry> => r.status === "fulfilled")
    .map((r) => r.value);
}

export function buildModuleMapContext(
  entries: ModuleEntry[],
  taskDescription: string,
  maxChars = 3000,
): string {
  const lower = taskDescription.toLowerCase();
  const keywords = lower.split(/\s+/).filter((w) => w.length > 3);

  let filtered = entries.filter((e) =>
    keywords.some(
      (kw) => e.path.toLowerCase().includes(kw) || e.purpose.toLowerCase().includes(kw),
    ),
  );

  if (filtered.length === 0) {
    filtered = [...entries].sort((a, b) => b.exports.length - a.exports.length).slice(0, 5);
  }

  const lines: string[] = ["## Module Map\n"];
  let chars = lines[0].length;
  for (const e of filtered) {
    const line = `- **${e.path}**: ${e.purpose || "(no summary)"} [exports: ${e.exports.slice(0, 5).join(", ")}]\n`;
    if (chars + line.length > maxChars) break;
    lines.push(line);
    chars += line.length;
  }
  return lines.length > 1 ? lines.join("") : "";
}
