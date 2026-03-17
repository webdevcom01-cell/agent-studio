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
import { extractPythonSignatures, extractTypeScriptSignatures } from "@/lib/cli-generator/prompts";

export const maxDuration = 300;

type PhaseRunner = (
  config: PipelineConfig,
  previousResults: PhaseResult[],
) => Promise<{ result: unknown; generatedFiles?: Record<string, string>; tokensUsed?: { input: number; output: number }; modelUsed?: string }>;

/**
 * Builds the phase runner array for a given target.
 * Phases 0 (analyze) and 1 (design) are language-agnostic and shared.
 * Phase 3 (test) uses the correct signature extractor for the target.
 * Phases 2, 4, 5 branch internally in ai-phases.ts based on config.target.
 */
function buildPhaseRunners(target: "python" | "typescript"): PhaseRunner[] {
  const extractSignatures =
    target === "typescript" ? extractTypeScriptSignatures : extractPythonSignatures;

  return [
    (config) => aiAnalyze(config),
    (config, prev) => aiDesign(config, prev[0]?.output),
    (config, prev) => aiImplement(config, prev[1]?.output),
    // Pass extracted function/class signatures instead of truncated raw file content.
    // This gives the test phase actual function names and parameter lists rather than
    // the first 200 chars of each file (which is typically just imports).
    (config, prev) => aiTest(config, extractSignatures(prev[2]?.output)),
    (config, prev) => aiDocs(config, prev[1]?.output),
    (config, prev) => aiPublish(config, prev[1]?.output),
  ];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { generationId } = await params;

    // Body is still accepted for backwards compat but config is now read from DB
    let bodyConfig: PipelineConfig | null = null;
    try {
      const body = await req.json() as { config?: PipelineConfig };
      if (body.config) bodyConfig = body.config;
    } catch {
      // Body is optional
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

    const phaseStartMs = Date.now();

    try {
      // Config priority: request body > values stored in DB
      // Cast to access `target` — the field exists in the DB schema but the
      // generated Prisma client types may not include it yet until `prisma generate`
      // runs on the next Vercel build.
      const generationRecord = generation as unknown as typeof generation & { target?: string };
      const target = (generationRecord.target ?? "python") as "python" | "typescript";
      const config: PipelineConfig = {
        applicationName: bodyConfig?.applicationName ?? generation.applicationName,
        description: bodyConfig?.description,
        capabilities: bodyConfig?.capabilities ?? [],
        platform: bodyConfig?.platform,
        target,
      };

      // Build phase runners for the correct target language
      const PHASE_RUNNERS = buildPhaseRunners(target);

      const runner = PHASE_RUNNERS[nextPhaseIndex];
      if (!runner) {
        throw new Error(`No runner for phase ${nextPhaseIndex}`);
      }

      // Phases 4 (docs) and 5 (publish) both depend only on phase 1 (design)
      // and are independent of each other — run them in parallel for a ~11s speedup.
      const DOCS_PHASE_IDX = 4;
      const PUBLISH_PHASE_IDX = 5;
      const isDocsPhase = nextPhaseIndex === DOCS_PHASE_IDX;

      let aiOutput: Awaited<ReturnType<PhaseRunner>>;
      let publishOutput: Awaited<ReturnType<PhaseRunner>> | null = null;

      if (isDocsPhase) {
        // Mark publish phase as running in local state before parallel execution
        const publishPhase = phases[PUBLISH_PHASE_IDX];
        if (publishPhase && publishPhase.status === "pending") {
          publishPhase.status = "running";
          publishPhase.startedAt = new Date().toISOString();
        }
        const publishRunner = PHASE_RUNNERS[PUBLISH_PHASE_IDX];
        if (publishRunner) {
          [aiOutput, publishOutput] = await Promise.all([
            runner(config, phases),
            publishRunner(config, phases),
          ]);
        } else {
          aiOutput = await runner(config, phases);
        }
      } else {
        aiOutput = await runner(config, phases);
      }

      // Save docs phase result
      phase.output = aiOutput.result;
      phase.generatedFiles = aiOutput.generatedFiles;
      phase.tokensUsed = aiOutput.tokensUsed;
      phase.status = "completed";
      phase.completedAt = new Date().toISOString();

      if (aiOutput.generatedFiles) {
        Object.assign(existingFiles, aiOutput.generatedFiles);
      }

      // Save publish phase result if it ran in parallel
      if (isDocsPhase && publishOutput) {
        const publishPhase = phases[PUBLISH_PHASE_IDX];
        if (publishPhase) {
          publishPhase.output = publishOutput.result;
          publishPhase.generatedFiles = publishOutput.generatedFiles;
          publishPhase.tokensUsed = publishOutput.tokensUsed;
          publishPhase.status = "completed";
          publishPhase.completedAt = new Date().toISOString();
        }
        if (publishOutput.generatedFiles) {
          Object.assign(existingFiles, publishOutput.generatedFiles);
        }
      }

      // After docs+publish parallel run, the last completed phase is publish (5)
      const lastCompletedPhase = isDocsPhase && publishOutput ? PUBLISH_PHASE_IDX : nextPhaseIndex;
      const isLastPhase = lastCompletedPhase === PHASE_COUNT - 1;
      const newStatus = isLastPhase ? "COMPLETED" : statusForPhase;

      // Extract cliConfig from publish output (publish phase returns "mcp_config" key)
      const publishResult = publishOutput
        ? (publishOutput.result as Record<string, unknown> | undefined)
        : (isLastPhase ? (aiOutput.result as Record<string, unknown> | undefined) : undefined);
      const cliConfig = publishResult?.mcp_config ?? publishResult?.cliConfig ?? null;

      const updatedGeneration = await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: {
          status: newStatus,
          currentPhase: lastCompletedPhase,
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

      // Aggregate token usage across both phases when docs+publish ran in parallel
      const totalTokens = {
        input: (aiOutput.tokensUsed?.input ?? 0) + (publishOutput?.tokensUsed?.input ?? 0),
        output: (aiOutput.tokensUsed?.output ?? 0) + (publishOutput?.tokensUsed?.output ?? 0),
      };

      return NextResponse.json({
        success: true,
        data: {
          phase: lastCompletedPhase,
          phaseName: phase.name,
          status: newStatus,
          done: isLastPhase,
          nextPhase: isLastPhase ? null : lastCompletedPhase + 1,
          durationMs: Date.now() - phaseStartMs,
          tokensUsed: totalTokens.input > 0 ? totalTokens : undefined,
          modelUsed: aiOutput.modelUsed ?? publishOutput?.modelUsed,
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
