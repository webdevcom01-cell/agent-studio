/**
 * Unit tests for Dynamic Skill Router (Phase F3)
 * 8 tests covering cache, threshold, topN, ECC flag, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCachedSkillEmbedding,
  routeToSkill,
  formatRoutedSkillsForPrompt,
  clearSkillEmbeddingCache,
  invalidateSkillCache,
  type RoutedSkill,
} from "../skill-router";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/ecc/feature-flag", () => ({
  isECCEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/knowledge/embeddings", () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock("@/lib/evals/semantic", () => ({
  cosineSimilarity: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("@/lib/knowledge/embedding-cache", () => ({
  acquireEmbeddingSemaphore: vi.fn(() => Promise.resolve(true)),
  releaseEmbeddingSemaphore: vi.fn(() => Promise.resolve()),
}));

// ─── Import mocks after vi.mock declarations ──────────────────────────────────

import { isECCEnabled } from "@/lib/ecc/feature-flag";
import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "@/lib/knowledge/embeddings";
import { cosineSimilarity } from "@/lib/evals/semantic";
import { cacheGet, cacheSet, getRedis } from "@/lib/redis";
import {
  acquireEmbeddingSemaphore,
  releaseEmbeddingSemaphore,
} from "@/lib/knowledge/embedding-cache";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_EMBEDDING_A = new Array(1536).fill(0.1);
const MOCK_EMBEDDING_B = new Array(1536).fill(0.2);
const MOCK_EMBEDDING_PROMPT = new Array(1536).fill(0.15);

const MOCK_SKILL = {
  id: "skill-1",
  name: "TypeScript Guide",
  slug: "typescript-guide",
  description: "TypeScript best practices",
  content: "# TypeScript\nUse strict types everywhere.",
};

function setup() {
  vi.mocked(isECCEnabled).mockReturnValue(true);
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(cacheSet).mockResolvedValue(undefined);
  vi.mocked(getRedis).mockResolvedValue(null);
  vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_A);
  vi.mocked(cosineSimilarity).mockReturnValue(0.8);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([MOCK_SKILL]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getCachedSkillEmbedding", () => {
  beforeEach(() => {
    clearSkillEmbeddingCache();
    vi.clearAllMocks();
  });

  it("T1: returns in-memory cached embedding without hitting API", async () => {
    // Prime the in-memory cache by calling once
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_A);
    vi.mocked(cacheGet).mockResolvedValue(null);

    const first = await getCachedSkillEmbedding("s1", "Name", "Desc");
    expect(first).toEqual(MOCK_EMBEDDING_A);
    expect(generateEmbedding).toHaveBeenCalledTimes(1);

    // Second call should hit memory cache — no new API call
    const second = await getCachedSkillEmbedding("s1", "Name", "Desc");
    expect(second).toEqual(MOCK_EMBEDDING_A);
    expect(generateEmbedding).toHaveBeenCalledTimes(1); // still 1
  });

  it("T2: falls back to Redis when in-memory cache is cold, populates in-memory", async () => {
    // Redis has the embedding
    vi.mocked(cacheGet).mockResolvedValue(JSON.stringify(MOCK_EMBEDDING_B));
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_A); // should NOT be called

    const result = await getCachedSkillEmbedding("s2", "Name", "Desc");

    expect(result).toEqual(MOCK_EMBEDDING_B);
    expect(generateEmbedding).not.toHaveBeenCalled();

    // Second call: now in-memory should have it
    vi.mocked(cacheGet).mockResolvedValue(null);
    const cached = await getCachedSkillEmbedding("s2", "Name", "Desc");
    expect(cached).toEqual(MOCK_EMBEDDING_B);
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it("T3: calls generateEmbedding on full cache miss, stores in both caches", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_A);

    const result = await getCachedSkillEmbedding("s3", "TypeScript", "Guide");

    expect(result).toEqual(MOCK_EMBEDDING_A);
    expect(generateEmbedding).toHaveBeenCalledWith("TypeScript Guide");
    expect(cacheSet).toHaveBeenCalledWith(
      expect.stringContaining("skill-emb:s3"),
      expect.any(String),
      600,
    );
    expect(acquireEmbeddingSemaphore).toHaveBeenCalled();
    expect(releaseEmbeddingSemaphore).toHaveBeenCalled();
  });

  it("T4: releases semaphore even when generateEmbedding throws", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockRejectedValue(new Error("API down"));

    await expect(
      getCachedSkillEmbedding("s4", "Name", "Desc"),
    ).rejects.toThrow("API down");

    expect(releaseEmbeddingSemaphore).toHaveBeenCalled();
  });
});

describe("routeToSkill", () => {
  beforeEach(() => {
    clearSkillEmbeddingCache();
    // resetAllMocks flushes mockReturnValueOnce queues between tests,
    // preventing queue bleed (clearAllMocks only resets call history).
    vi.resetAllMocks();
    setup();
  });

  afterEach(() => {
    clearSkillEmbeddingCache();
  });

  it("T5: returns [] immediately when ECC is disabled", async () => {
    vi.mocked(isECCEnabled).mockReturnValue(false);

    const result = await routeToSkill("build a TypeScript API", "agent-1");

    expect(result).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("T6: filters out skills below similarity threshold (0.35)", async () => {
    // Two skills: one above threshold, one below
    const skills = [
      { ...MOCK_SKILL, id: "s-high", slug: "high-skill" },
      { ...MOCK_SKILL, id: "s-low", slug: "low-skill" },
    ];
    vi.mocked(prisma.$queryRaw).mockResolvedValue(skills);
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_PROMPT);

    // cosineSimilarity called once per skill (2 calls total)
    vi.mocked(cosineSimilarity)
      .mockReturnValueOnce(0.8)  // s-high — above threshold 0.35 → included
      .mockReturnValueOnce(0.2); // s-low  — below 0.35 → filtered out

    const result = await routeToSkill("some prompt", "agent-1");

    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("high-skill");
  });

  it("T7: respects topN and returns skills sorted by similarity desc", async () => {
    const skills = [
      { ...MOCK_SKILL, id: "s-a", slug: "skill-a" },
      { ...MOCK_SKILL, id: "s-b", slug: "skill-b" },
      { ...MOCK_SKILL, id: "s-c", slug: "skill-c" },
      { ...MOCK_SKILL, id: "s-d", slug: "skill-d" },
    ];
    vi.mocked(prisma.$queryRaw).mockResolvedValue(skills);
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_PROMPT);

    // 4 skills → 4 cosineSimilarity calls (one per skill, in array order)
    vi.mocked(cosineSimilarity)
      .mockReturnValueOnce(0.6)  // s-a
      .mockReturnValueOnce(0.9)  // s-b (highest)
      .mockReturnValueOnce(0.5)  // s-c
      .mockReturnValueOnce(0.7); // s-d (second)

    const result = await routeToSkill("some prompt", "agent-1", 2);

    expect(result.length).toBe(2);
    expect(result[0].slug).toBe("skill-b"); // 0.9 — highest
    expect(result[1].slug).toBe("skill-d"); // 0.7 — second
  });

  it("T8: returns [] and logs error when DB query throws (non-fatal)", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("DB connection lost"));

    const result = await routeToSkill("some prompt", "agent-1");

    expect(result).toEqual([]);
    // Should not throw — error is swallowed
  });
});

describe("formatRoutedSkillsForPrompt", () => {
  it("T9: returns empty string for empty input", () => {
    expect(formatRoutedSkillsForPrompt([])).toBe("");
  });

  it("T10: wraps skills in <relevant_skills> XML tags with slug prefix", () => {
    const skills: RoutedSkill[] = [
      {
        id: "s1",
        name: "TypeScript Guide",
        slug: "typescript-guide",
        description: "TS best practices",
        content: "Use strict types.",
        similarity: 0.9,
      },
    ];

    const output = formatRoutedSkillsForPrompt(skills);

    expect(output).toContain("<relevant_skills>");
    expect(output).toContain("</relevant_skills>");
    expect(output).toContain("[typescript-guide]");
    expect(output).toContain("Use strict types.");
  });

  it("T11: truncates skill content longer than 2000 chars", () => {
    const longContent = "x".repeat(3000);
    const skills: RoutedSkill[] = [
      {
        id: "s1",
        name: "Big Skill",
        slug: "big-skill",
        description: "Large content",
        content: longContent,
        similarity: 0.8,
      },
    ];

    const output = formatRoutedSkillsForPrompt(skills);

    // Content should be truncated at 2000 chars + "..." = 2003 chars max
    expect(output).toContain("...");
    const contentSection = output.split("[big-skill] ")[1].split("\n")[0];
    expect(contentSection.length).toBeLessThanOrEqual(2003);
  });
});

describe("invalidateSkillCache", () => {
  it("T12: removes from in-memory and calls Redis del", async () => {
    // Seed in-memory cache
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockResolvedValue(MOCK_EMBEDDING_A);
    await getCachedSkillEmbedding("inv-1", "Name", "Desc");

    const mockRedis = { del: vi.fn().mockResolvedValue(1) };
    vi.mocked(getRedis).mockResolvedValue(mockRedis as unknown as Awaited<ReturnType<typeof getRedis>>);

    await invalidateSkillCache("inv-1");

    // In-memory should be gone — next call must hit API again
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(generateEmbedding).mockClear();
    await getCachedSkillEmbedding("inv-1", "Name", "Desc");
    expect(generateEmbedding).toHaveBeenCalledTimes(1);

    // Redis del should have been called
    expect(mockRedis.del).toHaveBeenCalledWith("skill-emb:inv-1");
  });
});
