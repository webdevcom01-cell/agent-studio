import { describe, it, expect, vi, beforeEach } from "vitest";
import { enrichWithSemanticSummaries, buildModuleMapContext } from "../module-map";
import type { ModuleEntry } from "../module-map";
import type { FileSignature } from "../ast-analyzer";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "Handles user authentication." }),
}));

vi.mock("@/lib/ai", () => ({
  getModel: vi.fn().mockReturnValue({ modelId: "gpt-4.1-mini" }),
}));

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeSig = (path: string, exports: string[], types: string[] = []): FileSignature => ({
  path,
  exports,
  imports: [],
  types,
});

describe("enrichWithSemanticSummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const result = await enrichWithSemanticSummaries([]);
    expect(result).toEqual([]);
  });

  it("calls generateText for each of top-10 signatures", async () => {
    const { generateText } = await import("ai");
    const sigs = Array.from({ length: 12 }, (_, i) =>
      makeSig(`/src/lib/mod${i}.ts`, ["export" + i]),
    );
    await enrichWithSemanticSummaries(sigs);
    // Should only call for top 10 (MAX_MODULES_TO_ENRICH)
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(10);
  });

  it("uses cached value when cacheGet returns a hit", async () => {
    const { cacheGet } = await import("@/lib/redis");
    const { generateText } = await import("ai");
    vi.mocked(cacheGet).mockResolvedValueOnce("Cached module summary.");

    const sigs = [makeSig("/src/lib/auth.ts", ["authenticate", "logout"])];
    const result = await enrichWithSemanticSummaries(sigs);

    expect(vi.mocked(generateText)).not.toHaveBeenCalled();
    expect(result[0].purpose).toBe("Cached module summary.");
  });

  it("returns entry with purpose '' when generateText throws (never throws overall)", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("API error"));

    const sigs = [makeSig("/src/lib/broken.ts", ["brokenExport"])];
    const result = await enrichWithSemanticSummaries(sigs);

    expect(result).toHaveLength(1);
    expect(result[0].purpose).toBe("");
  });

  it("caps at MAX_MODULES_TO_ENRICH=10 and picks by export count", async () => {
    const { generateText } = await import("ai");
    // 15 sigs, varying export counts
    const sigs = Array.from({ length: 15 }, (_, i) =>
      makeSig(`/src/mod${i}.ts`, Array.from({ length: i }, (__, j) => `exp${j}`)),
    );
    await enrichWithSemanticSummaries(sigs);
    // Top 10 by export count = indices 5..14 (most exports)
    expect(vi.mocked(generateText)).toHaveBeenCalledTimes(10);
  });

  it("preserves exports and types from signature in result", async () => {
    const sigs = [makeSig("/src/lib/utils.ts", ["helper", "formatDate"], ["UtilType"])];
    const result = await enrichWithSemanticSummaries(sigs);

    expect(result[0].exports).toEqual(["helper", "formatDate"]);
    expect(result[0].types).toEqual(["UtilType"]);
  });
});

describe("buildModuleMapContext", () => {
  const makeEntry = (path: string, purpose: string, exports: string[]): ModuleEntry => ({
    path,
    purpose,
    exports,
    types: [],
  });

  it("filters entries by keyword match on path and purpose", () => {
    const entries = [
      makeEntry("/src/lib/auth/session.ts", "Manages user sessions.", ["createSession"]),
      makeEntry("/src/lib/payments/billing.ts", "Handles billing invoices.", ["charge"]),
      makeEntry("/src/components/header.tsx", "Header navigation component.", ["Header"]),
    ];
    const result = buildModuleMapContext(entries, "fix the auth session token expiry", 5000);
    expect(result).toContain("session.ts");
    expect(result).not.toContain("billing.ts");
  });

  it("falls back to top-5 by export count when keyword filter returns empty", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry(`/src/mod${i}.ts`, "A module.", Array.from({ length: 8 - i }, (__, j) => `e${j}`)),
    );
    const result = buildModuleMapContext(entries, "zzz unknown xyz task", 5000);
    // Should include some entries (fallback to top-5 by export count)
    expect(result).toContain("## Module Map");
    // Should not be empty (fallback populated it)
    expect(result.length).toBeGreaterThan(15);
  });

  it("returns empty string when entries array is empty", () => {
    const result = buildModuleMapContext([], "some task", 5000);
    expect(result).toBe("");
  });
});
