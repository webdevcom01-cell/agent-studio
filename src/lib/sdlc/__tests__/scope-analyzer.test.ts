import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildImportGraph,
  getBlastRadius,
  identifyAffectedFiles,
  getCachedImportGraph,
  buildBlastRadiusContext,
} from "../scope-analyzer";
import type { ImportGraph } from "../scope-analyzer";

vi.mock("@/lib/redis", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("buildImportGraph", () => {
  it("returns empty graph when ts-morph throws", async () => {
    vi.doMock("ts-morph", () => {
      throw new Error("ts-morph not available");
    });

    const graph = await buildImportGraph("/nonexistent/path");
    expect(graph.adjacency.size).toBe(0);
    expect(graph.builtAt).toBe(0);
  });
});

describe("getBlastRadius", () => {
  const makeGraph = (edges: Record<string, string[]>): ImportGraph => ({
    adjacency: new Map(Object.entries(edges)),
    builtAt: Date.now(),
  });

  it("returns empty array when seedFiles is empty", () => {
    const graph = makeGraph({ "/a.ts": ["/b.ts"] });
    expect(getBlastRadius([], graph)).toEqual([]);
  });

  it("performs BFS up to maxDepth=2 and excludes seed files from result", () => {
    const graph = makeGraph({
      "/a.ts": ["/b.ts"],
      "/b.ts": ["/c.ts"],
      "/c.ts": ["/d.ts"],
    });
    // seed = ["/a.ts"], depth=2: a→b (depth 1), b→c (depth 2), c→d (depth 3, excluded)
    const result = getBlastRadius(["/a.ts"], graph, 2);
    expect(result).toContain("/b.ts");
    expect(result).toContain("/c.ts");
    expect(result).not.toContain("/d.ts");
    expect(result).not.toContain("/a.ts"); // seed excluded
  });

  it("handles circular imports without infinite loop", () => {
    const graph = makeGraph({
      "/a.ts": ["/b.ts"],
      "/b.ts": ["/a.ts"],
    });
    // Should terminate without hanging
    const result = getBlastRadius(["/a.ts"], graph, 5);
    expect(result).toContain("/b.ts");
    expect(result).not.toContain("/a.ts");
  });

  it("returns only files reachable from seeds", () => {
    const graph = makeGraph({
      "/a.ts": ["/b.ts"],
      "/c.ts": ["/d.ts"], // disconnected component
    });
    const result = getBlastRadius(["/a.ts"], graph, 2);
    expect(result).toContain("/b.ts");
    expect(result).not.toContain("/c.ts");
    expect(result).not.toContain("/d.ts");
  });
});

describe("identifyAffectedFiles", () => {
  it("returns files whose paths match task description keywords", () => {
    // seed = /src/lib/payments/checkout.ts (matches "checkout" keyword)
    // checkout.ts imports /src/lib/payments/cart.ts (cart does NOT match keywords)
    // blast radius = ["/src/lib/payments/cart.ts"]
    const graph: ImportGraph = {
      adjacency: new Map([
        ["/src/lib/payments/checkout.ts", ["/src/lib/payments/cart.ts"]],
        ["/src/lib/payments/cart.ts", []],
        ["/src/components/header.ts", []],
      ]),
      builtAt: Date.now(),
    };
    const result = identifyAffectedFiles("implement checkout flow", graph);
    // blast radius should include the dependency of the matched seed
    expect(result.some((f) => f.includes("cart"))).toBe(true);
    // seed itself is excluded from blast radius
    expect(result.some((f) => f.includes("checkout"))).toBe(false);
  });
});

describe("getCachedImportGraph", () => {
  it("deserializes Map correctly when cache hit", async () => {
    const { cacheGet } = await import("@/lib/redis");
    const entries: [string, string[]][] = [
      ["/src/a.ts", ["/src/b.ts"]],
      ["/src/b.ts", []],
    ];
    vi.mocked(cacheGet).mockResolvedValueOnce(JSON.stringify(entries));

    const graph = await getCachedImportGraph("agent-123", "/tmp/nonexistent");
    expect(graph.adjacency.get("/src/a.ts")).toEqual(["/src/b.ts"]);
    expect(graph.adjacency.get("/src/b.ts")).toEqual([]);
  });
});

describe("buildBlastRadiusContext", () => {
  it("limits to maxFiles and maxCharsPerFile", async () => {
    // Pass non-existent paths — they'll be skipped silently
    const files = ["/nonexistent/a.ts", "/nonexistent/b.ts", "/nonexistent/c.ts"];
    const result = await buildBlastRadiusContext(files, 2, 100);
    // All files are non-existent so result should be empty string
    expect(result).toBe("");
  });

  it("returns empty string when affectedFiles is empty", async () => {
    const result = await buildBlastRadiusContext([], 5, 800);
    expect(result).toBe("");
  });
});
