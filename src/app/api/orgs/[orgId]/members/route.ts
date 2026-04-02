import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember, isAuthError } from "@/lib/api/auth-guard";

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
}
