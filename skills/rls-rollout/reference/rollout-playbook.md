# RLS Rollout Playbook

Quick-reference map of documents, scripts, and tools for the Phase 1–4 rollout.

---

## Key documents

| Document | Purpose |
|----------|---------|
| `skill-rls-rollout-PLAN-V2.md` | Master plan (root of repo). Architecture decisions, phase scope, templates |
| `skill-rls-rollout-FORENSIC-REPORT.md` | 12 hallucinations + 18 gaps from v1. Read before making decisions. |
| `docs/_archive/rls-phase-1-cutover-runbook.md` | **Production cutover runbook.** Read before touching prod. |
| `skills/rls-rollout/reference/model-classifications.md` | All 61 models classified. |
| `skills/rls-rollout/reference/policy-patterns.md` | Which template to use for each model type. |
| `skills/rls-rollout/reference/decision-log.md` | Append-only log of rollout decisions. |
| `skills/rls-rollout/reference/cross-tenant-routes.md` | Catalog of public/admin/GDPR routes. |

---

## Scripts — execution order

### Phase 0 prep (prerequisite check)

```bash
# Verify all Phase 0 prerequisites are live
bash skills/rls-rollout/scripts/step0-preflight.sh
# Report: skills/rls-rollout/reference/preflight-report.json
```

### Phase 1 (TENANT_DIRECT, 13 tables)

```bash
# STEP 1: Generate inventory JSON
pnpm tsx skills/rls-rollout/scripts/step1-inventory.ts
# → reference/model-classifications.json

# STEP 2: Verify classifications
pnpm tsx skills/rls-rollout/scripts/step2-classify.ts

# STEP 3: Generate migration drafts (REVIEW before applying)
pnpm tsx skills/rls-rollout/scripts/step3-generate-migration.ts --phase=1
# → prisma/migrations/draft/YYYYMMDD_rls_phase1_*/migration.sql

# Human review: read each draft SQL file
# When approved: move out of draft/ and apply to STAGING
DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy

# STEP 4: Generate + run isolation tests on staging
pnpm tsx skills/rls-rollout/scripts/step4-isolation-tests.ts --phase=1
# Unskip tests in tests/generated/, then:
pnpm test skills/rls-rollout/tests/generated/

# STEP 5: Generate production runbook
pnpm tsx skills/rls-rollout/scripts/step5-runbook.ts --phase=1
# → reference/runbook-phase1-production.md
# Follow runbook for production cutover
```

### Emergency rollback

```bash
# Layer 1: disable flag (instant, no redeploy required)
railway env set RLS_ENFORCEMENT_ENABLED=false

# Layer 2: disable specific tables
bash skills/rls-rollout/scripts/rollback.sh --disable-tables=KBChunk,KBSource

# Layer 4: nuclear (disable all RLS)
bash skills/rls-rollout/scripts/rollback.sh --nuclear --confirm=RLS_DISABLE_ALL
```

---

## Template files

| Template | Use for |
|----------|---------|
| `templates/tenant-direct.sql.template` | Phase 1 — direct organizationId |
| `templates/tenant-direct-public.sql.template` | Phase 1 — Agent, Template (isPublic) |
| `templates/tenant-indirect.sql.template` | Phase 2 — FK chain via agentId |
| `templates/user-owned.sql.template` | Phase 3 — ApiKey, MCPServer, etc. |
| `templates/ambiguous-schema-additions.sql.template` | Phase 4 — AuditLog (needs schema change) |
| `templates/helper-functions.sql.template` | One-time setup before Phase 1 |

---

## Verification tests

| Test file | When to run |
|-----------|------------|
| `tests/step0.test.ts` | Before starting Phase 1 |
| `tests/step1.test.ts` | After running step1-inventory.ts |
| `tests/step2.test.ts` | After running step2-classify.ts |
| `tests/step3.test.ts` | Runs without DB — validates templates (CI) |
| `tests/step4.test.ts` | After applying migration to staging |
| `tests/step5.test.ts` | After running step5-runbook.ts |
| `tests/cross-tenant.test.ts` | Staging + production — cross-tenant isolation |
| `tests/public-routes.test.ts` | Staging + production — anonymous traffic |
| `tests/admin-routes.test.ts` | Staging + production — admin bypass |
| `tests/gdpr-export.test.ts` | Staging + production — GDPR export |
| `tests/performance.test.ts` | Staging — p95 regression check |
| `tests/lockout-recovery.test.ts` | Staging — flag toggle recovery |
| `tests/worker-tenant-context.test.ts` | Staging — BullMQ context |

---

## Environment variables

| Variable | Used by | Required for |
|----------|---------|-------------|
| `RLS_ENFORCEMENT_ENABLED` | Feature flag, Prisma extension | Phase 1 staging |
| `RLS_DISABLED_TABLES` | Per-table escape hatch | Layer 2 rollback |
| `DATABASE_URL` | Prisma migrations (postgres superuser) | All phases |
| `DATABASE_URL_APP_USER` | Tenant-scoped queries | Phase 1 runtime |
| `DATABASE_URL_ADMIN_USER` | Admin/cross-tenant queries | Phase 1 runtime |
| `ADMIN_USER_IDS` | Admin route bypass | Phase 1 |

---

## Phase status tracker

| Phase | Description | Status |
|-------|-------------|--------|
| 0 (all sub-phases) | Prerequisites | ✅ COMPLETE (PR #121 — 10/10 sub-phases live) |
| 0a.7b | Schema drift sync | ✅ LIVE (PR #125) |
| Cutover runbook | Production runbook | ✅ DONE (PR #126) |
| skills/rls-rollout/ | Skill scaffold (this file) | ✅ IN PROGRESS (PR #128) |
| 1 | TENANT_DIRECT (13 tables) | ⏳ PENDING — awaiting Phase 1 prep completion |
| 2 | TENANT_INDIRECT (36 tables) | ⏳ PENDING |
| 3 | USER_OWNED (4 tables) | ⏳ PENDING |
| 4 | AMBIGUOUS (1 table) | ⏳ PENDING |

---

## Links

- Production DB: Railway → agent-studio → Postgres → Query tab
- Sentry project: (check .env.local for SENTRY_DSN)
- Master plan: `skill-rls-rollout-PLAN-V2.md` at repo root
- This PR: feat/rls-rollout-skill
