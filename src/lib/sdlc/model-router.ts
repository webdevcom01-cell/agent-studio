import { ALL_MODELS } from "@/lib/models";
import { logger } from "@/lib/logger";

export type StepPhase = "planning" | "implementation" | "testing" | "review" | "other";

const PHASE_MODEL_PRIORITY: Record<StepPhase, string[]> = {
  planning:       ["gpt-4o-mini", "deepseek-reasoner", "o4-mini"],
  implementation: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  testing:        ["gpt-4o-mini", "gpt-4.1-mini"],
  review:         ["gpt-4o-mini", "claude-sonnet-4-6", "deepseek-reasoner"],
  other:          ["gpt-4o-mini"],
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
  // Implementation steps always use phase priority regardless of useSmartRouting,
  // because gpt-4o-mini does not support the structured output schema (generateObject fails).
  if (useSmartRouting || phase === "implementation") {
    const candidates = PHASE_MODEL_PRIORITY[phase];
    for (let i = 0; i < candidates.length; i++) {
      if (isModelAvailable(candidates[i])) {
        if (i > 0) {
          logger.info("model-router: phase model fallback", {
            phase,
            stepId,
            requested: candidates[0],
            resolved: candidates[i],
          });
        }
        return candidates[i];
      }
    }
    logger.info("model-router: all phase candidates unavailable, using default model fallback", {
      phase,
      stepId,
      candidates,
      resolved: defaultModelId,
    });
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
  if (candidate && isModelAvailable(candidate)) {
    if (candidate !== currentModelId) {
      logger.info("model-router: escalating model for retry", {
        phase,
        attempt,
        from: currentModelId,
        to: candidate,
      });
    }
    return candidate;
  }

  for (const c of candidates) {
    if (c !== currentModelId && isModelAvailable(c)) {
      logger.info("model-router: escalating model for retry", {
        phase,
        attempt,
        from: currentModelId,
        to: c,
      });
      return c;
    }
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

    // DB was queried successfully but no model met the threshold — fall back to static priority
    logger.info("model-router: adaptive routing using static priority (no qualifying DB stats)", {
      phase,
      stepId,
      sampledModels: sorted.length,
    });
  } catch (err) {
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
