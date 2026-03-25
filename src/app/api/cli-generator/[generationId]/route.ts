import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
// executor.ts is kept for legacy compat but cancelExecution is no-op with per-phase /advance architecture

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

    return NextResponse.json({ success: true, data: generation });
  } catch (err) {
    logger.error("Failed to get CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Failed to get generation" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
      select: { userId: true, status: true },
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

    // Per-phase architecture: cancellation means "stop calling /advance"
    // We mark FAILED so stuck pipeline doesn't resume after deletion UI re-add
    if (!["COMPLETED", "FAILED"].includes(generation.status)) {
      await prisma.cLIGeneration.update({
        where: { id: generationId },
        data: { status: "FAILED", errorMessage: "Cancelled by user" },
      }).catch(() => { /* ignore — we're deleting anyway */ });
    }

    await prisma.cLIGeneration.delete({
      where: { id: generationId },
    });

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to delete CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete generation" },
      { status: 500 },
    );
  }
}
