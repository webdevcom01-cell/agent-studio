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

import { PrismaClient, Prisma } from "@/generated/prisma";

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
 * @deprecated Prisma v6 removed $use(). This function only takes effect when
 * the client exposes $use (e.g. in tests with a mock client). For production,
 * use withOrgContext() per-request instead. Kept for backwards-compatible test
 * coverage; will be removed once dependent tests migrate.
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
 * Wraps `fn` in a `$transaction` and sets `app.current_org_id` inside that
 * transaction before executing the callback. RLS policies on tenant tables
 * read this session variable to filter rows to the caller's org.
 *
 * WHY $transaction: without it, `set_config` and the subsequent queries may
 * land on different connections from the pool, causing the session variable
 * to evaporate. $transaction pins a single connection for the duration of
 * `fn`, so the session variable is guaranteed to persist across queries.
 *
 * Use `tx` (the transaction client passed to `fn`) for all queries inside
 * the callback — using the outer `client` will bypass the org context.
 *
 * @example
 * const agents = await withOrgContext(prisma, orgId, (tx) => tx.agent.findMany())
 */
export async function withOrgContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
      return fn(tx);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5000,
      timeout: 30000,
    },
  );
}
