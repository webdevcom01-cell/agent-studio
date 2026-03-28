import { getConnection } from "./connection-pool";
import { resolveTemplate } from "@/lib/runtime/template";

const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE)\b/i;

const DEFAULT_MAX_ROWS = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
  executionTimeMs: number;
}

interface ExecuteOptions {
  dbType: string;
  connectionString: string;
  query: string;
  params: unknown[];
  readOnly: boolean;
  maxRows: number;
  timeoutMs: number;
  variables: Record<string, unknown>;
}

export async function executeQuery(options: ExecuteOptions): Promise<QueryResult> {
  const {
    dbType,
    connectionString,
    query,
    params,
    readOnly,
    maxRows,
    timeoutMs,
    variables,
  } = options;

  if (!connectionString) {
    throw new Error("No database connection string provided");
  }

  const resolvedQuery = resolveTemplate(query, variables);

  if (readOnly && WRITE_PATTERN.test(resolvedQuery)) {
    throw new Error("Write operations are blocked in read-only mode");
  }

  const effectiveMaxRows = maxRows || DEFAULT_MAX_ROWS;
  const effectiveTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;

  const client = await getConnection(dbType, connectionString);

  const start = Date.now();

  const result = await Promise.race([
    client.query(resolvedQuery, params),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Query timed out after ${effectiveTimeout}ms`)),
        effectiveTimeout,
      ),
    ),
  ]);

  const executionTimeMs = Date.now() - start;

  const truncatedRows = result.rows.slice(0, effectiveMaxRows);
  const columns =
    truncatedRows.length > 0 ? Object.keys(truncatedRows[0]) : [];

  return {
    rows: truncatedRows,
    rowCount: result.rowCount,
    columns,
    executionTimeMs,
  };
}
