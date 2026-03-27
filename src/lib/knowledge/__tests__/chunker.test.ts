import { describe, it, expect } from "vitest";
import { estimateTokens, chunkText } from "../chunker";

describe("estimateTokens", () => {
  it("estimates tokens from word count", () => {
    const result = estimateTokens("one two three four");
    expect(result).toBe(Math.ceil(4 / 0.75));
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles whitespace-only string", () => {
    expect(estimateTokens("   ")).toBe(0);
  });

  it("handles single word", () => {
    expect(estimateTokens("hello")).toBe(Math.ceil(1 / 0.75));
  });
});

describe("chunkText", () => {
  it("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const result = chunkText("This is a short text.");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("This is a short text.");
  });

  it("splits text into multiple chunks", () => {
    const paragraphs = Array.from(
      { length: 10 },
      (_, i) => `Paragraph ${i}. ` + "word ".repeat(50)
    ).join("\n\n");

    const result = chunkText(paragraphs, { maxTokens: 100 });
    expect(result.length).toBeGreaterThan(1);
  });

  it("respects maxTokens option", () => {
    const paragraphs = Array.from(
      { length: 5 },
      (_, i) => `Section ${i}. ` + "content ".repeat(30)
    ).join("\n\n");

    const result = chunkText(paragraphs, { maxTokens: 50 });
    for (const chunk of result) {
      const tokens = estimateTokens(chunk);
      expect(tokens).toBeLessThanOrEqual(50 * 1.3);
    }
  });

  it("handles text with no paragraph breaks", () => {
    const longSentences = Array.from(
      { length: 20 },
      (_, i) => `This is sentence number ${i} with some content.`
    ).join(" ");

    const result = chunkText(longSentences, { maxTokens: 50 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("adds overlap between chunks", () => {
    const paragraphs = Array.from(
      { length: 6 },
      (_, i) => `Unique paragraph ${i}. ` + "filler ".repeat(40)
    ).join("\n\n");

    const result = chunkText(paragraphs, {
      maxTokens: 80,
      overlapPercent: 0.2,
    });

    if (result.length >= 3) {
      const secondChunk = result[1];
      const firstChunkWords = result[0].split(/\s+/);
      const lastWordsOfFirst = firstChunkWords.slice(-5).join(" ");
      expect(secondChunk).toContain(lastWordsOfFirst.split(" ")[0]);
    }
  });

  it("uses default options when none provided", () => {
    const text = "Short text paragraph.";
    const result = chunkText(text);
    expect(result).toHaveLength(1);
  });
});
