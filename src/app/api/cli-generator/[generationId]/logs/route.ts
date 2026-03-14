import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import type { PhaseResult } from "@/lib/cli-generator/types";

const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ generationId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { generationId } = await params;
    if (!cuidSchema.safeParse(generationId).success) {
      return NextResponse.json(
        { success: false, error: "Generation not found" },
        { status: 404 },
      );
    }

    const generation = await prisma.cLIGeneration.findUnique({
      where: { id: generationId },
      select: {
        userId: true,
        phases: true,
        currentPhase: true,
        status: true,
        errorMessage: true,
      },
    });

    if (!generation) {
      return NextResponse.json(
        { success: false, error: "Generation not found" },
        { status: 404 },
      );
    }

    if (generation.userId !== authResult.userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const phases = (generation.phases as unknown as PhaseResult[]) ?? [];

    return NextResponse.json({
      success: true,
      data: {
        currentPhase: generation.currentPhase,
        status: generation.status,
        errorMessage: generation.errorMessage,
        phases,
      },
    });
  } catch (err) {
    logger.error("Failed to get CLI generation logs", err);
    return NextResponse.json(
      { success: false, error: "Failed to get generation logs" },
      { status: 500 },
    );
  }
}
