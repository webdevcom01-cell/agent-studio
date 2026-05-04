import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentOwner, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { grantPermission } from "@/lib/org-chart/hierarchy";

interface RouteParams {
  params: Promise<{ agentId: string }>;
}

const GrantPermissionSchema = z.object({
  grantorAgentId: z.string().cuid(),
  permission: z.string().min(1).max(100),
  scope: z.string().max(200).optional(),
  expiresAt: z.string().datetime().optional(),
  organizationId: z.string().cuid(),
});

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const grants = await prisma.agentPermissionGrant.findMany({
      where: { granteeAgentId: agentId },
      orderBy: { createdAt: "desc" },
      include: {
        grantor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: grants });
  } catch (error) {
    logger.error("GET /api/agents/[agentId]/permissions error", { agentId, error });
    return NextResponse.json({ success: false, error: "Failed to list permissions" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { agentId } = await params;

  const authResult = await requireAgentOwner(agentId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = GrantPermissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { grantorAgentId, permission, scope, expiresAt, organizationId } = parsed.data;

  try {
    const grant = await grantPermission(
      grantorAgentId,
      agentId,
      organizationId,
      permission,
      scope,
      expiresAt ? new Date(expiresAt) : undefined,
    );

    return NextResponse.json({ success: true, data: grant }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ancestor")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 422 });
    }
    logger.error("POST /api/agents/[agentId]/permissions error", { agentId, grantorAgentId, error });
    return NextResponse.json({ success: false, error: "Failed to grant permission" }, { status: 500 });
  }
}
