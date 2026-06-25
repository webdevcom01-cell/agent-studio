#!/usr/bin/env node
/**
 * Wire the admin_user (BYPASSRLS) connection so `withAdminBypass()` /
 * `prismaAdmin` use a real privileged role instead of falling back to the
 * primary client. This is a prerequisite for the RLS cutover (prevents login /
 * admin / cron breakage) and is SAFE today: admin_user bypasses RLS, so these
 * code paths behave exactly as they do now.
 *
 * What it does:
 *   1. Builds  postgresql://admin_user:<ADMIN_USER_PASSWORD>@<host>/<db>
 *      reusing host/port/db (and any sslmode) from DATABASE_URL.
 *   2. Upserts the DATABASE_URL_ADMIN_USER line in .env.local (password NOT printed).
 *   3. Connects as admin_user to verify login + rolbypassrls = true.
 *
 * Usage (admin_user password must already be set on the role — see
 * set-app-user-password.mjs with ADMIN_USER_PASSWORD):
 *   ADMIN_USER_PASSWORD='the-admin-pass' node scripts/wire-admin-user.mjs
 *
 * After it succeeds: restart the dev server (Ctrl+C, pnpm dev) so Next reloads env.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const envPath = new URL("../.env.local", import.meta.url);

function readEnv() {
  try { return fs.readFileSync(envPath, "utf8"); } catch { return null; }
}

const envText = readEnv();
if (envText == null) { console.error("ERROR: .env.local not found."); process.exit(1); }
const dbm = envText.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
if (!dbm) { console.error("ERROR: DATABASE_URL not in .env.local."); process.exit(1); }

const adminPw = process.env.ADMIN_USER_PASSWORD;
if (!adminPw || adminPw.length < 8) {
  console.error("ERROR: set ADMIN_USER_PASSWORD (min 8). First set it on the role via:");
  console.error("  APP_USER_PASSWORD='<existing>' ADMIN_USER_PASSWORD='<new>' node scripts/set-app-user-password.mjs");
  process.exit(1);
}

const u = new URL(dbm[1]);
u.username = "admin_user";
u.password = adminPw; // URL() percent-encodes on toString()
const adminUrl = u.toString();

(async () => {
  // Verify the connection works and the role bypasses RLS.
  const c = new Client({ connectionString: adminUrl, ssl: false });
  await c.connect();
  const row = (await c.query(`SELECT current_user AS role, rolbypassrls AS bypass
                                FROM pg_roles WHERE rolname=current_user`)).rows[0];
  await c.end();
  if (row.role !== "admin_user" || !row.bypass) {
    console.error(`ABORT: connected as ${row.role} bypass=${row.bypass} (expected admin_user / true).`);
    process.exit(1);
  }

  // Upsert DATABASE_URL_ADMIN_USER in .env.local (do not print the secret).
  const line = `DATABASE_URL_ADMIN_USER="${adminUrl}"`;
  let next;
  if (/^DATABASE_URL_ADMIN_USER\s*=.*$/m.test(envText)) {
    next = envText.replace(/^DATABASE_URL_ADMIN_USER\s*=.*$/m, line);
  } else {
    next = envText.replace(/\n*$/, "\n") + line + "\n";
  }
  fs.writeFileSync(envPath, next);

  console.log("OK: admin_user verified (LOGIN + BYPASSRLS) and DATABASE_URL_ADMIN_USER written to .env.local.");
  console.log("Next: restart the dev server (Ctrl+C, then `pnpm dev`), then log in and");
  console.log("check that login / admin pages still work (behaviour should be unchanged).");
})().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
