/**
 * POST /api/cli-generator/[generationId]/resume
 *
 * Resets a FAILED or stuck generation so the /advance loop can re-drive it.
 *
 * A generation is "stuck" when its status is non-terminal (not COMPLETED or
 * FAILED) but its `updatedAt` timestamp is older than STUCK_THRESHOLD_MS.
 * This happens when the browser was closed mid-pipeline, a serverless
 * invocation timed out without writing FAILED, or a network blip left a
 * "running" phase in the DB with no corresponding active /advance call.
 *
 * What this endpoint does:
 *   1. Resets any "failed" or "running" phase entries back to "pending"
 *      (so the next /advance call picks up from the right spot)
 *   2. Sets the generation status to the STATUS_FOR_PHASE of the first
 *      pending phase (or PENDING if the pipeline hasn't started at all)
 *   3. Clears errorMessage
 *   4. Returns the new status + resumeFromPhase index so the frontend knows
 *      where to restart the advance loop
 *
 * The /advance endpoint already handles partial completions: it reads existing
 * completed phase outputs from the DB `phases` JSON and feeds them as context
 * to subsequent phases — so resuming mid-pipeline yields the same quality
 * result as a fresh run without re-running successful phases.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import {
  PIPELINE_PHASES,
  STATUS_FOR_PHASE,
  STUCK_THRESHOLD_MS,
} from "@/lib/cli-generator/types";
import type { PhaseResult } from "@/lib/cli-generator/types";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { generationId } = await params;

    const generation = await prisma.cLIGeneration.findUnique({
      where: { id: generationId },
    });

    if (!generation) {
      return NextResponse.json(
        { success: false, error: "Generation not found" },
        { status: 404 },
      );
    }

    // Ownership check
    if (generation.userId && generation.userId !== authResult.userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    // Determine whether this generation is resumable
    const isTerminal = TERMINAL_STATUSES.has(generation.status);
    const isStuck =
      !isTerminal &&
      Date.now() - new Date(generation.updatedAt).getTime() > STUCK_THRESHOLD_MS;
    const isFailed = generation.status === "FAILED";

    if (isTerminal && !isFailed) {
      // Already COMPLETED — nothing to resume
      return NextResponse.json(
        { success: false, error: "Generation is already completed" },
        { status: 409 },
      );
    }

    if (!isFailed && !isStuck) {
      // Still actively running — do not reset
      return NextResponse.json(
        { success: false, error: "Generation is still actively running" },
        { status: 409 },
      );
    }

    // Rebuild the phases array, resetting any failed/running entries to pending
    const phases: PhaseResult[] = Array.isArray(generation.phases)
      ? (generation.phases as unknown as PhaseResult[]).map((p) =>
          p.status === "failed" || p.status === "running"
            ? { phase: p.phase, name: p.name, status: "pending" as const }
            : p,
        )
      : PIPELINE_PHASES.map(({ phase, name }) => ({
          phase,
          name,
          status: "pending" as const,
        }));

    // Find the first phase that will be re-run
    const resumeFromPhase = phases.findIndex((p) => p.status === "pending");
    if (resumeFromPhase === -1) {
      // All phases are marked completed but status wasn't updated — fix it
      await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: { status: "COMPLETED", errorMessage: null },
      });
      return NextResponse.json({
        success: true,
        data: { status: "COMPLETED", resumeFromPhase: -1, done: true },
      });
    }

    // Use STATUS_FOR_PHASE to pick the right in-progress status (e.g. ANALYZING)
    // Fall back to PENDING if the phase index isn't in the map
    const resumeStatus = STATUS_FOR_PHASE[resumeFromPhase] ?? "PENDING";

    const updated = await prisma.cLIGeneration.update({
      where: { id: generationId },
      data: {
        status: resumeStatus,
        currentPhase: resumeFromPhase,
        phases: JSON.parse(JSON.stringify(phases)),
        errorMessage: null,
      },
    });

    logger.info("CLI generation resumed", {
      generationId,
      wasStatus: generation.status,
      resumeFromPhase,
      resumeStatus,
    });

    return NextResponse.json({
      success: true,
      data: {
        status: updated.status,
        resumeFromPhase,
        done: false,
      },
    });
  } catch (err) {
    logger.error("Failed to resume CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
