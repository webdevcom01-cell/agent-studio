import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockExecuteRaw = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockUpsert = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    skill: { findMany: mockFindMany, findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    kBSource: { findUnique: mockFindUnique, create: mockCreate },
    knowledgeBase: { upsert: mockUpsert },
    agent: { upsert: mockUpsert },
    $executeRaw: mockExecuteRaw,
  },
}));

const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/knowledge/embeddings", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

vi.mock("@/lib/knowledge/chunker", () => ({
  chunkText: vi.fn((_text: string) => ["chunk-1", "chunk-2", "chunk-3"]),
  estimateTokens: vi.fn(() => 50),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { vectorizeSkills } from "../skill-ingest";

function makeFakeEmbedding(): number[] {
  return Array.from({ length: 1536 }, () => Math.random());
}

beforeEach(() => {
  vi.clearAllMocks();
  // Virtual source already exists
  mockFindUnique.mockResolvedValue({ id: "ecc-skills-virtual-source" });
  mockExecuteRaw.mockResolvedValue(1);
});

describe("vectorizeSkills — batch config and backpressure (P3-T5)", () => {
  it("uses default batch size of 10", async () => {
    mockFindMany.mockResolvedValue([
      { id: "s1", name: "Skill 1", description: "Desc", content: "Content" },
    ]);
    mockGenerateEmbeddings.mockResolvedValue([makeFakeEmbedding(), makeFakeEmbedding(), makeFakeEmbedding()]);

    const result = await vectorizeSkills();

    expect(result.batchSize).toBe(10);
    expect(result.chunksCreated).toBe(3);
    expect(result.skillsProcessed).toBe(1);
  });

  it("respects custom batch size", async () => {
    mockFindMany.mockResolvedValue([
      { id: "s1", name: "Skill 1", description: "Desc", content: "Content" },
    ]);
    mockGenerateEmbeddings.mockResolvedValue([makeFakeEmbedding(), makeFakeEmbedding(), makeFakeEmbedding()]);

    const result = await vectorizeSkills({ batchSize: 2 });

    expect(result.batchSize).toBe(2);
    // With batchSize=2 and 3 chunks: 2 batches (2+1)
    expect(mockGenerateEmbeddings).toHaveBeenCalledTimes(2);
  });

  it("clamps batch size to max 50", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await vectorizeSkills({ batchSize: 100 });
    expect(result.batchSize).toBe(50);
  });

  it("clamps batch size to min 1", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await vectorizeSkills({ batchSize: 0 });
    expect(result.batchSize).toBe(1);
  });

  it("reports progress in result", async () => {
    mockFindMany.mockResolvedValue([
      { id: "s1", name: "Skill 1", description: "Desc 1", content: "Content 1" },
      { id: "s2", name: "Skill 2", description: "Desc 2", content: "Content 2" },
    ]);
    mockGenerateEmbeddings.mockResolvedValue([makeFakeEmbedding(), makeFakeEmbedding(), makeFakeEmbedding()]);

    const result = await vectorizeSkills({ batchSize: 10 });

    expect(result.skillsProcessed).toBe(2);
    expect(result.chunksCreated).toBe(6);
    expect(result.backpressurePauses).toBe(0);
    expect(result.batchSize).toBe(10);
  });

  it("returns zero counts for empty skill set", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await vectorizeSkills();

    expect(result.skillsProcessed).toBe(0);
    expect(result.chunksCreated).toBe(0);
    expect(result.backpressurePauses).toBe(0);
  });

  it("tracks backpressure pauses", async () => {
    // Simulate many skills to trigger backpressure tracking
    const manySkills = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      name: `Skill ${i}`,
      description: "Desc",
      content: "Content",
    }));
    mockFindMany.mockResolvedValue(manySkills);
    mockGenerateEmbeddings.mockResolvedValue([makeFakeEmbedding(), makeFakeEmbedding(), makeFakeEmbedding()]);

    const result = await vectorizeSkills({ batchSize: 3 });

    expect(result.skillsProcessed).toBe(5);
    expect(result.chunksCreated).toBe(15);
    expect(typeof result.backpressurePauses).toBe("number");
  });
});
