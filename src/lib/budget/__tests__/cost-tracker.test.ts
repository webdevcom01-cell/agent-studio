import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUnique, mockTransaction, mockBudgetAlertCreate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockTransaction: vi.fn(),
  mockBudgetAlertCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentBudget: { findUnique: mockFindUnique, update: vi.fn() },
    costEvent: { create: vi.fn() },
    budgetAlert: { create: mockBudgetAlertCreate },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/generated/prisma", () => ({
  Prisma: {
    Decimal: class Decimal {
      private val: string;
      constructor(v: string | number) { this.val = String(v); }
      toString() { return this.val; }
    },
  },
}));

import { checkBudget, recordCost } from "../cost-tracker";

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockResolvedValue([]);
});

describe("checkBudget", () => {
  it("returns allowed=true when no budget exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(true);
  });

  it("returns allowed=true when hardLimitUsd is 0", async () => {
    mockFindUnique.mockResolvedValue({ hardLimitUsd: 0, isHardStop: true, currentSpendUsd: 5 });

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(true);
  });

  it("returns allowed=true when spend is below limit", async () => {
    mockFindUnique.mockResolvedValue({ hardLimitUsd: 10, isHardStop: true, currentSpendUsd: 5 });

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(true);
    expect(result.spendUsd).toBe(5);
    expect(result.hardLimitUsd).toBe(10);
  });

  it("returns allowed=false when spend >= hardLimitUsd", async () => {
    mockFindUnique.mockResolvedValue({ hardLimitUsd: 10, isHardStop: true, currentSpendUsd: 10 });

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("hard_limit_reached");
  });

  it("returns allowed=true when isHardStop is false even at limit", async () => {
    mockFindUnique.mockResolvedValue({ hardLimitUsd: 10, isHardStop: false, currentSpendUsd: 15 });

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(true);
  });

  it("fails open on DB error", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB connection lost"));

    const result = await checkBudget("agent-1");

    expect(result.allowed).toBe(true);
  });
});

describe("recordCost", () => {
  it("creates CostEvent and updates currentSpendUsd", async () => {
    mockFindUnique.mockResolvedValue({
      id: "budget-1",
      softLimitUsd: 0,
      hardLimitUsd: 0,
      alertThreshold: 0.8,
      currentSpendUsd: 0,
    });

    await recordCost({ agentId: "agent-1", costUsd: 0.05, modelId: "deepseek-chat" });

    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("does not throw when no budget record exists", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      recordCost({ agentId: "agent-1", costUsd: 0.05, modelId: "deepseek-chat" }),
    ).resolves.not.toThrow();

    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does not throw when DB transaction fails", async () => {
    mockFindUnique.mockResolvedValue({
      id: "budget-1",
      softLimitUsd: 0,
      hardLimitUsd: 0,
      alertThreshold: 0.8,
      currentSpendUsd: 0,
    });
    mockTransaction.mockRejectedValue(new Error("Deadlock"));

    await expect(
      recordCost({ agentId: "agent-1", costUsd: 0.05, modelId: "deepseek-chat" }),
    ).resolves.not.toThrow();
  });
});
