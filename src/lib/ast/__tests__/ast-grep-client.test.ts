/**
 * Unit tests for ast-grep-client.ts (Phase F2)
 * 10 tests covering: detectLanguage, astGrepSearch (unavailable addon),
 * error handling, language mapping.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dynamic import of @ast-grep/napi to avoid needing the native addon
vi.mock("@ast-grep/napi", () => {
  throw new Error("Cannot find module @ast-grep/napi");
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks are set up
import { detectLanguage, astGrepSearch, type AstGrepLanguage } from "../ast-grep-client";

describe("ast-grep-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── detectLanguage ───────────────────────────────────────────────────────

  describe("detectLanguage", () => {
    it("T1: maps .ts to typescript", () => {
      expect(detectLanguage("ts")).toBe("typescript");
      expect(detectLanguage(".ts")).toBe("typescript");
      expect(detectLanguage("file.ts")).toBe("typescript");
    });

    it("T2: maps .tsx to tsx", () => {
      expect(detectLanguage("tsx")).toBe("tsx");
      expect(detectLanguage("component.tsx")).toBe("tsx");
    });

    it("T3: maps .py to python", () => {
      expect(detectLanguage("py")).toBe("python");
      expect(detectLanguage("script.py")).toBe("python");
    });

    it("T4: maps .js to javascript", () => {
      expect(detectLanguage("js")).toBe("javascript");
      expect(detectLanguage("index.js")).toBe("javascript");
    });

    it("T5: maps .jsx to jsx", () => {
      expect(detectLanguage("jsx")).toBe("jsx");
    });

    it("T6: maps .go, .rs, .java, .c, .cpp", () => {
      expect(detectLanguage("go")).toBe("go");
      expect(detectLanguage("rs")).toBe("rust");
      expect(detectLanguage("java")).toBe("java");
      expect(detectLanguage("c")).toBe("c");
      expect(detectLanguage("cpp")).toBe("cpp");
    });

    it("T7: returns null for unknown extensions", () => {
      expect(detectLanguage("xyz")).toBeNull();
      expect(detectLanguage("")).toBeNull();
      expect(detectLanguage("docx")).toBeNull();
    });
  });

  // ─── astGrepSearch — when addon is unavailable ────────────────────────────

  describe("astGrepSearch (addon unavailable)", () => {
    it("T8: returns available:false when native addon cannot be loaded", async () => {
      const result = await astGrepSearch("const x = 1;", "const $VAR = $VAL", "typescript");
      expect(result.available).toBe(false);
      expect(result.matches).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it("T9: returns available:false for any language when addon missing", async () => {
      const languages: AstGrepLanguage[] = ["python", "rust", "go"];
      for (const lang of languages) {
        const result = await astGrepSearch("x = 1", "x = $VAL", lang);
        expect(result.available).toBe(false);
        expect(result.matches).toEqual([]);
      }
    });

    it("T10: does not throw even with empty inputs", async () => {
      const result = await astGrepSearch("", "", "typescript");
      expect(result.available).toBe(false);
      expect(result.matches).toEqual([]);
    });
  });
});
