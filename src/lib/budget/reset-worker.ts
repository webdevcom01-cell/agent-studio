import { withAdminBypass } from "@/lib/api/tenant-context";
import { logger } from "@/lib/logger";

export interface BudgetResetResult {
  count: number;
}

export async function resetAllBudgets(): Promise<BudgetResetResult> {
  const now = new Date();

  const budgets = await withAdminBypass((db) => db.agentBudget.findMany({
    select: { id: true, periodStart: true },
  }));

  const toReset = budgets.filter((b) => {
    const nextReset = new Date(b.periodStart);
    nextReset.setMonth(nextReset.getMonth() + 1);
    return now >= nextReset;
  });

  if (toReset.length === 0) {
    logger.info("budget-reset: no budgets due for reset");
    return { count: 0 };
  }

  await withAdminBypass((db) =>
    db.$transaction(
      toReset.map((b) =>
        db.agentBudget.update({
          where: { id: b.id },
          data: { currentSpendUsd: 0, periodStart: now },
        }),
      ),
    ),
  );

  logger.info("budget-reset: monthly reset complete", { count: toReset.length });
  return { count: toReset.length };
}
