---
name: rls-rollout
version: 1.1.0
description: >
  Audits, plans, and orchestrates a phased Postgres Row-Level Security (RLS)
  rollout for the agent-studio multi-tenant database (61 Prisma models).
  Produces SQL migration drafts, cross-tenant test suites, and rollout runbooks.
  NEVER auto-applies migrations — human approval gates every write operation.
  Triggers: "rls audit", "rls rollout", "rls migration", "enable rls",
  "tenant isolation", "row level security", "row-level security",
  "rls phase 1", "rls phase 2", "rls plan", "rls verify",
  "rls audit produkcije", "uradi rls audit", "krenimo sa rls", "rls staging".
  Do NOT use for: applying migrations without review (skill never does this),
  designing tenancy model from scratch (assumes existing organizationId schema),
  Redis cache audit (separate workstream), threat modeling (human task).
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
---

# RLS Rollout Skill

This skill is the operator's companion for rolling out Postgres Row-Level
Security across the agent-studio schema. It runs in 6 gated STEPs. **Each STEP
requires explicit human confirmation before the next.**

## Script naming convention

Two naming conventions coexist in `scripts/`. Both are intentional — do not remove either set.

| Convention | Files | When to use |
|-----------|-------|------------|
| Legacy (v1.0.0) | `audit.sh`, `generate-migration.ts`, `verify-staging.sh`, `rollback.sh`, `ci-fix.sh` | Full-featured implementations. Use these for STEP 0–4 execution. |
| Step-prefixed (v1.1.0) | `step1-inventory.ts`, `step2-classify.ts`, `step4-isolation-tests.ts`, `step5-runbook.ts` | Added in v1.1.0. Fill gaps not covered by legacy scripts. |

**Mapping to master plan §9 STEPs:**

| STEP | Master plan §9 name | Script to run |
|------|---------------------|---------------|
| STEP 0 | Pre-flight | `audit.sh --preflight` |
| STEP 1 | Audit & inventory | `audit.sh --inventory` (produces JSON) + `step1-inventory.ts` (fixes depth-aware parsing) |
| STEP 2 | Plan generation | `generate-migration.ts --plan` |
| STEP 3 | Migration draft | `generate-migration.ts --draft` |
| STEP 4 | Staging verification | `verify-staging.sh --phase=N` (runs tests) + `step4-isolation-tests.ts` (generates stubs) |
| STEP 5 | Production runbook | `step5-runbook.ts --phase=N` |

`audit.sh` covers both STEP 0 and STEP 1 because it was built before the step-prefix convention was adopted.

## Template extension convention

Templates use two extensions — both are valid:

- **`.sql.template`** — policy templates for TENANT_DIRECT, TENANT_INDIRECT, USER_OWNED, AMBIGUOUS, and helper functions. These are the primary policy templates you fill with `{{PLACEHOLDER}}` values.
- **`.sql.tpl`** — supplementary templates (`composite-index.sql.tpl`, `policy-admin-bypass.sql.tpl`) with no `.sql.template` equivalent. Keep `.tpl` extension.

## STEP 0 — Pre-flight check (read-only)

Run before anything else. Reports environment readiness; blocks if prerequisites
are not met.

```bash
bash skills/rls-rollout/scripts/audit.sh --preflight
```

### What it checks

| # | Check | Pass criteria |
|---|-------|---------------|
| 1 | Postgres version ≥ 14 | `SELECT version();` |
| 2 | `pgvector` extension present | `pg_extension` |
| 3 | Application role is NOT `postgres` (in non-dev) | `SELECT current_user` ≠ `postgres` |
| 4 | `RLS_ENFORCEMENT_ENABLED` env var defined | grep `.env*` |
| 5 | `app_user` role exists | `pg_roles` |
| 6 | `admin_user` role exists | `pg_roles` |
| 7 | `ADMIN_USER_IDS` env var defined | grep env |
| 8 | Sentry DSN configured | grep `SENTRY_DSN` |
| 9 | CI runs `prisma migrate deploy` | grep `.github/workflows/ci.yml` |
| 10 | `withOrgContext` uses `$transaction` | grep `src/lib/db/rls-middleware.ts` |
| 11 | `SET LOCAL hnsw.ef_search` wrapped in tx | grep `src/lib/knowledge/search.ts` |
| 12 | No NULL `Agent.organizationId` rows | `SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL` |
| 13 | `/api/users/switch-org` endpoint exists | `ls src/app/api/users/switch-org/` |
| 14 | JWT type includes `currentOrgId` | grep `src/types/next-auth.d.ts` |

### Output

`skills/rls-rollout/reference/preflight-report.json` with pass/fail per check.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed; proceed to STEP 1 |
| 1 | Blocking failure — fix and re-run STEP 0 |
| 2 | Non-blocking warnings — review before STEP 1 |

