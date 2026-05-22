---
name: rls-status-checker
version: 1.0.0
description: >
  Consolidated RLS rollout status dashboard across 4 systems:
  git, GitHub CI, Railway, and PostgreSQL.
  Produces a phase-tracking table with drift alerts.
  Read-only — never modifies files or DB.
  Triggers: "/rls-status-checker", "rls status", "check rls rollout",
  "rls health", "koliko smo daleko sa rls", "rls dashboard",
  "proveri rls", "rls phase status", "gde smo sa rls"
disable-model-invocation: false
allowed-tools:
  - Bash
  - Read
  - Grep
---

# RLS Status Checker

One-command dashboard for the RLS rollout state across git, GitHub CI,
Railway, and PostgreSQL. Detects drift between systems and tracks each
phase against real evidence — not hardcoded values.

## Flags

| Flag | Effect |
|------|--------|
| (none) | Full check: git + gh + curl + psql |
| `--verbose` | Print raw command output alongside the summary table |
| `--dry-run` | Skip all psql queries; git + gh + curl only |
| `--json` | Emit machine-readable JSON instead of Markdown tables |

---

## STEP 0 — Parse flags

Check the invocation message for `--verbose`, `--dry-run`, `--json`.
Announce mode in one sentence: e.g. "Running in dry-run mode — DB queries skipped."

---

## STEP 1 — Parallel data collection

**Send all Bash calls in a single message so they run in parallel.**
Sections 1a, 1b, 1c, 1e are always run. Section 1d is skipped if `--dry-run`.

### 1a — GIT STATE

```bash
git branch --show-current
git log -1 --format="%H %s"
git status --porcelain
git rev-list --count HEAD ^origin/main 2>/dev/null || echo "0"
git rev-list --count origin/main ^HEAD 2>/dev/null || echo "0"
```

Capture: `branch`, `head_sha` (first 7 chars of full SHA), `head_message`,
`is_clean` (empty porcelain = true), `commits_ahead`, `commits_behind`.

### 1b — GITHUB STATE

```bash
gh pr list --state open --json number,title,headRefName --limit 10
gh run list --branch main --limit 5 \
  --json name,status,conclusion,headSha,createdAt
gh run list --branch main --status failure --limit 3 \
  --json name,headSha,createdAt
```

Capture: `open_pr_count`, `open_prs[]` (number + title),
`recent_runs[]` (name + conclusion), `failed_runs[]`.

### 1c — RAILWAY STATE

```bash
curl -sf https://agent-studio.up.railway.app/api/health
```

Capture from JSON: `status`, `db`, `redis`, `replicaId`.
If curl fails or returns non-200: mark Railway as ❌ UNREACHABLE.

### 1d — DB STATE (skip if --dry-run)

Run as a single psql invocation using `$DATABASE_URL`. If `$DATABASE_URL`
is not set, mark DB STATE as ⚠️ NO_DB_URL and skip.

```sql
-- M1: Applied migrations (latest 10)
SELECT migration_name, finished_at::date AS applied
FROM _prisma_migrations
WHERE finished_at IS NOT NULL
ORDER BY started_at DESC
LIMIT 10;

-- M2: NULL-org agent count (must be 0 after Phase 0d)
SELECT COUNT(*)::int AS null_org_count
FROM "Agent"
WHERE "organizationId" IS NULL;

-- M3: Total RLS policy count in public schema (target ≥ 32)
SELECT COUNT(*)::int AS policy_count
FROM pg_policies
WHERE schemaname = 'public';

-- M4: ENABLE + FORCE RLS on 8 target tables
SELECT tablename,
       rowsecurity      AS enabled,
       forcerowsecurity AS forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'Agent','Flow','KBSource','KBChunk',
    'Conversation','AgentExecution','CostEvent','Template'
  )
ORDER BY tablename;

-- M5: DB roles (Phase 0b completion check)
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('app_user', 'admin_user');

-- M6: Organization count (Phase 0d proxy — personal orgs backfilled when > 1)
SELECT COUNT(*)::int AS org_count
FROM "Organization";
```

### 1e — FILESYSTEM SIGNALS (always run, parallel with 1a–1c)

Run all greps in one message:

```bash
# Phase 0a: withOrgContext wraps $transaction
grep -c '\$transaction' src/lib/db/rls-middleware.ts

# Phase 0a.5: HAL-8 NULL exploit hotfix committed
git log --oneline | grep -c "HAL-8\|0a\.5"

# Phase 0a.6: Sentry SQLSTATE 42501 tagging
grep -c "isRlsViolation\|42501" sentry.server.config.ts

# Phase 0a.7a: prisma migrate deploy in CI
grep -c "migrate deploy" .github/workflows/ci.yml

# Phase 0a.7b: app_user env vars exported in CI
grep -c "DATABASE_URL_APP_USER" .github/workflows/ci.yml

# Phase 0b.5: how many of the 5 helper files now use withOrgContext
grep -l "withOrgContext\|withAdminBypass" \
  src/lib/budget/cost-tracker.ts \
  src/lib/scheduler/execution-engine.ts \
  src/lib/sdlc/pipeline-manager.ts \
  src/lib/versioning/version-service.ts \
  src/lib/evals/generator.ts 2>/dev/null | wc -l

# Phase 0c: currentOrgId JWT claim wired
grep -c "currentOrgId" src/types/next-auth.d.ts

# Phase 0e: SET LOCAL hnsw.ef_search inside transaction
grep -c "hnsw.ef_search" src/lib/knowledge/search.ts

# Phase 0f: RLS_ENFORCEMENT_ENABLED feature flag
grep -rc "RLS_ENFORCEMENT_ENABLED" src/lib/feature-flags/ 2>/dev/null | \
  awk -F: '{sum += $2} END {print sum+0}'
```

