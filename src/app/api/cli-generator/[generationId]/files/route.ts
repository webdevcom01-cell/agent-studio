import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

const cuidSchema = z.string().cuid();

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  py: "python",
  md: "markdown",
  toml: "toml",
  cfg: "ini",
  ini: "ini",
  txt: "text",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  sh: "bash",
  bat: "batch",
  ps1: "powershell",
  ts: "typescript",
  js: "javascript",
  html: "html",
  css: "css",
  xml: "xml",
  sql: "sql",
  dockerfile: "dockerfile",
};

function inferLanguage(filename: string): string {
  const lower = filename.toLowerCase();

  if (lower === "dockerfile" || lower === "makefile") {
    return EXTENSION_LANGUAGE_MAP[lower] ?? "text";
  }

  const ext = lower.split(".").pop() ?? "";
  return EXTENSION_LANGUAGE_MAP[ext] ?? "text";
}

interface RouteParams {
  params: Promise<{ generationId: string }>;
}

export async function GET(
  request: NextRequest,
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
        generatedFiles: true,
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

    if (!generation.generatedFiles || typeof generation.generatedFiles !== "object") {
      return NextResponse.json(
        { success: false, error: "No generated files available" },
        { status: 404 },
      );
    }

    const files = generation.generatedFiles as Record<string, string>;
    const path = request.nextUrl.searchParams.get("path");

    if (!path) {
      return NextResponse.json({
        success: true,
        data: { files: Object.keys(files) },
      });
    }

    const content = files[path];
    if (content === undefined) {
      return NextResponse.json(
        { success: false, error: `File "${path}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        filename: path,
        content,
        language: inferLanguage(path),
      },
    });
  } catch (err) {
    logger.error("Failed to get CLI generation files", err);
    return NextResponse.json(
      { success: false, error: "Failed to get generation files" },
      { status: 500 },
    );
  }
}
