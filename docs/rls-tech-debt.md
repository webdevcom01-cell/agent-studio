# RLS Rollout — Tech Debt Tracking

Running list of issues discovered during the Row-Level Security (RLS)
rollout (`skill-rls-rollout-PLAN-V2.md`) that were intentionally
deferred. Each item should be addressed before the dependent RLS phase
listed under **Resolve before**.

This file is updated as new issues surface. Closed items move to the
**Resolved** section at the bottom rather than being deleted, so the
history of decisions is preserved.

---

## Open

### 2. `MCP pool shutdown triggered` log noise during SSG

**Severity**: Low (noise, not error) — but worth resolving before
Phase 0e because it pollutes the build-log signal we'll be reading.
**Surfaced in**: PR #97 Docker build logs
**Resolve before**: Phase 0e (so build logs are clean when diagnosing
the `SET LOCAL hnsw.ef_search` fix in `src/lib/knowledge/search.ts`)

**Symptom**

During the Next.js static page generation phase of the Docker build,
the message `MCP pool shutdown triggered` is logged 6+ times in rapid
succession:

```
#29 1499.5 {"level":"info","message":"MCP pool shutdown triggered",
            "timestamp":"2026-05-18T09:57:06.178Z"}
#29 1500.1 {"level":"info","message":"MCP pool shutdown triggered",
            "timestamp":"2026-05-18T09:57:07.198Z"}
[... 4 more in the next 20 seconds ...]
```

**Diagnosis (likely)**

A page module or API route is being imported during SSG and
eagerly initializes the MCP pool. Each SSG invocation that touches
that module triggers a setup-and-teardown cycle. The actual MCP
client is probably fine — this is a side-effectful import path.

**Why this matters**

Not a correctness bug; the build succeeds. But it is signal pollution
that will hide real issues when we diagnose the next failure. Cleaner
build logs make future debugging cheaper.

**Proposed fix**

Trace the import chain that pulls the MCP client into SSG. Convert
to a lazy initializer (e.g. wrap in `getMcpPool()` that constructs on
first call, not at module load).

**Recommendation**: Diagnose during Phase 0e pre-flight reading of
`src/lib/knowledge/search.ts` and adjacent modules. If it's a quick
fix, bundle with 0e; if not, separate PR.

---

### 3. Railway "Wait for CI" toggle is OFF

**Severity**: HIGH for Phase 0b+ (when actual RLS migrations land)
**Surfaced in**: Railway production environment settings, observed
during Phase 0a deploy verification
**Resolve before**: Phase 0b (no exceptions — see below)

**Symptom**

In Railway `reliable-youth` project → `agent-studio` service →
production environment → Settings → Source → the **"Wait for CI"**
toggle is **disabled**. This means Railway begins building a new
deployment as soon as a commit appears on the watched branch,
independent of whether GitHub Actions CI has finished or even started.

**Why this matters**

For Phase 0a (this PR), low impact — the patched `withOrgContext`
helper has zero production callers, so a too-early deploy could not
have caused incorrect behavior.

**For Phase 0b onward this becomes dangerous**:

- Phase 0b adds Postgres `app_user` and `admin_user` roles with
  migration `prisma/migrations/YYYYMMDD_create_rls_roles/`.
- If the migration is not yet applied to the production database (or
  fails mid-application), but Railway has already begun deploying the
  application code that expects those roles, the app will start up
  against a database in a mismatched state.
- Even worse: Railway could deploy an app that *passes startup but
  fails on every tenant query* because the role/policy stack is
  partially applied.

**Proposed fix**

In Railway dashboard:

1. `reliable-youth` → `agent-studio` service
2. Settings tab → Source section
3. Toggle **Wait for CI** to ON
4. Save

After this change, Railway will wait for GitHub Actions checks
required on `main` to complete before building. This is a one-time
configuration change, no code or migration required.

**Recommendation**: **Enable before Phase 0b PR is opened.** Hard
requirement for safe migration rollout.