### Common blocking failures and remediation

- **Check 5/6 fail**: Run the Phase 0b migration:
  `bash skills/rls-rollout/scripts/audit.sh --create-roles`
- **Check 10 fails**: Patch `src/lib/db/rls-middleware.ts` per Phase 0a in
  PLAN-V2.md §4.1 (wrap helper in `$transaction`)
- **Check 12 fails**: Run Phase 0d backfill migration (PLAN-V2 §4.4)
- **Check 14 fails**: Add `currentOrgId` to `src/types/next-auth.d.ts`

---

## STEP 1 — Audit & inventory (read-only)

```bash
bash skills/rls-rollout/scripts/audit.sh --inventory
```

### What it produces

| File | Purpose |
|------|---------|
| `reference/model-classifications.json` | All 61 models with tenancy classification |
| `reference/existing-rls-state.tsv` | Per-table RLS enabled/forced flags from DB |
| `reference/existing-policies.tsv` | Current policies in `pg_policies` |
| `reference/composite-indexes.tsv` | Existing `(organizationId, ...)` indexes |
| `reference/raw-sql-sites.txt` | 70 statements across 22 files for human review |
| `reference/cross-tenant-routes-actual.md` | Detected public/admin/GDPR routes |
| `STEP1-summary.md` | Human-readable summary with action items |

### Tenancy classifications used

Counts reflect schema analysis as of PR #125 (schema drift sync). See `reference/model-classifications.md` for the full list.

| Classification | Count | Strategy |
|----------------|-------|----------|
| `TENANT_DIRECT` | 13 | Direct `organizationId = current_setting(...)` policy |
| `TENANT_INDIRECT` | 36 | EXISTS subquery via FK chain → Agent → organizationId |
| `USER_OWNED` | 4 | `userId = current_setting('app.current_user_id', true)` |
| `GLOBAL` | 7 | No RLS (User, VerificationToken, Skill, Organization, PipelineTemplate, Account, Session) |
| `AMBIGUOUS` | 1 | Requires schema change before RLS (AuditLog only) |

### Success criteria

All 61 models accounted for in `model-classifications.json`. Discrepancy
between detected and expected counts triggers warning.

---

## STEP 2 — Plan generation (per phase)

```bash
pnpm tsx skills/rls-rollout/scripts/generate-migration.ts \
  --phase=1 \
  --classification=TENANT_DIRECT \
  --output=reference/migration-plan-phase1.md
```

### Phases

| Phase | Classification | Models | Risk |
|-------|---------------|--------|------|
| 1 | TENANT_DIRECT | 13 | Low |
| 2 | TENANT_INDIRECT | 36 | Medium |
| 3 | USER_OWNED | 4 | Low |
| 4 | AMBIGUOUS | 1 | High (schema change required for AuditLog) |

### Plan document structure

Each phase plan includes:
- Tables in scope
- SQL preview (DRY RUN, not yet applied)
- Composite indexes to add
- Estimated migration duration per table (based on `pg_class.reltuples`)
- Rollback SQL for each statement
- Application-side code paths affected

### Human review checkpoint

User MUST read and approve the plan document before STEP 3. Skill prints:

```
[STEP 2] Plan generated at reference/migration-plan-phase1.md
         Read it, then run STEP 3 to generate the migration draft.
```

---

## STEP 3 — Migration draft generation

```bash
pnpm tsx skills/rls-rollout/scripts/generate-migration.ts \
  --phase=1 \
  --classification=TENANT_DIRECT \
  --draft
```

### What it does

Generates a Prisma-compatible migration file at:
```
prisma/migrations/draft/YYYYMMDD_rls_phase{N}_{classification}/migration.sql
```

**Does NOT apply the migration.** Generates only.

### SQL it generates (per table)

For TENANT_DIRECT:
1. `CREATE INDEX IF NOT EXISTS` composite index `(organizationId, id)`
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `FORCE`
3. `GRANT ... TO app_user, admin_user`
4. 4 policies (SELECT/INSERT/UPDATE/DELETE) for `app_user`
5. Commented rollback SQL

For TENANT_DIRECT with `isPublic` (Agent, Template, AgentCard):
- SELECT policy includes `OR "isPublic" = true`
- INSERT/UPDATE/DELETE remain strict (own org only)

For TENANT_INDIRECT:
- Subquery pattern: `agentId IN (SELECT id FROM "Agent" WHERE organizationId = ...)`

For USER_OWNED:
- `userId = current_setting('app.current_user_id', true)`

### Human next steps

```bash
# Review the draft
cat prisma/migrations/draft/YYYYMMDD_rls_phase1_TENANT_DIRECT/migration.sql

# Move into Prisma migrations folder (renames out of draft/)
mv prisma/migrations/draft/YYYYMMDD_rls_phase1_TENANT_DIRECT prisma/migrations/

# Apply in STAGING first
DATABASE_URL=$STAGING_URL pnpm prisma migrate deploy

# Run verification
bash skills/rls-rollout/scripts/verify-staging.sh --phase=1
```

