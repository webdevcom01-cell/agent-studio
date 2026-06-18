/**
 * SDK Session Compaction (N9)
 *
 * Bounds the otherwise-unbounded growth of AgentSdkSession.messages. When a
 * session's history exceeds SDK_SESSION_COMPACTION_THRESHOLD, the oldest
 * messages are summarized into a single rolling "prior summary" (persisted in
 * session metadata, re-injected into the system prompt on resume) and only the
 * most recent SDK_SESSION_KEEP_RECENT messages are retained verbatim.
 *
 * Format-safe: the summary is NEVER inserted into the message array (which would
 * create multiple system messages). It lives in metadata and is folded into the
 * single system prompt by the caller.
 *
 * Never throws — on summarization failure it falls back to a plain cap.
 */

import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { logger } from "@/lib/logger";
import type { SessionMessage } from "./persistence";

/** Compaction triggers when a session exceeds this many messages. */
export const SDK_SESSION_COMPACTION_THRESHOLD = 60;

/** Number of most-recent messages retained verbatim after compaction. */
export const SDK_SESSION_KEEP_RECENT = 30;

/** Cheap model used for the summarization call. */
const SUMMARY_MODEL = process.env.COMPACTION_MODEL || "gpt-4.1-mini";

export interface CompactSessionResult {
  /** Messages to persist (recent tail when compacted, original otherwise). */
  messages: SessionMessage[];
  /** Rolling summary of dropped older messages, if any. */
  priorSummary?: string;
}

/** Safely extract a prior summary string from session metadata. */
export function readPriorSummary(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const v = metadata?.priorSummary;
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

/**
 * Build the system-prompt preamble that re-injects the prior summary on resume.
 * Returns "" when there is no summary.
 */
export function buildSessionSummaryPreamble(priorSummary?: string): string {
  if (!priorSummary || !priorSummary.trim()) return "";
  return `[Summary of earlier conversation in this session:\n${priorSummary.trim()}]`;
}

async function summarizeOlder(
  older: SessionMessage[],
  existingPriorSummary: string | undefined,
): Promise<string | null> {
  const priorBlock = existingPriorSummary
    ? `Earlier summary (preserve this):\n${existingPriorSummary}\n\n`
    : "";
  const conversationText = older
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n\n");

  const { text } = await generateText({
    model: getModel(SUMMARY_MODEL),
    maxOutputTokens: 500,
    temperature: 0.3,
    system: [
      "You are a session summarization assistant.",
      "Condense the earlier part of an agent session into a compact summary",
      "so it can be used as context after the older messages are dropped.",
      "",
      "Preserve: key decisions, facts, names, numbers, the task state, and any",
      "instructions that should persist. Be concise but complete. Third person.",
      "Output ONLY the summary, no preamble.",
    ].join("\n"),
    prompt: `${priorBlock}Summarize the essential context from this session excerpt:\n\n${conversationText}`,
  });

  const trimmed = text?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * Compact a session message array if it exceeds the threshold. Returns the
 * messages to persist plus the rolling prior summary. Never throws.
 */
export async function compactSessionMessages(
  messages: SessionMessage[],
  existingPriorSummary?: string,
  opts?: { threshold?: number; keepRecent?: number },
): Promise<CompactSessionResult> {
  const threshold = opts?.threshold ?? SDK_SESSION_COMPACTION_THRESHOLD;
  const keepRecent = opts?.keepRecent ?? SDK_SESSION_KEEP_RECENT;

  if (messages.length <= threshold) {
    return { messages, priorSummary: existingPriorSummary };
  }

  const older = messages.slice(0, messages.length - keepRecent);
  const recent = messages.slice(-keepRecent);

  try {
    const summary = await summarizeOlder(older, existingPriorSummary);
    if (!summary) {
      return { messages: recent, priorSummary: existingPriorSummary };
    }
    logger.info("SDK session compacted", {
      droppedCount: older.length,
      keptCount: recent.length,
      summaryLength: summary.length,
    });
    return { messages: recent, priorSummary: summary };
  } catch (error) {
    logger.warn("SDK session compaction failed — falling back to plain cap", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { messages: recent, priorSummary: existingPriorSummary };
  }
}
