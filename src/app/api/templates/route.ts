import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma";

const VALID_CATEGORIES = ["GENERAL", "SALES", "SUPPORT", "ENGINEERING", "MARKETING"] as const;

const SaveTemplateSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.enum(VALID_CATEGORIES).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  isPublic: z.boolean().optional(),
  payload: z.record(z.unknown()),
  checksum: z.string().min(1),
  sourceAgentId: z.string().cuid().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const marketplace = searchParams.get("marketplace") === "true";
  const category = searchParams.get("category") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const orgId = searchParams.get("orgId") ?? undefined;

  if (marketplace) {
    try {
      const where: Prisma.TemplateWhereInput = {
        isPublic: true,
        ...(category && { category }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      };

      const templates = await prisma.template.findMany({
        where,
        orderBy: [{ importCount: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          tags: true,
          version: true,
          importCount: true,
          checksum: true,
          createdAt: true,
        },
      });
      return NextResponse.json({ success: true, data: templates });
    } catch (error) {
      logger.error("GET /api/templates marketplace error", { error });
      return NextResponse.json({ success: false, error: "Failed to list templates" }, { status: 500 });
    }
  }

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId or marketplace=true required" }, { status: 400 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const templates = await prisma.template.findMany({
      where: {
        organizationId: orgId,
        ...(category && { category }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    logger.error("GET /api/templates error", { orgId, error });
    return NextResponse.json({ success: false, error: "Failed to list templates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = SaveTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { organizationId, name, description, category, tags, isPublic, payload, checksum, sourceAgentId } =
    parsed.data;

  const orgAuth = await requireOrgMember(organizationId, request);
  if (isAuthError(orgAuth)) return orgAuth;

  try {
    const template = await prisma.template.create({
      data: {
        organizationId,
        name,
        description: description ?? null,
        category: category ?? "GENERAL",
        tags: tags ?? [],
        isPublic: isPublic ?? false,
        payload: payload as object,
        checksum,
        sourceAgentId: sourceAgentId ?? null,
      },
    });
    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/templates error", { organizationId, error });
    return NextResponse.json({ success: false, error: "Failed to save template" }, { status: 500 });
  }
}
