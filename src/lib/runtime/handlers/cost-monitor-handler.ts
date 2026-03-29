import type { NodeHandler } from "../types";
import {
  loadBudgetState,
  getTrackingVariable,
  type BudgetState,
} from "@/lib/cost/budget-tracker";
import { logger } from "@/lib/logger";

const DEFAULT_BUDGET_USD = 1.0;
const DEFAULT_ALERT_THRESHOLD = 0.8;
const DEFAULT_TRACKING_VARIABLE = "cost_tracking";
const DEFAULT_OUTPUT_VARIABLE = "cost_status";

interface AdaptiveTiers {
  tier1: number; // % → switch to balanced
  tier2: number; // % → switch to fast
  tier3: number; // % → stop non-critical / enforce block
}

const DEFAULT_TIERS: AdaptiveTiers = { tier1: 60, tier2: 80, tier3: 95 };

function parseTiers(raw: unknown): AdaptiveTiers {
  if (!raw || typeof raw !== "object") return DEFAULT_TIERS;
  const obj = raw as Record<string, unknown>;
  return {
    tier1: Math.max(0, Math.min(100, Number(obj.tier1) || DEFAULT_TIERS.tier1)),
    tier2: Math.max(0, Math.min(100, Number(obj.tier2) || DEFAULT_TIERS.tier2)),
    tier3: Math.max(0, Math.min(100, Number(obj.tier3) || DEFAULT_TIERS.tier3)),
  };
}

/**
 * cost_monitor — Real-time token/cost tracking with budget enforcement.
 * Modes: monitor (log only), budget (stop flow), alert (notify).
 */
export const costMonitorHandler: NodeHandler = async (node, context) => {
  const mode = (node.data.mode as string) ?? "monitor";
  const budgetUsd = (node.data.budgetUsd as number) ?? DEFAULT_BUDGET_USD;

  if (mode !== "monitor" && (!budgetUsd || budgetUsd <= 0)) {
    return {
      messages: [
        {
          role: "assistant",
          content: "Cost monitor requires a positive budgetUsd value. Set budgetUsd in the property panel.",
        },
      ],
      nextNodeId: null,
      waitForInput: false,
    };
  }

  const alertThreshold =
    (node.data.alertThreshold as number) ?? DEFAULT_ALERT_THRESHOLD;
  const onExceeded =
    (node.data.onBudgetExceeded as string) ?? "stop_flow";
  const trackingVariable =
    (node.data.trackingVariable as string) || DEFAULT_TRACKING_VARIABLE;
  const outputVariable =
    (node.data.outputVariable as string) || DEFAULT_OUTPUT_VARIABLE;

  const state = loadBudgetState(
    context.variables,
    trackingVariable,
    budgetUsd,
    alertThreshold,
  );

  const output = formatOutput(state);

  logger.info("Cost monitor checkpoint", {
    agentId: context.agentId,
    mode,
    totalCostUsd: state.totalCostUsd,
    budgetUsd,
    budgetPercent: state.budgetPercent,
  });

  // Budget mode: stop flow if exceeded
  if (mode === "budget" && state.isExceeded) {
    if (onExceeded === "stop_flow") {
      return {
        messages: [
          {
            role: "assistant",
            content: `Budget exceeded: $${state.totalCostUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}. Flow stopped.`,
          },
        ],
        nextNodeId: null,
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [getTrackingVariable(trackingVariable)]: state,
          [outputVariable]: output,
        },
      };
    }

    if (onExceeded === "route_to_handle") {
      return {
        messages: [],
        nextNodeId: "budget_exceeded",
        waitForInput: false,
        updatedVariables: {
          ...context.variables,
          [getTrackingVariable(trackingVariable)]: state,
          [outputVariable]: output,
        },
      };
    }
  }

  // Alert mode: warn if threshold crossed
  if (mode === "alert" && state.isAlertTriggered) {
    return {
      messages: [
        {
          role: "assistant",
          content: `Cost alert: ${(state.budgetPercent * 100).toFixed(0)}% of budget used ($${state.totalCostUsd.toFixed(4)} / $${budgetUsd.toFixed(2)}).`,
        },
      ],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [getTrackingVariable(trackingVariable)]: state,
        [outputVariable]: output,
      },
    };
  }

  // Adaptive / enforce mode: dynamically downgrade model tier based on budget usage
  if (mode === "adaptive" || mode === "enforce") {
    const tiers = parseTiers(node.data.adaptiveTiers);
    const pct = state.budgetPercent * 100;
    let tierOverride: string | undefined;
    let tierWarning = "";

    if (pct >= tiers.tier3) {
      if (mode === "enforce") {
        return {
          messages: [
            {
              role: "assistant",
              content: `Budget enforced: $${state.totalCostUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (${pct.toFixed(0)}% >= ${tiers.tier3}% limit). Flow blocked.`,
            },
          ],
          nextNodeId: null,
          waitForInput: false,
          updatedVariables: {
            ...context.variables,
            [getTrackingVariable(trackingVariable)]: state,
            [outputVariable]: { ...output, blocked: true, tier: "blocked" },
          },
        };
      }
      tierOverride = "fast";
      tierWarning = `Budget at ${pct.toFixed(0)}%, non-critical operations may be skipped`;
    } else if (pct >= tiers.tier2) {
      tierOverride = "fast";
    } else if (pct >= tiers.tier1) {
      tierOverride = "balanced";
    }

    logger.info("Adaptive cost monitor", {
      agentId: context.agentId,
      budgetPercent: pct.toFixed(0) + "%",
      tierOverride: tierOverride ?? "none",
      tiers,
    });

    const messages = tierOverride
      ? [
          {
            role: "assistant" as const,
            content: tierWarning || `Cost adaptive: ${pct.toFixed(0)}% budget used. Model tier downgraded to "${tierOverride}".`,
          },
        ]
      : [];

    return {
      messages,
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [getTrackingVariable(trackingVariable)]: state,
        [outputVariable]: { ...output, tier: tierOverride ?? "original" },
        ...(tierOverride ? { __model_tier_override: tierOverride } : {}),
      },
    };
  }

  // Monitor mode or budget not yet exceeded: pass through
  return {
    messages: [],
    nextNodeId: null,
    waitForInput: false,
    updatedVariables: {
      ...context.variables,
      [getTrackingVariable(trackingVariable)]: state,
      [outputVariable]: output,
    },
  };
};

function formatOutput(state: BudgetState): Record<string, unknown> {
  return {
    totalTokens: state.totalTokens,
    totalCostUsd: Number(state.totalCostUsd.toFixed(6)),
    budgetRemaining: Number(state.budgetRemaining.toFixed(6)),
    budgetPercent: Number((state.budgetPercent * 100).toFixed(1)),
    isExceeded: state.isExceeded,
    breakdown: state.breakdown.map((e) => ({
      model: e.model,
      tokens: e.inputTokens + e.outputTokens,
      cost: Number(e.cost.toFixed(6)),
    })),
  };
}
