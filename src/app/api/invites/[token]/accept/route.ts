import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { logger } from "@/lib/logger";
import { writeAuditLog } from "@/lib/security/audit";

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { token } = await params;

  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { organization: { select: { name: true } } },
    });

    if (!invitation) {
      return NextResponse.json(
        { success: false, error: "Invitation not found" },
        { status: 404 },
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { success: false, error: "Invitation already accepted" },
        { status: 409 },
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: "Invitation has expired" },
        { status: 410 },
      );
    }

    // Verify the authenticated user matches the invited email
    const user = await prisma.user.findUnique({
      where: { id: authResult.userId },
      select: { email: true },
    });

    if (user?.email !== invitation.email) {
      return NextResponse.json(
        { success: false, error: "This invitation was sent to a different email address" },
        { status: 403 },
      );
    }

    // Create membership + mark invitation accepted in a transaction
    await prisma.$transaction([
      prisma.organizationMember.create({
        data: {
          userId: authResult.userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    logger.info("Invitation accepted", {
      userId: authResult.userId,
      orgId: invitation.organizationId,
      role: invitation.role,
    });

    void writeAuditLog({
      userId: authResult.userId,
      action: "CREATE",
      resourceType: "org_member",
      resourceId: invitation.organizationId,
      after: { userId: authResult.userId, role: invitation.role, via: "invitation" },
    });

    return NextResponse.json({
      success: true,
      data: {
        organizationId: invitation.organizationId,
        organizationName: invitation.organization.name,
        role: invitation.role,
      },
    });
  } catch (error) {
    logger.error("Failed to accept invitation", { userId: authResult.userId, error });
    return NextResponse.json(
      { success: false, error: "Failed to accept invitation" },
      { status: 500 },
    );
  }
}
