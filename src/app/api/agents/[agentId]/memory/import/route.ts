import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { importMemoryFromMarkdown } from "@/lib/memory/markdown-export";
import { logger } from "@/lib/logger";

const MAX_IMPORT_SIZE = 1024 * 1024; // 1 MB

/**
 * POST /api/agents/[agentId]/memory/import — Upload and parse MEMORY.md
 * Body: { markdown: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const markdown = body?.markdown;

    if (typeof markdown !== "string" || !markdown.trim()) {
      return NextResponse.json(
        { success: false, error: "Request body must include a non-empty 'markdown' string" },
        { status: 422 },
      );
    }

    if (markdown.length > MAX_IMPORT_SIZE) {
      return NextResponse.json(
        { success: false, error: "Markdown content exceeds 1 MB limit" },
        { status: 413 },
      );
    }

    const result = await importMemoryFromMarkdown(agentId, markdown);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Failed to import memory", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to import memory" },
      { status: 500 },
    );
  }
}
