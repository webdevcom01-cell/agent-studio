import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function getModel(modelId: string) {
  if (modelId.startsWith("deepseek")) {
    return deepseek(modelId);
  }
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    const openai = getOpenAI();
    if (!openai) throw new Error("OPENAI_API_KEY not configured");
    return openai(modelId);
  }
  if (modelId.startsWith("claude")) {
    const anthropic = getAnthropic();
    if (!anthropic) throw new Error("ANTHROPIC_API_KEY not configured");
    return anthropic(modelId);
  }
  return deepseek("deepseek-chat");
}

export function getEmbeddingModel() {
  const openai = getOpenAI();
  if (!openai) {
    throw new Error("OPENAI_API_KEY required for embeddings (DeepSeek does not support embeddings)");
  }
  return openai.embedding("text-embedding-3-small");
}

export const DEFAULT_MODEL = "deepseek-chat";

export const AVAILABLE_MODELS = [
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "deepseek" },
  ...(process.env.OPENAI_API_KEY
    ? [
        { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
        { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
      ]
    : []),
  ...(process.env.ANTHROPIC_API_KEY
    ? [
        { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic" },
      ]
    : []),
] as const;
