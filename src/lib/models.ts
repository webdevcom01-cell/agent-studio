// Client-safe model catalog — no server-side imports, no API keys
// Updated March 2026 — verified against official provider documentation

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  tier: "fast" | "balanced" | "powerful";
  /** env var key that must be set for this model to work */
  envKey?: string;
}

export const ALL_MODELS: ModelOption[] = [
  // ── DeepSeek — always available (required key) ──────────────────────────
  { id: "deepseek-chat",     name: "DeepSeek V3",       provider: "DeepSeek", tier: "balanced" },
  { id: "deepseek-reasoner", name: "DeepSeek R1",        provider: "DeepSeek", tier: "powerful" },

  // ── OpenAI — always available (required key) ────────────────────────────
  { id: "gpt-4o-mini", name: "GPT-4o Mini",  provider: "OpenAI", tier: "fast"     },
  { id: "gpt-4o",      name: "GPT-4o",       provider: "OpenAI", tier: "balanced" },
  { id: "o4-mini",     name: "o4 Mini",      provider: "OpenAI", tier: "powerful" },

  // ── Anthropic — optional ─────────────────────────────────────────────────
  { id: "claude-haiku-4-5-20251001",  name: "Claude Haiku 4.5",  provider: "Anthropic", tier: "fast",     envKey: "ANTHROPIC_API_KEY" },
  { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5", provider: "Anthropic", tier: "balanced", envKey: "ANTHROPIC_API_KEY" },

  // ── Google Gemini — optional ─────────────────────────────────────────────
  // Stable IDs (no date suffix) — verified March 2026
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", tier: "fast",     envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro",   provider: "Google", tier: "powerful", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },

  // ── Groq — optional ──────────────────────────────────────────────────────
  // llama-3.3-70b-versatile: 128k context, tool use, fastest inference
  // compound-beta: agentic system (web search + code execution built-in)
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B",   provider: "Groq", tier: "fast",     envKey: "GROQ_API_KEY" },
  { id: "compound-beta",           name: "Compound Beta",    provider: "Groq", tier: "balanced", envKey: "GROQ_API_KEY" },

  // ── Mistral — optional ───────────────────────────────────────────────────
  // Small 3.1: multimodal, 128k context (released March 2025)
  // Medium 3: best price/performance (released May 2025)
  // Large 3: 675B MoE, 256k context (released December 2025)
  { id: "mistral-small-3.1-2503",  name: "Mistral Small 3.1", provider: "Mistral", tier: "fast",     envKey: "MISTRAL_API_KEY" },
  { id: "mistral-medium-3",        name: "Mistral Medium 3",  provider: "Mistral", tier: "balanced", envKey: "MISTRAL_API_KEY" },
  { id: "mistral-large-2512",      name: "Mistral Large 3",   provider: "Mistral", tier: "powerful", envKey: "MISTRAL_API_KEY" },

  // ── Moonshot Kimi — optional ─────────────────────────────────────────────
  // K2: 1T parameter MoE, agentic, OpenAI-compatible API
  // K2 Thinking: extended reasoning variant
  { id: "kimi-k2-0905-preview", name: "Kimi K2",         provider: "Moonshot", tier: "balanced", envKey: "MOONSHOT_API_KEY" },
  { id: "kimi-k2-thinking",     name: "Kimi K2 Thinking", provider: "Moonshot", tier: "powerful", envKey: "MOONSHOT_API_KEY" },
];

export const DEFAULT_MODEL = "deepseek-chat";
