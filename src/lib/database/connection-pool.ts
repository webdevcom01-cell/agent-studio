import { logger } from "@/lib/logger";

interface PoolEntry {
  client: PoolClient;
  lastUsedAt: number;
  dbType: string;
}

interface PoolClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  end(): Promise<void>;
}

const pool = new Map<string, PoolEntry>();
const MAX_IDLE_MS = 300_000;

export async function getConnection(
  dbType: string,
  connectionString: string,
): Promise<PoolClient> {
  const key = `${dbType}:${connectionString}`;
  const existing = pool.get(key);

  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.client;
  }

  const client = await createClient(dbType, connectionString);
  pool.set(key, { client, lastUsedAt: Date.now(), dbType });
  return client;
}

async function createClient(
  dbType: string,
  connectionString: string,
): Promise<PoolClient> {
  switch (dbType) {
    case "mysql": {
      const mysql = await import("mysql2/promise");
      const conn = await mysql.createConnection(connectionString);
      return {
        async query(sql: string, params?: unknown[]) {
          const values = (params ?? []) as (string | number | boolean | null | Buffer)[];
          const [rows] = await conn.execute(sql, values);
          const resultRows = Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
          return { rows: resultRows, rowCount: resultRows.length };
        },
        async end() {
          await conn.end();
        },
      };
    }

    case "sqlite": {
      const BetterSqlite3 = (await import("better-sqlite3")).default;
      const db = new BetterSqlite3(connectionString);
      return {
        async query(sql: string, params?: unknown[]) {
          const stmt = db.prepare(sql);
          if (sql.trim().toUpperCase().startsWith("SELECT") || sql.trim().toUpperCase().startsWith("WITH")) {
            const rows = stmt.all(...(params ?? [])) as Record<string, unknown>[];
            return { rows, rowCount: rows.length };
          }
          const info = stmt.run(...(params ?? []));
          return { rows: [], rowCount: info.changes };
        },
        async end() {
          db.close();
        },
      };
    }

    case "postgres":
    default: {
      const { Pool } = await import("pg");
      const pgPool = new Pool({ connectionString, max: 3 });
      return {
        async query(sql: string, params?: unknown[]) {
          const result = await pgPool.query(sql, params);
          return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 };
        },
        async end() {
          await pgPool.end();
        },
      };
    }
  }
}

export function releaseIdleConnections(): void {
  const now = Date.now();
  for (const [key, entry] of pool) {
    if (now - entry.lastUsedAt > MAX_IDLE_MS) {
      entry.client.end().catch((err) =>
        logger.warn("Failed to close idle connection", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      pool.delete(key);
    }
  }
}

export function closeAllConnections(): void {
  for (const [key, entry] of pool) {
    entry.client.end().catch(() => {});
    pool.delete(key);
  }
}
