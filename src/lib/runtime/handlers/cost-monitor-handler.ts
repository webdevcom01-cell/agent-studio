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

/**
 * cost_monitor — Real-time token/cost tracking with budget enforcement.
 * Modes: monitor (log only), budget (stop flow), alert (notify).
 */
export const costMonitorHandler: NodeHandler = async (node, context) => {
  const mode = (node.data.mode as string) ?? "monitor";
  const budgetUsd = (node.data.budgetUsd as number) ?? DEFAULT_BUDGET_USD;
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

  // Adaptive mode: dynamically downgrade model tier based on budget usage
  if (mode === "adaptive") {
    let tierOverride: string | undefined;

    if (state.budgetPercent > 0.95) {
      // >95% budget: stop flow (same as budget mode)
      return {
        messages: [
          {
            role: "assistant",
            content: `Adaptive budget limit reached: $${state.totalCostUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (${(state.budgetPercent * 100).toFixed(0)}%). Flow stopped.`,
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
    } else if (state.budgetPercent > 0.8) {
      tierOverride = "fast";
    } else if (state.budgetPercent > 0.6) {
      tierOverride = "balanced";
    }
    // ≤60%: no override, use original tier

    logger.info("Adaptive cost monitor", {
      agentId: context.agentId,
      budgetPercent: (state.budgetPercent * 100).toFixed(0) + "%",
      tierOverride: tierOverride ?? "none",
    });

    return {
      messages: tierOverride
        ? [
            {
              role: "assistant",
              content: `Cost adaptive: ${(state.budgetPercent * 100).toFixed(0)}% budget used. Model tier downgraded to "${tierOverride}".`,
            },
          ]
        : [],
      nextNodeId: null,
      waitForInput: false,
      updatedVariables: {
        ...context.variables,
        [getTrackingVariable(trackingVariable)]: state,
        [outputVariable]: output,
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
