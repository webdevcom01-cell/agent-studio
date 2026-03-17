import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  PipelineConfig,
  PhaseResult,
  PipelineProgress,
  AIPhaseOutput,
  GeneratedFiles,
} from "./types";
import {
  PIPELINE_PHASES,
  PHASE_COUNT,
  STATUS_FOR_PHASE,
} from "./types";
import {
  aiAnalyze,
  aiDesign,
  aiImplement,
  aiTest,
  aiDocs,
  aiPublish,
} from "./ai-phases";
import { registerCLIBridgeAsMCP } from "./mcp-registration";

function createInitialPhases(): PhaseResult[] {
  return PIPELINE_PHASES.map(({ phase, name }) => ({
    phase,
    name,
    status: "pending" as const,
  }));
}

type PhaseRunner = (
  config: PipelineConfig,
  previousResults: PhaseResult[],
) => Promise<AIPhaseOutput>;

/** Summarize implement output to reduce context size for downstream phases */
function summarizeImplementOutput(output: unknown): unknown {
  if (typeof output !== "object" || output === null) return output;
  const record = output as Record<string, unknown>;
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      // Keep only filename + first 200 chars as preview
      summary[key] = value.length > 200
        ? `${value.substring(0, 200)}... (${value.length} chars total)`
        : value;
    }
  }
  return summary;
}

const PHASE_RUNNERS: PhaseRunner[] = [
  (config) => aiAnalyze(config),                       // 0: analyze
  (config, prev) => aiDesign(config, prev[0]?.output), // 1: design
  (config, prev) => aiImplement(config, prev[1]?.output), // 2: implement
  (config, prev) => aiTest(config, summarizeImplementOutput(prev[2]?.output)),   // 3: write-tests
  (config, prev) => aiDocs(config, prev[1]?.output),   // 4: document
  (config, prev) => aiPublish(config, prev[1]?.output), // 5: publish
];

export async function runPipeline(
  generationId: string,
  config: PipelineConfig,
): Promise<PipelineProgress> {
  const phases = createInitialPhases();
  const allFiles: GeneratedFiles = {};

  for (let i = 0; i < PHASE_COUNT; i++) {
    const phase = phases[i];
    phase.status = "running";
    phase.startedAt = new Date().toISOString();

    const statusForPhase = STATUS_FOR_PHASE[i] ?? "PENDING";

    await prisma.cLIGeneration.update({
      where: { id: generationId },
      data: {
        status: statusForPhase,
        currentPhase: i,
        phases: JSON.parse(JSON.stringify(phases)),
      },
    });

    try {
      const runner = PHASE_RUNNERS[i];
      const aiOutput = await runner(config, phases);

      phase.output = aiOutput.result;
      phase.generatedFiles = aiOutput.generatedFiles;
      phase.tokensUsed = aiOutput.tokensUsed;
      phase.status = "completed";
      phase.completedAt = new Date().toISOString();

      if (aiOutput.generatedFiles) {
        Object.assign(allFiles, aiOutput.generatedFiles);
      }

      await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: {
          currentPhase: i,
          phases: JSON.parse(JSON.stringify(phases)),
          generatedFiles: Object.keys(allFiles).length > 0
            ? JSON.parse(JSON.stringify(allFiles))
            : undefined,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      phase.status = "failed";
      phase.error = errorMsg;
      phase.completedAt = new Date().toISOString();

      logger.error("CLI generation phase failed", {
        generationId,
        phase: i,
        phaseName: phase.name,
        error: errorMsg,
      });

      await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          currentPhase: i,
          phases: JSON.parse(JSON.stringify(phases)),
          errorMessage: `Phase ${phase.name} failed: ${errorMsg}`,
          generatedFiles: Object.keys(allFiles).length > 0
            ? JSON.parse(JSON.stringify(allFiles))
            : undefined,
        },
      });

      return {
        generationId,
        status: "FAILED",
        currentPhase: i,
        phases,
        errorMessage: `Phase ${phase.name} failed: ${errorMsg}`,
      };
    }
  }

  const lastPhaseOutput = phases[PHASE_COUNT - 1]?.output as Record<string, unknown> | undefined;
  const cliConfig = lastPhaseOutput?.cliConfig ?? null;

  const completedGeneration = await prisma.cLIGeneration.update({
    where: { id: generationId },
    data: {
      status: "COMPLETED",
      currentPhase: PHASE_COUNT - 1,
      phases: JSON.parse(JSON.stringify(phases)),
      cliConfig: cliConfig ? JSON.parse(JSON.stringify(cliConfig)) : undefined,
      generatedFiles: Object.keys(allFiles).length > 0
        ? JSON.parse(JSON.stringify(allFiles))
        : undefined,
    },
  });

  try {
    if (completedGeneration.userId) {
      const mcpServer = await registerCLIBridgeAsMCP(
        generationId,
        completedGeneration.userId,
      );
      if (mcpServer) {
        logger.info("CLI bridge auto-registered as MCP server", {
          generationId,
          mcpServerId: mcpServer.id,
        });
      }
    }
  } catch (err) {
    logger.warn("CLI bridge MCP auto-registration failed", {
      generationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    generationId,
    status: "COMPLETED",
    currentPhase: PHASE_COUNT - 1,
    phases,
    cliConfig,
  };
}

export { createInitialPhases };
