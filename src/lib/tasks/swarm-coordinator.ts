import { checkoutTask, releaseCheckout, getAgentCheckouts } from "./atomic-checkout";
import type { TaskCheckout } from "./atomic-checkout";
import { logger } from "@/lib/logger";

/**
 * Attempt checkout with each agent in priority order until one succeeds.
 * Returns { agentId, checkout } of the winning agent, or null if all fail.
 */
export async function distributeTask(
  taskId: string,
  agentIds: string[],
  sessionId: string,
  ttlSeconds?: number,
): Promise<{ agentId: string; checkout: TaskCheckout } | null> {
  for (const agentId of agentIds) {
    const checkout = await checkoutTask(taskId, agentId, sessionId, ttlSeconds);
    if (checkout) {
      logger.info("Task distributed", { taskId, agentId, sessionId });
      return { agentId, checkout };
    }
  }

  logger.warn("distributeTask: all agents failed to acquire lock", { taskId, agentCount: agentIds.length });
  return null;
}

/**
 * Release all checkouts held by an agent (called on session end or crash).
 * Returns the count of successfully released locks.
 */
export async function releaseAllAgentTasks(agentId: string, sessionId: string): Promise<number> {
  const checkouts = await getAgentCheckouts(agentId);

  let released = 0;
  await Promise.all(
    checkouts.map(async (checkout) => {
      if (checkout.sessionId !== sessionId) return;
      const ok = await releaseCheckout(checkout.taskId, agentId, sessionId);
      if (ok) released++;
    }),
  );

  logger.info("Agent checkouts released", { agentId, sessionId, released, total: checkouts.length });
  return released;
}
