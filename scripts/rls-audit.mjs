#!/usr/bin/env node
/**
 * READ-ONLY RLS production audit. Captures the ACTUAL deployed state of the
 * database (which may differ from the migrations in the repo) so the rollout
 * plan is grounded in reality, not assumptions.
 *
 * Performs NO writes. Run from the repo root:
 *   node scripts/rls-audit.mjs
 *
 * Reads DATABASE_URL from .env.local (falls back to .env). Requires the `pg`
 * package (already a dependency).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

function loadDatabaseUrl() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const m = txt.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

const cs = loadDatabaseUrl();
if (!cs) {
  console.error("ERROR: DATABASE_URL not found in .env.local or .env");
  process.exit(1);
}

const q = (c, sql) => c.query(sql).then((r) => r.rows);

(async () => {
  const c = new Client({ connectionString: cs, ssl: false });
  await c.connect();

  console.log("\n========== 1. CONNECTION ROLE ==========");
  console.table(
    await q(c, `SELECT current_user AS role, rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
                  FROM pg_roles WHERE rolname = current_user`),
  );

  console.log("\n========== 2. RLS ROLES (app_user / admin_user) ==========");
  console.table(
    await q(c, `SELECT r.rolname AS role, r.rolcanlogin AS can_login, r.rolsuper AS superuser,
                       r.rolbypassrls AS bypasses_rls, (a.rolpassword IS NOT NULL) AS has_password
                  FROM pg_roles r LEFT JOIN pg_authid a ON a.oid = r.oid
                 WHERE r.rolname IN ('postgres','app_user','admin_user') ORDER BY r.rolname`),
  );

  console.log("\n========== 3. RLS COVERAGE (tables with rowsecurity / forced) ==========");
  const cov = await q(c, `SELECT count(*) FILTER (WHERE relrowsecurity) AS rls_enabled,
                                 count(*) FILTER (WHERE relforcerowsecurity) AS forced
                            FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace`);
  console.table(cov);
  console.log("Tables WITH rls enabled:");
  console.table(await q(c, `SELECT relname AS table FROM pg_class
                             WHERE relkind='r' AND relnamespace='public'::regnamespace AND relrowsecurity
                             ORDER BY relname`));

  console.log("\n========== 4. POLICY COUNT PER TABLE ==========");
  console.table(await q(c, `SELECT tablename AS table, count(*)::int AS policies
                              FROM pg_policies WHERE schemaname='public'
                              GROUP BY tablename ORDER BY tablename`));

  console.log("\n========== 5. app_user TABLE PRIVILEGES (tables it CANNOT SELECT) ==========");
  console.table(await q(c, `SELECT t.tablename AS table
                              FROM pg_tables t
                             WHERE t.schemaname='public'
                               AND NOT has_table_privilege('app_user', format('public.%I', t.tablename), 'SELECT')
                             ORDER BY t.tablename`).catch((e) => [{ error: e.message }]));

  console.log("\n========== 6. NULL Agent.organizationId (must be 0 before app_user switch) ==========");
  console.table(await q(c, `SELECT count(*)::int AS null_org_agents FROM "Agent" WHERE "organizationId" IS NULL`));

  console.log("\n========== 7. COMPOSITE INDEXES on organizationId ==========");
  console.table(await q(c, `SELECT tablename AS table, indexname AS index
                              FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%organizationId%'
                              ORDER BY tablename`));

  console.log("\n========== 8. APPLIED RLS MIGRATIONS ==========");
  console.table(await q(c, `SELECT migration_name, finished_at
                              FROM "_prisma_migrations"
                             WHERE migration_name ILIKE '%rls%' OR migration_name ILIKE '%role%'
                             ORDER BY migration_name`).catch((e) => [{ error: e.message }]));

  console.log("\n========== 9. TENANTS (orgs) + agents per org ==========");
  console.table(await q(c, `SELECT o.name AS org, count(a.id)::int AS agents
                              FROM "Organization" o LEFT JOIN "Agent" a ON a."organizationId"=o.id
                             GROUP BY o.name ORDER BY agents DESC`));

  await c.end();
  console.log("\nDONE — read-only audit complete. Paste this output back to review against the plan.");
})().catch((e) => {
  console.error("Audit failed:", e.message);
  process.exit(1);
});
