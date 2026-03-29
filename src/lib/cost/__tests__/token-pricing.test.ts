import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  calculateCost,
  calculateEmbeddingCost,
} from "../token-pricing";

// ─── getModelPricing ──────────────────────────────────────────────────────────

describe("getModelPricing", () => {
  // DeepSeek
  it("returns correct pricing for deepseek-chat", () => {
    const p = getModelPricing("deepseek-chat");
    expect(p.inputPer1M).toBe(0.27);
    expect(p.outputPer1M).toBe(1.10);
  });

  it("returns correct pricing for deepseek-reasoner", () => {
    const p = getModelPricing("deepseek-reasoner");
    expect(p.inputPer1M).toBe(0.55);
    expect(p.outputPer1M).toBe(2.19);
  });

  // OpenAI
  it("returns correct pricing for gpt-4.1-mini", () => {
    const p = getModelPricing("gpt-4.1-mini");
    expect(p.inputPer1M).toBe(0.40);
    expect(p.outputPer1M).toBe(1.60);
  });

  it("returns correct pricing for gpt-4.1", () => {
    const p = getModelPricing("gpt-4.1");
    expect(p.inputPer1M).toBe(2.00);
    expect(p.outputPer1M).toBe(8.00);
  });

  it("returns correct pricing for o4-mini", () => {
    const p = getModelPricing("o4-mini");
    expect(p.inputPer1M).toBe(1.10);
    expect(p.outputPer1M).toBe(4.40);
  });

  it("returns correct pricing for o3", () => {
    const p = getModelPricing("o3");
    expect(p.inputPer1M).toBe(10.00);
    expect(p.outputPer1M).toBe(40.00);
  });

  // Anthropic
  it("returns correct pricing for claude-haiku-4-5-20251001", () => {
    const p = getModelPricing("claude-haiku-4-5-20251001");
    expect(p.inputPer1M).toBe(0.80);
    expect(p.outputPer1M).toBe(4.00);
  });

  it("returns correct pricing for claude-sonnet-4-6", () => {
    const p = getModelPricing("claude-sonnet-4-6");
    expect(p.inputPer1M).toBe(3.00);
    expect(p.outputPer1M).toBe(15.00);
  });

  it("returns correct pricing for claude-opus-4-6", () => {
    const p = getModelPricing("claude-opus-4-6");
    expect(p.inputPer1M).toBe(15.00);
    expect(p.outputPer1M).toBe(75.00);
  });

  // Google Gemini
  it("returns correct pricing for gemini-2.5-flash", () => {
    const p = getModelPricing("gemini-2.5-flash");
    expect(p.inputPer1M).toBe(0.15);
    expect(p.outputPer1M).toBe(0.60);
  });

  it("returns correct pricing for gemini-2.5-pro", () => {
    const p = getModelPricing("gemini-2.5-pro");
    expect(p.inputPer1M).toBe(1.25);
    expect(p.outputPer1M).toBe(10.00);
  });

  // Groq
  it("returns correct pricing for llama-3.3-70b-versatile", () => {
    const p = getModelPricing("llama-3.3-70b-versatile");
    expect(p.inputPer1M).toBe(0.59);
    expect(p.outputPer1M).toBe(0.79);
  });

  it("returns correct pricing for compound-beta", () => {
    const p = getModelPricing("compound-beta");
    expect(p.inputPer1M).toBe(0.59);
    expect(p.outputPer1M).toBe(0.79);
  });

  // Mistral
  it("returns correct pricing for mistral-small-3.1-2503", () => {
    const p = getModelPricing("mistral-small-3.1-2503");
    expect(p.inputPer1M).toBe(0.10);
    expect(p.outputPer1M).toBe(0.30);
  });

  it("returns correct pricing for mistral-medium-3", () => {
    const p = getModelPricing("mistral-medium-3");
    expect(p.inputPer1M).toBe(0.40);
    expect(p.outputPer1M).toBe(2.00);
  });

  it("returns correct pricing for mistral-large-2512", () => {
    const p = getModelPricing("mistral-large-2512");
    expect(p.inputPer1M).toBe(2.00);
    expect(p.outputPer1M).toBe(6.00);
  });

  // Moonshot
  it("returns correct pricing for kimi-k2-0905-preview", () => {
    const p = getModelPricing("kimi-k2-0905-preview");
    expect(p.inputPer1M).toBe(0.60);
    expect(p.outputPer1M).toBe(2.40);
  });

  it("returns correct pricing for kimi-k2-thinking", () => {
    const p = getModelPricing("kimi-k2-thinking");
    expect(p.inputPer1M).toBe(0.60);
    expect(p.outputPer1M).toBe(2.40);
  });

  // Embeddings
  it("returns correct pricing for text-embedding-3-small", () => {
    const p = getModelPricing("text-embedding-3-small");
    expect(p.inputPer1M).toBe(0.02);
    expect(p.outputPer1M).toBe(0);
  });

  it("returns correct pricing for text-embedding-3-large", () => {
    const p = getModelPricing("text-embedding-3-large");
    expect(p.inputPer1M).toBe(0.13);
    expect(p.outputPer1M).toBe(0);
  });

  // Default / fallback
  it("returns default pricing for unknown model", () => {
    const p = getModelPricing("some-unknown-model-xyz");
    expect(p.inputPer1M).toBe(1.00);
    expect(p.outputPer1M).toBe(3.00);
  });

  it("returns default pricing for empty string", () => {
    const p = getModelPricing("");
    expect(p.inputPer1M).toBe(1.00);
    expect(p.outputPer1M).toBe(3.00);
  });

  it("returns an object with inputPer1M and outputPer1M for every known model", () => {
    const knownModels = [
      "deepseek-chat", "gpt-4.1", "claude-sonnet-4-6",
      "gemini-2.5-flash", "llama-3.3-70b-versatile", "mistral-large-2512",
    ];
    for (const model of knownModels) {
      const p = getModelPricing(model);
      expect(typeof p.inputPer1M).toBe("number");
      expect(typeof p.outputPer1M).toBe("number");
      expect(p.inputPer1M).toBeGreaterThanOrEqual(0);
      expect(p.outputPer1M).toBeGreaterThanOrEqual(0);
    }
  });

  it("output pricing is always >= 0 (embeddings have 0 output cost)", () => {
    expect(getModelPricing("text-embedding-3-small").outputPer1M).toBe(0);
  });

  it("o3 is more expensive than gpt-4.1 on input", () => {
    expect(getModelPricing("o3").inputPer1M).toBeGreaterThan(
      getModelPricing("gpt-4.1").inputPer1M,
    );
  });

  it("claude-opus-4-6 is more expensive than claude-haiku-4-5-20251001", () => {
    expect(getModelPricing("claude-opus-4-6").inputPer1M).toBeGreaterThan(
      getModelPricing("claude-haiku-4-5-20251001").inputPer1M,
    );
  });
});

