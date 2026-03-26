/**
 * GET /api/cli-generator/[generationId]/test-mcp
 *
 * Static validation + Claude Desktop config export for a completed CLI bridge.
 *
 * Returns:
 *   - Validation issues from py-validator or ts-validator
 *   - Ready-to-paste Claude Desktop config JSON
 *   - MCP server registration status (mcpServerId from DB)
 *   - Target runtime (python | typescript)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { validatePythonOutput } from "@/lib/cli-generator/py-validator";
import { validateTSOutput } from "@/lib/cli-generator/ts-validator";
import type { ValidationIssue } from "@/lib/cli-generator/py-validator";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ generationId: string }> },
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { generationId } = await params;

    const generation = await prisma.cLIGeneration.findUnique({
      where: { id: generationId },
      select: {
        userId: true,
        status: true,
        target: true,
        applicationName: true,
        generatedFiles: true,
        cliConfig: true,
        mcpServerId: true,
      },
    });

    if (!generation) {
      return NextResponse.json(
        { success: false, error: "Generation not found" },
        { status: 404 },
      );
    }

    if (generation.userId && generation.userId !== authResult.userId) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (generation.status !== "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Generation is not yet completed" },
        { status: 409 },
      );
    }

    const files = (generation.generatedFiles ?? {}) as Record<string, string>;
    const target = (generation.target ?? "python") as "python" | "typescript";

    // Run static validation
    let issues: ValidationIssue[] = [];
    let valid = true;
    try {
      const result = target === "typescript"
        ? validateTSOutput(files)
        : validatePythonOutput(files);
      issues = result.issues;
      valid = result.valid;
    } catch (err) {
      logger.warn("MCP test: validation threw", {
        generationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Build Claude Desktop config from stored cliConfig
    const safeName = generation.applicationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const storedConfig = generation.cliConfig as Record<string, unknown> | null;
    const mcpConfig = storedConfig?.mcp_config as Record<string, unknown> | undefined;

    const claudeDesktopConfig = {
      mcpServers: {
        [safeName]: mcpConfig ?? (
          target === "typescript"
            ? { command: "node", args: ["dist/server.js"] }
            : { command: "python", args: ["server.py"] }
        ),
      },
    };

    return NextResponse.json({
      success: true,
      data: {
        valid,
        issues,
        target,
        claudeDesktopConfig,
        mcpServerId: generation.mcpServerId,
        fileCount: Object.keys(files).length,
      },
    });
  } catch (err) {
    logger.error("Failed to test MCP bridge", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
