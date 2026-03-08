import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { serverId } = await params;
    const server = await prisma.mCPServer.findFirst({
      where: { id: serverId, userId: session.user.id },
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
