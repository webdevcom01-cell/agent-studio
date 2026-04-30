/**
 * Multi-turn conversation-aware query reformulation.
 *
 * When a user writes "tell me more about that" or "and the second point?",
 * a naive RAG pipeline searches for "tell me more about that" — which retrieves
 * nothing useful. This module reformulates the query using conversation history
 * so the KB search gets a meaningful, self-contained query.
 *
 * Design:
 * - Fast heuristic first: only call LLM when pronouns / short queries are detected.
 * - Sliding window of last 3 exchanges (6 messages) to keep tokens low.
 * - Hard timeout: 3 s — if LLM is slow, fall back to original query.
 */

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";

/** Message shape from RuntimeContext.messageHistory */
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Max messages from history to include (sliding window = last 3 exchanges). */
const HISTORY_WINDOW = 6;

/** Words / patterns that indicate the query references prior context. */
const REFERENCE_PATTERN =
  /\b(it|its|that|this|those|them|they|their|there|these|then|him|her|his|hers|we|our|such|same|above|below|mentioned|said|described|previous|before|ago|more about|tell me more|explain more|go on|continue|elaborate|next|another|also|too|as well|the first|the second|the third|the last)\b/i;

/**
 * Returns true when the query likely needs reformulation.
 * Keeps LLM calls to a minimum — most standalone queries pass straight through.
 */
function needsReformulation(query: string, historyLength: number): boolean {
  if (historyLength === 0) return false;
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount <= 3) return true; // Very short — almost certainly anaphoric
  return REFERENCE_PATTERN.test(query);
}

/**
 * Reformulates `currentQuery` using the last few turns of `chatHistory`.
 *
 * Returns the original query unchanged when:
 * - History is empty
 * - No references detected (fast-path)
 * - LLM call fails or times out
 */
export async function reformulateWithHistory(
  currentQuery: string,
  chatHistory: ChatMessage[],
): Promise<string> {
  if (!needsReformulation(currentQuery, chatHistory.length)) return currentQuery;

  // Sliding window: keep the last HISTORY_WINDOW messages (skip system messages)
  const recentHistory = chatHistory
    .filter((m) => m.role !== "system")
    .slice(-HISTORY_WINDOW);

  if (recentHistory.length === 0) return currentQuery;

  const historyText = recentHistory
    .map((m) => {
      const speaker = m.role === "user" ? "User" : "Assistant";
      // Truncate long messages to avoid prompt bloat
      const preview = m.content.length > 300 ? m.content.slice(0, 300) + "…" : m.content;
      return `${speaker}: ${preview}`;
    })
    .join("\n");

  try {
    const { text } = await Promise.race([
      generateText({
        model: getModel("gpt-4.1-mini"),
        prompt: `You are a query reformulation assistant.
Rewrite the user's latest question into a self-contained search query that can be understood without the conversation history.

Conversation so far:
${historyText}

Latest question: "${currentQuery}"

Rules:
- Output ONLY the reformulated query — no explanation, no quotes
- Keep it concise (under 20 words)
- If the question is already self-contained, return it unchanged`,
        maxOutputTokens: 80,
        temperature: 0,
      }),
      // Hard timeout — fall back to original on slow response
      new Promise<{ text: string }>((resolve) =>
        setTimeout(() => resolve({ text: "" }), 3000),
      ),
    ]);

    const reformulated = text.trim();
    if (!reformulated || reformulated.length < 3) return currentQuery;

    logger.info("Query reformulated", {
      original: currentQuery,
      reformulated,
    });

    return reformulated;
  } catch (err) {
    logger.warn("Query reformulation failed, using original", {
      error: err instanceof Error ? err.message : String(err),
    });
    return currentQuery;
  }
}
