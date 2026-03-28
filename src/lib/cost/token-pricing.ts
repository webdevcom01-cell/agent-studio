/**
 * Token pricing per model — USD per 1M tokens (input / output).
 * Prices as of March 2026. Update periodically from provider pricing pages.
 */

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // DeepSeek
  "deepseek-chat":     { inputPer1M: 0.27,  outputPer1M: 1.10 },
  "deepseek-reasoner": { inputPer1M: 0.55,  outputPer1M: 2.19 },

  // OpenAI
  "gpt-4.1-mini":  { inputPer1M: 0.40,  outputPer1M: 1.60 },
  "gpt-4.1":       { inputPer1M: 2.00,  outputPer1M: 8.00 },
  "o4-mini":       { inputPer1M: 1.10,  outputPer1M: 4.40 },
  "o3":            { inputPer1M: 10.00, outputPer1M: 40.00 },

  // Anthropic
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80,  outputPer1M: 4.00 },
  "claude-sonnet-4-6":         { inputPer1M: 3.00,  outputPer1M: 15.00 },
  "claude-opus-4-6":           { inputPer1M: 15.00, outputPer1M: 75.00 },

  // Google Gemini
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gemini-2.5-pro":   { inputPer1M: 1.25, outputPer1M: 10.00 },

  // Groq
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "compound-beta":           { inputPer1M: 0.59, outputPer1M: 0.79 },

  // Mistral
  "mistral-small-3.1-2503": { inputPer1M: 0.10, outputPer1M: 0.30 },
  "mistral-medium-3":       { inputPer1M: 0.40, outputPer1M: 2.00 },
  "mistral-large-2512":     { inputPer1M: 2.00, outputPer1M: 6.00 },

  // Moonshot
  "kimi-k2-0905-preview": { inputPer1M: 0.60, outputPer1M: 2.40 },
  "kimi-k2-thinking":     { inputPer1M: 0.60, outputPer1M: 2.40 },

  // Embeddings
  "text-embedding-3-small": { inputPer1M: 0.02, outputPer1M: 0 },
  "text-embedding-3-large": { inputPer1M: 0.13, outputPer1M: 0 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 1.00, outputPer1M: 3.00 };

export function getModelPricing(modelId: string): ModelPricing {
  return PRICING[modelId] ?? DEFAULT_PRICING;
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(modelId);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

export function calculateEmbeddingCost(
  modelId: string,
  tokens: number,
): number {
  const pricing = getModelPricing(modelId);
  return (tokens / 1_000_000) * pricing.inputPer1M;
}