// ─── calculateCost ────────────────────────────────────────────────────────────

describe("calculateCost", () => {
  it("calculates cost correctly for deepseek-chat with 1M input + 1M output", () => {
    const cost = calculateCost("deepseek-chat", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.27 + 1.10, 5);
  });

  it("calculates cost correctly for gpt-4.1 with 500k input + 200k output", () => {
    const cost = calculateCost("gpt-4.1", 500_000, 200_000);
    const expected = (500_000 / 1_000_000) * 2.00 + (200_000 / 1_000_000) * 8.00;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("returns 0 for 0 input and 0 output tokens", () => {
    expect(calculateCost("deepseek-chat", 0, 0)).toBe(0);
  });

  it("returns 0 for 0 output tokens only", () => {
    expect(calculateCost("deepseek-chat", 0, 0)).toBe(0);
  });

  it("calculates only input cost when outputTokens is 0", () => {
    const cost = calculateCost("gpt-4.1-mini", 1_000_000, 0);
    expect(cost).toBeCloseTo(0.40, 5);
  });

  it("calculates only output cost when inputTokens is 0", () => {
    const cost = calculateCost("gpt-4.1-mini", 0, 1_000_000);
    expect(cost).toBeCloseTo(1.60, 5);
  });

  it("uses default pricing for unknown model", () => {
    const cost = calculateCost("unknown-model", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.00 + 3.00, 5);
  });

  it("calculates correct cost for claude-opus-4-6 (premium model)", () => {
    const cost = calculateCost("claude-opus-4-6", 100_000, 50_000);
    const expected = (100_000 / 1_000_000) * 15.00 + (50_000 / 1_000_000) * 75.00;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it("cost is always non-negative", () => {
    expect(calculateCost("deepseek-chat", 1000, 500)).toBeGreaterThanOrEqual(0);
  });

  it("larger token counts produce proportionally larger costs", () => {
    const cost1 = calculateCost("deepseek-chat", 100_000, 50_000);
    const cost2 = calculateCost("deepseek-chat", 200_000, 100_000);
    expect(cost2).toBeCloseTo(cost1 * 2, 5);
  });

  it("o3 costs significantly more than deepseek-chat for same tokens", () => {
    const cheapCost = calculateCost("deepseek-chat", 100_000, 100_000);
    const expensiveCost = calculateCost("o3", 100_000, 100_000);
    expect(expensiveCost).toBeGreaterThan(cheapCost * 10);
  });

  it("embedding model has zero output cost", () => {
    const cost = calculateCost("text-embedding-3-small", 100_000, 100_000);
    // Output cost should be 0 regardless of outputTokens
    const inputOnly = calculateCost("text-embedding-3-small", 100_000, 0);
    expect(cost).toBeCloseTo(inputOnly, 6);
  });
});

// ─── calculateEmbeddingCost ───────────────────────────────────────────────────

describe("calculateEmbeddingCost", () => {
  it("calculates embedding cost for text-embedding-3-small with 1M tokens", () => {
    const cost = calculateEmbeddingCost("text-embedding-3-small", 1_000_000);
    expect(cost).toBeCloseTo(0.02, 5);
  });

  it("calculates embedding cost for text-embedding-3-large with 1M tokens", () => {
    const cost = calculateEmbeddingCost("text-embedding-3-large", 1_000_000);
    expect(cost).toBeCloseTo(0.13, 5);
  });

  it("returns 0 for 0 tokens", () => {
    expect(calculateEmbeddingCost("text-embedding-3-small", 0)).toBe(0);
  });

  it("text-embedding-3-large is more expensive than text-embedding-3-small", () => {
    const small = calculateEmbeddingCost("text-embedding-3-small", 500_000);
    const large = calculateEmbeddingCost("text-embedding-3-large", 500_000);
    expect(large).toBeGreaterThan(small);
  });

  it("uses inputPer1M rate only (no output cost for embeddings)", () => {
    const cost = calculateEmbeddingCost("text-embedding-3-small", 100_000);
    const expected = (100_000 / 1_000_000) * 0.02;
    expect(cost).toBeCloseTo(expected, 8);
  });

  it("cost scales linearly with token count", () => {
    const c1 = calculateEmbeddingCost("text-embedding-3-small", 50_000);
    const c2 = calculateEmbeddingCost("text-embedding-3-small", 100_000);
    expect(c2).toBeCloseTo(c1 * 2, 6);
  });

  it("uses default pricing for unknown embedding model", () => {
    const cost = calculateEmbeddingCost("unknown-embed-model", 1_000_000);
    expect(cost).toBeCloseTo(1.00, 5); // default inputPer1M
  });
});
