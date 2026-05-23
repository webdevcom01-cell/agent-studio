import { prisma } from "@/lib/prisma";
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
): Promise<T> {
  return withOrgContext(prisma, getCurrentOrgId(), fn);
}

/**
 * Execute Prisma operations without RLS tenant isolation.
 * Use only for admin routes, cron jobs, or system operations that
 * legitimately span multiple organizations.
 */
export function withAdminBypass<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  return fn(prisma);
}
