import { generateText } from "ai";
import { getModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { RuntimeContext } from "./types";

/**
 * Compaction threshold — when messageHistory exceeds this count,
 * we generate a summary before truncating. Set below MAX_HISTORY (100)
 * so the summary is created while context is still rich.
 */
export const COMPACTION_THRESHOLD = 80;

/**
 * Maximum number of context summaries to keep per agent in AgentMemory.
 * Older summaries are deleted when this limit is exceeded.
 */
const MAX_SUMMARIES_PER_AGENT = 5;

/**
 * The cheap model used for summarization. Chosen for speed and cost —
 * the summary prompt is straightforward and doesn't need a powerful model.
 */
const COMPACTION_MODEL = "deepseek-chat";

/**
 * Category used for all context compaction entries in AgentMemory.
 */
const COMPACTION_CATEGORY = "context_compaction";

/**
 * Variable key where the latest context summary is stored.
 * AI response handlers read this to inject the summary into the system prompt.
 */
export const CONTEXT_SUMMARY_VAR = "__context_summary";

/**
 * Check whether compaction should run for the given context.
 *
 * Compaction triggers when:
 * 1. messageHistory exceeds COMPACTION_THRESHOLD
 * 2. enableSmartCompaction is not explicitly set to false
 */
export function shouldCompact(context: RuntimeContext): boolean {
  if (context.enableSmartCompaction === false) return false;
  return context.messageHistory.length > COMPACTION_THRESHOLD;
}

/**
 * Generate a context summary from the current messageHistory, persist it
 * to AgentMemory, and store it in context.variables for system prompt injection.
 *
 * Returns the summary string on success, or null if anything fails.
 * Failures are logged but never thrown — the engine falls back to raw truncation.
 */
export async function compactContext(
  context: RuntimeContext
): Promise<string | null> {
  const startMs = Date.now();

  try {
    const model = getModel(COMPACTION_MODEL);

    // Build the conversation excerpt for summarization.
    // Use the full messageHistory — this runs BEFORE truncation.
    const conversationText = context.messageHistory
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join("\n\n");

    const { text: summary } = await generateText({
      model,
      maxOutputTokens: 500,
      temperature: 0.3,
      system: [
        "You are a context summarization assistant.",
        "Your job is to extract and preserve the essential information from a conversation",
        "so that it can be used as context after older messages are discarded.",
        "",
        "Focus on:",
        "- Key decisions made by the user",
        "- Important facts, names, numbers, and preferences stated",
        "- The current state of the task or workflow",
        "- Any instructions the user gave that should persist",
        "- Variable values or data that were established",
        "",
        "Be concise but complete. Write in third person. Do not add opinions.",
        "Output ONLY the summary, no preamble.",
      ].join("\n"),
      prompt: `Summarize the essential context from this conversation:\n\n${conversationText}`,
    });

    if (!summary || summary.trim().length === 0) {
      logger.warn("Compaction returned empty summary", {
        agentId: context.agentId,
        historyLength: context.messageHistory.length,
      });
      return null;
    }

    const trimmedSummary = summary.trim();

    // Persist to AgentMemory for long-term storage
    await saveCompactionSummary(context.agentId, trimmedSummary);

    // Store in context.variables — this persists via saveContext() (conversation.variables)
    // and is read by ai-response handlers to inject into the system prompt
    context.variables[CONTEXT_SUMMARY_VAR] = trimmedSummary;

    const durationMs = Date.now() - startMs;
    logger.info("Context compaction completed", {
      agentId: context.agentId,
      conversationId: context.conversationId,
      historyLength: context.messageHistory.length,
      summaryLength: trimmedSummary.length,
      durationMs,
    });

    return trimmedSummary;
  } catch (error) {
    const durationMs = Date.now() - startMs;
    logger.warn("Context compaction failed, falling back to raw truncation", {
      agentId: context.agentId,
      conversationId: context.conversationId,
      historyLength: context.messageHistory.length,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Persist the compaction summary to AgentMemory.
 * Enforces MAX_SUMMARIES_PER_AGENT by deleting the oldest when exceeded.
 */
async function saveCompactionSummary(
  agentId: string,
  summary: string
): Promise<void> {
  const key = `__context_summary_${Date.now()}`;

  // Upsert the new summary
  await prisma.agentMemory.create({
    data: {
      agentId,
      key,
      value: summary as unknown as object,
      category: COMPACTION_CATEGORY,
      importance: 0.9,
    },
  });

  // Enforce max summaries — delete oldest beyond limit
  const allSummaries = await prisma.agentMemory.findMany({
    where: { agentId, category: COMPACTION_CATEGORY },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (allSummaries.length > MAX_SUMMARIES_PER_AGENT) {
    const toDelete = allSummaries
      .slice(MAX_SUMMARIES_PER_AGENT)
      .map((s) => s.id);
    await prisma.agentMemory.deleteMany({
      where: { id: { in: toDelete } },
    });
  }
}
