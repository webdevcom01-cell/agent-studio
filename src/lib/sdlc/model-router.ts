import { ALL_MODELS } from "@/lib/models";

export type StepPhase = "planning" | "implementation" | "testing" | "review" | "other";

const PHASE_MODEL_PRIORITY: Record<StepPhase, string[]> = {
  planning:       ["deepseek-reasoner", "o4-mini", "deepseek-chat"],
  implementation: ["deepseek-chat", "gpt-4.1", "deepseek-reasoner"],
  testing:        ["deepseek-chat", "gpt-4.1-mini"],
  review:         ["claude-sonnet-4-6", "deepseek-reasoner", "deepseek-chat"],
  other:          ["deepseek-chat"],
};

export function isModelAvailable(modelId: string): boolean {
  const model = ALL_MODELS.find((m) => m.id === modelId);
  if (!model) return false;
  if (!model.envKey) return true;
  return !!process.env[model.envKey];
}

export function resolveStepModel(
  phase: StepPhase,
  overrides: Record<string, string>,
  stepId: string,
  defaultModelId: string,
  useSmartRouting: boolean,
): string {
  if (overrides[stepId]) return overrides[stepId];
  if (!useSmartRouting) return defaultModelId;
  const candidates = PHASE_MODEL_PRIORITY[phase];
  for (const candidate of candidates) {
    if (isModelAvailable(candidate)) return candidate;
  }
  return defaultModelId;
}

// ---------------------------------------------------------------------------
// G4: Retry model escalation
// ---------------------------------------------------------------------------

/**
 * Returns the model to use for a specific feedback loop retry attempt.
 *
 * - attempt <= 1  : same model (first retry — give it another chance with context)
 * - attempt === 2 : next model in the phase priority list
 * - attempt >= 3  : last model in the priority list (most capable fallback)
 *
 * Falls back to currentModelId if no escalation candidate is available.
 */
export function getEscalationModel(
  phase: StepPhase,
  currentModelId: string,
  attempt: number,
): string {
  if (attempt <= 1) return currentModelId;

  const candidates = PHASE_MODEL_PRIORITY[phase];
  const currentIdx = candidates.indexOf(currentModelId);

  const targetIdx =
    attempt >= 3
      ? candidates.length - 1
      : Math.min(currentIdx + 1, candidates.length - 1);

  const candidate = candidates[targetIdx];
  if (candidate && isModelAvailable(candidate)) return candidate;

  for (const c of candidates) {
    if (c !== currentModelId && isModelAvailable(c)) return c;
  }

  return currentModelId;
}

// ---------------------------------------------------------------------------
// G3: Adaptive model routing (DB-backed with cold-start fallback)
// ---------------------------------------------------------------------------

/** Minimum number of runs before DB stats are trusted for routing decisions */
const MIN_SAMPLE_SIZE = 5;
/** Minimum success rate required to prefer a DB-tracked model */
const MIN_SUCCESS_RATE = 0.6;

/**
 * Resolves the model for a pipeline step using DB-backed performance history
 * when sufficient data exists. Falls back to the static PHASE_MODEL_PRIORITY
 * table on cold start (< MIN_SAMPLE_SIZE runs) or when DB is unavailable.
 *
 * Explicit per-step overrides always take precedence over both DB and static routing.
 */
export async function resolveStepModelAdaptive(
  phase: StepPhase,
  overrides: Record<string, string>,
  stepId: string,
  defaultModelId: string,
): Promise<string> {
  if (overrides[stepId]) return overrides[stepId];

  try {
    const { prisma } = await import("@/lib/prisma");
    const stats = await prisma.modelPerformanceStat.findMany({
      where: { phase, runCount: { gte: MIN_SAMPLE_SIZE } },
    });

    const sorted = [...stats].sort((a, b) => {
      const rateA = a.successCount / a.runCount;
      const rateB = b.successCount / b.runCount;
      if (rateB !== rateA) return rateB - rateA;
      return (a.totalInputTokens / a.runCount) - (b.totalInputTokens / b.runCount);
    });

    for (const stat of sorted) {
      const rate = stat.successCount / stat.runCount;
      if (rate >= MIN_SUCCESS_RATE && isModelAvailable(stat.modelId)) {
        return stat.modelId;
      }
    }
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.warn("model-router: adaptive DB query failed, using static priority", {
      phase,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  for (const candidate of PHASE_MODEL_PRIORITY[phase]) {
    if (isModelAvailable(candidate)) return candidate;
  }

  return defaultModelId;
}
