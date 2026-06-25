#!/usr/bin/env node
/**
 * READ-ONLY proof that RLS actually isolates tenants — run BEFORE any app cutover.
 *
 * Connects to the DB as the non-superuser `app_user` role (NOBYPASSRLS), sets
 * app.current_org_id to each tenant's org, and verifies it sees ONLY that
 * tenant's agents. Also re-runs the corrected app_user grant check (§5 fix).
 *
 * Performs NO writes. Changes NOTHING about the running app. Run from repo root:
 *   APP_USER_PASSWORD='<app_user password>' node scripts/rls-prove-isolation.mjs
 *
 * The app_user password: whatever was set via Railway console (or the migration
 * placeholder 'CHANGE_ME_VIA_RAILWAY_CONSOLE' if never rotated). You pass it via
 * the env var so it is never written to a file and never shown to anyone else.
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

const adminCs = loadDatabaseUrl();
if (!adminCs) {
  console.error("ERROR: DATABASE_URL not found in .env.local or .env");
  process.exit(1);
}
const pw = process.env.APP_USER_PASSWORD;
if (!pw) {
  console.error("ERROR: set APP_USER_PASSWORD env var (the app_user role password).");
  console.error("  APP_USER_PASSWORD='...' node scripts/rls-prove-isolation.mjs");
  process.exit(1);
}

// Build an app_user connection string reusing host/port/db from DATABASE_URL.
const u = new URL(adminCs);
u.username = "app_user";
u.password = pw;
const appCs = u.toString();

const q = (c, sql, params) => c.query(sql, params).then((r) => r.rows);

(async () => {
  // 1) admin connection (postgres) — list orgs + expected counts (ground truth).
  const admin = new Client({ connectionString: adminCs, ssl: false });
  await admin.connect();
  const truth = await q(
    admin,
    `SELECT o.id, o.name, count(a.id)::int AS expected
       FROM "Organization" o LEFT JOIN "Agent" a ON a."organizationId"=o.id
      GROUP BY o.id, o.name ORDER BY expected DESC`,
  );
  await admin.end();

  // 2) app_user connection — must be NOBYPASSRLS.
  const app = new Client({ connectionString: appCs, ssl: false });
  await app.connect();
  const who = (await q(app, `SELECT current_user AS role, rolbypassrls AS bypass
                               FROM pg_roles WHERE rolname=current_user`))[0];
  console.log("\n== Connected as ==");
  console.table([who]);
  if (who.bypass) {
    console.error("ABORT: app_user has BYPASSRLS — RLS would not be enforced. Fix the role.");
    await app.end();
    process.exit(1);
  }

  // §5 fix — tables app_user CANNOT SELECT (should be empty).
  console.log("\n== §5 Tables app_user CANNOT SELECT (want: none) ==");
  const noSelect = await q(
    app,
    `SELECT tablename FROM pg_tables t
      WHERE schemaname='public'
        AND to_regclass(quote_ident('public')||'.'||quote_ident(tablename)) IS NOT NULL
        AND NOT has_table_privilege(current_user, quote_ident('public')||'.'||quote_ident(tablename),'SELECT')
      ORDER BY tablename`,
  );
  console.table(noSelect.length ? noSelect : [{ tablename: "(none — all SELECTable)" }]);

  // 3) Per-tenant isolation proof.
  console.log("\n== Tenant isolation proof (app_user sees ONLY its org) ==");
  const results = [];
  for (const org of truth) {
    await app.query(`SELECT set_config('app.current_org_id', $1, false)`, [org.id]);
    const seen = (await q(app, `SELECT count(*)::int AS n FROM "Agent"`))[0].n;
    results.push({
      org: org.name,
      expected: org.expected,
      app_user_sees: seen,
      verdict: seen === org.expected ? "PASS ✅" : "MISMATCH ❌",
    });
  }
  // No-org context → should see 0.
  await app.query(`SELECT set_config('app.current_org_id', $1, false)`, [""]);
  const none = (await q(app, `SELECT count(*)::int AS n FROM "Agent"`))[0].n;
  results.push({ org: "(no org set)", expected: 0, app_user_sees: none, verdict: none === 0 ? "PASS ✅" : "LEAK ❌" });
  console.table(results);

  const allPass = results.every((r) => r.verdict.startsWith("PASS"));
  console.log(allPass
    ? "\nRESULT: ✅ RLS isolates tenants correctly under app_user. Safe to plan cutover."
    : "\nRESULT: ❌ Isolation NOT clean — investigate before any cutover.");

  await app.end();
})().catch((e) => {
  console.error("Proof failed:", e.message);
  process.exit(1);
});
