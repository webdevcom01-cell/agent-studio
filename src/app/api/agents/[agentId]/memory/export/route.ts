import { NextRequest, NextResponse } from "next/server";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { exportAgentMemoryAsMarkdown } from "@/lib/memory/markdown-export";
import { logger } from "@/lib/logger";

/**
 * GET /api/agents/[agentId]/memory/export — Download MEMORY.md
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const authResult = await requireAgentOwner(agentId);
  if (isAuthError(authResult)) return authResult;

  try {
    const markdown = await exportAgentMemoryAsMarkdown(agentId);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="MEMORY-${agentId.slice(0, 8)}.md"`,
      },
    });
  } catch (error) {
    logger.error("Failed to export memory", { agentId, error });
    return NextResponse.json(
      { success: false, error: "Failed to export memory" },
      { status: 500 },
    );
  }
}
