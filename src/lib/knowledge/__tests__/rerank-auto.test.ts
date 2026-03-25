import { describe, it, expect, vi } from "vitest";
import { shouldRerank } from "../search";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/observability/metrics", () => ({
  recordMetric: vi.fn(),
}));

describe("shouldRerank — auto-rerank for short queries (P3-T4)", () => {
  describe("auto-enable for short queries (< 5 words)", () => {
    it("enables for 1-word query", () => {
      expect(shouldRerank("security", undefined)).toBe(true);
    });

    it("enables for 2-word query", () => {
      expect(shouldRerank("webhook secrets", undefined)).toBe(true);
    });

    it("enables for 3-word query", () => {
      expect(shouldRerank("fix auth bug", undefined)).toBe(true);
    });

    it("enables for 4-word query", () => {
      expect(shouldRerank("how deploy to railway", undefined)).toBe(true);
    });

    it("disables for 5-word query", () => {
      expect(shouldRerank("how to deploy on railway", undefined)).toBe(false);
    });

    it("disables for long query", () => {
      expect(shouldRerank(
        "explain how the webhook signature verification works in the execute pipeline",
        undefined
      )).toBe(false);
    });
  });

  describe("explicit override", () => {
    it("forces enable when rerank=true regardless of query length", () => {
      expect(shouldRerank(
        "this is a very long query with many words that would normally not trigger reranking",
        true
      )).toBe(true);
    });

    it("forces disable when rerank=false regardless of query length", () => {
      expect(shouldRerank("short", false)).toBe(false);
    });

    it("forces disable for 1-word query when rerank=false", () => {
      expect(shouldRerank("x", false)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty query (0 words)", () => {
      expect(shouldRerank("", undefined)).toBe(true);
    });

    it("handles whitespace-only query", () => {
      expect(shouldRerank("   ", undefined)).toBe(true);
    });

    it("handles query with extra spaces", () => {
      expect(shouldRerank("  fix   bug  ", undefined)).toBe(true);
    });
  });
});
