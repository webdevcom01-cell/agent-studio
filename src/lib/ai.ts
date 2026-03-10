import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { getEnv } from "@/lib/env";
import { ALL_MODELS, type ModelOption } from "@/lib/models";
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
  // Moonshot (Kimi)
  if (modelId.startsWith("moonshot") || modelId.startsWith("kimi")) {
    const moonshot = getMoonshot();
    if (!moonshot) throw new Error("MOONSHOT_API_KEY not configured");
    return moonshot(modelId);
  }
  // Default fallback
  return getDeepSeek()("deepseek-chat");
}

export function getEmbeddingModel() {
  return getOpenAI().embedding("text-embedding-3-small");
}

export const DEFAULT_MODEL = "deepseek-chat";


export function getAvailableModels(): ModelOption[] {
  const env = getEnv();
  return ALL_MODELS.filter((m) => {
    if (!m.envKey) return true;
    return !!env[m.envKey as keyof typeof env];
  });
}
