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

## 6. Phase 2 dry-run findings (local Docker, app_user + flag on)

Ran the full `skills/rls-rollout/tests/` harness against a local pgvector DB with
all migrations applied, `app_user`/`admin_user` roles, and `RLS_ENFORCEMENT_ENABLED=true`.
Result: `cross-tenant` (10/10) green — SELECT/INSERT/UPDATE/DELETE isolation for
TENANT_DIRECT (Agent) and TENANT_INDIRECT (Flow→Agent) + admin bypass all pass.
The dry-run surfaced the following:

### 6.1 Real bug — public agents hidden cross-org (FIXED)
The strict `agent_select_policy` (from hal8) had no `isPublic` clause, but
`discover/route.ts` reads public agents cross-org via `withOrgContext` (app_user).
Under enforcement, discover/marketplace would hide all cross-org public agents.
**Fix:** migration `20260626000000_rls_agent_public_select` adds a separate
permissive `agent_select_public` SELECT policy (`isPublic = true`). ORed with the
strict org policy; private agents stay isolated; writes stay strict.

### 6.2 Coverage gap — Template missing RLS (FIXED)
Audit (models with `organizationId` vs tables with policies) found **Template** had
NO RLS at all, despite being TENANT_DIRECT #13 in the runbook. Its query-path was
wrapped (withOrgContext/withAdminBypass) so no active leak via known routes (app-level
`where organizationId`), but the DB backstop was missing. **Fix:** migration
`20260626000001_rls_phase1_template` (org policies + `isPublic` SELECT) + new
`template-isolation.test.ts`.

### 6.3 ApiKey — userId-scoped, correctly GLOBAL (NO org-RLS)
The same audit flagged **ApiKey** (has `organizationId`, no RLS). Investigation of
all access paths showed ApiKey is **user-owned, not org-owned**: every route scopes
by `userId` (`requireAuth` + `where { userId }`), and validation is by `keyHash`
(pre-context, must be global). `organizationId` is denormalized metadata, not the
access-control axis. Adding **org**-RLS would be the wrong axis and would break the
pre-context validation/auth paths. Decision: **ApiKey stays GLOBAL** (the burn-down
classification was correct). If a DB backstop is ever wanted, the correct design is a
`userId`-based policy (via `app.current_user_id`) + wrapping the api-keys routes — a
separate, careful change, not part of this cutover.

### 6.4 Performance note (not a blocker)
`performance.test.ts`: `Agent.findMany` showed −2.5% (RLS policy eval is cheap), but
`Agent.findUnique by id` showed a large % regression. This is the fixed
`withOrgContext` transaction-wrapper overhead (BEGIN + set_config + COMMIT) on the
cheapest possible query — sub-millisecond absolute, and the 10% threshold is
unrealistic for a trivial PK lookup. Not a correctness/cutover blocker, but on a
network DB (prod) the extra round-trips add real per-query latency; validate latency
on prod-like conditions during the cutover window (runbook already includes latency/
Sentry watch).

### 6.5 Complete coverage audit (every model classified)
Compared all 63 models against tables with RLS policies; every no-policy table was
verified GLOBAL by its actual access pattern (not assumption):

- **TENANT_DIRECT (14)** — all have policies (Template was the only gap → fixed here).
- **TENANT_INDIRECT (35)** — covered by `20260621000002_rls_phase2_tenant_indirect`; proven by the cross-tenant Flow→Agent test.
- **NextAuth (User, Account, Session, VerificationToken)** — global by necessity (auth runs before org context).
- **userId-owned (ApiKey, CLIGeneration, GoogleOAuthToken, MCPServer, SomaReviewBatch)** — user-scoped (`requireAuth` + `where userId`), not the org axis; org-RLS would be the wrong model.
- **System / catalog (ModelPerformanceStat, AuditLog, PipelineTemplate, Skill, Organization, SomaReviewPost)** — system telemetry / audit infra / global catalogs; read via bare/admin with no user-facing org-scoped route. (`PipelineTemplate` has no `organizationId`/`agentId` field at all — the apparent `agentId` was inside a comment.)

Conclusion: every org-isolation table has an RLS backstop; every other table is
legitimately global. RLS coverage is complete for the enforcement cutover.
