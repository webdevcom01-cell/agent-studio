-- =========================================================================
-- Composite index template — RLS performance prerequisite
-- =========================================================================
-- Use to add a covering index when the audit detects an RLS-enabled table
-- WITHOUT a leading-tenant-column composite index.
--
-- Without this, RLS queries are 10-100x slower (sequential scan instead of
-- index lookup). Source: 2026 multi-tenant benchmarks.
--
-- Placeholders:
--   {{TABLE_NAME}}    — PascalCase model name
--   {{TENANT_COLUMN}} — "organizationId" (TENANT_DIRECT) or "userId" (USER_OWNED)
--                       or FK column (TENANT_INDIRECT)
--   {{EXTRA_COLUMNS}} — optional extra columns for compound queries
--                       (e.g., "createdAt DESC" for recent-items queries)

-- Basic composite index (tenant column + id for fast lookups)
CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_{{TENANT_COLUMN}}_id_idx"
  ON "{{TABLE_NAME}}" ("{{TENANT_COLUMN}}", "id");

-- Optional: extended composite for common query patterns
-- Uncomment and customize per table's access patterns:
-- CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_{{TENANT_COLUMN}}_{{EXTRA_COLUMNS}}_idx"
--   ON "{{TABLE_NAME}}" ("{{TENANT_COLUMN}}", {{EXTRA_COLUMNS}});

-- =========================================================================
-- Important: CREATE INDEX CONCURRENTLY for live tables
-- =========================================================================
-- The template above uses CREATE INDEX (not CONCURRENTLY) because Prisma
-- migrate wraps each migration file in a transaction, and CONCURRENTLY
-- cannot run inside a transaction.
--
-- For LARGE production tables (>100k rows), do the index creation OUTSIDE
-- Prisma migrate to avoid table lock:
--
--   1. Apply RLS-enable migration WITHOUT the index
--   2. Manually run via psql (NOT inside a transaction):
--      psql "$DATABASE_URL" -c "
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS
--          \"{{TABLE_NAME}}_{{TENANT_COLUMN}}_id_idx\"
--          ON \"{{TABLE_NAME}}\" (\"{{TENANT_COLUMN}}\", \"id\");
--      "
--   3. Verify with: \d+ "{{TABLE_NAME}}"
--
-- For SMALL tables (<10k rows), the in-migration CREATE INDEX is fine —
-- the brief lock is acceptable.

-- =========================================================================
-- Rollback
-- =========================================================================
-- DROP INDEX IF EXISTS "{{TABLE_NAME}}_{{TENANT_COLUMN}}_id_idx";
