import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

const updateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  transport: z.enum(["STREAMABLE_HTTP", "SSE"]).optional(),
  headers: z.record(z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function getOwnedServer(serverId: string, userId: string) {
  return prisma.mCPServer.findFirst({
    where: { id: serverId, userId },
  });
}

export async function GET(
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
      include: {
        agents: {
          include: {
            agent: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!server) {
      return NextResponse.json(
        { success: false, error: "MCP server not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: server });
  } catch (err) {
    logger.error("Failed to get MCP server", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to get MCP server" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
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
    const existing = await getOwnedServer(serverId, session.user.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "MCP server not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.url !== undefined) updateData.url = parsed.data.url;
    if (parsed.data.transport !== undefined) updateData.transport = parsed.data.transport;
    if (parsed.data.headers !== undefined) updateData.headers = parsed.data.headers;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;

    const server = await prisma.mCPServer.update({
      where: { id: serverId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: server });
  } catch (err) {
    logger.error("Failed to update MCP server", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to update MCP server" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const existing = await getOwnedServer(serverId, session.user.id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "MCP server not found" },
        { status: 404 },
      );
    }

    await prisma.mCPServer.delete({ where: { id: serverId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Failed to delete MCP server", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { success: false, error: "Failed to delete MCP server" },
      { status: 500 },
    );
  }
}
