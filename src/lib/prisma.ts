import { PrismaClient } from "@/generated/prisma";

// RLS NOTE: For tenant-isolated queries, use withOrgContext(prisma, orgId, fn)
// from '@/lib/db/rls-middleware'. Direct prisma usage in API routes should
// always be wrapped. Admin/cron jobs bypass RLS via BYPASSRLS on the DB role.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
  prismaAdmin: PrismaClient | undefined;
};

/** Primary client — used for all writes and default reads. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

/**
 * Read replica client — used for heavy read queries (analytics, discover, search).
 * Falls back to primary when DATABASE_READ_URL is not configured.
 *
 * Set DATABASE_READ_URL env var to enable read replica routing.
 */
export const prismaRead: PrismaClient = globalForPrisma.prismaRead ?? createReadClient();

/**
 * Admin client — BYPASSRLS connection (admin_user role) for system/cron work
 * and for resolving tenant context (e.g. agent→org) before RLS context is set.
 * Uses DATABASE_URL_ADMIN_USER. Falls back to the primary client when that env
 * var is not set, so behavior is unchanged until the dedicated role is wired in.
 */
export const prismaAdmin: PrismaClient = globalForPrisma.prismaAdmin ?? createAdminClient();

function createAdminClient(): PrismaClient {
  const adminUrl = process.env.DATABASE_URL_ADMIN_USER;
  if (!adminUrl) return prisma;

  return new PrismaClient({
    datasourceUrl: adminUrl,
  });
}

function createReadClient(): PrismaClient {
  const readUrl = process.env.DATABASE_READ_URL;
  if (!readUrl) return prisma;

  return new PrismaClient({
    datasourceUrl: readUrl,
  });
}

/**
 * Measures replication lag between primary and read replica.
 * Returns lag in milliseconds, or null if read replica is not configured.
 */
export async function measureReplicationLag(): Promise<number | null> {
  if (!process.env.DATABASE_READ_URL) return null;

  try {
    const [primaryResult] = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
    const [replicaResult] = await prismaRead.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;

    const lagMs = Math.abs(primaryResult.now.getTime() - replicaResult.now.getTime());
    return lagMs;
  } catch {
    return null;
  }
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRead = prismaRead;
  globalForPrisma.prismaAdmin = prismaAdmin;
}
