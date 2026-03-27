import { describe, it, expect } from "vitest";
import { classifyQuery, getSearchConfigForQueryType } from "../query-router";
import type { QueryType } from "../query-router";

describe("classifyQuery", () => {
  // ── factual (≤5 words, no multi-hop signals) ──────────────────────────────

  it("classifies single-word query as factual", () => {
    expect(classifyQuery("pricing")).toBe("factual");
  });

  it("classifies 5-word query as factual", () => {
    expect(classifyQuery("what is the return policy")).toBe("factual");
  });

  it("classifies 3-word question as factual", () => {
    expect(classifyQuery("how to cancel")).toBe("factual");
  });

  // ── conversational (6–10 words) ────────────────────────────────────────────

  it("classifies 7-word query as conversational", () => {
    expect(classifyQuery("how do I update my billing information please")).toBe("conversational");
  });

  it("classifies 10-word query as conversational", () => {
    expect(classifyQuery("can you explain what happens when I cancel my subscription")).toBe("conversational");
  });

  // ── analytical (>10 words) ────────────────────────────────────────────────

  it("classifies long query as analytical", () => {
    expect(
      classifyQuery(
        "What are the detailed steps I need to follow to migrate my account from the old plan to the new enterprise plan?",
      ),
    ).toBe("analytical");
  });

  // ── multi-hop (comparison / multi-part signals) ────────────────────────────

  it("classifies 'compare' queries as multi-hop", () => {
    expect(classifyQuery("compare the basic and premium plan features")).toBe("multi-hop");
  });

  it("classifies 'vs.' queries as multi-hop", () => {
    expect(classifyQuery("basic vs. premium pricing")).toBe("multi-hop");
  });

  it("classifies 'versus' queries as multi-hop", () => {
    expect(classifyQuery("monthly versus annual billing options")).toBe("multi-hop");
  });

  it("classifies 'difference' queries as multi-hop", () => {
    expect(classifyQuery("what is the difference between starter and pro")).toBe("multi-hop");
  });

  it("classifies 'razlika' queries as multi-hop (Serbian)", () => {
    expect(classifyQuery("koja je razlika između planova")).toBe("multi-hop");
  });

  it("classifies 'između' queries as multi-hop (Serbian)", () => {
    expect(classifyQuery("razlika između basic i premium paketa")).toBe("multi-hop");
  });

  it("classifies 'both' queries as multi-hop", () => {
    expect(classifyQuery("do both plans include API access")).toBe("multi-hop");
  });

  it("multi-hop takes precedence over word count", () => {
    // Only 3 words, but contains 'compare'
    expect(classifyQuery("compare plans")).toBe("multi-hop");
  });
});

describe("getSearchConfigForQueryType", () => {
  const TYPES: QueryType[] = ["factual", "conversational", "analytical", "multi-hop"];

  it.each(TYPES)("returns a config object for type '%s'", (type) => {
    const config = getSearchConfigForQueryType(type);
    expect(config).toBeDefined();
    expect(typeof config.topK).toBe("number");
    expect(config.topK).toBeGreaterThan(0);
  });

  it("factual config has low topK and no reranking", () => {
    const config = getSearchConfigForQueryType("factual");
    expect(config.topK).toBeLessThanOrEqual(5);
    expect(config.rerankModel).toBe("none");
  });

  it("analytical config has higher topK than factual", () => {
    const factual = getSearchConfigForQueryType("factual");
    const analytical = getSearchConfigForQueryType("analytical");
    expect(analytical.topK).toBeGreaterThan(factual.topK);
  });

  it("analytical config enables reranking", () => {
    const config = getSearchConfigForQueryType("analytical");
    expect(config.rerankModel).toBeDefined();
    expect(config.rerankModel).not.toBe("none");
  });

  it("multi-hop config has highest topK", () => {
    const conversational = getSearchConfigForQueryType("conversational");
    const multiHop = getSearchConfigForQueryType("multi-hop");
    expect(multiHop.topK).toBeGreaterThan(conversational.topK);
  });

  it("multi-hop config includes multi_query transform", () => {
    const config = getSearchConfigForQueryType("multi-hop");
    expect(config.queryTransform).toBe("multi_query");
  });
});
