/**
 * get-rls-client.ts — Test helper for creating Prisma clients with explicit role.
 *
 * Use in RLS verification tests to obtain a client connected as `app_user`
 * (RLS-enforced) or `admin_user` (BYPASSRLS).
 *
 * Note: Tests using app_user MUST wrap queries in `withRLSContext()` below to
 * set the session variables. Otherwise queries will return empty.
 */

import { PrismaClient, Prisma } from "@/generated/prisma";

export type TenantContext = {
  organizationId: string;
  userId: string;
};

export type RLSClient = {
  prisma: PrismaClient;
  role: "app_user" | "admin_user" | "postgres";
  cleanup: () => Promise<void>;
};

/**
 * Get a Prisma client connected as the specified role.
 *
 * @param role - 'app_user' (RLS-enforced), 'admin_user' (BYPASSRLS), or 'postgres' (dev fallback)
 * @returns Client + cleanup function (call in afterAll)
 */
export async function getRLSClient(
  role: "app_user" | "admin_user" | "postgres" = "app_user"
): Promise<RLSClient> {
  let url: string | undefined;
  switch (role) {
    case "app_user":
      url = process.env.DATABASE_URL_APP_USER;
      break;
    case "admin_user":
      url = process.env.DATABASE_URL_ADMIN_USER;
      break;
    case "postgres":
      url = process.env.DATABASE_URL;
      break;
  }

  if (!url) {
    throw new Error(
      `getRLSClient: env var for role '${role}' is not set. ` +
        `Expected DATABASE_URL_${role.toUpperCase()}.`
    );
  }

  const prisma = new PrismaClient({ datasourceUrl: url });

  return {
    prisma,
    role,
    cleanup: async () => {
      await prisma.$disconnect();
    },
  };
}

/**
 * Run a function with RLS tenant context set within a single transaction.
 *
 * Wraps the callback in $transaction(), sets both `app.current_org_id` and
 * `app.current_user_id` session variables (LOCAL to the transaction), then
 * invokes the callback with the transaction client.
 *
 * The session variables persist for all queries inside the transaction but
 * disappear when the transaction commits/rolls back.
 *
 * @param client - Prisma client (typically from getRLSClient('app_user'))
 * @param ctx - Tenant context (organizationId + userId)
 * @param fn - Callback that uses the transaction client
 */
export async function withRLSContext<T>(
  client: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ctx.organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}

/**
 * Verify the session variables are actually set inside a transaction.
 * Useful for debugging "why are my queries returning empty?" issues.
 */
export async function debugRLSContext(
  client: PrismaClient,
  ctx: TenantContext
): Promise<{ orgId: string; userId: string }> {
  return withRLSContext(client, ctx, async (tx: Prisma.TransactionClient) => {
    const orgResult = await tx.$queryRaw<{ val: string }[]>`
      SELECT current_setting('app.current_org_id', true) AS val
    `;
    const userResult = await tx.$queryRaw<{ val: string }[]>`
      SELECT current_setting('app.current_user_id', true) AS val
    `;
    return {
      orgId: orgResult[0]?.val ?? "",
      userId: userResult[0]?.val ?? "",
    };
  });
}