---

## STEP 4 — Staging verification

```bash
bash skills/rls-rollout/scripts/verify-staging.sh --phase=1
```

### What it runs

1. **Cross-tenant isolation test** — `tests/cross-tenant.test.ts`
   - Creates two orgs, attempts cross-reads/writes
   - Must show 0 leaks

2. **Public route test** — `tests/public-routes.test.ts`
   - Anonymous request to `/api/agents/{id}/chat` for public agent
   - Must return 200 (org resolved from agent record)

3. **Admin route test** — `tests/admin-routes.test.ts`
   - User in `ADMIN_USER_IDS` accesses `/api/admin/flags`
   - Must return cross-tenant data

4. **GDPR export test** — `tests/gdpr-export.test.ts`
   - User with agents in multiple orgs hits `/api/user/export`
   - Must return all user data across orgs

5. **Performance benchmark** — `tests/performance.test.ts`
   - Runs 20 representative queries 100× each
   - Fail if p95 regression > 10%

6. **Lockout recovery** — `tests/lockout-recovery.test.ts`
   - Toggles `RLS_ENFORCEMENT_ENABLED` and confirms app survives

7. **Worker context** — `tests/worker-tenant-context.test.ts`
   - Triggers BullMQ jobs, verifies tenant context is set
   - `budget.monthly.reset` and `governance.timeout` use admin client

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed — safe to plan production cutover |
| 1 | Cross-tenant leak detected — STOP, do not deploy |
| 2 | Performance regression — investigate composite indexes |
| 3 | Public/admin/GDPR route broken — fix route handler |

---

## STEP 5 — Production cutover guidance (informational)

Skill produces a per-phase runbook at:
```
reference/runbook-phase{N}-production.md
```

### Runbook contents (template)

```
T-24h
  - [ ] Verify staging tests passing for ≥24h
  - [ ] Take Railway DB snapshot
  - [ ] Verify Sentry alert rules cover "permission denied"
  - [ ] Notify team

T-0 (cutover window, off-hours)
  - [ ] Verify RLS_ENFORCEMENT_ENABLED=false in prod
  - [ ] pnpm prisma migrate deploy
  - [ ] Wait for Railway redeploy
  - [ ] Spot-check 5 routes (login, agents, KB search, chat, cron)
  - [ ] Flip RLS_ENFORCEMENT_ENABLED=true
  - [ ] Wait for Railway redeploy
  - [ ] Spot-check same 5 routes
  - [ ] Monitor Sentry 30 min

Rollback triggers (any one fires → rollback)
  - 5xx rate > baseline + 1%
  - p95 latency > baseline + 25%
  - Sentry: "permission denied for table X" > 5/min
  - Sentry: "Tenant context not set" > 5/min
  - User reports: "can't see my agents" / "empty data"

Rollback procedure (4 layers)
  Layer 1: Set RLS_ENFORCEMENT_ENABLED=false → wait 60s → verify recovery
  Layer 2: Set RLS_DISABLED_TABLES=table1,table2 → wait 60s
  Layer 3: git revert migration commit, prisma migrate deploy
  Layer 4: Manual SQL: bash skills/rls-rollout/scripts/rollback.sh --nuclear
```

### Skill never performs cutover

This STEP is documentation only. Skill never flips production flags or runs
production migrations. Human operator follows the runbook manually.

---

## Emergency rollback

If something breaks mid-rollout:

```bash
# Layer 2 — disable RLS for specific tables (no deploy needed)
bash skills/rls-rollout/scripts/rollback.sh --disable-tables=KBChunk,KBSource

# Layer 4 — nuclear option (requires DB superuser)
bash skills/rls-rollout/scripts/rollback.sh --nuclear --confirm=RLS_DISABLE_ALL
```

Layer 4 disables RLS on all 61 tables in one transaction. Use only if
production is on fire.

---

## File reference

### Scripts

| Path | Convention | Purpose |
|------|-----------|---------|
| `scripts/audit.sh` | legacy | STEP 0 (preflight, 14 checks) + STEP 1 (inventory → JSON/TSV) |
| `scripts/generate-migration.ts` | legacy | STEP 2 (`--plan`) + STEP 3 (`--draft`); reads `model-classifications.json` |
| `scripts/verify-staging.sh` | legacy | STEP 4 driver — runs all staging test suites |
| `scripts/rollback.sh` | legacy | Emergency rollback (Layer 2 `--disable-tables`, Layer 4 `--nuclear`) |
| `scripts/ci-fix.sh` | legacy | Patches `.github/workflows/ci.yml` to add `migrate deploy` |
| `scripts/step1-inventory.ts` | step-prefix | Depth-aware schema parser; fixes `@default("{}")` bug in legacy classifier |
| `scripts/step2-classify.ts` | step-prefix | Verifies classification counts against known-good reference |
| `scripts/step4-isolation-tests.ts` | step-prefix | Generates per-table cross-tenant isolation test stubs (`.skip`) |
| `scripts/step5-runbook.ts` | step-prefix | Generates per-table production runbook with 4-layer rollback SQL |

