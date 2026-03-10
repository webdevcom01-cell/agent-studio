import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { testMCPConnection } from "@/lib/mcp/client";

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const { serverId } = await params;
    const server = await prisma.mCPServer.findFirst({
      where: { id: serverId, userId: authResult.userId },
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: "MCP server not found" },
        { status: 404 },
      );
    }

    const headers = server.headers as Record<string, string> | null;
    const result = await testMCPConnection(
      server.url,
      server.transport,
      headers ?? undefined,
    );

    if (result.success) {
      await prisma.mCPServer.update({
        where: { id: serverId },
        data: { toolsCache: result.tools },
      });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    logger.error("Failed to test MCP connection", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to test MCP connection" },
      { status: 500 },
    );
  }
}
