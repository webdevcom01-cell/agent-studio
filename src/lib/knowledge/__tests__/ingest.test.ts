import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  kBSource: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  kBChunk: {
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
}));

const mockParseSource = vi.hoisted(() => vi.fn());
const mockChunkText = vi.hoisted(() => vi.fn());
const mockEstimateTokens = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("../parsers", () => ({ parseSource: mockParseSource }));
vi.mock("../chunker", () => ({
  chunkText: mockChunkText,
  estimateTokens: mockEstimateTokens,
}));
vi.mock("../embeddings", () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

import { ingestSource, deleteSourceChunks } from "../ingest";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.kBSource.update.mockResolvedValue({});
  mockPrisma.kBChunk.deleteMany.mockResolvedValue({});
  mockPrisma.$executeRaw.mockResolvedValue(0);
  mockEstimateTokens.mockReturnValue(50);
});

describe("ingestSource", () => {
  it("ingests TEXT source with provided content", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "TEXT",
      rawContent: "raw text",
    });
    mockChunkText.mockReturnValue(["chunk1", "chunk2"]);
    mockGenerateEmbeddings.mockResolvedValue([
      new Array(1536).fill(0.1),
      new Array(1536).fill(0.2),
    ]);

    const result = await ingestSource("s1", "provided text");

    expect(result.chunksCreated).toBe(2);
    expect(mockPrisma.kBSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
  });

  it("ingests URL source via parseSource", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "URL",
      url: "https://example.com",
    });
    mockParseSource.mockResolvedValue("parsed content from URL");
    mockChunkText.mockReturnValue(["chunk"]);
    mockGenerateEmbeddings.mockResolvedValue([new Array(1536).fill(0.1)]);

    const result = await ingestSource("s1");

    expect(result.chunksCreated).toBe(1);
    expect(mockParseSource).toHaveBeenCalledWith({
      type: "URL",
      url: "https://example.com",
    });
  });

  it("sets status to FAILED on error", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "TEXT",
      rawContent: "",
    });

    await expect(ingestSource("s1")).rejects.toThrow("No content extracted");

    expect(mockPrisma.kBSource.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMsg: "No content extracted",
        }),
      }),
    );
  });

  it("throws on invalid embedding values", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "TEXT",
      rawContent: "text",
    });
    mockChunkText.mockReturnValue(["chunk"]);
    mockGenerateEmbeddings.mockResolvedValue([
      [NaN, 0.1, Infinity],
    ]);

    await expect(ingestSource("s1", "text")).rejects.toThrow(
      "Embedding at index 0 contains invalid values",
    );
  });

  it("batches inserts for many chunks", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "TEXT",
      rawContent: "text",
    });

    const chunks = Array.from({ length: 120 }, (_, i) => `chunk-${i}`);
    mockChunkText.mockReturnValue(chunks);
    mockGenerateEmbeddings.mockResolvedValue(
      chunks.map(() => new Array(1536).fill(0.1)),
    );

    const result = await ingestSource("s1", "text");

    expect(result.chunksCreated).toBe(120);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("throws when no chunks generated", async () => {
    mockPrisma.kBSource.findUniqueOrThrow.mockResolvedValue({
      id: "s1",
      type: "TEXT",
      rawContent: "text",
    });
    mockChunkText.mockReturnValue([]);

    await expect(ingestSource("s1", "text")).rejects.toThrow("No chunks generated");
  });
});

describe("deleteSourceChunks", () => {
  it("deletes all chunks for source", async () => {
    await deleteSourceChunks("s1");
    expect(mockPrisma.kBChunk.deleteMany).toHaveBeenCalledWith({
      where: { sourceId: "s1" },
    });
  });
});
