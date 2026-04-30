import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { getEnv } from "@/lib/env";
import { ALL_MODELS, getModelsByTier, buildFallbackChain, type ModelOption } from "@/lib/models";
export type { ModelOption };

function getDeepSeek() {
  return createDeepSeek({ apiKey: getEnv().DEEPSEEK_API_KEY });
}

function getOpenAI() {
  return createOpenAI({ apiKey: getEnv().OPENAI_API_KEY });
}

function getAnthropic() {
  const key = getEnv().ANTHROPIC_API_KEY;
  if (!key) return null;
  return createAnthropic({ apiKey: key });
}

function getGoogle() {
  const key = getEnv().GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  return createGoogleGenerativeAI({ apiKey: key });
}

function getGroq() {
  const key = getEnv().GROQ_API_KEY;
  if (!key) return null;
  return createGroq({ apiKey: key });
}

function getMistral() {
  const key = getEnv().MISTRAL_API_KEY;
  if (!key) return null;
  return createMistral({ apiKey: key });
}

// Ollama — local inference via OpenAI-compatible API (localhost only)
function getOllama() {
  const baseURL = getEnv().OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
  return createOpenAI({ baseURL, apiKey: "ollama" });
}

// Moonshot (Kimi) uses OpenAI-compatible API
function getMoonshot() {
  const key = getEnv().MOONSHOT_API_KEY;
  if (!key) return null;
  return createOpenAI({
    apiKey: key,
    baseURL: "https://api.moonshot.cn/v1",
  });
}

export function getModel(modelId: string) {
  // DeepSeek
  if (modelId.startsWith("deepseek")) {
    return getDeepSeek()(modelId);
  }
  // OpenAI
  if (
    modelId.startsWith("gpt") ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o2") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4")
  ) {
    return getOpenAI()(modelId);
  }
  // Anthropic
  if (modelId.startsWith("claude")) {
    const anthropic = getAnthropic();
    if (!anthropic) throw new Error("ANTHROPIC_API_KEY not configured");
    return anthropic(modelId);
  }
  // Google Gemini
  if (modelId.startsWith("gemini")) {
    const google = getGoogle();
    if (!google) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not configured");
    return google(modelId);
  }
  // Groq
  if (
    modelId.startsWith("llama") ||
    modelId.startsWith("groq-") ||
    modelId.startsWith("compound")
  ) {
    const groq = getGroq();
    if (!groq) throw new Error("GROQ_API_KEY not configured");
    return groq(modelId);
  }
  // Mistral
  if (modelId.startsWith("mistral") || modelId.startsWith("codestral")) {
    const mistral = getMistral();
    if (!mistral) throw new Error("MISTRAL_API_KEY not configured");
    return mistral(modelId);
  }
  // Ollama (local) — prefix: "ollama/"
  if (modelId.startsWith("ollama/")) {
    return getOllama()(modelId.replace("ollama/", ""));
  }
  // Moonshot (Kimi)
  if (modelId.startsWith("moonshot") || modelId.startsWith("kimi")) {
    const moonshot = getMoonshot();
    if (!moonshot) throw new Error("MOONSHOT_API_KEY not configured");
    return moonshot(modelId);
  }
  // Default fallback
  return getOpenAI()("gpt-4.1-mini");
}

export function getEmbeddingModel() {
  return getOpenAI().embedding("text-embedding-3-small");
}

export function getEmbeddingModelById(modelId: string) {
  switch (modelId) {
    case "text-embedding-3-small":
      return getOpenAI().embedding("text-embedding-3-small");
    case "text-embedding-3-large":
      return getOpenAI().embedding("text-embedding-3-large");
    default:
      return getEmbeddingModel();
  }
}

export const DEFAULT_MODEL = "gpt-4.1-mini";


export function getAvailableModels(): ModelOption[] {
  const env = getEnv();
  return ALL_MODELS.filter((m) => {
    if (!m.envKey) return true;
    return !!env[m.envKey as keyof typeof env];
  });
}

/**
 * Get a model by tier — selects the first available model for the given tier.
 * Checks env keys to ensure the model is actually usable.
 * @param tier - "fast" | "balanced" | "powerful"
 * @param preferredProvider - Optional provider preference (e.g., "DeepSeek", "OpenAI")
 */
export function getModelByTier(
  tier: "fast" | "balanced" | "powerful",
  preferredProvider?: string,
) {
  const env = getEnv();
  const candidates = getModelsByTier(tier);

  // Try preferred provider first
  if (preferredProvider) {
    const preferred = candidates.find(
      (m) =>
        m.provider === preferredProvider &&
        (!m.envKey || !!env[m.envKey as keyof typeof env]),
    );
    if (preferred) return getModel(preferred.id);
  }

  // Fall back to first available
  for (const candidate of candidates) {
    if (!candidate.envKey || !!env[candidate.envKey as keyof typeof env]) {
      return getModel(candidate.id);
    }
  }

  // Ultimate fallback: default model
  return getModel(DEFAULT_MODEL);
}

/**
 * Resolve the model ID string for a given tier (same selection logic as getModelByTier).
 * Useful when callers need to log or store the resolved model ID without calling getModel().
 */
export function getModelIdByTier(
  tier: "fast" | "balanced" | "powerful",
  preferredProvider?: string,
): string {
  const env = getEnv();
  const candidates = getModelsByTier(tier);

  if (preferredProvider) {
    const preferred = candidates.find(
      (m) =>
        m.provider === preferredProvider &&
        (!m.envKey || !!env[m.envKey as keyof typeof env]),
    );
    if (preferred) return preferred.id;
  }

  for (const candidate of candidates) {
    if (!candidate.envKey || !!env[candidate.envKey as keyof typeof env]) {
      return candidate.id;
    }
  }

  return DEFAULT_MODEL;
}

/**
 * Get a fallback chain of model IDs for a given model.
 * Filters to only include models with configured API keys.
 * Used by plan-and-execute and reflexive loop for automatic model failover.
 */
export function getModelFallbackChain(modelId: string): string[] {
  const env = getEnv();
  const chain = buildFallbackChain(modelId);

  return chain.filter((id) => {
    const model = ALL_MODELS.find((m) => m.id === id);
    if (!model) return false;
    if (!model.envKey) return true;
    return !!env[model.envKey as keyof typeof env];
  });
}
