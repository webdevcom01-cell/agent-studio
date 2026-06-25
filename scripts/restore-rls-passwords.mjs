#!/usr/bin/env node
/**
 * Restore app_user / admin_user role passwords to the ORIGINAL values that
 * .env.test (and CI) expect. We rotated these during the isolation proof; that
 * rotation broke .env.test and would break CI's test:rls. This undoes it so the
 * system returns to its known-good state. The deliberate rotation belongs to the
 * real cutover (Phase 3), coordinated with all consumers.
 *
 * What it does:
 *   1. Reads the ORIGINAL app_user/admin_user passwords from .env.test
 *      (DATABASE_URL_APP_USER / DATABASE_URL_ADMIN_USER).
 *   2. Connects as the superuser (DATABASE_URL from .env.local/.env) and runs
 *      ALTER ROLE ... PASSWORD to restore each.
 *   3. Re-syncs .env.local's DATABASE_URL_ADMIN_USER to match .env.test, so
 *      withAdminBypass/prismaAdmin keep working after the restore.
 *
 * No password is printed. Run from repo root, then restart the dev server:
 *   node scripts/restore-rls-passwords.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const readFile = (p) => { try { return fs.readFileSync(new URL(p, import.meta.url), "utf8"); } catch { return null; } };
const envTest = readFile("../.env.test");
const envLocalText = readFile("../.env.local");
if (!envTest) { console.error("ERROR: .env.test not found."); process.exit(1); }

const get = (text, key) => {
  const m = text.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
  return m ? m[1] : null;
};
const appUrl = get(envTest, "DATABASE_URL_APP_USER");
const adminUrl = get(envTest, "DATABASE_URL_ADMIN_USER");
if (!appUrl || !adminUrl) { console.error("ERROR: .env.test missing DATABASE_URL_APP_USER/ADMIN_USER."); process.exit(1); }

const pwOf = (u) => decodeURIComponent(new URL(u).password);
const appPw = pwOf(appUrl);
const adminPw = pwOf(adminUrl);

// Superuser connection for ALTER ROLE.
const superUrl = get(envLocalText ?? "", "DATABASE_URL") || get(readFile("../.env") ?? "", "DATABASE_URL");
if (!superUrl) { console.error("ERROR: DATABASE_URL (superuser) not found."); process.exit(1); }

const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  const c = new Client({ connectionString: superUrl, ssl: false });
  await c.connect();
  const su = (await c.query(`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if (!su.rolsuper) { console.error("ERROR: DATABASE_URL is not superuser — cannot ALTER ROLE."); process.exit(1); }
  await c.query(`ALTER ROLE app_user   WITH LOGIN PASSWORD ${lit(appPw)}`);
  await c.query(`ALTER ROLE admin_user WITH LOGIN PASSWORD ${lit(adminPw)}`);
  await c.end();
  console.log("OK: app_user + admin_user passwords restored to the .env.test originals.");

  // Re-sync .env.local admin URL to the restored value so prismaAdmin keeps working.
  if (envLocalText != null) {
    const line = `DATABASE_URL_ADMIN_USER="${adminUrl}"`;
    let next;
    if (/^DATABASE_URL_ADMIN_USER\s*=.*$/m.test(envLocalText)) {
      next = envLocalText.replace(/^DATABASE_URL_ADMIN_USER\s*=.*$/m, line);
    } else {
      next = envLocalText.replace(/\n*$/, "\n") + line + "\n";
    }
    fs.writeFileSync(new URL("../.env.local", import.meta.url), next);
    console.log("OK: .env.local DATABASE_URL_ADMIN_USER re-synced to the restored admin password.");
  }
  console.log("\nNext: restart the dev server (Ctrl+C, pnpm dev). Then `pnpm test:rls` should connect.");
})().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
