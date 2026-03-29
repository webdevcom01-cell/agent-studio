import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { costMonitorHandler } from "../cost-monitor-handler";
import { recordUsage, loadBudgetState, getTrackingVariable } from "@/lib/cost/budget-tracker";
import { calculateCost } from "@/lib/cost/token-pricing";
import type { RuntimeContext } from "../../types";
import type { FlowNode, FlowContent } from "@/types";

function makeNode(overrides: Record<string, unknown> = {}): FlowNode {
  return {
    id: "cost-1",
    type: "cost_monitor",
    position: { x: 0, y: 0 },
    data: {
      mode: "monitor",
      budgetUsd: 1.0,
      alertThreshold: 0.8,
      onBudgetExceeded: "stop_flow",
      trackingVariable: "cost_tracking",
      outputVariable: "cost_status",
      ...overrides,
    },
  };
}

function makeContext(overrides: Partial<RuntimeContext> = {}): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] } as FlowContent,
    currentNodeId: "cost-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function contextWithUsage(totalCostUsd: number, budgetUsd: number = 1.0): RuntimeContext {
  const trackKey = getTrackingVariable("cost_tracking");
  return makeContext({
    variables: {
      [trackKey]: {
        totalTokens: 5000,
        totalCostUsd,
        budgetUsd,
        budgetRemaining: budgetUsd - totalCostUsd,
        budgetPercent: totalCostUsd / budgetUsd,
        breakdown: [],
        isExceeded: totalCostUsd >= budgetUsd,
        isAlertTriggered: totalCostUsd / budgetUsd >= 0.8,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("costMonitorHandler", () => {
  it("passes through in monitor mode without blocking", async () => {
    const result = await costMonitorHandler(makeNode(), makeContext());
    expect(result.messages).toHaveLength(0);
    expect(result.nextNodeId).toBeNull();
    expect(result.updatedVariables?.cost_status).toBeDefined();
  });

  it("stops flow in budget mode when exceeded", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "budget", budgetUsd: 1.0 }),
      contextWithUsage(1.5, 1.0),
    );
    expect(result.messages[0].content).toContain("Budget exceeded");
    expect(result.nextNodeId).toBeNull();
  });

  it("routes to handle when budget exceeded with route_to_handle", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "budget", onBudgetExceeded: "route_to_handle", budgetUsd: 1.0 }),
      contextWithUsage(1.5, 1.0),
    );
    expect(result.nextNodeId).toBe("budget_exceeded");
  });

  it("emits alert when threshold crossed", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "alert", budgetUsd: 1.0, alertThreshold: 0.8 }),
      contextWithUsage(0.85, 1.0),
    );
    expect(result.messages[0].content).toContain("Cost alert");
    expect(result.messages[0].content).toContain("85%");
  });

  it("does not alert below threshold", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "alert", budgetUsd: 1.0, alertThreshold: 0.8 }),
      contextWithUsage(0.5, 1.0),
    );
    expect(result.messages).toHaveLength(0);
  });
});

describe("token pricing", () => {
  it("calculates DeepSeek cost correctly", () => {
    const cost = calculateCost("deepseek-chat", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.27 + 1.10, 2);
  });

  it("calculates GPT-4.1 cost correctly", () => {
    const cost = calculateCost("gpt-4.1", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.0 + 8.0, 2);
  });

  it("calculates Claude Opus cost correctly", () => {
    const cost = calculateCost("claude-opus-4-6", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(15.0 + 75.0, 2);
  });

  it("uses default pricing for unknown model", () => {
    const cost = calculateCost("unknown-model", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.0 + 3.0, 2);
  });
});

describe("budget tracker", () => {
  it("loads empty state for fresh conversation", () => {
    const state = loadBudgetState({}, "cost_tracking", 1.0, 0.8);
    expect(state.totalCostUsd).toBe(0);
    expect(state.isExceeded).toBe(false);
  });

  it("records usage and accumulates cost", () => {
    const initial = loadBudgetState({}, "cost_tracking", 1.0, 0.8);
    const after = recordUsage(initial, "deepseek-chat", 1000, 500);
    expect(after.totalTokens).toBe(1500);
    expect(after.totalCostUsd).toBeGreaterThan(0);
    expect(after.breakdown).toHaveLength(1);
  });

  it("detects budget exceeded", () => {
    const initial = loadBudgetState({}, "cost_tracking", 0.001, 0.8);
    const after = recordUsage(initial, "gpt-4.1", 100000, 100000);
    expect(after.isExceeded).toBe(true);
  });
});

// ── Adaptive & enforce modes (F-03) ─────────────────────────────────────────

describe("adaptive mode (F-03)", () => {
  it("no tier override when below tier1", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.3, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBeUndefined();
    expect(result.messages).toHaveLength(0);
  });

  it("sets balanced tier when above tier1", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.65, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBe("balanced");
  });

  it("sets fast tier when above tier2", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.85, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBe("fast");
  });

  it("sets fast tier + warning when above tier3", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.96, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBe("fast");
    expect(result.messages[0].content).toContain("non-critical");
  });

  it("uses default tiers when adaptiveTiers not configured", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0 }),
      contextWithUsage(0.65, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBe("balanced");
  });

  it("logs tier change", async () => {
    const { logger } = await import("@/lib/logger");

    await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 1.0 }),
      contextWithUsage(0.85, 1.0),
    );

    expect(logger.info).toHaveBeenCalledWith(
      "Adaptive cost monitor",
      expect.objectContaining({ tierOverride: "fast" }),
    );
  });
});

describe("enforce mode (F-03)", () => {
  it("blocks flow when above tier3", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "enforce", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.96, 1.0),
    );
    expect(result.messages[0].content).toContain("blocked");
    expect(result.nextNodeId).toBeNull();
    const output = result.updatedVariables?.cost_status as Record<string, unknown>;
    expect(output.blocked).toBe(true);
  });

  it("downgrades to balanced below tier3 but above tier1", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "enforce", budgetUsd: 1.0, adaptiveTiers: { tier1: 60, tier2: 80, tier3: 95 } }),
      contextWithUsage(0.65, 1.0),
    );
    expect(result.updatedVariables?.__model_tier_override).toBe("balanced");
    expect(result.messages[0].content).not.toContain("blocked");
  });

  it("does not block at 0% budget", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "enforce", budgetUsd: 1.0 }),
      makeContext(),
    );
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.__model_tier_override).toBeUndefined();
  });
});

describe("budgetUsd validation (F-03)", () => {
  it("returns error when budgetUsd is 0 in non-monitor mode", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "adaptive", budgetUsd: 0 }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("positive budgetUsd");
    expect(result.nextNodeId).toBeNull();
  });

  it("returns error when budgetUsd is negative", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "enforce", budgetUsd: -5 }),
      makeContext(),
    );
    expect(result.messages[0].content).toContain("positive budgetUsd");
  });

  it("allows undefined budgetUsd in monitor mode (uses default)", async () => {
    const result = await costMonitorHandler(
      makeNode({ mode: "monitor", budgetUsd: undefined }),
      makeContext(),
    );
    expect(result.messages).toHaveLength(0);
    expect(result.updatedVariables?.cost_status).toBeDefined();
  });
});
