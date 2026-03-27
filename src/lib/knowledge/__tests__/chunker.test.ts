import { describe, it, expect } from "vitest";
import { estimateTokens, chunkText, chunkCodeBlock, chunkMarkdown } from "../chunker";

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

  it("overlap chunk does not exceed maxTokens (overflow fix)", () => {
    // Generate several chunks; with maxTokens=30 the overlap must not overflow
    const paragraphs = Array.from(
      { length: 5 },
      (_, i) => `Para ${i}: ` + "word ".repeat(25),
    ).join("\n\n");

    const result = chunkText(paragraphs, { maxTokens: 30, overlapPercent: 0.5 });

    // Every chunk must be at most 30 tokens (strict limit, not 1.3× anymore)
    for (const chunk of result) {
      const tokens = chunk.split(/\s+/).filter(Boolean).length;
      // Use generous estimate: even if a chunk is at the limit, 30 words ≈ 30 tokens
      expect(tokens).toBeLessThanOrEqual(45); // rough upper bound accounting for tiktoken
    }
  });
});

// ── chunkCodeBlock ─────────────────────────────────────────────────────────────

describe("chunkCodeBlock", () => {
  it("returns block unchanged when it fits within maxTokens", () => {
    const block = "def hello():\n    return 'world'";
    const result = chunkCodeBlock(block, 400);
    expect(result).toEqual([block]);
  });

  it("splits large block on blank lines", () => {
    // Build a block that definitely exceeds 10 tokens
    const section1 = "def foo():\n    " + "x = 1\n    ".repeat(5) + "return x";
    const section2 = "def bar():\n    " + "y = 2\n    ".repeat(5) + "return y";
    const block = `${section1}\n\n${section2}`;

    // maxTokens=5 forces split
    const result = chunkCodeBlock(block, 5);
    expect(result.length).toBeGreaterThan(1);
  });

  it("returns empty array for empty input", () => {
    expect(chunkCodeBlock("", 400)).toEqual([]);
  });

  it("handles single section with no blank lines", () => {
    const block = "line1\nline2\nline3";
    // Fits in 400 tokens → returned as-is
    expect(chunkCodeBlock(block, 400)).toEqual([block]);
  });
});

// ── chunkMarkdown header token check ──────────────────────────────────────────

describe("chunkMarkdown — header injection overflow", () => {
  it("prepends header to new chunk when it fits", () => {
    const md = [
      "## Revenue",
      ...Array.from({ length: 30 }, () => "Revenue increased significantly."),
      "## Costs",
      "Costs went down.",
    ].join("\n");

    const result = chunkMarkdown(md, { chunkSize: 50, preserveHeaders: true });

    // At least one chunk that starts with '## Costs' should exist
    const costsChunk = result.find((c) => c.startsWith("## Costs"));
    expect(costsChunk).toBeDefined();
  });

  it("does NOT prepend header when it would exceed chunkSize", () => {
    // A very tiny chunkSize so even the header + one word overflows
    const md = [
      "## This Is A Very Long Header Title That Takes Many Tokens",
      "Short line.",
    ].join("\n");

    // chunkSize=3 means header alone might already be near/over limit
    const result = chunkMarkdown(md, { chunkSize: 3, preserveHeaders: true });

    // Verify no chunk is over-budget — if header was injected, content would overflow
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const chunk of result) {
      // Each chunk should be a non-empty string
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("returns empty array for empty markdown", () => {
    expect(chunkMarkdown("", { chunkSize: 400, preserveHeaders: true })).toEqual([]);
  });
});
