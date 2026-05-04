import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ templateId: string }>;
}

const VALID_CATEGORIES = ["GENERAL", "SALES", "SUPPORT", "ENGINEERING", "MARKETING"] as const;

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isPublic: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { templateId } = await params;

  try {
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    if (!template.isPublic) {
      const authResult = await requireOrgMember(template.organizationId, request);
      if (isAuthError(authResult)) return authResult;
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    logger.error("GET /api/templates/[templateId] error", { templateId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch template" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { templateId } = await params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, organizationId: true },
  });
  if (!template) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });

  const authResult = await requireOrgMember(template.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  try {
    const updated = await prisma.template.update({
      where: { id: templateId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.category !== undefined && { category: parsed.data.category }),
        ...(parsed.data.tags !== undefined && { tags: parsed.data.tags }),
        ...(parsed.data.isPublic !== undefined && { isPublic: parsed.data.isPublic }),
      },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PATCH /api/templates/[templateId] error", { templateId, error });
    return NextResponse.json({ success: false, error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { templateId } = await params;

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, organizationId: true },
  });
  if (!template) return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });

  const authResult = await requireOrgMember(template.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    await prisma.template.delete({ where: { id: templateId } });
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/templates/[templateId] error", { templateId, error });
    return NextResponse.json({ success: false, error: "Failed to delete template" }, { status: 500 });
  }
}
