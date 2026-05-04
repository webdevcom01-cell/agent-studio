/**
 * RLS Middleware — sets PostgreSQL session variable `app.current_org_id`
 * before Prisma queries so Row-Level Security policies tenant-isolate results.
 *
 * PRIMARY API: withOrgContext() — use this in all API routes.
 *
 * IMPORTANT: Prisma v6 removed $use() middleware. registerRLSMiddleware()
 * is preserved for compatibility with test mocks; production wiring uses
 * withOrgContext() per-request instead of a global middleware hook.
 *
 * For admin/cron jobs that legitimately span orgs, skip withOrgContext —
 * the DATABASE_URL role has BYPASSRLS on the DB level.
 */

import { PrismaClient } from "@/generated/prisma";

export type OrgIdResolver = () => string | null;

// Opaque middleware function type — matches Prisma's legacy $use signature
// without referencing the removed MiddlewareParams type.
type MiddlewareFn = (
  params: Record<string, unknown>,
  next: (params: Record<string, unknown>) => Promise<unknown>,
) => Promise<unknown>;

// Extended client interface to allow test mocks with legacy $use.
// In production (Prisma v6), $use is not available — use withOrgContext().
interface PrismaClientWithLegacyMiddleware extends PrismaClient {
  $use?: (middleware: MiddlewareFn) => void;
}

/**
 * Registers an RLS middleware hook on a PrismaClient.
 *
 * NOTE: Prisma v6 removed $use(). This function only takes effect when the
 * client exposes $use (e.g. in tests with a mock client). For production,
 * use withOrgContext() per-request instead.
 */
export function registerRLSMiddleware(
  client: PrismaClient,
  getOrgId: OrgIdResolver,
): void {
  const extendable = client as PrismaClientWithLegacyMiddleware;

  extendable.$use?.((params, next) => {
    const orgId = getOrgId();
    if (orgId) {
      return client
        .$executeRawUnsafe(`SELECT set_config('app.current_org_id', $1, true)`, orgId)
        .then(() => next(params));
    }
    return next(params);
  });
}

/**
 * Execute Prisma operations with a specific org context.
 *
 * Sets `app.current_org_id` for the current DB session before running `fn`,
 * enabling RLS policies to automatically filter rows to that org.
 *
 * @example
 * const agents = await withOrgContext(prisma, orgId, (db) => db.agent.findMany())
 */
export async function withOrgContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (client: PrismaClient) => Promise<T>,
): Promise<T> {
  await client.$executeRawUnsafe(
    `SELECT set_config('app.current_org_id', $1, true)`,
    orgId,
  );
  return fn(client);
}
