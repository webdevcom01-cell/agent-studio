import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId } = await params;

  const authResult = await requireOrgMember(orgId);
  if (isAuthError(authResult)) return authResult;

  try {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    logger.error("Failed to list organization members", { orgId, error });
    return NextResponse.json(
      { success: false, error: "Failed to list members" },
      { status: 500 },
    );
  }
}
