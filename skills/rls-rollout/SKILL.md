---
name: rls-rollout
version: 1.0.0
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

| Classification | Count (expected) | Strategy |
|----------------|------------------|----------|
| `TENANT_DIRECT` | 14 | Direct `organizationId = current_setting(...)` policy |
| `TENANT_INDIRECT` | 35 | Subquery via parent table |
| `USER_OWNED` | 5 | `userId` based policy |
| `GLOBAL` | 5 | No RLS (User, VerificationToken, Skill, Organization, PipelineTemplate) |
| `AMBIGUOUS` | 2-3 | Requires schema change before RLS (AuditLog, ModelPerformanceStat, optionally Template) |

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
| 1 | TENANT_DIRECT | 14 | Low |
| 2 | TENANT_INDIRECT | 35 | Medium |
| 3 | USER_OWNED | 5 | Low |
| 4 | AMBIGUOUS | 2-3 | High (schema changes) |

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

| Path | Purpose |
|------|---------|
| `scripts/audit.sh` | STEP 0 + STEP 1 driver |
| `scripts/generate-migration.ts` | STEP 2 + STEP 3 |
| `scripts/verify-staging.sh` | STEP 4 driver |
| `scripts/rollback.sh` | Emergency rollback |
| `scripts/ci-fix.sh` | Patches `.github/workflows/ci.yml` to add migrate deploy |
| `templates/*.sql.tpl` | SQL policy + index templates |
| `tests/*.test.ts` | Verification test suites |
| `tests/_helpers/get-rls-client.ts` | Test client factory with role selection |
| `reference/model-classifications.json` | Generated by STEP 1 |
| `reference/decision-log.md` | Append-only log of rollout decisions |
| `reference/cross-tenant-routes.md` | Catalog of routes requiring special handling |

---

## Skill version history

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
