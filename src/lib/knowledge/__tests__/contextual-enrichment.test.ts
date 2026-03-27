import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { enrichChunksWithContext } from "../contextual-enrichment";
import { generateText } from "ai";

const mockGenerateText = vi.mocked(generateText);

const DOC = "This is a Q3 2024 financial report for ACME Corp discussing quarterly performance.";

const CHUNKS: string[] = [
  "Revenue grew 23% compared to last quarter.",
  "Operating expenses decreased by 5%.",
  "Net profit margin reached 18%.",
];

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Happy path ─────────────────────────────────────────────────────────────────

describe("enrichChunksWithContext — happy path", () => {
  it("prepends context to each chunk", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "From the ACME Q3 2024 revenue section." } as never)
      .mockResolvedValueOnce({ text: "From the ACME Q3 2024 expenses section." } as never)
      .mockResolvedValueOnce({ text: "From the ACME Q3 2024 profitability section." } as never);

    const result = await enrichChunksWithContext(CHUNKS, DOC);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(
      "From the ACME Q3 2024 revenue section.\n\nRevenue grew 23% compared to last quarter.",
    );
    expect(result[1]).toContain("expenses section");
    expect(result[2]).toContain("profitability section");
  });

  it("calls generateText once per chunk", async () => {
    mockGenerateText.mockResolvedValue({ text: "Some context." } as never);

    await enrichChunksWithContext(CHUNKS, DOC);

    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("returns empty array when given empty chunks", async () => {
    const result = await enrichChunksWithContext([], DOC);
    expect(result).toHaveLength(0);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});

// ── Batching ───────────────────────────────────────────────────────────────────

describe("enrichChunksWithContext — batching", () => {
  it("respects custom concurrency option", async () => {
    mockGenerateText.mockResolvedValue({ text: "Context." } as never);

    // 6 chunks with concurrency=2 → 3 batches
    const manyChunks: string[] = Array.from({ length: 6 }, (_, i) => `Chunk ${i}`);

    await enrichChunksWithContext(manyChunks, DOC, { concurrency: 2 });

    expect(mockGenerateText).toHaveBeenCalledTimes(6);
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe("enrichChunksWithContext — error handling", () => {
  it("falls back to original chunk when LLM call fails", async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error("Rate limit"))
      .mockResolvedValueOnce({ text: "Context for chunk 2." } as never)
      .mockResolvedValueOnce({ text: "Context for chunk 3." } as never);

    const result = await enrichChunksWithContext(CHUNKS, DOC);

    // Chunk 1: fallback to original
    expect(result[0]).toBe("Revenue grew 23% compared to last quarter.");
    // Chunk 2: enriched
    expect(result[1]).toContain("Context for chunk 2.");
    // Still returns all 3 chunks
    expect(result).toHaveLength(3);
  });

  it("falls back to original chunk when LLM returns empty string", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "" } as never);

    const result = await enrichChunksWithContext(["Revenue grew 23%."], DOC);

    expect(result[0]).toBe("Revenue grew 23%.");
  });

  it("truncates document to 12000 characters in the prompt", async () => {
    const longDoc = "x".repeat(20_000);
    mockGenerateText.mockResolvedValueOnce({ text: "Context." } as never);

    await enrichChunksWithContext(["Some chunk."], longDoc);

    const callArgs = mockGenerateText.mock.calls[0][0] as { prompt: string };
    // The prompt contains the document — verify it was truncated
    expect(callArgs.prompt.length).toBeLessThan(20_000 + 500); // 12000 + prompt overhead
    expect(callArgs.prompt).not.toContain("x".repeat(13_000));
  });
});
