# RLS Enforcement Cutover — Readiness Analysis & Plan

> **Status**: Pre-cutover analysis (read-only). No enforcement is live yet
> (`RLS_ENFORCEMENT_ENABLED=false` in production, `DATABASE_URL` = superuser).
> **Prereq complete**: Query-path migration ("our Phase 1", PRs #267–#280) — every
> tenant-scoped Prisma call (ORM + raw SQL + interactive tx) routes through
> `withOrgContext` / `withTenant` / `withAdminBypass` / `withOrgVectorTx`. Burn-down 0/0/0.

## 0. Terminology

There are two numbering schemes — keep them straight:

| Conversational name | Runbook / master-plan name | Scope | Status |
|---|---|---|---|
| "Phase 1" (query-path migration) | Phase 0 + prep | route all queries through org context | ✅ DONE (#267–#280) |
| "Phase 2 enforcement cutover" | **"Phase 1 cutover"** | TENANT_DIRECT, 14 tables | ⬜ NEXT (this doc) |
| (later) | "Phase 2" | TENANT_INDIRECT, 35 tables (agentId→Agent chains) | ⬜ FUTURE |

This document covers the **enforcement cutover** (turning RLS on).

## 1. How enforcement actually works (from the code)

Three conditions must ALL be true for RLS to actually isolate tenants:

1. **App connects as `app_user`** (NOBYPASSRLS). The main client is
   `prisma = new PrismaClient()` (`src/lib/prisma.ts`) → uses plain `DATABASE_URL`.
   **The real cutover lever is the role in `DATABASE_URL`.** If it's `postgres`
   (Railway default superuser), RLS is bypassed and the flag does nothing.
2. **`RLS_ENFORCEMENT_ENABLED=true`** → `withOrgContext` (`src/lib/db/rls-middleware.ts`)
   wraps the call in a `$transaction` and runs
   `SELECT set_config('app.current_org_id', <orgId>, true)`. Flag off → it skips
   the transaction entirely and sets no GUC.
3. **Policies applied** to the tables (migrations `20260526…20260605` for the 14
   TENANT_DIRECT tables, `20260621` for TENANT_INDIRECT). Policies are scoped
   `TO app_user` with `FORCE ROW LEVEL SECURITY`; `admin_user` has BYPASSRLS.

Policy shape: `USING ("organizationId" = current_setting('app.current_org_id', true))`.
With the GUC unset, `current_setting(...,true)` returns NULL → `org = NULL` is false →
**app_user sees 0 rows**. (This is the key fact behind GAP-A below.)

## 2. Assets that already exist

- `docs/rls-phase-1-cutover-runbook.md` — detailed cutover runbook (backup, apply order, smoke SQL, rollback, comms).
- `scripts/rls-prove-isolation.mjs` — READ-ONLY proof: connects as `app_user`, verifies per-org isolation, aborts if `app_user` has BYPASSRLS. **This is the main gate.**
- `scripts/rls-audit.mjs`, `scripts/check-rls-coverage.sh` (CI guard).
- 14 TENANT_DIRECT policy migrations + 1 TENANT_INDIRECT migration.
- Flag wiring (`src/lib/feature-flags/index.ts`) — env `RLS_ENFORCEMENT_ENABLED` (true/1/yes/on, case-insensitive).
- `prismaAdmin` (BYPASSRLS) via `DATABASE_URL_ADMIN_USER`, falls back to `prisma` if unset.

## 3. Readiness gates (verify on prod DB before cutover — CLI/psql)

1. Roles `app_user` (NOBYPASSRLS) + `admin_user` (BYPASSRLS) exist.
2. **`DATABASE_URL_ADMIN_USER` set in Railway** → so `withAdminBypass` truly bypasses. HARD prereq — else cron/system jobs get RLS-enforced and break once the app is on app_user.
3. `app_user` has GRANTs on **all ~61 tables** (not just the 14 RLS ones) — else 42501 on the rest.
4. Policy migrations applied in prod (`_prisma_migrations` + `pg_policies`).
5. **`rls-prove-isolation.mjs` passes** against prod (all PASS) — the decisive gate.

### 3.1 Read-only CLI checklist (Phase A)

```bash
# Roles exist + bypass flags correct
psql "$ADMIN_USER_URL" -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user','admin_user');"
#   admin_user | t   ,  app_user | f

# Policies present (expect rows for the 14 TENANT_DIRECT tables)
psql "$ADMIN_USER_URL" -c "SELECT tablename, count(*) FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;"

# Migrations applied
psql "$ADMIN_USER_URL" -c "SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%rls%' ORDER BY migration_name;"

# Tables app_user CANNOT select (want: none) + per-tenant isolation proof
APP_USER_PASSWORD='<app_user pw>' node scripts/rls-prove-isolation.mjs
```

## 4. Gaps & risks (honest — runbook is partly stale)

- **GAP-A (critical):** runbook §4.3 says rollback = turn the flag off. **Unsafe once `DATABASE_URL=app_user`** — with the flag off, `withOrgContext` sets no GUC → policies return 0 rows → app shows empty data. **Correct primary rollback = revert `DATABASE_URL` to the `postgres` superuser** (bypasses RLS regardless of GUC). Runbook corrected.
- **GAP-B:** `RLS_DISABLED_TABLES` (runbook §4.4 per-table escape hatch) is **NOT implemented** in `src/`. Real rollback layers: (1) revert DATABASE_URL [global, instant], (2) drop-policy SQL [per-table], (3) restore from backup. Building RLS_DISABLED_TABLES is optional future work — not added now to avoid untested code on the cutover path.
- **GAP-C:** runbook Appendix A.1 referenced non-existent files (`src/lib/db/clients.ts`, `prismaApp`, `tenant-context.ts` path) — corrected to `src/lib/prisma.ts`, `src/lib/api/tenant-context.ts`.
- **GAP-D:** enforcement is **global** (every table with policies enforces at once when app_user + flag on), not per-table via the flag. Graduated rollout requires applying/dropping policies per table. **Open question:** are the policy migrations already applied in prod? If yes, cutover is all-at-once (higher blast radius).
- Any code path that bypasses `withOrgContext` → 0 rows / 42501 once on app_user. Burn-down is 0/0/0, but raw-SQL edges should be double-checked during the staging soak.

## 5. Implementation plan (gated)

- **Phase A — Verify readiness** (read-only, prod DB, CLI): §3.1 checklist. All must PASS.
- **Phase B — Close gaps** (repo edits): runbook rollback/refs corrected (this change); RLS_DISABLED_TABLES decision documented.
- **Phase C — Staging dry-run**: staging `DATABASE_URL`→app_user + flag on → prove-isolation + Playwright E2E + 24h soak; watch Sentry 42501.
- **Phase D — Prod cutover** (CLI, gated): backup → confirm `DATABASE_URL_ADMIN_USER` → flag on (no-op while postgres) → switch `DATABASE_URL`→app_user (enforcement begins) → smoke tests (runbook §3) → Sentry watch 60 min. **Rollback = revert `DATABASE_URL`.**
- **Phase E — TENANT_INDIRECT wave** (later, same pattern).

### Division of work
- **Here (repo):** Phase B doc/code gap fixes.
- **CLI (prod DB / Railway env):** Phase A verification, Phases C/D execution.
