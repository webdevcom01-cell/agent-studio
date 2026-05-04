import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { parseBodyWithLimit } from "@/lib/api/body-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ departmentId: string }>;
}

const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
});

async function loadDepartment(departmentId: string) {
  return prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, organizationId: true, name: true, description: true, parentId: true, createdAt: true, updatedAt: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { departmentId } = await params;

  const dept = await loadDepartment(departmentId);
  if (!dept) return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });

  const authResult = await requireOrgMember(dept.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const full = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        children: { select: { id: true, name: true, description: true } },
        agents: { select: { id: true, name: true, model: true } },
      },
    });

    return NextResponse.json({ success: true, data: full });
  } catch (error) {
    logger.error("GET /api/departments/[departmentId] error", { departmentId, error });
    return NextResponse.json({ success: false, error: "Failed to fetch department" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { departmentId } = await params;

  const dept = await loadDepartment(departmentId);
  if (!dept) return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });

  const authResult = await requireOrgMember(dept.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = (await parseBodyWithLimit(request)) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = UpdateDepartmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { name, description, parentId } = parsed.data;

  try {
    if (parentId !== undefined && parentId !== null) {
      if (parentId === departmentId) {
        return NextResponse.json({ success: false, error: "Department cannot be its own parent" }, { status: 422 });
      }
      const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { organizationId: true } });
      if (!parent || parent.organizationId !== dept.organizationId) {
        return NextResponse.json({ success: false, error: "Parent department not found in this org" }, { status: 422 });
      }
    }

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(parentId !== undefined && { parentId }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error("PATCH /api/departments/[departmentId] error", { departmentId, error });
    return NextResponse.json({ success: false, error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { departmentId } = await params;

  const dept = await loadDepartment(departmentId);
  if (!dept) return NextResponse.json({ success: false, error: "Department not found" }, { status: 404 });

  const authResult = await requireOrgMember(dept.organizationId, request);
  if (isAuthError(authResult)) return authResult;

  try {
    const agentCount = await prisma.agent.count({ where: { departmentId } });
    if (agentCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete department with ${agentCount} assigned agent(s). Reassign agents first.` },
        { status: 409 },
      );
    }

    await prisma.department.delete({ where: { id: departmentId } });

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error("DELETE /api/departments/[departmentId] error", { departmentId, error });
    return NextResponse.json({ success: false, error: "Failed to delete department" }, { status: 500 });
  }
}
