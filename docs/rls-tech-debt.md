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

### 1. CI Docker Build & Push hits 30-minute timeout

**Severity**: Medium
**Surfaced in**: PR #97 (Phase 0a merge)
**Resolve before**: Phase 0b (when Docker build must be reliable as a
gate for migration-bearing PRs)

**Symptom**

`.github/workflows/docker.yml` has `timeout-minutes: 30`. On the Phase
0a PR, the job ran 30m 29s and was cancelled by GitHub Actions during
the post-build `Collecting build traces` step. The Next.js compile
inside the container completed successfully in **15.3 minutes**, then
the remaining 14.7 minutes were consumed by static page generation
(70/70 pages) plus `Collecting build traces`, leaving no slack.

**Evidence**

```
#29 1234  ✓ Compiled successfully in 15.3min
#29 1242  ✓ Generating static pages (70/70)
#29 1245  Finalizing page optimization ...
#29 1246  Collecting build traces ...
[...]
Error: The operation was canceled.
```

**Why this matters**

Docker Build & Push is currently **not** a required check on PRs into
`main`, so the timeout did not block Phase 0a. Once RLS migrations and
multi-role DB configuration land in Phase 0b+, we need Docker build
to be a trustworthy verification path. A flaky timeout in the gate is
a credibility problem before it is a correctness problem.

**Proposed fixes (pick one)**

- **Raise the cap to 45 minutes** in `.github/workflows/docker.yml`.
  Cheapest fix. Adds slack without touching the build pipeline. May
  mask a slowly-growing real problem.
- **Move Docker build off the PR pipeline** to push-on-main only.
  Eliminates the per-PR cost entirely but loses the PR-level
  verification that the Dockerfile + lockfile still build cleanly.
- **Reduce Next.js compile time** with `--turbopack` build, partial
  prerendering review, or splitting the build into prod vs preview.
  Highest engineering cost but addresses the underlying trend.

**Recommendation**: Raise to 45m as a Phase 0a follow-up. Investigate
compile-time optimization in a separate, non-blocking workstream.

---

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

---

## Resolved

(none yet)

---

## References

- `skill-rls-rollout-PLAN-V2.md` — the rollout plan that surfaced
  these items
- `skill-rls-rollout-FORENSIC-REPORT.md` — forensic analysis;
  HAL-7 and §3 #6 mention CI gaps adjacent to these items
- PR #97 — Phase 0a merge that produced items #1 and #2
- `railway.toml` — Railway deployment configuration
