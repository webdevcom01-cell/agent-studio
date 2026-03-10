import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const linkServerSchema = z.object({
  mcpServerId: z.string().min(1, "mcpServerId is required"),
  enabledTools: z.array(z.string()).optional(),
});

const unlinkServerSchema = z.object({
  mcpServerId: z.string().min(1, "mcpServerId is required"),
});

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const agentMCPServers = await prisma.agentMCPServer.findMany({
      where: { agentId },
      include: {
        mcpServer: {
          select: {
            id: true,
            name: true,
            url: true,
            transport: true,
            enabled: true,
            toolsCache: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: agentMCPServers });
  } catch (err) {
    logger.error("Failed to list agent MCP servers", err);
    return NextResponse.json(
      { success: false, error: "Failed to list agent MCP servers" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const parsed = linkServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const server = await prisma.mCPServer.findFirst({
      where: { id: parsed.data.mcpServerId, userId: authResult.userId },
    });
    if (!server) {
      return NextResponse.json(
        { success: false, error: "MCP server not found" },
        { status: 404 },
      );
    }

    const link = await prisma.agentMCPServer.create({
      data: {
        agentId,
        mcpServerId: parsed.data.mcpServerId,
        enabledTools: parsed.data.enabledTools ?? undefined,
      },
      include: {
        mcpServer: {
          select: { id: true, name: true, url: true, transport: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (err) {
    const errCode = err instanceof Error && "code" in err ? (err as { code: string }).code : null;
    if (errCode === "P2002") {
      return NextResponse.json(
        { success: false, error: "Server already linked to this agent" },
        { status: 409 },
      );
    }
    logger.error("Failed to link MCP server to agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to link MCP server to agent" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const body = await request.json();
    const parsed = unlinkServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const link = await prisma.agentMCPServer.findUnique({
      where: {
        agentId_mcpServerId: {
          agentId,
          mcpServerId: parsed.data.mcpServerId,
        },
      },
    });

    if (!link) {
      return NextResponse.json(
        { success: false, error: "Link not found" },
        { status: 404 },
      );
    }

    await prisma.agentMCPServer.delete({
      where: { id: link.id },
    });

    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    logger.error("Failed to unlink MCP server from agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to unlink MCP server from agent" },
      { status: 500 },
    );
  }
}