### Templates

| Path | Extension | Purpose |
|------|-----------|---------|
| `templates/tenant-direct.sql.template` | `.sql.template` | TENANT_DIRECT policy (direct organizationId) |
| `templates/tenant-direct-public.sql.template` | `.sql.template` | TENANT_DIRECT with `isPublic` (Agent, Template) |
| `templates/tenant-indirect.sql.template` | `.sql.template` | TENANT_INDIRECT via FK chain |
| `templates/user-owned.sql.template` | `.sql.template` | USER_OWNED (userId-scoped) |
| `templates/ambiguous-schema-additions.sql.template` | `.sql.template` | Phase 4 — adds organizationId column + backfill |
| `templates/helper-functions.sql.template` | `.sql.template` | One-time setup: `current_org_id()`, `current_user_id()` SQL functions |
| `templates/composite-index.sql.tpl` | `.sql.tpl` | Reusable index template (CONCURRENTLY note included) |
| `templates/policy-admin-bypass.sql.tpl` | `.sql.tpl` | Reference: BYPASSRLS verification queries |

### Tests

| Path | When to run |
|------|------------|
| `tests/step0.test.ts` | Static checks (no DB) — before Phase 1 |
| `tests/step1.test.ts` | After `step1-inventory.ts --dry-run` |
| `tests/step2.test.ts` | After `step2-classify.ts` |
| `tests/step3.test.ts` | CI — validates template files exist + SQL content (no DB) |
| `tests/step4.test.ts` | After applying migration to staging |
| `tests/step5.test.ts` | After `step5-runbook.ts` |
| `tests/cross-tenant.test.ts` | Staging + production — cross-tenant isolation |
| `tests/public-routes.test.ts` | Staging + production — anonymous traffic |
| `tests/admin-routes.test.ts` | Staging + production — admin bypass |
| `tests/gdpr-export.test.ts` | Staging + production — GDPR export |
| `tests/performance.test.ts` | Staging — p95 regression check |
| `tests/lockout-recovery.test.ts` | Staging — flag toggle recovery |
| `tests/worker-tenant-context.test.ts` | Staging — BullMQ context |
| `tests/_helpers/get-rls-client.ts` | Test helper — RLS client factory |

### Reference

| Path | Purpose |
|------|---------|
| `reference/model-classifications.md` | Complete 61-model list with phase, FK chain, notes |
| `reference/model-classifications.json` | Machine-readable; generated by `audit.sh --inventory` |
| `reference/policy-patterns.md` | Decision tree: which template for each classification |
| `reference/rollout-playbook.md` | Quick-reference map of all scripts, docs, env vars |
| `reference/cross-tenant-routes.md` | Catalog of public/admin/GDPR routes requiring special handling |
| `reference/decision-log.md` | Append-only log of rollout decisions |
| `reference/preflight-report.json` | Generated by STEP 0 preflight |

---

## Skill version history

- **1.1.0** (2026-05-23) — Merged v2 scaffolding. Added step-prefixed scripts
  (`step1`–`step5`), `.sql.template` policy templates, `step0`–`step5` test stubs,
  and three reference docs (`model-classifications.md`, `policy-patterns.md`,
  `rollout-playbook.md`). Corrected model counts to match post-PR #125 schema
  (13 TENANT_DIRECT, 36 TENANT_INDIRECT, 4 USER_OWNED, 7 GLOBAL, 1 AMBIGUOUS).
  Dropped 7 duplicate files (3 scripts, 4 `.sql.tpl` policy templates).

- **1.0.0** (2026-05-18) — Initial release. Incorporates findings from forensic
  analysis: three-role architecture, public/anonymous endpoint handling,
  GDPR + admin endpoint handling, `isPublic` marketplace policy clauses,
  CI fix, `withOrgContext` patch as Phase 0 prerequisite.

---

## References

- `skill-rls-rollout-ANALYSIS.md` — Current state assessment
- `skill-rls-rollout-PLAN-V2.md` — Full implementation plan (this skill is the executor)
- `skill-rls-rollout-FORENSIC-REPORT.md` — Hallucinations and gaps caught in v1
- PostgreSQL RLS docs: <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- Prisma Client Extensions: <https://www.prisma.io/docs/concepts/components/prisma-client/client-extensions>
