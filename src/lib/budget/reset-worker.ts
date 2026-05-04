import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface BudgetResetResult {
  count: number;
}

export async function resetAllBudgets(): Promise<BudgetResetResult> {
  const now = new Date();

  const budgets = await prisma.agentBudget.findMany({
    select: { id: true, periodStart: true },
  });

  const toReset = budgets.filter((b) => {
    const nextReset = new Date(b.periodStart);
    nextReset.setMonth(nextReset.getMonth() + 1);
    return now >= nextReset;
  });

  if (toReset.length === 0) {
    logger.info("budget-reset: no budgets due for reset");
    return { count: 0 };
  }

  await prisma.$transaction(
    toReset.map((b) =>
      prisma.agentBudget.update({
        where: { id: b.id },
        data: { currentSpendUsd: 0, periodStart: now },
      }),
    ),
  );

  logger.info("budget-reset: monthly reset complete", { count: toReset.length });
  return { count: toReset.length };
}
