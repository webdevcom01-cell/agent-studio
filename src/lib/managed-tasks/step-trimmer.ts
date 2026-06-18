/**
 * Managed-task step context trimmer (N10)
 *
 * Bounds the message window sent to the model BETWEEN tool-use steps of a single
 * long-running `generateText` call (managed.task.run can run up to maxSteps
 * tool steps, accumulating every tool result in one context window).
 *
 * Used from `prepareStep` — a pure, deterministic structural trim (no LLM call).
 * Critically, it preserves tool-call ↔ tool-result pairing: the retained tail is
 * never allowed to BEGIN with an orphan `tool` result message (whose originating
 * assistant tool-call was dropped), which would make the provider request invalid.
 *
 * Returns `undefined` when no trimming is needed (caller then keeps the SDK's
 * default messages for that step).
 */

import type { ModelMessage } from "ai";

/** Trim when the step's message count exceeds this. */
export const STEP_TRIM_THRESHOLD = 60;

/** Number of most-recent messages retained when trimming. */
export const STEP_TRIM_KEEP_RECENT = 30;

export function trimStepMessages(
  messages: ModelMessage[],
  opts?: { threshold?: number; keepRecent?: number },
): ModelMessage[] | undefined {
  const threshold = opts?.threshold ?? STEP_TRIM_THRESHOLD;
  const keepRecent = opts?.keepRecent ?? STEP_TRIM_KEEP_RECENT;

  if (messages.length <= threshold) return undefined;

  // Anchor: keep the very first message (the original task) verbatim — unless it
  // is itself a tool result (never expected as the first message).
  const head: ModelMessage[] =
    messages.length > 0 && messages[0].role !== "tool" ? [messages[0]] : [];

  let start = messages.length - keepRecent;
  if (start < 1) return undefined; // nothing meaningful to drop

  // Never let the retained tail begin with an orphan `tool` result: advance the
  // cut point past any leading tool messages so the kept slice starts on a
  // user/assistant boundary.
  while (start < messages.length && messages[start].role === "tool") {
    start++;
  }
  if (start >= messages.length) return undefined;

  return [...head, ...messages.slice(start)];
}