**STATUS: ✅ RESOLVED 2026-05-20** — "Wait for CI" was enabled in
Railway production environment before PR #105 merged. Phase 0b
deploys are now gated on CI green status. See Resolved section below.

---

### 4. E2E tests have pre-existing assertion failures on main

**Severity**: Medium (test coverage gap, not production-breaking)
**Surfaced in**: CI run #770 for commit 2807c8b (PR #105 merge)
**Resolve before**: Phase 0c (so that tenant-context wiring lands
against trustworthy E2E coverage)

**Symptom**

Known failing specs (all root cause: auth redirect in CI env — session
not established before test assertions run):

- `e2e/tests/dashboard.spec.ts` — 2 failures
- `e2e/tests/api/agents-api.spec.ts` — 2 failures
- `e2e/tests/eval-generation.spec.ts` — 5 failures
- `e2e/tests/agent-import-export.spec.ts` — 2 failures

These failures are **pre-existing**, not introduced by Phase 0a, 0e,
0b, 0a.7, or 0f work. They were masked until now because:

1. E2E only runs on push to main (skipped on PRs without `e2e` label)
2. Railway's "Wait for CI" was off until 2026-05-20, so deploys
   went through despite red CI

**Temporary mitigation in PR #105**

`continue-on-error: true` added to the E2E job in `ci.yml` so the
workflow as a whole reports green and Railway deploys proceed. The
E2E job still runs and surfaces failures as annotations — failures
remain visible, just not blocking.

The `ci.yml` comment currently names only `agents-api.spec.ts` and
`agent-import-export.spec.ts`. **TODO**: update that comment to list
all four failing specs (`dashboard.spec.ts`, `agents-api.spec.ts`,
`eval-generation.spec.ts`, `agent-import-export.spec.ts`) so the
comment stays accurate for future readers.

**Proposed permanent fix**

A dedicated debugging workstream:

1. Clone affected specs locally and reproduce failures with
   `pnpm test:e2e e2e/tests/api/agents-api.spec.ts`
2. For each failure, determine whether the test is stale (assert on
   outdated API shape) or the code regressed (API behavior changed
   without test update)
3. Fix one PR per failing spec, with the `e2e` label so the spec
   runs on PR
4. After all 11 errors are addressed, **revert
   `continue-on-error: true`** in a small follow-up PR

