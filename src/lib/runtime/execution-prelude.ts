import type { RuntimeContext } from "./types";
import { maybeCompactAndTruncate } from "./context-compaction";
import { createHooksFromFlowContent } from "./hooks";
import { injectHotMemoryIntoContext } from "@/lib/memory/hot-cold-tier";
import { injectGoalContextIntoContext } from "@/lib/goals/goal-context";
import { writeAuditLog } from "@/lib/safety/audit-logger";
import { emitHook } from "./hooks";
import { emitSessionEvent } from "./session-events";

interface PreludeOptions {
  streaming: boolean;
}

/**
 * Runs the pre-execution enrichment pipeline that both engines share:
 *   1. Context compaction (if history is long)
 *   2. History truncation (hard cap)
 *   3. Lifecycle hook initialization
 *   4. Hot memory injection
 *   5. Goal context injection
 *   6. Audit log + session/hook events
 *
 * Mutates `context` in place — same contract as the individual enrichers.
 */
export async function prepareContextForExecution(
  context: RuntimeContext,
  userMessage: string | null,
  options: PreludeOptions,
): Promise<void> {
  // Compact (summarize) + hard-cap history once at the start of every run.
  await maybeCompactAndTruncate(context);

  if (!context.hooks) {
    const registry = createHooksFromFlowContent(context.flowContent);
    if (registry) context.hooks = registry;
  }

  await injectHotMemoryIntoContext(context);
  await injectGoalContextIntoContext(context);

  writeAuditLog({
    userId: context.userId,
    action: "FLOW_EXECUTION_START",
    resourceType: "Agent",
    resourceId: context.agentId,
    after: {
      conversationId: context.conversationId,
      hasUserMessage: !!userMessage,
      streaming: options.streaming,
    },
  }).catch(() => {});

  emitHook(context, "onFlowStart", {
    meta: { hasUserMessage: !!userMessage, streaming: options.streaming },
  });

  emitSessionEvent(context, "session.started", {
    meta: { hasUserMessage: !!userMessage, streaming: options.streaming },
  });
}
