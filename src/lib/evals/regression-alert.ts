/**
 * Eval Regression Alert (B6/G2)
 *
 * After a suite run completes, compares its score against the previous COMPLETED
 * run for the same suite. On a regression (drop >= DELTA) or an edge-triggered
 * floor breach (score < FLOOR while the previous run was >= FLOOR, or there is no
 * baseline), delivers a warning via the notifications module (Slack renderer +
 * webhook sink) to NOTIFICATION_WEBHOOK_URL.
 *
 * Fail-safe: never throws. An alerting failure must never break an eval or deploy.
 */

import { withAdminBypass } from "@/lib/api/tenant-context";
import { logger } from "@/lib/logger";
import { getRenderer, getSink } from "@/lib/notifications";
import type { NotificationInput } from "@/lib/notifications";
import {
  evalAlertsEnabled,
  getRegressionDelta,
  getRegressionFloor,
} from "@/lib/constants/eval-alerts";

const WEBHOOK_TIMEOUT_MS = 5_000;

export interface EvalRegressionAlertInput {
  suiteId: string;
  suiteName: string;
  agentId: string;
  runId: string;
  score: number;
}

type Reason = "regression" | "floor_breach";

// Tolerance for boundary comparisons — e.g. 0.6 - 0.45 is 0.1499999… in IEEE-754,
// which must still count as a 0.15 drop.
const FLOAT_EPSILON = 1e-9;

function evaluateReasons(
  current: number,
  previous: number | null,
  delta: number,
  floor: number,
): Reason[] {
  const reasons: Reason[] = [];
  if (previous !== null && previous - current >= delta - FLOAT_EPSILON) {
    reasons.push("regression");
  }
  if (current < floor && (previous === null || previous >= floor)) {
    reasons.push("floor_breach");
  }
  return reasons;
}

export async function alertOnEvalRegression(
  input: EvalRegressionAlertInput,
): Promise<void> {
  if (!evalAlertsEnabled()) return;

  try {
    const previous = await withAdminBypass((db) =>
      db.evalRun.findFirst({
        where: {
          suiteId: input.suiteId,
          status: "COMPLETED",
          NOT: { id: input.runId },
        },
        orderBy: { createdAt: "desc" },
        select: { score: true },
      }),
    );

    const previousScore = previous?.score ?? null;
    const reasons = evaluateReasons(
      input.score,
      previousScore,
      getRegressionDelta(),
      getRegressionFloor(),
    );

    if (reasons.length === 0) return;

    await deliverAlert(input, previousScore, reasons);
  } catch (error) {
    logger.error("eval-regression-alert failed (non-fatal)", {
      suiteId: input.suiteId,
      runId: input.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deliverAlert(
  input: EvalRegressionAlertInput,
  previousScore: number | null,
  reasons: Reason[],
): Promise<void> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL ?? "";
  const agentName = await resolveAgentName(input.agentId);
  const delta =
    previousScore !== null ? Number((previousScore - input.score).toFixed(3)) : null;

  const notification: NotificationInput = {
    title: `Eval regresija: ${agentName} / ${input.suiteName}`,
    message: buildMessage(input.score, previousScore, delta, reasons),
    level: "warning",
    agentId: input.agentId,
    timestamp: new Date().toISOString(),
    meta: {
      suiteId: input.suiteId,
      runId: input.runId,
      previousScore,
      currentScore: input.score,
      delta,
      reasons,
    },
  };

  const rendered = getRenderer("slack").render(notification);
  const result = await getSink("webhook").deliver(rendered, {
    webhookUrl,
    timeoutMs: WEBHOOK_TIMEOUT_MS,
    agentId: input.agentId,
  });

  if (!result.success) {
    logger.warn("eval-regression-alert: delivery failed", {
      suiteId: input.suiteId,
      runId: input.runId,
      channel: result.channel,
      error: result.error,
    });
  }
}

async function resolveAgentName(agentId: string): Promise<string> {
  try {
    const agent = await withAdminBypass((db) =>
      db.agent.findUnique({ where: { id: agentId }, select: { name: true } }),
    );
    return agent?.name ?? agentId;
  } catch {
    return agentId;
  }
}

function buildMessage(
  current: number,
  previous: number | null,
  delta: number | null,
  reasons: Reason[],
): string {
  const prevLabel = previous !== null ? previous.toFixed(2) : "—";
  const deltaLabel = delta !== null ? `Δ ${delta.toFixed(2)}` : "prvi run";
  return `Skor ${prevLabel} → ${current.toFixed(2)} (${deltaLabel}) — razlozi: ${reasons.join(", ")}`;
}
