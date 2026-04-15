/**
 * db.ts — PostgreSQL client for agent-studio Railway database.
 *
 * Uses `pg` (node-postgres) with a connection pool.
 * DATABASE_URL must be set in environment (Railway provides this automatically).
 */

import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "On Railway: add it in Variables → DATABASE_URL. " +
        "Locally: copy from Railway dashboard → Postgres → Connect."
      );
    }
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("railway.internal")
        ? false  // internal Railway network — no SSL needed
        : { rejectUnauthorized: false },  // external connection needs SSL
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on("error", (err) => {
      process.stderr.write(`[DB] Unexpected pool error: ${err.message}\n`);
    });
  }
  return pool;
}

/** Run a parameterized query and return all rows. */
export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** Run a parameterized query and return first row (or null). */
export async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Health check — returns true if DB is reachable. */
export async function ping(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
