import { prisma, prismaAdmin } from "@/lib/prisma";
import { withOrgContext } from "@/lib/db/rls-middleware";
import { getCurrentOrgId } from "@/lib/context/org-context";
import type { Prisma, PrismaClient } from "@/generated/prisma";

/**
 * Execute Prisma operations inside an RLS-enforced transaction for the
 * currently authenticated tenant. Reads the org ID from AsyncLocalStorage —
 * the caller must have invoked runWithOrgId() (or have ALS populated via
 * the NextAuth session middleware) before calling this.
 *
 * For admin/cron routes that legitimately cross org boundaries, use
 * withAdminBypass() instead.
 */
export function withTenant<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  explicitOrgId?: string | null,
): Promise<T> {
  // When an explicit orgId is provided (e.g. threaded from RuntimeContext
  // during streaming, where AsyncLocalStorage is NOT in scope), use it.
  // Otherwise fall back to the ALS-resolved org (awaited request paths).
  const orgId =
    explicitOrgId !== undefined ? explicitOrgId : getCurrentOrgId();
  return withOrgContext(prisma, orgId, fn);
}

/**
 * Execute Prisma operations without RLS tenant isolation.
 * Use only for admin routes, cron jobs, or system operations that
 * legitimately span multiple organizations.
 */
/**
 * Resolve the admin (BYPASSRLS) client. Falls back to the primary client when
 * prismaAdmin is not available — e.g. local/dev without DATABASE_URL_ADMIN_USER,
 * or unit tests that mock only `prisma`. (Accessing a missing named export of a
 * mocked module throws under Vitest, hence the guard.)
 */
function adminClient(): PrismaClient {
  try {
    return prismaAdmin ?? prisma;
  } catch {
    return prisma;
  }
}

export function withAdminBypass<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  return fn(adminClient());
}
