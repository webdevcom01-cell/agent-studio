/**
 * Ecomode — Task complexity classification for cost-optimized model routing.
 *
 * Classifies an AI task into simple/moderate/complex using a cheap 1-shot LLM call,
 * then maps to the cheapest capable model tier.
 *
 * B3.2 — Phase B, agent-studio
 */

import { generateObject } from "ai";
import { z } from "zod";
import { logger } from "@/lib/logger";

export type TaskComplexity = "simple" | "moderate" | "complex";

/**
 * In-memory cache: hash of prompt prefix → complexity tier.
 * TTL: 5 minutes. Max 500 entries (LRU eviction).
 */
const complexityCache = new Map<
  string,
  { complexity: TaskComplexity; expiresAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500;

const ClassifyOutputSchema = z.object({
  complexity: z.enum(["simple", "moderate", "complex"]),
});

/**
 * Simple hash of the first 200 chars of the prompt for cache keying.
 */
function hashPromptPrefix(prompt: string): string {
  const prefix = prompt.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    const chr = prefix.charCodeAt(i);
    hash = ((hash << 5) - hash + chr) | 0;
  }
  return `eco_${hash}`;
}

/**
 * Evict expired entries and trim to max size if needed.
 */
function evictCache(): void {
  const now = Date.now();

  // Remove expired entries
  for (const [key, entry] of complexityCache) {
    if (entry.expiresAt < now) {
      complexityCache.delete(key);
    }
  }

  // If still over max size, remove oldest entries
  if (complexityCache.size > CACHE_MAX_SIZE) {
    const entries = [...complexityCache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt
    );
    const toRemove = entries.slice(0, complexityCache.size - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      complexityCache.delete(key);
    }
  }
}

/**
 * Classify task complexity using a cheap 1-shot LLM call.
 *
 * Uses the fastest available model (passed in by caller) to minimize latency.
 * Results are cached by prompt prefix for 5 minutes.
 *
 * @param prompt - The AI task prompt to classify
 * @param model - Pre-resolved fastest available model instance
 * @returns TaskComplexity — "simple" | "moderate" | "complex"
 */
export async function classifyTaskComplexity(
  prompt: string,
  model: ReturnType<typeof import("@/lib/ai").getModel>
): Promise<TaskComplexity> {
  // Check cache first
  const cacheKey = hashPromptPrefix(prompt);
  const cached = complexityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.complexity;
  }

  try {
    const { object } = await generateObject({
      model,
      schema: ClassifyOutputSchema,
      prompt: `Classify this AI task's complexity. Reply with ONLY "simple", "moderate", or "complex".

simple = factual lookup, formatting, translation, basic Q&A
moderate = analysis, comparison, multi-step reasoning, code review
complex = creative writing, architecture design, multi-domain synthesis, novel problem solving

Task: ${prompt.slice(0, 500)}`,
    });

    const complexity = object.complexity;

    // Cache the result
    evictCache();
    complexityCache.set(cacheKey, {
      complexity,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return complexity;
  } catch (error) {
    logger.warn("Ecomode classify failed, defaulting to moderate", { error });
    return "moderate";
  }
}

/**
 * Map task complexity to model tier.
 */
export function complexityToTier(
  complexity: TaskComplexity
): "fast" | "balanced" | "powerful" {
  switch (complexity) {
    case "simple":
      return "fast";
    case "moderate":
      return "balanced";
    case "complex":
      return "powerful";
  }
}

/**
 * Clear the complexity cache (for testing).
 */
export function clearEcomodeCache(): void {
  complexityCache.clear();
}

/**
 * Get current cache size (for testing/metrics).
 */
export function getEcomodeCacheSize(): number {
  return complexityCache.size;
}
