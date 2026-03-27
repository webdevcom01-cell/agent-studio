/**
 * Agentic / Self-RAG Decision Layer
 *
 * Decides whether to retrieve from the knowledge base for a given query.
 * V1 uses only heuristics (no LLM call) to keep latency at ~0 ms.
 *
 * Design philosophy: err on the side of retrieving (false negatives cost
 * quality; false positives only add a small latency overhead).
 */

/** Simple greetings and acknowledgements that never need KB retrieval. */
const SKIP_PATTERNS: RegExp[] = [
  /^(zdravo|cao|ćao|hi|hello|hey|hej|howdy)\b/i,
  /^(hvala|thank\s*you|thanks|thx|ty)\b/i,
  /^(ok|okay|ок|da|ne|yes|no|nope|yep|sure)\b/i,
  /^(bye|goodbye|doviđenja|ćao)\b/i,
  /^(dobro|good|great|nice|perfect|super|awesome)\b/i,
];

export interface RetrievalDecision {
  /** Whether to query the knowledge base */
  retrieve: boolean;
  /** Machine-readable reason for auditing / analytics */
  reason:
    | "no_kb"
    | "empty_query"
    | "greeting_or_simple"
    | "too_short"
    | "standard_query";
}

/**
 * Heuristically decides whether to run KB retrieval for the current query.
 *
 * @param query          - The (possibly reformulated) user message
 * @param hasKnowledgeBase - Whether the agent has a configured KB
 */
export function shouldRetrieve(
  query: string,
  hasKnowledgeBase: boolean,
): RetrievalDecision {
  if (!hasKnowledgeBase) {
    return { retrieve: false, reason: "no_kb" };
  }

  const trimmed = query.trim();

  if (!trimmed) {
    return { retrieve: false, reason: "empty_query" };
  }

  // Fast path: greeting or one-word social signal
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) {
    return { retrieve: false, reason: "greeting_or_simple" };
  }

  // Very short queries rarely benefit from RAG (user is not asking for knowledge)
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 2) {
    return { retrieve: false, reason: "too_short" };
  }

  // Default: retrieve (conservative — better to over-retrieve than under-retrieve)
  return { retrieve: true, reason: "standard_query" };
}
