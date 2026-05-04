import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const CreateDepartmentSchema = z.object({
  organizationId: z.string().cuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().cuid().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const orgId = request.nextUrl.searchParams.get("orgId");

  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId query param required" }, { status: 400 });
  }

  const authResult = await requireOrgMember(orgId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const departments = await prisma.department.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { agents: true, children: true } },
      },
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error) {
    logger.error("GET /api/departments error", { orgId, error });
    return NextResponse.json({ success: false, error: "Failed to list departments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = CreateDepartmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { organizationId, name, description, parentId } = parsed.data;

  const authResult = await requireOrgMember(organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    if (parentId) {
      const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { organizationId: true } });
      if (!parent || parent.organizationId !== organizationId) {
        return NextResponse.json({ success: false, error: "Parent department not found in this org" }, { status: 422 });
      }
    }

    const department = await prisma.department.create({
      data: { name, description, organizationId, parentId: parentId ?? null },
    });

    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/departments error", { organizationId, error });
    return NextResponse.json({ success: false, error: "Failed to create department" }, { status: 500 });
  }
}
