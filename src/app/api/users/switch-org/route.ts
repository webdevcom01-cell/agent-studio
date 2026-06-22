import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError } from "@/lib/api/auth-guard";
import { prisma } from "@/lib/prisma";
import { withAdminBypass } from "@/lib/api/tenant-context";
import { logger } from "@/lib/logger";

const SwitchOrgSchema = z.object({ organizationId: z.string().min(1) });

export async function POST(req: Request): Promise<NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const { userId } = authResult;

  const body = await req.json().catch(() => null);
  const parsed = SwitchOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "organizationId is required" },
      { status: 422 },
    );
  }
  const { organizationId } = parsed.data;

  try {
    // Validate membership under admin bypass: once RLS is enforced, the user's
    // CURRENT org context would otherwise filter out the TARGET org and make a
    // legitimate switch look like a 403.
    const membership = await withAdminBypass((db) => db.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { organizationId: true },
    }));

    if (!membership) {
      return NextResponse.json(
        { success: false, error: "You are not a member of this organization" },
        { status: 403 },
      );
    }

    await prisma.user.update({
      where: { id: userId },
      data: { currentOrgId: organizationId },
    });

    return NextResponse.json({ success: true, data: { currentOrgId: organizationId } });
  } catch (error) {
    logger.error("Failed to switch organization", { userId, organizationId, error });
    return NextResponse.json(
      { success: false, error: "Failed to switch organization" },
      { status: 500 },
    );
  }
}
