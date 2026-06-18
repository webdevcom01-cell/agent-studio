/**
 * System-prompt assembly (N7).
 *
 * The ai_response handlers inject several context blocks around the base prompt.
 * Historically they were prepended/appended inline in a VOLATILE order
 * (lsp, skills, hot-memory, summary FIRST), which keeps the changing parts at
 * the front of the prompt and defeats provider prompt-caching (a stable prefix
 * is required for KV-cache reuse on OpenAI / Anthropic).
 *
 * This helper centralizes the assembly and offers two orderings:
 *
 *  - default (stablePrefix = false): BYTE-IDENTICAL to the previous inline
 *    behavior — `[lsp, skills, hotMemory, summary, base, goal]` joined by "\n\n",
 *    skipping empty blocks. Zero behavior change.
 *
 *  - stable (stablePrefix = true): the stable anchor (base prompt, then per-agent
 *    goal/skills) goes to the FRONT and the volatile blocks (hot-memory, summary,
 *    lsp) to the END — maximizing the cacheable prefix.
 *
 * The per-tool "parallel execution" hint is appended by the caller AFTER this,
 * in both orderings, so it is not modeled here.
 */
export interface SystemPromptBlocks {
  /** Base node prompt (already RAG-augmented if applicable). */
  base: string;
  /** Rolling conversation summary block (volatile). */
  summary: string;
  /** Hot-memory block (semi-volatile). */
  hotMemory: string;
  /** Goal-alignment block (stable per agent). */
  goal: string;
  /** Routed/composed skills block (semi-volatile). */
  skills: string;
  /** LSP context block (volatile). */
  lsp: string;
}

export function assembleSystemPrompt(
  b: SystemPromptBlocks,
  opts?: { stablePrefix?: boolean },
): string {
  const order = opts?.stablePrefix
    ? [b.base, b.goal, b.skills, b.hotMemory, b.summary, b.lsp]
    : [b.lsp, b.skills, b.hotMemory, b.summary, b.base, b.goal];
  return order.filter((s) => s.length > 0).join("\n\n");
}
