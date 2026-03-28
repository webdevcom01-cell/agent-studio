import { calculateCost } from "./token-pricing";

export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
}

export interface BudgetState {
  totalTokens: number;
  totalCostUsd: number;
  budgetUsd: number;
  budgetRemaining: number;
  budgetPercent: number;
  breakdown: CostEntry[];
  isExceeded: boolean;
  isAlertTriggered: boolean;
}

const TRACKING_PREFIX = "__cost_";

export function getTrackingVariable(trackingVar: string): string {
  return `${TRACKING_PREFIX}${trackingVar}`;
}

export function loadBudgetState(
  variables: Record<string, unknown>,
  trackingVariable: string,
  budgetUsd: number,
  alertThreshold: number,
): BudgetState {
  const key = getTrackingVariable(trackingVariable);
  const existing = variables[key] as BudgetState | undefined;

  if (existing && typeof existing === "object" && "totalCostUsd" in existing) {
    return {
      ...existing,
      budgetUsd,
      budgetRemaining: budgetUsd - existing.totalCostUsd,
      budgetPercent: budgetUsd > 0 ? existing.totalCostUsd / budgetUsd : 0,
      isExceeded: existing.totalCostUsd >= budgetUsd,
      isAlertTriggered:
        budgetUsd > 0
          ? existing.totalCostUsd / budgetUsd >= alertThreshold
          : false,
    };
  }

  return {
    totalTokens: 0,
    totalCostUsd: 0,
    budgetUsd,
    budgetRemaining: budgetUsd,
    budgetPercent: 0,
    breakdown: [],
    isExceeded: false,
    isAlertTriggered: false,
  };
}

export function recordUsage(
  state: BudgetState,
  model: string,
  inputTokens: number,
  outputTokens: number,
): BudgetState {
  const cost = calculateCost(model, inputTokens, outputTokens);
  const entry: CostEntry = {
    model,
    inputTokens,
    outputTokens,
    cost,
    timestamp: Date.now(),
  };

  const totalCostUsd = state.totalCostUsd + cost;
  const totalTokens = state.totalTokens + inputTokens + outputTokens;

  return {
    totalTokens,
    totalCostUsd,
    budgetUsd: state.budgetUsd,
    budgetRemaining: state.budgetUsd - totalCostUsd,
    budgetPercent:
      state.budgetUsd > 0 ? totalCostUsd / state.budgetUsd : 0,
    breakdown: [...state.breakdown, entry],
    isExceeded: totalCostUsd >= state.budgetUsd,
    isAlertTriggered:
      state.budgetUsd > 0 ? totalCostUsd / state.budgetUsd >= 0.8 : false,
  };
}
