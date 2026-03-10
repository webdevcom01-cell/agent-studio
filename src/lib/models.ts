// Client-safe model catalog — no server-side imports, no API keys
// This is the single source of truth for available models in the UI

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tier: "fast" | "balanced" | "powerful";
  /** env var key that must be set for this model to work */
  envKey?: string;
}

export const ALL_MODELS: ModelOption[] = [
  // DeepSeek — always available (required key)
  { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", tier: "balanced" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner", provider: "DeepSeek", tier: "powerful" },
  // OpenAI — always available (required key)
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", tier: "fast" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", tier: "balanced" },
  { id: "o4-mini", name: "o4 Mini", provider: "OpenAI", tier: "powerful" },
  // Anthropic — optional
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", provider: "Anthropic", tier: "fast", envKey: "ANTHROPIC_API_KEY" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "Anthropic", tier: "balanced", envKey: "ANTHROPIC_API_KEY" },
  // Google Gemini — optional
  { id: "gemini-2.5-flash-preview-04-17", name: "Gemini 2.5 Flash", provider: "Google", tier: "fast", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { id: "gemini-2.5-pro-preview-03-25", name: "Gemini 2.5 Pro", provider: "Google", tier: "powerful", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  // Groq — optional
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", provider: "Groq", tier: "fast", envKey: "GROQ_API_KEY" },
  { id: "compound-beta", name: "Compound Beta", provider: "Groq", tier: "balanced", envKey: "GROQ_API_KEY" },
  // Mistral — optional
  { id: "mistral-small-latest", name: "Mistral Small", provider: "Mistral", tier: "fast", envKey: "MISTRAL_API_KEY" },
  { id: "mistral-large-latest", name: "Mistral Large", provider: "Mistral", tier: "powerful", envKey: "MISTRAL_API_KEY" },
  // Moonshot Kimi — optional
  { id: "kimi-k2-0711-preview", name: "Kimi K2", provider: "Moonshot", tier: "powerful", envKey: "MOONSHOT_API_KEY" },
  { id: "moonshot-v1-32k", name: "Moonshot 32K", provider: "Moonshot", tier: "balanced", envKey: "MOONSHOT_API_KEY" },
];

export const DEFAULT_MODEL = "deepseek-chat";
