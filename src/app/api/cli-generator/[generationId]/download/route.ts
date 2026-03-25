import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import archiver from "archiver";
import { Readable, PassThrough } from "node:stream";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

const cuidSchema = z.string().cuid();

interface RouteParams {
  params: Promise<{ generationId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse | Response> {
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
        status: true,
        applicationName: true,
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

    if (generation.status !== "COMPLETED") {
      return NextResponse.json(
        { success: false, error: "Generation is not completed yet" },
        { status: 400 },
      );
    }

    if (!generation.generatedFiles || typeof generation.generatedFiles !== "object") {
      return NextResponse.json(
        { success: false, error: "No generated files available" },
        { status: 400 },
      );
    }

    const files = generation.generatedFiles as Record<string, string>;
    const fileEntries = Object.entries(files);

    if (fileEntries.length === 0) {
      return NextResponse.json(
        { success: false, error: "No generated files available" },
        { status: 400 },
      );
    }

    const appSlug = generation.applicationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const passthrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      logger.error("Archive creation failed", err);
      passthrough.destroy(err);
    });

    archive.pipe(passthrough);

    for (const [filename, content] of fileEntries) {
      archive.append(content, { name: filename });
    }

    archive.finalize();

    const webStream = Readable.toWeb(passthrough) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cli-bridge-${appSlug}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("Failed to download CLI generation", err);
    return NextResponse.json(
      { success: false, error: "Failed to download generation" },
      { status: 500 },
    );
  }
}
