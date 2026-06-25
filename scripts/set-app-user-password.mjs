#!/usr/bin/env node
/**
 * Set a known password on the app_user (and optionally admin_user) DB role,
 * so we can build the app_user connection string for the RLS isolation proof
 * and, later, the cutover.
 *
 * Connects as the superuser in DATABASE_URL (.env.local / .env) and runs
 * ALTER ROLE. You choose the password(s) via env vars — never written to a file.
 *
 *   APP_USER_PASSWORD='choose-strong' node scripts/set-app-user-password.mjs
 *   # optional, also rotate admin_user at the same time:
 *   APP_USER_PASSWORD='...' ADMIN_USER_PASSWORD='...' node scripts/set-app-user-password.mjs
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
if (!cs) { console.error("ERROR: DATABASE_URL not found in .env.local or .env"); process.exit(1); }

const appPw = process.env.APP_USER_PASSWORD;
const adminPw = process.env.ADMIN_USER_PASSWORD; // optional
if (!appPw || appPw.length < 8) {
  console.error("ERROR: set APP_USER_PASSWORD (min 8 chars). Example:");
  console.error("  APP_USER_PASSWORD='your-strong-pass' node scripts/set-app-user-password.mjs");
  process.exit(1);
}

// ALTER ROLE ... PASSWORD does not accept bind parameters; escape single quotes.
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";

(async () => {
  const c = new Client({ connectionString: cs, ssl: false });
  await c.connect();
  const me = (await c.query(`SELECT current_user AS u, rolsuper AS s FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if (!me.s) { console.error(`ERROR: connected as ${me.u} (not superuser) — cannot ALTER ROLE.`); process.exit(1); }

  await c.query(`ALTER ROLE app_user WITH LOGIN PASSWORD ${lit(appPw)}`);
  console.log("OK: app_user password set.");
  if (adminPw && adminPw.length >= 8) {
    await c.query(`ALTER ROLE admin_user WITH LOGIN PASSWORD ${lit(adminPw)}`);
    console.log("OK: admin_user password set.");
  }
  await c.end();
  console.log("\nNext: run the isolation proof with the SAME app_user password:");
  console.log("  APP_USER_PASSWORD='<the one you just set>' node scripts/rls-prove-isolation.mjs");
})().catch((e) => { console.error("Failed:", e.message); process.exit(1); });
