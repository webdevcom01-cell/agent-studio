import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { AgentExportData } from "@/lib/schemas/agent-export";
import { parseFlowContent } from "@/lib/validators/flow-content";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { logger } from "@/lib/logger";
import { exportTemplate } from "@/lib/templates/template-engine";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const ClipmartExportSchema = z.object({
  save: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  category: z.enum(["GENERAL", "SALES", "SUPPORT", "ENGINEERING", "MARKETING"]).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown> = {};
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    // empty body is fine — just export without saving
  }

  const parsed = ClipmartExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { organizationId: true },
  });
  if (!agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  const organizationId = agent.organizationId ?? authResult.userId;

  try {
    const { payload, checksum } = await exportTemplate(agentId, organizationId);

    let templateId: string | undefined;

    if (parsed.data.save) {
      const name = parsed.data.name ?? `Export of ${agentId}`;
      const template = await prisma.template.create({
        data: {
          organizationId,
          name,
          description: parsed.data.description ?? null,
          category: parsed.data.category ?? "GENERAL",
          tags: parsed.data.tags ?? [],
          isPublic: parsed.data.isPublic ?? false,
          payload: payload as object,
          checksum,
          sourceAgentId: agentId,
        },
      });
      templateId = template.id;
    }

    return NextResponse.json({ success: true, data: { payload, checksum, templateId } });
  } catch (error) {
    logger.error("POST /api/agents/[agentId]/export error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to export agent" }, { status: 500 });
  }
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

    const flowContent = parseFlowContent(agent.flow.content);

    const exportData: AgentExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      agent: {
        name: agent.name,
        description: agent.description ?? "",
        systemPrompt: agent.systemPrompt ?? "You are a helpful assistant.",
        model: agent.model ?? "gpt-4.1-mini",
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
