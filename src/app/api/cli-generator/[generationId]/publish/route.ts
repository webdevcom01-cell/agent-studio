import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { registerCLIBridgeAsMCP } from "@/lib/cli-generator/mcp-registration";

const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ generationId: string }>;
}

export async function POST(
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

    if (generation.status !== "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Generation must be completed before publishing" },
        { status: 400 },
      );
    }

    const mcpServer = await registerCLIBridgeAsMCP(
      generationId,
      authResult.userId,
    );

    if (!mcpServer) {
      return NextResponse.json(
        { success: false, error: "Failed to register CLI bridge as MCP server" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { mcpServer },
    });
  } catch (err) {
    logger.error("Failed to publish CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Failed to publish generation" },
      { status: 500 },
    );
  }
}
