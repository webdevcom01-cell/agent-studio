import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { importTemplate, validateTemplatePayload } from "@/lib/templates/template-engine";
import type { TemplatePayload } from "@/lib/templates/template-engine";

interface RouteParams {
  params: Promise<{ templateId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { templateId } = await params;

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const orgId = (body.organizationId as string | undefined) ?? undefined;
  if (!orgId) {
    return NextResponse.json({ success: false, error: "organizationId required" }, { status: 422 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  const { valid, errors } = validateTemplatePayload(template.payload);
  if (!valid) {
    return NextResponse.json(
      { success: false, error: `Stored template is invalid: ${errors.join(", ")}` },
      { status: 422 },
    );
  }

  try {
    const result = await importTemplate(
      template.payload as unknown as TemplatePayload,
      template.checksum,
      orgId,
    );

    await prisma.template.update({
      where: { id: templateId },
      data: { importCount: { increment: 1 } },
    });

    logger.info("Template imported from marketplace", { templateId, orgId, agentId: result.agentId });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    logger.error("POST /api/templates/[templateId]/import error", { templateId, orgId, error });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
