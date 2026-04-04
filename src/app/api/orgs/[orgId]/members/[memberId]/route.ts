import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgAdmin, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ orgId: string; memberId: string }>;
}

export async function DELETE(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId, memberId } = await params;

  const authResult = await requireOrgAdmin(orgId);
  if (isAuthError(authResult)) return authResult;

  try {
    const member = await prisma.organizationMember.findUnique({
      where: { id: memberId },
      select: { userId: true, role: true, organizationId: true },
    });

    if (!member || member.organizationId !== orgId) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }

    if (member.role === "OWNER") {
      return NextResponse.json(
        { success: false, error: "Cannot remove the organization owner" },
        { status: 403 },
      );
    }

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    logger.info("Member removed from organization", {
      orgId,
      memberId,
      removedUserId: member.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to remove organization member", { orgId, memberId, error });
    return NextResponse.json(
      { success: false, error: "Failed to remove member" },
      { status: 500 },
    );
  }
}
