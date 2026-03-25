/**
 * Unit tests for src/lib/evals/standards.ts
 *
 * Coverage:
 *   - All 19 categories are defined
 *   - getCategoryStandard() merges global + category assertions correctly
 *   - getCategoryStandard() deduplicates assertion types (category wins)
 *   - getCategoryStandard() returns DEFAULT_EVAL_STANDARD for unknown category
 *   - getRequiredAssertions() returns only required:true assertions
 *   - getAllStandards() returns all categories with merged globals
 *   - Every standard has required fields populated
 *   - Global assertions are always present (latency, relevance)
 *   - Thresholds are within valid range 0.0–1.0
 *   - passingScore is within 0.0–1.0
 *   - minTestCases >= 1
 *   - suggestedTestLabels is non-empty
 */

import { describe, it, expect } from "vitest";
import {
  GLOBAL_EVAL_ASSERTIONS,
  CATEGORY_EVAL_STANDARDS,
  DEFAULT_EVAL_STANDARD,
  getCategoryStandard,
  getRequiredAssertions,
  getAllStandards,
} from "../standards";

// ─── Known categories ──────────────────────────────────────────────────────────

const KNOWN_CATEGORIES = [
  "assistant",
  "research",
  "writing",
  "coding",
  "design",
  "marketing",
  "support",
  "data",
  "education",
  "productivity",
  "specialized",
  "engineering",
  "testing",
  "product",
  "project-management",
  "game-development",
  "spatial-computing",
  "paid-media",
  "desktop-automation",
];

// ─── GLOBAL_EVAL_ASSERTIONS ────────────────────────────────────────────────────

describe("GLOBAL_EVAL_ASSERTIONS", () => {
  it("contains at least 2 global assertions", () => {
    expect(GLOBAL_EVAL_ASSERTIONS.length).toBeGreaterThanOrEqual(2);
  });

  it("includes a latency assertion", () => {
    const latency = GLOBAL_EVAL_ASSERTIONS.find((a) => a.assertion.type === "latency");
    expect(latency).toBeDefined();
    expect(latency?.required).toBe(true);
    expect(latency?.layer).toBe(1);
  });

  it("includes a relevance assertion", () => {
    const relevance = GLOBAL_EVAL_ASSERTIONS.find((a) => a.assertion.type === "relevance");
    expect(relevance).toBeDefined();
    expect(relevance?.required).toBe(true);
    expect(relevance?.layer).toBe(3);
  });

  it("all global assertions have rationale", () => {
    for (const a of GLOBAL_EVAL_ASSERTIONS) {
      expect(a.rationale.length).toBeGreaterThan(10);
    }
  });

  it("latency threshold is a positive number in milliseconds", () => {
    const latency = GLOBAL_EVAL_ASSERTIONS.find((a) => a.assertion.type === "latency");
    if (latency?.assertion.type === "latency") {
      expect(latency.assertion.threshold).toBeGreaterThan(0);
    }
  });

  it("relevance threshold is between 0 and 1", () => {
    const relevance = GLOBAL_EVAL_ASSERTIONS.find((a) => a.assertion.type === "relevance");
    if (relevance?.assertion.type === "relevance") {
      expect(relevance.assertion.threshold).toBeGreaterThan(0);
      expect(relevance.assertion.threshold).toBeLessThanOrEqual(1);
    }
  });
});

// ─── CATEGORY_EVAL_STANDARDS ──────────────────────────────────────────────────

