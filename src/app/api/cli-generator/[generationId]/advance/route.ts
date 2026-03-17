/**
 * POST /api/cli-generator/[generationId]/advance
 *
 * Runs exactly ONE next pending phase of the CLI generation pipeline.
 * This is the 2026 industry-standard pattern for long-running AI pipelines:
 * each phase is a separate serverless function invocation, giving each
 * phase its own independent 300s budget instead of sharing one budget.
 *
 * The frontend calls this endpoint in a loop until status is COMPLETED or FAILED.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { PIPELINE_PHASES, PHASE_COUNT, STATUS_FOR_PHASE } from "@/lib/cli-generator/types";
import type { PhaseResult, PipelineConfig } from "@/lib/cli-generator/types";
import {
  aiAnalyze,
  aiDesign,
  aiImplement,
  aiTest,
  aiDocs,
  aiPublish,
} from "@/lib/cli-generator/ai-phases";
import { registerCLIBridgeAsMCP } from "@/lib/cli-generator/mcp-registration";

export const maxDuration = 300;

/** Truncate large file content to 200 chars to reduce downstream context size */
function summarizeOutput(output: unknown): unknown {
  if (typeof output !== "object" || output === null) return output;
  const record = output as Record<string, unknown>;
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") {
      summary[key] = value.length > 200
        ? `${value.substring(0, 200)}... (${value.length} chars total)`
        : value;
    }
  }
  return summary;
}

type PhaseRunner = (
  config: PipelineConfig,
  previousResults: PhaseResult[],
) => Promise<{ result: unknown; generatedFiles?: Record<string, string>; tokensUsed?: { input: number; output: number } }>;

const PHASE_RUNNERS: PhaseRunner[] = [
  (config) => aiAnalyze(config),
  (config, prev) => aiDesign(config, prev[0]?.output),
  (config, prev) => aiImplement(config, prev[1]?.output),
  (config, prev) => aiTest(config, summarizeOutput(prev[2]?.output)),
  (config, prev) => aiDocs(config, prev[1]?.output),
  (config, prev) => aiPublish(config, prev[1]?.output),
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { generationId } = await params;

    // Config is passed in the request body (not stored in DB to avoid schema changes)
    let pipelineConfig: PipelineConfig = { applicationName: "" };
    try {
      const body = await req.json() as { config?: PipelineConfig };
      if (body.config) pipelineConfig = body.config;
    } catch {
      // Body is optional — generation name will be used as fallback
    }

    const generation = await prisma.cLIGeneration.findUnique({
      where: { id: generationId },
    });

    if (!generation) {
      return NextResponse.json(
        { success: false, error: "Generation not found" },
        { status: 404 },
      );
    }

    // Only the owner can advance
    if (generation.userId && generation.userId !== authResult.userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // Already terminal — nothing to do
    if (generation.status === "COMPLETED" || generation.status === "FAILED") {
      return NextResponse.json({
        success: true,
        data: { status: generation.status, done: true },
      });
    }

    // Reconstruct phases from DB or create fresh
    const phases: PhaseResult[] = Array.isArray(generation.phases)
      ? (generation.phases as unknown as PhaseResult[])
      : PIPELINE_PHASES.map(({ phase, name }) => ({
          phase,
          name,
          status: "pending" as const,
        }));

    // Find the next pending phase
    const nextPhaseIndex = phases.findIndex((p) => p.status === "pending");
    if (nextPhaseIndex === -1) {
      // All phases completed but status not updated — fix it
      return NextResponse.json({
        success: true,
        data: { status: "COMPLETED", done: true },
      });
    }

    const phase = phases[nextPhaseIndex];
    phase.status = "running";
    phase.startedAt = new Date().toISOString();

    const statusForPhase = STATUS_FOR_PHASE[nextPhaseIndex] ?? "PENDING";

    await prisma.cLIGeneration.update({
      where: { id: generationId },
      data: {
        status: statusForPhase,
        currentPhase: nextPhaseIndex,
        phases: JSON.parse(JSON.stringify(phases)),
      },
    });

    // Reconstruct accumulated files from DB
    const existingFiles: Record<string, string> = {};
    if (generation.generatedFiles && typeof generation.generatedFiles === "object") {
      Object.assign(existingFiles, generation.generatedFiles);
    }

    try {
      const runner = PHASE_RUNNERS[nextPhaseIndex];
      if (!runner) {
        throw new Error(`No runner for phase ${nextPhaseIndex}`);
      }

      // Use config from request body; fallback to generation name if not provided
      const config: PipelineConfig = {
        applicationName: pipelineConfig.applicationName || generation.applicationName,
        description: pipelineConfig.description,
        capabilities: pipelineConfig.capabilities ?? [],
        platform: pipelineConfig.platform,
      };

      const aiOutput = await runner(config, phases);

      phase.output = aiOutput.result;
      phase.generatedFiles = aiOutput.generatedFiles;
      phase.tokensUsed = aiOutput.tokensUsed;
      phase.status = "completed";
      phase.completedAt = new Date().toISOString();

      if (aiOutput.generatedFiles) {
        Object.assign(existingFiles, aiOutput.generatedFiles);
      }

      const isLastPhase = nextPhaseIndex === PHASE_COUNT - 1;
      const newStatus = isLastPhase ? "COMPLETED" : statusForPhase;

      const lastPhaseOutput = isLastPhase
        ? (aiOutput.result as Record<string, unknown> | undefined)
        : undefined;
      const cliConfig = lastPhaseOutput?.cliConfig ?? null;

      const updatedGeneration = await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: {
          status: newStatus,
          currentPhase: nextPhaseIndex,
          phases: JSON.parse(JSON.stringify(phases)),
          generatedFiles: Object.keys(existingFiles).length > 0
            ? JSON.parse(JSON.stringify(existingFiles))
            : undefined,
          ...(cliConfig ? { cliConfig: JSON.parse(JSON.stringify(cliConfig)) } : {}),
        },
      });

      // Auto-register MCP server on completion
      if (isLastPhase && updatedGeneration.userId) {
        try {
          const mcpServer = await registerCLIBridgeAsMCP(generationId, updatedGeneration.userId);
          if (mcpServer) {
            logger.info("CLI bridge auto-registered as MCP server", { generationId, mcpServerId: mcpServer.id });
          }
        } catch (regErr) {
          logger.warn("CLI bridge MCP auto-registration failed", {
            generationId,
            error: regErr instanceof Error ? regErr.message : String(regErr),
          });
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          phase: nextPhaseIndex,
          phaseName: phase.name,
          status: newStatus,
          done: isLastPhase,
          nextPhase: isLastPhase ? null : nextPhaseIndex + 1,
        },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      phase.status = "failed";
      phase.error = errorMsg;
      phase.completedAt = new Date().toISOString();

      logger.error("CLI generation phase failed in advance", {
        generationId,
        phase: nextPhaseIndex,
        phaseName: phase.name,
        error: errorMsg,
      });

      await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: {
          status: "FAILED",
          currentPhase: nextPhaseIndex,
          phases: JSON.parse(JSON.stringify(phases)),
          errorMessage: `Phase ${phase.name} failed: ${errorMsg}`,
          generatedFiles: Object.keys(existingFiles).length > 0
            ? JSON.parse(JSON.stringify(existingFiles))
            : undefined,
        },
      });

      return NextResponse.json(
        { success: false, error: `Phase ${phase.name} failed: ${errorMsg}` },
        { status: 500 },
      );
    }
  } catch (err) {
    logger.error("Failed to advance CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
