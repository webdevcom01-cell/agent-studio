import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AgentExportData } from "@/lib/schemas/agent-export";
import type { FlowContent } from "@/types";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { agentId } = await params;
    const authResult = await requireAgentOwner(agentId);
    if (isAuthError(authResult)) return authResult;

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { flow: true },
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, error: "Agent not found" },
        { status: 404 }
      );
    }

    if (!agent.flow) {
      return NextResponse.json(
        { success: false, error: "Agent has no flow" },
        { status: 404 }
      );
    }

    const flowContent = agent.flow.content as unknown as FlowContent;

    const exportData: AgentExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      agent: {
        name: agent.name,
        description: agent.description ?? "",
        systemPrompt: agent.systemPrompt ?? "You are a helpful assistant.",
        model: agent.model ?? "deepseek-chat",
      },
      flow: {
        nodes: flowContent.nodes ?? [],
        edges: flowContent.edges ?? [],
        variables: flowContent.variables ?? [],
      },
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${agent.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.agent.json"`,
      },
    });
  } catch (err) {
    logger.error("Failed to export agent", err);
    return NextResponse.json(
      { success: false, error: "Failed to export agent" },
      { status: 500 }
    );
  }
}