**Hard deadline**: 2026-06-03 (14 days from this item's creation).
After that, escalate — having `continue-on-error` on a test job
indefinitely is enterprise technical debt.

**Why this matters for enterprise path**

`continue-on-error` is acceptable as a time-bounded measure with a
tracked deadline. It is **not acceptable as permanent state** —
auditors and compliance reviews will flag it. The deadline is the
discipline mechanism. Honor it.

---

### 5. Phase 0a.7b — Schema drift: CI uses `db push` instead of migrations

**Severity**: Medium (CI paper-over; real schema gap could mask migration bugs)
**Surfaced in**: Phase 0a.7 CI fix work (PR #114, 2026-05-22)
**Resolve before**: Phase 1 (RLS policy enforcement) — policy migrations
must be tested against a schema that exactly matches production

**Symptom**

The CI `e2e` job currently runs `prisma migrate deploy` (correctly), but
this fails silently against the test database because 17 tables and ~15
columns present in the live Railway schema are missing from the migration
history. The Phase 0a.7 fix added a fallback `prisma db push --accept-data-loss`
step after the failed migration to create those structures directly.

This is a **CI-only paper-over**. The test database is not schema-accurate
relative to production, meaning:

1. Integration tests that touch the 17 missing tables run against a
   schema that was never validated by a migration.
2. Any new migration that alters one of those tables may fail in CI
   even though it would succeed in production (or vice versa).
3. `--accept-data-loss` in CI silently drops columns on re-runs,
   potentially hiding data-shape regressions.

**Root cause**

Schema drift accumulated while the project used `prisma db push` for
rapid iteration instead of `prisma migrate dev`. The migration history
does not reflect all of the structural changes that were pushed directly.

**Proposed fix**

Generate a reconciliation migration that captures the full delta between
the current `prisma/migrations/` history and the production schema:

```bash
# On a clean DB matching production schema:
pnpm prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/YYYYMMDD_schema_reconciliation/migration.sql
pnpm prisma migrate resolve --applied YYYYMMDD_schema_reconciliation
```

Then remove the `prisma db push --accept-data-loss` fallback from
`ci.yml` and verify CI goes green using migrations only.

**Estimated scope**: 1–2 days. Requires a Railway DB dump for accurate
diff; the 17 missing tables must be inventoried first.

**Recommendation**: Schedule as a standalone PR before Phase 0c, so
Phase 0c's JWT/AsyncLocalStorage migration is tested against a
schema-accurate CI database.

---

## Future-watch (no action required yet)

These are not gates but should be reviewed before scaling beyond
Phase 1.

- **Railway preview deploys** — currently no preview environment per
  PR. Phase 1+ should consider this so migrations can be tested in
  an isolated preview database before merge.
- **Deployment status reporting back to GitHub PRs** — Railway deploy
  success/fail is not currently posted as a status check on GitHub
  PRs. Useful before Phase 2 for reviewer visibility.
- **Auto-rollback on healthcheck failure** — `railway.toml` has
  `restartPolicyType = "ON_FAILURE"` for app restarts within a
  deploy, but no automatic rollback to previous deploy on sustained
  healthcheck failure. Consider before Phase 2.
- **Phase 0a.5 HAL-8 hotfix may be removable post-0d** — The HAL-8
  hotfix (`20260521000000_hal8_null_exploit_hotfix`) Step 1 DO block
  contains a hardcoded prod-user backfill (user ID `cmmwaactt0000n80kazwd1c54`)
  that is superseded by the general Phase 0d migration. The migration
  file is immutable so no change is needed there; the debt is code-level:
  verify during Phase 1 prep that no code path references the hardcoded
  org ID `cmpersonal00org0000000001` — if found, replace with a dynamic
  org lookup. The RLS policies added in Steps 3–5 of the 0a.5 migration
  are permanent and must stay.

---

## Resolved

### 1. Docker Build & Push timeout (2026-05-21)

**Resolution**: `.github/workflows/docker.yml` updated in two ways to fix
the 30-minute timeout that was causing Railway 'CI check suite failed' and
blocking deploys of PR #107, #108, and #111.

1. **Raised `timeout-minutes` from 30 → 45.** Gives slack above the Phase
   0a observed 30m 29s wall-clock.
2. **Dropped `linux/arm64` from the build platforms matrix.** arm64 was
   being cross-compiled via QEMU emulation, consuming roughly half of the
   build wall-clock for zero current consumers (Railway runs amd64; k8s
   overlays reference placeholder `ghcr.io/org/...` images and `example.com`
   hosts, i.e. not actually deployed).

Combined effect: Docker build should now complete in ~15–18 minutes with
20+ minutes of headroom against the timeout. If arm64 is needed later
(Apple Silicon dev, AWS Graviton), add a separate `release-arm64.yml`
that runs only on tagged releases, not every PR.

**Related**: Surfaced as a deploy blocker once tech-debt item #3 (Wait
for CI) was enabled on 2026-05-20.

---

### 3. Railway "Wait for CI" toggle enabled (2026-05-20)

Wait for CI was enabled in Railway production environment before
PR #105 merged. Phase 0b deploys are now gated on CI green status.
See full context in Open section item #3 above.

---

## References

- `skill-rls-rollout-PLAN-V2.md` — the rollout plan that surfaced
  these items
- `skill-rls-rollout-FORENSIC-REPORT.md` — forensic analysis;
  HAL-7 and §3 #6 mention CI gaps adjacent to these items
- PR #97 — Phase 0a merge that produced items #1 and #2
- `railway.toml` — Railway deployment configuration
