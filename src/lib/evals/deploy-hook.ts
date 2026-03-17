/**
 * Agent Evals — Deploy Hook
 *
 * Called immediately after a successful flow-version deployment.
 * Finds all EvalSuites for the agent that have `runOnDeploy: true`,
 * then runs each one (sequentially) in the background.
 *
 * Design decisions:
 *   - Fire-and-forget: deploy response is NOT delayed by eval execution.
 *   - Silent failure: errors are logged but never propagate to the caller.
 *   - Sequential suites: we run one suite at a time to avoid hammering
 *     the chat API with parallel eval runs on a freshly deployed flow.
 *   - "deploy" triggeredBy label: visible in run history so users can
 *     distinguish automated runs from manual ones.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runEvalSuite } from "./runner";

export interface DeployHookOptions {
  /** Full base URL used for internal chat API calls (e.g. https://example.com) */
  baseUrl: string;
  /**
   * Auth cookie string forwarded from the deploy request so the internal
   * chat call is authenticated the same way as a browser session.
   * Format: raw Cookie header value, e.g. "authjs.session-token=abc123"
   */
  authHeader?: string;
}

/**
 * Trigger eval runs for all suites with `runOnDeploy: true`.
 *
 * @param agentId  - The agent that was just deployed
 * @param options  - baseUrl + optional auth header
 *
 * Returns immediately (fire-and-forget).  All work happens asynchronously.
 */
export function triggerDeployEvals(
  agentId: string,
  options: DeployHookOptions
): void {
  // Intentionally not awaited — we return before the work starts
  void runDeployEvals(agentId, options);
}

// ─── Internal async runner ────────────────────────────────────────────────────

async function runDeployEvals(
  agentId: string,
  { baseUrl, authHeader }: DeployHookOptions
): Promise<void> {
  // 1. Find suites with runOnDeploy: true that have at least one test case
  let suites: Array<{ id: string; name: string; _count: { testCases: number } }>;
  try {
    suites = await prisma.evalSuite.findMany({
      where: { agentId, runOnDeploy: true },
      select: { id: true, name: true, _count: { select: { testCases: true } } },
      orderBy: { createdAt: "asc" },
    });
  } catch (err) {
    logger.error("deploy-hook: failed to query eval suites", { agentId, err });
    return;
  }

  const eligible = suites.filter((s) => s._count.testCases > 0);

  if (eligible.length === 0) {
    logger.info("deploy-hook: no eligible suites to run", { agentId });
    return;
  }

  logger.info("deploy-hook: starting eval runs after deploy", {
    agentId,
    suiteCount: eligible.length,
  });

  // 2. Run each suite sequentially to avoid parallel rate-limit pressure
  for (const suite of eligible) {
    try {
      logger.info("deploy-hook: running suite", { agentId, suiteId: suite.id, suiteName: suite.name });
      const summary = await runEvalSuite(suite.id, agentId, {
        baseUrl,
        triggeredBy: "deploy",
        authHeader,
      });
      logger.info("deploy-hook: suite finished", {
        agentId,
        suiteId: suite.id,
        runId: summary.runId,
        score: summary.score,
        passed: summary.passedCases,
        failed: summary.failedCases,
      });
    } catch (err) {
      // Never let one suite failure block the next suite
      logger.error("deploy-hook: suite run failed", { agentId, suiteId: suite.id, err });
    }
  }

  logger.info("deploy-hook: all suites finished", { agentId, suiteCount: eligible.length });
}
