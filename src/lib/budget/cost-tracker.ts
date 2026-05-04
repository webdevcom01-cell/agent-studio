import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: "hard_limit_reached";
  spendUsd?: number;
  hardLimitUsd?: number;
}

export interface RecordCostParams {
  agentId: string;
  costUsd: number;
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  source?: string;
}

export async function checkBudget(agentId: string): Promise<BudgetCheckResult> {
  try {
    const budget = await prisma.agentBudget.findUnique({
      where: { agentId },
      select: { hardLimitUsd: true, isHardStop: true, currentSpendUsd: true },
    });

    if (!budget) return { allowed: true };

    const hardLimit = Number(budget.hardLimitUsd);

    if (hardLimit === 0 || !budget.isHardStop) {
      return { allowed: true, spendUsd: Number(budget.currentSpendUsd), hardLimitUsd: hardLimit };
    }

    const currentSpend = Number(budget.currentSpendUsd);
    if (currentSpend >= hardLimit) {
      return { allowed: false, reason: "hard_limit_reached", spendUsd: currentSpend, hardLimitUsd: hardLimit };
    }

    return { allowed: true, spendUsd: currentSpend, hardLimitUsd: hardLimit };
  } catch (error) {
    logger.error("checkBudget error — failing open", { agentId, error });
    return { allowed: true };
  }
}

export async function recordCost(params: RecordCostParams): Promise<void> {
  const { agentId, costUsd, modelId, inputTokens = 0, outputTokens = 0, source = "chat" } = params;

  try {
    const budget = await prisma.agentBudget.findUnique({
      where: { agentId },
      select: { id: true, softLimitUsd: true, hardLimitUsd: true, alertThreshold: true, currentSpendUsd: true },
    });

    if (!budget) return;

    const costDecimal = new Prisma.Decimal(costUsd.toFixed(4));

    await prisma.$transaction([
      prisma.costEvent.create({
        data: { budgetId: budget.id, agentId, costUsd: costDecimal, modelId, inputTokens, outputTokens, source },
      }),
      prisma.agentBudget.update({
        where: { id: budget.id },
        data: { currentSpendUsd: { increment: costDecimal } },
      }),
    ]);

    void checkAndFireAlerts(budget, agentId, Number(budget.currentSpendUsd) + costUsd);
  } catch (error) {
    logger.error("recordCost error", { agentId, costUsd, error });
  }
}

async function checkAndFireAlerts(
  budget: { id: string; softLimitUsd: Prisma.Decimal; hardLimitUsd: Prisma.Decimal; alertThreshold: number },
  agentId: string,
  newSpend: number,
): Promise<void> {
  const hardLimit = Number(budget.hardLimitUsd);
  const softLimit = Number(budget.softLimitUsd);
  const threshold = budget.alertThreshold;

  if (hardLimit > 0 && newSpend >= hardLimit) {
    await createAlert(budget.id, agentId, "hard_limit_reached", newSpend, hardLimit);
  } else if (softLimit > 0 && newSpend >= softLimit) {
    await createAlert(budget.id, agentId, "soft_limit_reached", newSpend, softLimit);
  } else if (hardLimit > 0 && threshold > 0 && newSpend >= hardLimit * threshold) {
    await createAlert(budget.id, agentId, "threshold_reached", newSpend, hardLimit);
  }
}

async function createAlert(
  budgetId: string,
  agentId: string,
  alertType: string,
  spendUsd: number,
  limitUsd: number,
): Promise<void> {
  try {
    await prisma.budgetAlert.create({
      data: {
        budgetId,
        agentId,
        alertType,
        spendUsd: new Prisma.Decimal(spendUsd.toFixed(2)),
        limitUsd: new Prisma.Decimal(limitUsd.toFixed(2)),
      },
    });
    logger.warn("Budget alert created", { agentId, alertType, spendUsd, limitUsd });
  } catch (error) {
    logger.error("Failed to create budget alert", { budgetId, agentId, alertType, error });
  }
}
