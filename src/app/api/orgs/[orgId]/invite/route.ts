import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgAdmin, isAuthError } from "@/lib/api/auth-guard";
import { sendEmail } from "@/lib/email/client";
import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]).default("MEMBER"),
});

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { orgId } = await params;

  const authResult = await requireOrgAdmin(orgId);
  if (isAuthError(authResult)) return authResult;

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { email, role } = parsed.data;

  // Check if already a member
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: existingUser.id,
          organizationId: orgId,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: "User is already a member" },
        { status: 409 },
      );
    }
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  const invitation = await prisma.invitation.create({
    data: {
      email,
      organizationId: orgId,
      role: role as "ADMIN" | "MEMBER" | "VIEWER",
      token,
      expiresAt,
    },
  });

  await sendEmail({
    to: email,
    subject: `You're invited to ${org?.name ?? "an organization"} on Agent Studio`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px;">You're invited!</h1>
        <p>You've been invited to join <strong>${org?.name ?? "an organization"}</strong> as a ${role.toLowerCase()}.</p>
        <p>This invitation expires in 7 days.</p>
        <p style="color: #888; font-size: 14px;">Invitation token: ${token.slice(0, 8)}...</p>
      </div>
    `,
  });

  logger.info("Invitation sent", { orgId, email, role });

  return NextResponse.json({
    success: true,
    data: { invitationId: invitation.id, expiresAt },
  });
}
