# RLS Phase 1 — Production Cutover Runbook

**Scope**: TENANT_DIRECT (14 tables) — tables with a direct `organizationId` column.  
**Prerequisite**: Phase 0 complete (all 10 sub-phases live as of commit `9352c14`).  
**Master plan reference**: `skill-rls-rollout-PLAN-V2.md` §13.  
**Feature flag**: `RLS_ENFORCEMENT_ENABLED` (default `false`; CI forces `true`).

---

## Table of contents

1. [Backup procedure](#1-backup-procedure)
2. [Staging-first apply order](#2-staging-first-apply-order)
3. [Smoke test SQL queries](#3-smoke-test-sql-queries)
4. [Sentry 42501 rollback threshold](#4-sentry-42501-rollback-threshold)
5. [Communication template](#5-communication-template)

---

## 1. Backup procedure

### 1.1 Before every Phase 1 migration — mandatory

Run this before applying any migration to production. Do not skip.

```bash
# Set from Railway Dashboard → Postgres → Connect → Connection URL
PROD_URL="postgresql://postgres:<PASSWORD>@tramway.proxy.rlwy.net:<PORT>/railway"
BACKUP_FILE="rls-phase1-pre-$(date +%Y%m%d-%H%M%S).dump"

# Full custom-format dump (parallel restore capable)
pg_dump \
  "$PROD_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$BACKUP_FILE"

echo "Backup written: $BACKUP_FILE ($(du -sh $BACKUP_FILE | cut -f1))"
```

### 1.2 Verify backup integrity

```bash
# List objects — must show 61 tables (62 including _prisma_migrations)
pg_restore --list "$BACKUP_FILE" | grep "TABLE DATA" | wc -l

# Expected: >= 61
# If lower: backup is incomplete — do NOT proceed with migration
```

### 1.3 Storage

Store the backup in **two** places before proceeding:

| Location | Command |
|----------|---------|
| Railway dashboard backup | Dashboard → Postgres → Backups → Create backup (manual trigger) |
| Local secure storage | `mv "$BACKUP_FILE" ~/backups/agent-studio/` (git-ignored directory) |

> Note: This project currently does not have a dedicated S3 backup bucket. The Railway dashboard backup + local copy in `~/backups/agent-studio/` is sufficient for the single-developer workflow. If a dedicated bucket is added later, document the path here.

**Retention**: Keep backups for **30 days minimum** after Phase 1 completes. Label clearly: `rls-phase1-pre-<table>-<date>.dump`.

### 1.4 Rollback restore (emergency only)

If a Phase 1 migration causes unrecoverable data loss, restore from backup:

```bash
# Step 1: Disable the app (prevent writes during restore)
# Railway Dashboard → agent-studio service → Settings → Deploy → Pause

# Step 2: Drop and recreate the database
psql "$PROD_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'railway' AND pid <> pg_backend_pid();"
# Then via Railway query tab: DROP SCHEMA public CASCADE; CREATE SCHEMA public;

# Step 3: Restore
pg_restore \
  --dbname="$PROD_URL" \
  --no-owner \
  --no-acl \
  --verbose \
  "$BACKUP_FILE"

# Step 4: Verify row counts match pre-backup snapshot
psql "$PROD_URL" -c "SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"

# Step 5: Resume app in Railway dashboard
```

> **Note**: This is a last resort. The feature flag rollback in §4 should handle 99% of incidents without requiring a restore.

---

## 2. Staging-first apply order

### 2.1 Environment setup

Phase 1 requires two database connections for smoke tests:

```bash
# app_user: tenant-scoped (RLS enforced)
APP_USER_URL="postgresql://app_user:<PASSWORD>@tramway.proxy.rlwy.net:<PORT>/railway"

# admin_user: cross-tenant (BYPASSRLS)
ADMIN_USER_URL="postgresql://admin_user:<PASSWORD>@tramway.proxy.rlwy.net:<PORT>/railway"

# Verify roles exist
psql "$ADMIN_USER_URL" -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user','admin_user');"
# Expected:
#  rolname   | rolbypassrls
# -----------+-------------
#  admin_user | t
#  app_user   | f
```

### 2.2 Per-table apply gate

For each table in the ordered list below:

```
APPLY → SMOKE TEST (§3) → SENTRY WATCH 60 min → PASS gate → NEXT TABLE
                                                ↓ FAIL gate
                                          STOP + diagnose (do not proceed)
```

**Pass gate**: Zero `42501` errors in Sentry for 60+ consecutive minutes after applying.  
**Fail gate**: Any `42501` spike → stop, set `RLS_DISABLED_TABLES=<table>` (per §13.2 of PLAN-V2), investigate before resuming.

### 2.3 Apply order (low-traffic → high-traffic)

Apply in this exact sequence. Each row = one migration PR.

| # | Table | Policy type | isPublic | Rationale |
|---|-------|-------------|----------|-----------|
| 1 | `OrganizationMember` | TENANT_DIRECT | no | Foundational membership table; low write rate; read path is org-scoped already |
| 2 | `Invitation` | TENANT_DIRECT | no | Low traffic; isolated create/consume lifecycle |
| 3 | `CompanyMission` | TENANT_DIRECT | no | Max 1 row per org; no FK chains; safest to validate first |
| 4 | `Department` | TENANT_DIRECT | no | Low traffic; tree structure but simple policies |
| 5 | `Goal` | TENANT_DIRECT | no | Low traffic; confirm `missionId` FK path doesn't break reads |
| 6 | `AgentPermissionGrant` | TENANT_DIRECT | no | Security-sensitive; verify A2A permission checks still pass |
| 7 | `HeartbeatConfig` | TENANT_DIRECT | no | BullMQ worker reads this; verify worker tenant context wiring |
| 8 | `HeartbeatContext` | TENANT_DIRECT | no | High insert rate (BullMQ); watch for `42501` on worker paths |
| 9 | `HeartbeatRun` | TENANT_DIRECT | no | Append-only; low risk after HeartbeatConfig/Context pass |
| 10 | `ApprovalPolicy` | TENANT_DIRECT | no | Board governance; `ADMIN_USER_IDS` bypass path must work |
| 11 | `PolicyDecision` | TENANT_DIRECT | no | FK to ApprovalPolicy; apply immediately after #10 |
| 12 | `AgentCard` | TENANT_DIRECT | **yes** | First `isPublic` table; validates public-read policy works |
| 13 | `Template` | TENANT_DIRECT | **yes** | Marketplace reads; confirm `isPublic=true` rows visible cross-org |
| 14 | `Agent` | TENANT_DIRECT | **yes** | Highest traffic; applied last after all simpler tables are stable |

### 2.4 Staging → production gate

After all 14 tables pass in **staging**:

- **24-hour soak** in staging with `RLS_ENFORCEMENT_ENABLED=true`
- Confirm no `42501` events across the full soak period
- Run full Playwright E2E suite against staging
- Only then open the production apply window

### 2.5 Production apply window

- **Preferred time**: weekday 09:00–14:00 (off-peak, developer available)
- Apply 3–4 tables per session max; do not rush all 14 in one sitting
- Keep Railway dashboard open in a second browser tab throughout

---

## 3. Smoke test SQL queries

Run these immediately after applying each table's migration. Uses the 3-query pattern: RLS-enforced count, admin count, wrong-org write attempt.

### 3.1 Setup: create test fixtures

```sql
-- Run as admin_user once per smoke test session
-- Creates two isolated test orgs + one agent each

INSERT INTO "Organization" (id, name, slug, plan, "createdAt", "updatedAt")
VALUES
  ('smoke-org-a', 'Smoke Org A', 'smoke-a', 'FREE', NOW(), NOW()),
  ('smoke-org-b', 'Smoke Org B', 'smoke-b', 'FREE', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

### 3.2 Standard pattern (no `isPublic`)

Replace `{TABLE}` and `{ORG_COL}` per table. Run as `app_user`.

```sql
-- Query 1: RLS-enforced SELECT (app_user, org A context)
SET LOCAL "app.current_org_id" = 'smoke-org-a';
SET LOCAL "app.current_user_id" = 'smoke-user-a';
SELECT COUNT(*) FROM "{TABLE}";
-- Expected: only rows where organizationId = 'smoke-org-a'
-- Org B rows must NOT appear.

-- Query 2: Admin bypass SELECT (admin_user — run in separate session)
SELECT COUNT(*) FROM "{TABLE}";
-- Expected: ALL rows across all orgs (admin_user has BYPASSRLS)

-- Query 3: Wrong-org write attempt (app_user, org A context trying to write org B)
BEGIN;
SET LOCAL "app.current_org_id" = 'smoke-org-a';
INSERT INTO "{TABLE}" (..., "organizationId") VALUES (..., 'smoke-org-b');
-- Expected: ERROR 42501 "new row violates row-level security policy"
ROLLBACK;
```

### 3.3 `isPublic` pattern (Agent, AgentCard, Template)

```sql
-- Setup: one public row in org B (as admin_user)
UPDATE "Agent" SET "isPublic" = true WHERE id = '<org-b-agent-id>';

-- Query 1a: Org A can see its own private agents
BEGIN;
SET LOCAL "app.current_org_id" = 'smoke-org-a';
SELECT id, "isPublic" FROM "Agent" WHERE "organizationId" = 'smoke-org-a';
-- Expected: all org-a agents returned
ROLLBACK;

-- Query 1b: Org A can see org B's PUBLIC agent (cross-org read allowed)
BEGIN;
SET LOCAL "app.current_org_id" = 'smoke-org-a';
SELECT id, "isPublic" FROM "Agent" WHERE "organizationId" = 'smoke-org-b';
-- Expected: only the public agent returned (private org-b agents hidden)
ROLLBACK;

-- Query 2: Admin sees all (including private org B agents)
SELECT COUNT(*) FROM "Agent" WHERE "organizationId" = 'smoke-org-b';
-- Expected: total org-b agents (public + private)

-- Query 3: Org A cannot UPDATE org B's private agent
BEGIN;
SET LOCAL "app.current_org_id" = 'smoke-org-a';
UPDATE "Agent" SET name = 'pwned' WHERE "organizationId" = 'smoke-org-b' AND "isPublic" = false;
-- Expected: UPDATE 0 (RLS hides the row — no 42501, just silent empty result)
-- Alternatively: if WITH CHECK is on UPDATE, expect 42501
ROLLBACK;

-- Query 4: Org A cannot UPDATE org B's PUBLIC agent either (INSERT/UPDATE/DELETE stay strict)
BEGIN;
SET LOCAL "app.current_org_id" = 'smoke-org-a';
UPDATE "Agent" SET name = 'pwned' WHERE "organizationId" = 'smoke-org-b' AND "isPublic" = true;
-- Expected: UPDATE 0 (public read does NOT grant write)
ROLLBACK;
```

### 3.4 Per-table smoke test checklist

| Table | Q1 filtered? | Q2 full? | Q3 blocked? | isPublic test? | Sign-off |
|-------|:---:|:---:|:---:|:---:|---------|
| OrganizationMember | ☐ | ☐ | ☐ | n/a | |
| Invitation | ☐ | ☐ | ☐ | n/a | |
| CompanyMission | ☐ | ☐ | ☐ | n/a | |
| Department | ☐ | ☐ | ☐ | n/a | |
| Goal | ☐ | ☐ | ☐ | n/a | |
| AgentPermissionGrant | ☐ | ☐ | ☐ | n/a | |
| HeartbeatConfig | ☐ | ☐ | ☐ | n/a | |
| HeartbeatContext | ☐ | ☐ | ☐ | n/a | |
| HeartbeatRun | ☐ | ☐ | ☐ | n/a | |
| ApprovalPolicy | ☐ | ☐ | ☐ | n/a | |
| PolicyDecision | ☐ | ☐ | ☐ | n/a | |
| AgentCard | ☐ | ☐ | ☐ | ☐ | |
| Template | ☐ | ☐ | ☐ | ☐ | |
| Agent | ☐ | ☐ | ☐ | ☐ | |

### 3.5 Cleanup after smoke tests

```sql
-- Run as admin_user after each table's tests
DELETE FROM "Organization" WHERE id IN ('smoke-org-a', 'smoke-org-b');
-- Cascades to all FK-linked smoke rows
```

---

## 4. Sentry 42501 rollback threshold

PostgreSQL error code `42501` = `insufficient_privilege`. This fires when RLS denies a query that the application code did not expect to be filtered.

### 4.1 Baseline

**Current baseline**: 0 events/hour. No RLS policies enforce yet (`RLS_ENFORCEMENT_ENABLED=false` in production).

### 4.2 Alert thresholds

| Level | Condition | Action |
|-------|-----------|--------|
| **Green** | 0–4 events/hour | Normal — monitor passively |
| **Yellow** | > 5 events/hour sustained ≥ 15 min | Investigate immediately; do **not** auto-rollback yet; check if events are from smoke test cleanup artifacts |
| **Red** | > 20 events/hour sustained ≥ 5 min | **Rollback immediately** via feature flag (§4.3); file incident report |

### 4.3 Layer 1 rollback — revert the DATABASE_URL role (primary)

> ⚠️ **CORRECTION (see `docs/rls-phase2-cutover-analysis.md` §4 GAP-A):** Once
> `DATABASE_URL` points at `app_user`, do **NOT** roll back by turning the flag
> off. With `RLS_ENFORCEMENT_ENABLED=false`, `withOrgContext` sets no
> `app.current_org_id`, so every policy evaluates `org = NULL` → **0 rows** → the
> app shows empty data (worse than the incident). The correct, instant rollback
> is to point the app back at the superuser role, which bypasses RLS regardless
> of the GUC:

```
Railway Dashboard → agent-studio service → Variables
  DATABASE_URL = <postgres superuser connection string>   ← revert this
  Save → Railway auto-redeploys (~60 seconds)
```

> The **flag-off** rollback is only safe BEFORE the DATABASE_URL switch — i.e.
> while the app still connects as the superuser. In that window flipping
> `RLS_ENFORCEMENT_ENABLED=false` is a harmless no-op.

Confirm rollback succeeded:

```bash
# After redeploy, Sentry 42501 rate must return to 0 within 5 minutes
curl https://<your-railway-domain>/api/health
# Expected: { "status": "healthy", "db": "ok", ... }
```

### 4.4 Layer 2 rollback — per-table escape hatch (NOT IMPLEMENTED)

> ⚠️ **CORRECTION (GAP-B):** `RLS_DISABLED_TABLES` is referenced in older notes
> but is **NOT implemented** in the current codebase — there is no Prisma routing
> extension for it, and `src/lib/db/clients.ts` does not exist. Do not rely on it.
> For a single-table rollback that keeps other tables enforced, use the
> drop-policy approach in §4.5. Building `RLS_DISABLED_TABLES` is optional future
> work, not a prerequisite for cutover.

### 4.5 Layer 3 rollback — migration revert

If the policy SQL itself must be removed:

```sql
-- Run as postgres (superuser) via Railway query tab
DROP POLICY IF EXISTS agent_select ON "Agent";
DROP POLICY IF EXISTS agent_insert ON "Agent";
DROP POLICY IF EXISTS agent_update ON "Agent";
DROP POLICY IF EXISTS agent_delete ON "Agent";
ALTER TABLE "Agent" DISABLE ROW LEVEL SECURITY;
```

Then create a new migration that records the revert so `_prisma_migrations` stays accurate.

### 4.6 Layer 4 rollback — full restore

See §1.4. Use only if data integrity is compromised.

### 4.7 Post-rollback checklist

After any rollback:

- [ ] Sentry `42501` rate returns to 0 within 10 minutes
- [ ] Health check endpoint returns `{ "status": "ok" }`
- [ ] BullMQ jobs resume normally (check Railway worker logs)
- [ ] Public chat endpoint responds (`/api/agents/<id>/chat`)
- [ ] Write incident summary to `docs/rls-incidents/YYYYMMDD-<table>.md`
- [ ] Root cause identified before re-attempting the migration

---

## 5. Communication template

This is a single-developer project. Templates are for future team contexts and for self-accountability during the rollout.

### 5.1 Pre-deploy notification (T-24h)

```
Subject: RLS Phase 1 starting [DATE] — [N] tables

Applying Row-Level Security enforcement to the first [N] of 14 TENANT_DIRECT
tables tomorrow starting at [TIME].

Tables in scope (this session): [list]
Monitoring: Sentry project agent-studio — filter by error.type:42501
Rollback SLA: < 60 seconds via RLS_ENFORCEMENT_ENABLED=false in Railway

No user-facing changes expected. If any tenant reports missing data or
unexpected errors, that is the rollback trigger.

Status updates every 60 minutes during the apply window.
```

### 5.2 Per-table status update (during deploy)

```
[TIME] RLS Phase 1 status:
  ✅ OrganizationMember — enforced 90 min, 0 events
  ✅ Invitation — enforced 75 min, 0 events
  🔄 CompanyMission — applying now, smoke tests running
  ⏳ Department — queued

Sentry 42501 rate: 0/hour (green)
Next update: [TIME + 1h]
```

### 5.3 Post-deploy summary

```
Subject: RLS Phase 1 complete — [DATE]

Phase 1 (TENANT_DIRECT) complete. All 14 tables now enforce tenant isolation.

Results:
  Tables enforced: [N]/14
  Incidents: [0 or describe]
  Rollbacks: [0 or describe]
  Total calendar time: [N] days

Sentry 42501 baseline: 0/hour (unchanged)
Phase 2 (TENANT_INDIRECT, 35 tables) planned for: [DATE]

Backup retained at: [location], expires: [DATE+30d]
```

### 5.4 Incident escalation (Red alert)

```
🚨 RLS ROLLBACK TRIGGERED

Time: [TIMESTAMP]
Table: [TABLE NAME]
Event rate: [N] 42501 errors/hour for [N] minutes

Action taken: RLS_ENFORCEMENT_ENABLED set to false in Railway at [TIME]
Sentry confirmed 0 rate at: [TIME]

Investigation required before re-applying:
  1. Pull Sentry event stack traces for 42501 on table [TABLE]
  2. Identify call site (which API route / BullMQ handler)
  3. Determine if missing tenant context or policy SQL bug
  4. Fix → re-run smoke tests → re-apply

Estimated re-apply window: [DATE]
```

---

## Appendix A — Quick reference

### A.1 Key files

| File | Purpose |
|------|---------|
| `src/lib/db/rls-middleware.ts` | `withOrgContext` / `withOrgVectorTx` helpers |
| `src/lib/api/tenant-context.ts` | `withTenant` / `withAdminBypass` |
| `src/lib/context/org-context.ts` | AsyncLocalStorage org context store |
| `src/lib/prisma.ts` | `prisma` / `prismaAdmin` / `prismaRead` client factory |
| `src/lib/feature-flags/index.ts` | `RLS_ENFORCEMENT_ENABLED` flag |
| `skill-rls-rollout-PLAN-V2.md` | Master plan (§8: SQL templates, §13: rollback) |
| `docs/rls-tech-debt.md` | Open items and resolved history |

### A.2 Railway variables reference

| Variable | Phase 1 value | Notes |
|----------|--------------|-------|
| `RLS_ENFORCEMENT_ENABLED` | `false` → flip to `true` per table | Master switch |
| `RLS_DISABLED_TABLES` | `""` | CSV escape hatch (e.g. `Agent,Template`) |
| `DATABASE_URL_APP_USER` | set | Tenant-scoped role |
| `DATABASE_URL_ADMIN_USER` | set | Cross-tenant bypass role |
| `ADMIN_USER_IDS` | set | Comma-separated user IDs |

### A.3 Sentry filter

```
project:agent-studio
error.type:42501
OR
error.value:*insufficient_privilege*
```

### A.4 14 TENANT_DIRECT tables at a glance

```
OrganizationMember  Invitation        CompanyMission    Department
Goal                AgentPermission   HeartbeatConfig   HeartbeatContext
HeartbeatRun        ApprovalPolicy    PolicyDecision    AgentCard*
Template*           Agent*

* isPublic tables — require extended policy (§8.2 of PLAN-V2)
```
