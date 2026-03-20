import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

/** Primary client — used for all writes and default reads. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

/**
 * Read replica client — used for heavy read queries (analytics, discover, search).
 * Falls back to primary when DATABASE_READ_URL is not configured.
 *
 * Configure on Railway:
 *   DATABASE_READ_URL=postgresql://...@read-replica.railway.internal:5432/railway
 */
export const prismaRead: PrismaClient = globalForPrisma.prismaRead ?? createReadClient();

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
}