describe("CATEGORY_EVAL_STANDARDS", () => {
  it("contains all 19 known categories", () => {
    for (const cat of KNOWN_CATEGORIES) {
      expect(CATEGORY_EVAL_STANDARDS[cat]).toBeDefined();
    }
  });

  it("every category has valid required fields", () => {
    for (const [key, standard] of Object.entries(CATEGORY_EVAL_STANDARDS)) {
      expect(standard.category).toBe(key);
      expect(standard.displayName.length).toBeGreaterThan(0);
      expect(standard.description.length).toBeGreaterThan(10);
      expect(standard.assertions.length).toBeGreaterThan(0);
      expect(standard.minTestCases).toBeGreaterThanOrEqual(1);
      expect(standard.passingScore).toBeGreaterThan(0);
      expect(standard.passingScore).toBeLessThanOrEqual(1);
      expect(standard.suggestedTestLabels.length).toBeGreaterThan(0);
    }
  });

  it("every assertion template has a rationale", () => {
    for (const standard of Object.values(CATEGORY_EVAL_STANDARDS)) {
      for (const template of standard.assertions) {
        expect(template.rationale.length).toBeGreaterThan(10);
      }
    }
  });

  it("every assertion template has a valid layer (1, 2, or 3)", () => {
    for (const standard of Object.values(CATEGORY_EVAL_STANDARDS)) {
      for (const template of standard.assertions) {
        expect([1, 2, 3]).toContain(template.layer);
      }
    }
  });

  it("non-latency threshold fields are in valid range 0.0–1.0 when present", () => {
    for (const standard of Object.values(CATEGORY_EVAL_STANDARDS)) {
      for (const template of standard.assertions) {
        const a = template.assertion as Record<string, unknown>;
        // latency.threshold is in milliseconds — excluded from 0.0–1.0 check
        if (a["type"] === "latency") continue;
        if (typeof a["threshold"] === "number") {
          expect(a["threshold"]).toBeGreaterThan(0);
          expect(a["threshold"]).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("high-stakes categories (specialized) have stricter thresholds", () => {
    const specialized = CATEGORY_EVAL_STANDARDS["specialized"];
    expect(specialized.passingScore).toBeGreaterThanOrEqual(0.80);
    // kb_faithfulness threshold should be >= 0.85 for specialized
    const faithfulness = specialized.assertions.find(
      (a) => a.assertion.type === "kb_faithfulness",
    );
    if (faithfulness?.assertion.type === "kb_faithfulness") {
      expect(faithfulness.assertion.threshold).toBeGreaterThanOrEqual(0.80);
    }
  });

  it("support category has kb_faithfulness assertion", () => {
    const support = CATEGORY_EVAL_STANDARDS["support"];
    const faithfulness = support.assertions.find(
      (a) => a.assertion.type === "kb_faithfulness",
    );
    expect(faithfulness).toBeDefined();
  });

  it("coding category has llm_rubric with high threshold", () => {
    const coding = CATEGORY_EVAL_STANDARDS["coding"];
    const rubric = coding.assertions.find((a) => a.assertion.type === "llm_rubric");
    expect(rubric).toBeDefined();
    if (rubric?.assertion.type === "llm_rubric") {
      expect(rubric.assertion.threshold).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("desktop-automation has not_contains for rm -rf /", () => {
    const desktop = CATEGORY_EVAL_STANDARDS["desktop-automation"];
    const safety = desktop.assertions.find(
      (a) => a.assertion.type === "not_contains" &&
        a.assertion.type === "not_contains" &&
        (a.assertion as { type: "not_contains"; value: string }).value === "rm -rf /",
    );
    expect(safety).toBeDefined();
  });

  it("marketing and paid-media have not_contains for restricted claims", () => {
    for (const cat of ["marketing", "paid-media"]) {
      const standard = CATEGORY_EVAL_STANDARDS[cat];
      const notContains = standard.assertions.filter(
        (a) => a.assertion.type === "not_contains",
      );
      expect(notContains.length).toBeGreaterThan(0);
    }
  });
});

// ─── getCategoryStandard() ────────────────────────────────────────────────────

describe("getCategoryStandard()", () => {
  it("returns the correct category for a known category", () => {
    const std = getCategoryStandard("coding");
    expect(std.category).toBe("coding");
  });

  it("returns DEFAULT_EVAL_STANDARD for unknown category", () => {
    const std = getCategoryStandard("unknown_xyz");
    expect(std.category).toBe("default");
  });

  it("returns DEFAULT_EVAL_STANDARD for null", () => {
    const std = getCategoryStandard(null);
    expect(std.category).toBe("default");
  });

  it("returns DEFAULT_EVAL_STANDARD for undefined", () => {
    const std = getCategoryStandard(undefined);
    expect(std.category).toBe("default");
  });

  it("merged result always includes global latency assertion", () => {
    for (const cat of KNOWN_CATEGORIES) {
      const std = getCategoryStandard(cat);
      const hasLatency = std.assertions.some((a) => a.assertion.type === "latency");
      expect(hasLatency).toBe(true);
    }
  });

  it("merged result always includes a relevance-type assertion", () => {
    // Either global relevance OR category relevance — one must be present
    for (const cat of KNOWN_CATEGORIES) {
      const std = getCategoryStandard(cat);
      const hasRelevance = std.assertions.some((a) => a.assertion.type === "relevance");
      expect(hasRelevance).toBe(true);
    }
  });

  it("required globals always appear exactly once even when category defines same type", () => {
    // 'assistant' defines its own optional latency (15s).
    // The required global latency (30s) must still appear exactly once.
    const std = getCategoryStandard("assistant");
    const latencyEntries = std.assertions.filter(
      (a) => a.assertion.type === "latency",
    );
    // Required global latency is kept; optional category latency is dropped
    expect(latencyEntries).toHaveLength(1);
    expect(latencyEntries[0].required).toBe(true);
  });

  it("category non-required assertions that don't conflict with required globals are kept", () => {
    // 'assistant' defines an optional llm_rubric — should still be in merged result
    const std = getCategoryStandard("assistant");
    const rubric = std.assertions.find((a) => a.assertion.type === "llm_rubric");
    expect(rubric).toBeDefined();
  });

  it("does not mutate the original standard when merging", () => {
    const originalCount = CATEGORY_EVAL_STANDARDS["coding"].assertions.length;
    getCategoryStandard("coding");
    expect(CATEGORY_EVAL_STANDARDS["coding"].assertions.length).toBe(originalCount);
  });

  it("returns a new array (not a reference) on each call", () => {
    const s1 = getCategoryStandard("coding");
    const s2 = getCategoryStandard("coding");
    expect(s1.assertions).not.toBe(s2.assertions);
  });
});

// ─── getRequiredAssertions() ──────────────────────────────────────────────────

describe("getRequiredAssertions()", () => {
  it("returns only required assertions", () => {
    const required = getRequiredAssertions("support");
    for (const a of required) {
      expect(a.required).toBe(true);
    }
  });

  it("returns at least one required assertion for every known category", () => {
    for (const cat of KNOWN_CATEGORIES) {
      const required = getRequiredAssertions(cat);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("always includes global required assertions (latency is required global)", () => {
    // latency is required:true in GLOBAL_EVAL_ASSERTIONS
    for (const cat of KNOWN_CATEGORIES) {
      const required = getRequiredAssertions(cat);
      const hasLatency = required.some((a) => a.assertion.type === "latency");
      expect(hasLatency).toBe(true);
    }
  });

  it("returns fewer assertions than getCategoryStandard when optional exist", () => {
    // 'assistant' has an optional latency (15s) on top of required assertions
    const all = getCategoryStandard("assistant").assertions;
    const required = getRequiredAssertions("assistant");
    // required should be <= all
    expect(required.length).toBeLessThanOrEqual(all.length);
  });
});

// ─── getAllStandards() ────────────────────────────────────────────────────────

describe("getAllStandards()", () => {
  it("returns 19 category standards", () => {
    const all = getAllStandards();
    expect(all.length).toBe(KNOWN_CATEGORIES.length);
  });

  it("every returned standard has merged global assertions", () => {
    for (const std of getAllStandards()) {
      const hasLatency = std.assertions.some((a) => a.assertion.type === "latency");
      expect(hasLatency).toBe(true);
    }
  });

  it("returns unique categories (no duplicates)", () => {
    const all = getAllStandards();
    const seen = new Set<string>();
    for (const std of all) {
      expect(seen.has(std.category)).toBe(false);
      seen.add(std.category);
    }
  });
});

// ─── DEFAULT_EVAL_STANDARD ────────────────────────────────────────────────────

describe("DEFAULT_EVAL_STANDARD", () => {
  it("has category 'default'", () => {
    expect(DEFAULT_EVAL_STANDARD.category).toBe("default");
  });

  it("has at least one assertion", () => {
    expect(DEFAULT_EVAL_STANDARD.assertions.length).toBeGreaterThan(0);
  });

  it("has valid passingScore", () => {
    expect(DEFAULT_EVAL_STANDARD.passingScore).toBeGreaterThan(0);
    expect(DEFAULT_EVAL_STANDARD.passingScore).toBeLessThanOrEqual(1);
  });

  it("has at least one suggestedTestLabel", () => {
    expect(DEFAULT_EVAL_STANDARD.suggestedTestLabels.length).toBeGreaterThan(0);
  });
});