Also count pending migrations:

```bash
find prisma/migrations -maxdepth 1 -name "*.sql" | wc -l
```

---

## STEP 2 — Drift detection

Evaluate using data from STEP 1. Three checks:

### D1 — Commit drift (git vs Railway)

Compare `head_sha` (7-char from 1a) against Railway `replicaId` (from 1c).

- Equal → `✅ in sync`
- Different → `🔴 ALERT — Railway deployed <replicaId>, main is <head_sha>`
- Railway unreachable → `⚠️ cannot determine`

### D2 — Migration drift

Compare migration file count (find output) vs M1 applied count.

- File count ≤ applied count → `✅ 0 pending`
- File count > applied → `🔴 ALERT — N migrations not yet deployed`
- `--dry-run` active → `⚠️ skipped (--dry-run)`

### D3 — CI failures on main

- `failed_runs[]` empty → `✅ clean`
- Non-empty → `🔴 ALERT — N failed runs: <names>`

---

## STEP 3 — Phase status derivation

Map signal counts to status using this table.
**Never hardcode a phase as ✅ — always derive from STEP 1 evidence.**

| Phase | Description | ✅ live | 🟡 partial | ❌ not started |
|-------|-------------|---------|-----------|---------------|
| 0a | withOrgContext $transaction | `rls_middleware_count ≥ 1` | — | `= 0` |
| 0a.5 | HAL-8 NULL exploit hotfix | `git_hal8_count ≥ 1` | — | `= 0` |
| 0a.6 | Sentry SQLSTATE 42501 tagging | `sentry_count ≥ 1` | — | `= 0` |
| 0a.7 | Full CI fix (migrate deploy + roles) | `ci_migrate ≥ 1` AND `ci_env ≥ 1` | `ci_migrate ≥ 1` XOR `ci_env ≥ 1` | both `= 0` |
| 0b | app_user + admin_user DB roles | M5 returns 2 rows | M5 unavailable (--dry-run) but git log has commit | git log = 0 AND M5 = 0 |
| 0b.5 | Refactor 5 raw helpers to withOrgContext | `helper_file_count = 5` | `1–4 files` | `= 0` |
| 0c | JWT currentOrgId + AsyncLocalStorage | `currentOrgId_count ≥ 1` | — | `= 0` |
| 0d | Personal org backfill (no NULL agents) | M2 `= 0` AND M6 `> 1` | M2 `= 0` but M6 `≤ 1`, or --dry-run | M2 `> 0` |
| 0e | SET LOCAL hnsw.ef_search inside tx | `hnsw_count ≥ 1` | — | `= 0` |
| 0f | RLS_ENFORCEMENT_ENABLED feature flag | `flag_count ≥ 1` | — | `= 0` |

---

## STEP 4 — Render output

### Default (Markdown)

Emit three tables in this exact order.

```
## RLS Rollout Status — YYYY-MM-DD HH:MM

### Phase Tracking
| Phase | Description                    | Status | Evidence |
|-------|--------------------------------|--------|----------|
| 0a    | withOrgContext $transaction    | ✅ live | 1 match rls-middleware.ts:80 |
| 0a.5  | HAL-8 NULL exploit hotfix      | ✅ live | commit e9fd740 in log |
| 0a.6  | Sentry SQLSTATE 42501          | ✅ live | 5 matches sentry.server.config.ts |
| 0a.7  | Full CI fix                    | ❌      | 0 matches ci.yml |
| 0b    | app_user + admin_user roles    | ✅ live | M5: 2 roles confirmed |
| 0b.5  | Refactor 5 raw helpers         | ❌      | 0/5 files use withOrgContext |
| 0c    | JWT currentOrgId claim         | ❌      | 0 matches next-auth.d.ts |
| 0d    | Personal org backfill          | 🟡      | --dry-run: DB not checked |
| 0e    | SET LOCAL hnsw in tx           | ✅ live | 1 match search.ts:209 |
| 0f    | RLS_ENFORCEMENT_ENABLED flag   | ❌      | 0 matches feature-flags/ |

### System Health
| System     | Status | Detail |
|------------|--------|--------|
| Git        | ✅ clean | branch: main, HEAD: d14333e |
| GitHub CI  | ✅     | 5/5 recent runs passing |
| Railway    | ✅ healthy | replicaId: a2075835, db: ok, redis: ok |
| DB         | ✅     | 32 policies, 0 NULL-org agents, 2 roles |

### Drift Alerts
| Check                     | Status | Detail |
|---------------------------|--------|--------|
| Commit drift (git vs Railway) | ✅ in sync | both: d14333e |
| Migration drift           | ✅ 0 pending | 47 files = 47 applied |
| CI failures on main       | ✅ none | last 5 runs: all passing |
```

Fill in actual values from STEP 1–3. Never use placeholder values.

### --verbose mode

After each table, append a `<details>` block with raw command output:

```markdown
<details>
<summary>Raw: git state</summary>

\`\`\`
<raw output here>
\`\`\`
</details>
```

### --json mode

Emit a single JSON object with keys: `phases`, `health`, `drift`, `generated_at`.
No prose. Schema follows the table columns above.

---

## Reference files

| Path | Purpose |
|------|---------|
| `reference/phase-definitions.md` | Completion criteria + rationale per phase |
| `reference/check-queries.sql` | SQL batch for DB STATE (M1–M6) |
| `tests/expected-output.md` | Expected --dry-run output fixture |
