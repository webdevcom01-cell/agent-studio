import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runPipeline } from "./pipeline";
import type { PipelineConfig, PipelineProgress } from "./types";

const activeExecutions = new Map<string, AbortController>();

export function isExecutionActive(generationId: string): boolean {
  return activeExecutions.has(generationId);
}

export function cancelExecution(generationId: string): boolean {
  const controller = activeExecutions.get(generationId);
  if (!controller) return false;
  controller.abort();
  activeExecutions.delete(generationId);
  return true;
}

export function startExecution(
  generationId: string,
  config: PipelineConfig,
): Promise<void> {
  if (activeExecutions.has(generationId)) {
    return Promise.reject(
      new Error(`Execution already in progress for ${generationId}`),
    );
  }

  const controller = new AbortController();
  activeExecutions.set(generationId, controller);

  return executePipeline(generationId, config, controller.signal)
    .catch((err) => {
      logger.error("CLI generation execution failed", {
        generationId,
        error: err instanceof Error ? err.message : String(err),
      });
    })
    .then(() => {
      // discard PipelineProgress to satisfy Promise<void> return type
    });
}

async function executePipeline(
  generationId: string,
  config: PipelineConfig,
  signal: AbortSignal,
): Promise<PipelineProgress> {
  try {
    if (signal.aborted) {
      await markCancelled(generationId);
      return {
        generationId,
        status: "FAILED",
        currentPhase: 0,
        phases: [],
        errorMessage: "Execution cancelled",
      };
    }

    const result = await runPipeline(generationId, config);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await prisma.cLIGeneration.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
      },
    }).catch((updateErr) => {
      logger.error("Failed to update generation status", updateErr);
    });

    return {
      generationId,
      status: "FAILED",
      currentPhase: 0,
      phases: [],
      errorMessage: errorMsg,
    };
  } finally {
    activeExecutions.delete(generationId);
  }
}

async function markCancelled(generationId: string): Promise<void> {
  await prisma.cLIGeneration.update({
    where: { id: generationId },
    data: {
      status: "FAILED",
      errorMessage: "Execution cancelled by user",
    },
  }).catch((err) => {
    logger.error("Failed to mark generation as cancelled", err);
  });
}

export function getActiveExecutionCount(): number {
  return activeExecutions.size;
}
