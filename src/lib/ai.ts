import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { getEnv } from "@/lib/env";

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

export function getModel(modelId: string) {
  if (modelId.startsWith("deepseek")) {
    return getDeepSeek()(modelId);
  }
  if (modelId.startsWith("gpt") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
    return getOpenAI()(modelId);
  }
  if (modelId.startsWith("claude")) {
    const anthropic = getAnthropic();
    if (!anthropic) throw new Error("ANTHROPIC_API_KEY not configured");
    return anthropic(modelId);
  }
  return getDeepSeek()("deepseek-chat");
}

export function getEmbeddingModel() {
  return getOpenAI().embedding("text-embedding-3-small");
}

export const DEFAULT_MODEL = "deepseek-chat";

export function getAvailableModels() {
  const env = getEnv();
  return [
    { id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "deepseek" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
    ...(env.ANTHROPIC_API_KEY
      ? [
          { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "anthropic" },
        ]
      : []),
  ];
}
