import { describe, it, expect, vi, beforeEach } from "vitest";
import { costMonitorHandler } from "../cost-monitor-handler";
import type { RuntimeContext } from "../../types";
import type { FlowNode } from "@/types";

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/cost/budget-tracker", () => ({
  loadBudgetState: vi.fn(
    (
      _vars: Record<string, unknown>,
      _trackVar: string,
      budget: number,
      threshold: number
    ) => ({
      totalTokens: 1000,
      totalCostUsd: 0.05,
      budgetRemaining: budget - 0.05,
      budgetPercent: 0.05 / budget,
      isExceeded: false,
      isAlertTriggered: false,
      breakdown: [],
    })
  ),
  getTrackingVariable: vi.fn((name: string) => `__budget_${name}`),
}));

function makeContext(
  overrides: Partial<RuntimeContext> = {}
): RuntimeContext {
  return {
    conversationId: "conv-1",
    agentId: "agent-1",
    flowContent: { nodes: [], edges: [], variables: [] },
    currentNodeId: "cost-1",
    variables: {},
    messageHistory: [],
    isNewConversation: true,
    ...overrides,
  };
}

function makeCostNode(data: Record<string, unknown> = {}): FlowNode {
  return {
    id: "cost-1",
    type: "cost_monitor",
    position: { x: 0, y: 0 },
    data: {
      budgetUsd: 1.0,
      ...data,
    },
  };
}

describe("cost-monitor ecomode (B3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ecomode sets __ecomode_enabled = true", async () => {
    const context = makeContext();
    const node = makeCostNode({ mode: "ecomode" });

    const result = await costMonitorHandler(node, context);

    expect(result.updatedVariables?.__ecomode_enabled).toBe(true);
    expect(result.messages[0].content).toContain("Ecomode active");
  });

  it("ecomode includes ecomode flag in output variable", async () => {
    const context = makeContext();
    const node = makeCostNode({ mode: "ecomode", outputVariable: "status" });

    const result = await costMonitorHandler(node, context);

    const output = result.updatedVariables?.status as Record<string, unknown>;
    expect(output.ecomode).toBe(true);
  });

  it("adaptive mode sets __model_tier_override", async () => {
    const { loadBudgetState } = await import("@/lib/cost/budget-tracker");
    vi.mocked(loadBudgetState).mockReturnValueOnce({
      totalTokens: 5000,
      totalCostUsd: 0.7,
      budgetRemaining: 0.3,
      budgetPercent: 0.7,
      isExceeded: false,
      isAlertTriggered: true,
      breakdown: [],
    });

    const context = makeContext();
    const node = makeCostNode({ mode: "adaptive" });

    const result = await costMonitorHandler(node, context);

    // At 70% budget, should be >= tier1 (60%) → balanced
    expect(result.updatedVariables?.__model_tier_override).toBe("balanced");
  });

  it("monitor mode does NOT set __ecomode_enabled or __model_tier_override", async () => {
    const context = makeContext();
    const node = makeCostNode({ mode: "monitor" });

    const result = await costMonitorHandler(node, context);

    expect(result.updatedVariables?.__ecomode_enabled).toBeUndefined();
    expect(result.updatedVariables?.__model_tier_override).toBeUndefined();
  });
});
