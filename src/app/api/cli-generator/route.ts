import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { startExecution } from "@/lib/cli-generator/executor";
import { createInitialPhases } from "@/lib/cli-generator/pipeline";

export const maxDuration = 300;

const MAX_GENERATIONS_PER_USER = 50;
const WRITE_RATE_LIMIT = 5;

const createGenerationSchema = z.object({
  applicationName: z
    .string()
    .min(1, "Application name is required")
    .max(100, "Application name must be 100 characters or less"),
  description: z.string().max(2000).optional(),
  capabilities: z.array(z.string().max(100)).max(50).optional(),
  platform: z.enum(["cross-platform", "linux", "macos", "windows"]).optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const generations = await prisma.cLIGeneration.findMany({
      where: { userId: authResult.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationName: true,
        status: true,
        currentPhase: true,
        createdAt: true,
        updatedAt: true,
        mcpServerId: true,
        errorMessage: true,
      },
    });

    return NextResponse.json({ success: true, data: generations });
  } catch (err) {
    logger.error("Failed to list CLI generations", err);
    return NextResponse.json(
      { success: false, error: "Failed to list generations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const rateResult = checkRateLimit(
      `cli-gen:${authResult.userId}`,
      WRITE_RATE_LIMIT,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const generationCount = await prisma.cLIGeneration.count({
      where: { userId: authResult.userId },
    });
    if (generationCount >= MAX_GENERATIONS_PER_USER) {
      return NextResponse.json(
        {
          success: false,
          error: `Generation limit reached (${MAX_GENERATIONS_PER_USER} max)`,
        },
        { status: 403 },
      );
    }

    const body: unknown = await request.json();
    const parsed = createGenerationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { applicationName, description, capabilities, platform } =
      parsed.data;

    const generation = await prisma.cLIGeneration.create({
      data: {
        applicationName,
        userId: authResult.userId,
        phases: JSON.parse(JSON.stringify(createInitialPhases())),
      },
    });

    after(
      startExecution(generation.id, {
        applicationName,
        description,
        capabilities,
        platform,
      }).catch((err) => {
        logger.error("Failed to start CLI generation", err);
      }),
    );

    return NextResponse.json(
      { success: true, data: generation },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Failed to create CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Failed to create generation" },
      { status: 500 },
    );
  }
}
