/**
 * Dynamic Skill Router — Phase F3
 *
 * Auto-detects which ECC skills are most relevant for the current task
 * and injects ONLY those skills into the agent's system prompt.
 *
 * Reduces context bloat vs. static 3-layer composition (C2.3).
 *
 * Architecture:
 * - Skill description embeddings cached in memory + Redis (600s TTL)
 * - Cosine similarity against the current prompt selects top-N skills
 * - Threshold 0.35 — below this, skills are considered irrelevant
 * - Returns [] when ECC disabled — callers fall back to C2.3 automatically
 *
 * Semaphore: respects acquireEmbeddingSemaphore() — max 3 concurrent
 * embedding API calls (same limit as KB search pipeline).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { cosineSimilarity } from "@/lib/evals/semantic";
import { cacheGet, cacheSet, getRedis } from "@/lib/redis";
import {
  acquireEmbeddingSemaphore,
  releaseEmbeddingSemaphore,
} from "@/lib/knowledge/embedding-cache";
import { isECCEnabled } from "@/lib/ecc/feature-flag";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutedSkill {
  id: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  similarity: number;
}

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  content: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_EMBED_CACHE_PREFIX = "skill-emb:";
const SKILL_EMBED_TTL_SECONDS = 600;
const SIMILARITY_THRESHOLD = 0.35;
const IN_MEMORY_TTL_MS = 600_000; // 10 min

// ─── In-memory cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  embedding: number[];
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

function getMemoryCached(skillId: string): number[] | null {
  const entry = memoryCache.get(skillId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(skillId);
    return null;
  }
  return entry.embedding;
}

function setMemoryCached(skillId: string, embedding: number[]): void {
  memoryCache.set(skillId, {
    embedding,
    expiresAt: Date.now() + IN_MEMORY_TTL_MS,
  });
}

/** Clear in-memory cache — for testing only. */
export function clearSkillEmbeddingCache(): void {
  memoryCache.clear();
}

// ─── Redis cache helpers ──────────────────────────────────────────────────────

async function getRedisCached(skillId: string): Promise<number[] | null> {
  try {
    const raw = await cacheGet(`${SKILL_EMBED_CACHE_PREFIX}${skillId}`);
    if (!raw) return null;
    return JSON.parse(raw) as number[];
  } catch {
    return null;
  }
}

async function setRedisCached(skillId: string, embedding: number[]): Promise<void> {
  try {
    await cacheSet(
      `${SKILL_EMBED_CACHE_PREFIX}${skillId}`,
      JSON.stringify(embedding),
      SKILL_EMBED_TTL_SECONDS,
    );
  } catch {
    // Fire-and-forget
  }
}

// ─── Embedding fetch ──────────────────────────────────────────────────────────

/**
 * Get embedding for a skill using in-memory → Redis → API chain.
 * Text to embed: "{name} {description}" (concise, stable across calls).
 */
export async function getCachedSkillEmbedding(
  skillId: string,
  name: string,
  description: string,
): Promise<number[]> {
  // 1. In-memory cache (fastest — no network)
  const inMem = getMemoryCached(skillId);
  if (inMem) return inMem;

  // 2. Redis cache
  const redisHit = await getRedisCached(skillId);
  if (redisHit) {
    setMemoryCached(skillId, redisHit);
    return redisHit;
  }

  // 3. Generate via API (respect semaphore — max 3 concurrent)
  const acquired = await acquireEmbeddingSemaphore();
  try {
    const textToEmbed = `${name} ${description}`.trim();
    const embedding = await generateEmbedding(textToEmbed);
    setMemoryCached(skillId, embedding);
    void setRedisCached(skillId, embedding); // fire-and-forget
    return embedding;
  } finally {
    if (acquired) await releaseEmbeddingSemaphore();
  }
}

/**
 * Invalidate cached embedding for a skill.
 * Call when a skill is updated or deleted.
 */
export async function invalidateSkillCache(skillId: string): Promise<void> {
  memoryCache.delete(skillId);
  try {
    const redis = await getRedis();
    if (redis) await redis.del(`${SKILL_EMBED_CACHE_PREFIX}${skillId}`);
  } catch {
    // Fire-and-forget
  }
}

// ─── Main router ─────────────────────────────────────────────────────────────

/**
 * Route to the most relevant skills for the given prompt.
 *
 * Returns top-N skills with similarity >= 0.35.
 * Returns [] when ECC disabled — callers should fall back to C2.3.
 *
 * Skills are scored sequentially (not parallel) to respect the
 * embedding semaphore and avoid thundering herd on cold start.
 */
export async function routeToSkill(
  prompt: string,
  agentId: string,
  topN = 3,
): Promise<RoutedSkill[]> {
  if (!isECCEnabled()) return [];
  if (!prompt.trim()) return [];

  try {
    // Load skills for agent via AgentSkillPermission
    const rows = await prisma.$queryRaw<SkillRow[]>(
      Prisma.sql`
        SELECT s.id, s.name, s.slug, s.description, s.content
        FROM "Skill" s
        INNER JOIN "AgentSkillPermission" asp ON asp."skillId" = s.id
        WHERE asp."agentId" = ${agentId}
      `,
    );

    if (rows.length === 0) return [];

    // Generate prompt embedding (with semaphore)
    const promptAcquired = await acquireEmbeddingSemaphore();
    let promptEmbedding: number[];
    try {
      promptEmbedding = await generateEmbedding(prompt.slice(0, 500));
    } finally {
      if (promptAcquired) await releaseEmbeddingSemaphore();
    }

    // Score each skill sequentially — respect semaphore, avoid cold-start thundering herd
    const scored: RoutedSkill[] = [];
    for (const skill of rows) {
      try {
        const skillEmbedding = await getCachedSkillEmbedding(
          skill.id,
          skill.name,
          skill.description,
        );
        const similarity = cosineSimilarity(promptEmbedding, skillEmbedding);
        if (similarity >= SIMILARITY_THRESHOLD) {
          scored.push({ ...skill, similarity });
        }
      } catch (err) {
        logger.warn("Failed to embed skill for routing", {
          skillId: skill.id,
          error: err,
        });
      }
    }

    // Sort by similarity descending, return top N
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topN);
  } catch (error) {
    logger.error("Skill router error", { agentId, error });
    return [];
  }
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/**
 * Format dynamically routed skills for system prompt injection.
 *
 * Simpler than formatSkillPipelineForPrompt (no layer structure):
 *
 * <relevant_skills>
 * [typescript-guide] TypeScript best practices...
 * [security-check] Security scanning instructions...
 * </relevant_skills>
 */
export function formatRoutedSkillsForPrompt(skills: RoutedSkill[]): string {
  if (skills.length === 0) return "";

  const lines: string[] = ["<relevant_skills>"];
  for (const skill of skills) {
    const truncated =
      skill.content.length > 2000
        ? skill.content.slice(0, 1997) + "..."
        : skill.content;
    lines.push(`[${skill.slug}] ${truncated}`);
  }
  lines.push("</relevant_skills>");
  return lines.join("\n");
}
