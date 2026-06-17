import { withAdminBypass } from "@/lib/api/tenant-context";

/**
 * Ensure the user has at least one organization membership.
 *
 * If the user already belongs to an org, returns that org id. Otherwise creates
 * a personal organization with the user as OWNER and returns the new org id.
 *
 * Runs via {@link withAdminBypass} because `Organization` and `OrganizationMember`
 * are RLS-protected — provisioning happens outside any tenant context (there is
 * no org yet). Idempotent and race-safe: the per-user slug is unique, so a
 * concurrent create loses the race and we re-read the winner.
 */
export async function ensurePersonalOrg(
  userId: string,
  label?: string | null,
): Promise<string> {
  return withAdminBypass(async (db) => {
    const existing = await db.organizationMember.findFirst({
      where: { userId },
      select: { organizationId: true },
      orderBy: { joinedAt: "asc" },
    });
    if (existing) return existing.organizationId;

    const name = `${label?.trim() || "My"} (Personal)`;
    const slug = `personal-${userId}`;

    try {
      const org = await db.organization.create({
        data: {
          name,
          slug,
          members: { create: { userId, role: "OWNER" } },
        },
        select: { id: true },
      });
      return org.id;
    } catch {
      // Lost a race (unique slug / membership already created) — re-read winner.
      const winner = await db.organizationMember.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { joinedAt: "asc" },
      });
      if (winner) return winner.organizationId;
      throw new Error(`Failed to provision personal org for user ${userId}`);
    }
  });
}
