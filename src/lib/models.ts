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
  // V3: best price/perf ratio, strong coding — default model
  // R1: chain-of-thought reasoning, comparable to o1
  { id: "deepseek-chat",     name: "DeepSeek V3",       provider: "DeepSeek", tier: "balanced" },
  { id: "deepseek-reasoner", name: "DeepSeek R1",        provider: "DeepSeek", tier: "powerful" },

  // ── OpenAI — always available (required key) ────────────────────────────
  // GPT-4.1 series (April 2025): outperforms GPT-4o across the board
  // o4-mini / o3: reasoning models — o3 is the strongest general reasoner
  { id: "gpt-4o-mini",  name: "GPT-4o Mini",   provider: "OpenAI", tier: "fast"     },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini",  provider: "OpenAI", tier: "fast"     },
  { id: "gpt-4.1",      name: "GPT-4.1",       provider: "OpenAI", tier: "balanced" },
  { id: "o4-mini",      name: "o4 Mini",        provider: "OpenAI", tier: "powerful" },
  { id: "o3",           name: "o3",             provider: "OpenAI", tier: "powerful" },

  // ── Anthropic — optional ─────────────────────────────────────────────────
  // 4.6 series (February 2026): latest generation — Sonnet 4.6 beats Opus 4.5 in coding
  // 4.5 series kept for backwards compatibility with existing agents
  { id: "claude-haiku-4-5-20251001",  name: "Claude Haiku 4.5",  provider: "Anthropic", tier: "fast",     envKey: "ANTHROPIC_API_KEY" },
  { id: "claude-sonnet-4-6",          name: "Claude Sonnet 4.6", provider: "Anthropic", tier: "balanced", envKey: "ANTHROPIC_API_KEY" },
  { id: "claude-opus-4-6",            name: "Claude Opus 4.6",   provider: "Anthropic", tier: "powerful", envKey: "ANTHROPIC_API_KEY" },

  // ── Google Gemini — optional ─────────────────────────────────────────────
  // Stable IDs without date suffix (verified March 2026)
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", tier: "fast",     envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro",   provider: "Google", tier: "powerful", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },

  // ── Groq — optional ──────────────────────────────────────────────────────
  // Llama 3.3 70B: 128k context, tool use, fastest inference on market
  // Compound Beta: agentic system with web search + code execution built-in
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B",  provider: "Groq", tier: "fast",     envKey: "GROQ_API_KEY" },
  { id: "compound-beta",           name: "Compound Beta",   provider: "Groq", tier: "balanced", envKey: "GROQ_API_KEY" },

  // ── Mistral — optional ───────────────────────────────────────────────────
  // Small 3.1: multimodal, 128k context (March 2025)
  // Medium 3: best price/performance in Mistral lineup (May 2025)
  // Large 3: 675B MoE, 256k context, top-tier (December 2025)
  { id: "mistral-small-3.1-2503", name: "Mistral Small 3.1", provider: "Mistral", tier: "fast",     envKey: "MISTRAL_API_KEY" },
  { id: "mistral-medium-3",       name: "Mistral Medium 3",  provider: "Mistral", tier: "balanced", envKey: "MISTRAL_API_KEY" },
  { id: "mistral-large-2512",     name: "Mistral Large 3",   provider: "Mistral", tier: "powerful", envKey: "MISTRAL_API_KEY" },

  // ── Ollama — local inference only (requires OLLAMA_BASE_URL) ────────────
  // Runs on your machine via Ollama (http://localhost:11434).
  // Not available on Railway — only shown in UI when OLLAMA_BASE_URL is set.
  { id: "ollama/qwen3:8b", name: "Qwen3 8B (local)", provider: "Ollama", tier: "fast", envKey: "OLLAMA_BASE_URL" },

  // ── Moonshot Kimi — optional ─────────────────────────────────────────────
  // K2: 1T parameter MoE, strong agentic capabilities, OpenAI-compatible API
  // K2 Thinking: extended reasoning variant (chain-of-thought)
  { id: "kimi-k2-0905-preview", name: "Kimi K2",          provider: "Moonshot", tier: "balanced", envKey: "MOONSHOT_API_KEY" },
  { id: "kimi-k2-thinking",     name: "Kimi K2 Thinking", provider: "Moonshot", tier: "powerful", envKey: "MOONSHOT_API_KEY" },
];

export const DEFAULT_MODEL = "deepseek-chat";

/**
 * All model IDs as a tuple — single source of truth for Zod enum validation.
 * Used by API routes to validate model selection on agent create/update.
 * Automatically stays in sync when models are added/removed from ALL_MODELS.
 */
export const ALL_MODEL_IDS = ALL_MODELS.map((m) => m.id) as [string, ...string[]];

/**
 * Get models filtered by tier — client-safe helper for tier-based routing.
 * Returns only models whose tier matches, ordered by: always-available first.
 */
export function getModelsByTier(tier: "fast" | "balanced" | "powerful"): ModelOption[] {
  return ALL_MODELS.filter((m) => m.tier === tier).sort((a, b) => {
    // Prefer always-available models (no envKey) first
    if (!a.envKey && b.envKey) return -1;
    if (a.envKey && !b.envKey) return 1;
    return 0;
  });
}

/**
 * Build a fallback chain for a given model: same-tier alternatives → cheaper tier.
 * Client-safe — does NOT check env keys (that happens in ai.ts at call time).
 */
export function buildFallbackChain(modelId: string): string[] {
  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) return [DEFAULT_MODEL];

  const tierOrder: Array<"fast" | "balanced" | "powerful"> =
    model.tier === "powerful"
      ? ["powerful", "balanced", "fast"]
      : model.tier === "balanced"
        ? ["balanced", "fast"]
        : ["fast"];

  const chain: string[] = [];
  for (const tier of tierOrder) {
    const candidates = getModelsByTier(tier).filter((m) => m.id !== modelId);
    for (const c of candidates) {
      chain.push(c.id);
    }
  }

  // Always end with default model as ultimate fallback
  if (!chain.includes(DEFAULT_MODEL)) {
    chain.push(DEFAULT_MODEL);
  }

  return chain;
}
