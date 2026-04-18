import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipelineMemory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { prisma } = await import("@/lib/prisma");
const { generateObject } = await import("ai");
const mockedCreate = vi.mocked(prisma.pipelineMemory.create);
const mockedFindMany = vi.mocked(prisma.pipelineMemory.findMany);
const mockedGenerateObject = vi.mocked(generateObject);

describe("extractAndSaveMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls prisma.pipelineMemory.create for each extracted memory", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        memories: [
          { category: "architecture", content: "Used repository pattern" },
          { category: "patterns", content: "Always validate inputs at boundary" },
        ],
      },
    } as Awaited<ReturnType<typeof generateObject>>);
    mockedCreate.mockResolvedValue({} as never);

    const { extractAndSaveMemory } = await import("../pipeline-memory");
    await extractAndSaveMemory("run1", "agent1", "Build auth module", ["step output 1"]);

    expect(mockedCreate).toHaveBeenCalledTimes(2);
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "architecture", agentId: "agent1" }),
      }),
    );
  });

  it("does NOT throw when generateObject rejects (LLM failure)", async () => {
    mockedGenerateObject.mockRejectedValueOnce(new Error("LLM timeout"));

    const { extractAndSaveMemory } = await import("../pipeline-memory");
    await expect(
      extractAndSaveMemory("run1", "agent1", "Build auth module", []),
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when prisma.create rejects (DB failure)", async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: { memories: [{ category: "errors", content: "Fixed null pointer" }] },
    } as Awaited<ReturnType<typeof generateObject>>);
    mockedCreate.mockRejectedValueOnce(new Error("DB connection failed"));

    const { extractAndSaveMemory } = await import("../pipeline-memory");
    await expect(
      extractAndSaveMemory("run1", "agent1", "Build auth module", []),
    ).resolves.toBeUndefined();
  });
});

describe("loadRelevantMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns '' when findMany returns []", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const { loadRelevantMemory } = await import("../pipeline-memory");
    const result = await loadRelevantMemory("agent1");
    expect(result).toBe("");
  });

  it("returns '' when findMany rejects (DB error, never throws)", async () => {
    mockedFindMany.mockRejectedValueOnce(new Error("DB error"));

    const { loadRelevantMemory } = await import("../pipeline-memory");
    await expect(loadRelevantMemory("agent1")).resolves.toBe("");
  });

  it("output never exceeds MAX_MEMORY_CHARS_TOTAL characters", async () => {
    const longContent = "x".repeat(400);
    mockedFindMany.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        category: "architecture",
        content: `${longContent}-${i}`,
      })),
    );

    const { loadRelevantMemory } = await import("../pipeline-memory");
    const result = await loadRelevantMemory("agent1");
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it("respects take: MAX_MEMORIES_LOADED (assert findMany was called with take: 10)", async () => {
    mockedFindMany.mockResolvedValueOnce([]);

    const { loadRelevantMemory } = await import("../pipeline-memory");
    await loadRelevantMemory("agent1");

    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});
