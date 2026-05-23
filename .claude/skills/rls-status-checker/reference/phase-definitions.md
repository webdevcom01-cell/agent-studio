# RLS Phase Definitions

Append-only reference. Each phase: what it does, completion criteria,
blocking dependency, and known commits/PRs.

---

## Execution Order — Phase 0 remaining (confirmed 2026-05-22)

```
0a.7  CI fix            1-2h   independent; unlocks confidence in all future tests
 └─→ 0f   feature flag  30min  ─┐
     0c   JWT+ALS       ~1d   ──┼─ all three parallel after 0a.7
     0d   backfill      ~1d   ──┘
           └─→ 0b.5  helpers  last Phase 0; blocked on all three above
                └─→ ── Phase 1 (policy rollout) ──
```

**Parallel safe:** 0f, 0c, and 0d can all run simultaneously after 0a.7.
**Not parallel safe:** 0b.5 requires all three (0f kill switch ready, 0c currentOrgId in workers, 0d no NULL agents).

---

## Phase 0a — withOrgContext $transaction patch

**What it does:** Wraps `set_config('app.current_org_id', ...)` inside a
`$transaction` in `src/lib/db/rls-middleware.ts`. Without this, pool
connections can receive the `set_config` on a different connection than the
queries that follow, silently defeating tenant isolation.

**Completion criteria:**
- `grep -c '\$transaction' src/lib/db/rls-middleware.ts` returns ≥ 1
- `withOrgContext` signature accepts a `(tx: Prisma.TransactionClient)` callback

**Blocking:** Yes — must be live before any RLS policies can be enforced.

**Status:** ✅ live
**Commit:** present in main (line 80 of rls-middleware.ts confirmed 2026-05-22)

---

## Phase 0a.5 — HAL-8 NULL exploit hotfix

**What it does:** Closes a data-leak where agents with `organizationId = NULL`
were visible to all users. Applied as a hotfix ahead of the full Phase 0d
backfill migration.

**Completion criteria:**
- `git log --oneline | grep "HAL-8\|0a\.5"` returns ≥ 1 match

**Blocking:** No — independent fix. Phase 0d will complete the NULL cleanup.

**Status:** ✅ live
**Commit:** e9fd740 (PR #107)

---

## Phase 0a.6 — Sentry SQLSTATE 42501 tagging

**What it does:** Tags Sentry error events that carry PostgreSQL SQLSTATE 42501
(permission denied — RLS policy violation) with a distinct fingerprint and
`sqlstate: "42501"` context. Makes RLS violations observable in production
before enforcement is fully enabled.

**Completion criteria:**
- `grep -c "isRlsViolation\|42501" sentry.server.config.ts` returns ≥ 1

**Blocking:** No — observability only.

**Status:** ✅ live
**Commit:** 5a9b131 (PR #111)

---

## Phase 0a.7 — Full CI fix

**What it does:** Three changes to `.github/workflows/ci.yml`:
1. Add `prisma migrate deploy` step so migrations are applied in CI
2. Create `app_user` and `admin_user` roles in the CI test database
3. Export `DATABASE_URL_APP_USER` and `DATABASE_URL_ADMIN_USER` as env vars
   so integration tests can run under the correct roles

**Completion criteria (all three must pass):**
- `grep -c "migrate deploy" .github/workflows/ci.yml` returns ≥ 1
- `grep -c "DATABASE_URL_APP_USER" .github/workflows/ci.yml` returns ≥ 1
- CI runs green after the change

**Blocking:** Yes — without this, RLS integration tests in CI will fail or
be skipped silently, giving false confidence before Phase 1.

**Status:** ✅ live
**PR:** #114 — merged 2026-05-22

---

## Phase 0b — app_user + admin_user DB roles

**What it does:** Creates two PostgreSQL roles in the production database:
- `app_user` — tenant-scoped requests (no BYPASSRLS)
- `admin_user` — cross-tenant operations (BYPASSRLS granted)

**Completion criteria:**
- `SELECT rolname FROM pg_roles WHERE rolname IN ('app_user','admin_user')`
  returns exactly 2 rows

**Blocking:** Yes — RLS policies reference these roles by name.

**Status:** ✅ live
**Commit:** 407b8d3 (Phase 0b migration)

---

## Phase 0b.5 — Refactor 5 raw $transaction helpers

**What it does:** Refactors 5 service files that use raw `prisma.$transaction`
directly (bypassing org context) to instead call `withOrgContext` or
`withAdminBypass` (for cross-tenant operations):

1. `src/lib/budget/cost-tracker.ts`
2. `src/lib/scheduler/execution-engine.ts`
3. `src/lib/sdlc/pipeline-manager.ts`
4. `src/lib/versioning/version-service.ts`
5. `src/lib/evals/generator.ts`

**Completion criteria:**
- `grep -l "withOrgContext\|withAdminBypass" <all 5 files> | wc -l` returns 5

**Blocking:** No — these files can operate without tenant context until Phase 1
policies are enforced. But they must be refactored before Phase 1 goes live
in production.

**Status:** ❌ not started (0/5 files refactored as of 2026-05-22)

---

## Phase 0c — JWT currentOrgId + AsyncLocalStorage

**What it does:** Three application-side changes:
1. Add `currentOrgId` to the JWT session type (`src/types/next-auth.d.ts`)
2. Wire `currentOrgId` through NextAuth session callbacks
3. Propagate org context via AsyncLocalStorage so BullMQ workers and
   background jobs can read it without passing it through every call frame

**Completion criteria:**
- `grep -c "currentOrgId" src/types/next-auth.d.ts` returns ≥ 1
- `grep -rn "withTenant\|withAdminBypass" src/lib/api/` returns ≥ 1 match

**Blocking:** Yes — without this, `withOrgContext` has no org ID to set for
server-side requests; must be complete before Phase 1.

**Status:** ✅ live (PR #118 merged 2026-05-23, commit 8de264f)

---

## Phase 0d — Personal org backfill migration

**What it does:** Creates a personal `Organization` record for every user
who has agents with `organizationId = NULL`, then assigns those agents to
the personal org. Eliminates the dual-tenancy code path and resolves the
data-leak bug (NULL-org agents are visible cross-tenant).

**Completion criteria (both must pass):**
- `SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL` returns 0
- `SELECT COUNT(*) FROM "Organization"` returns > 1 (at least one personal org exists)

**Blocking:** Yes — NULL agents will bypass RLS policies (no org context to match).

**Status:** ✅ live (PR #119 merged 2026-05-23, commit 5a1a0a9)

---

## Phase 0e — SET LOCAL hnsw.ef_search inside transaction

**What it does:** Wraps the `SET LOCAL hnsw.ef_search` call in
`src/lib/knowledge/search.ts` inside a transaction. `SET LOCAL` only takes
effect within a transaction; outside one it behaves as `SET SESSION`,
which leaks the setting across pool connections.

**Completion criteria:**
- `grep -c "hnsw.ef_search" src/lib/knowledge/search.ts` returns ≥ 1
- The match is inside a `$executeRaw` within a transaction block

**Blocking:** No — correctness fix for pgvector HNSW search, not RLS critical path.

**Status:** ✅ live
**Location:** `src/lib/knowledge/search.ts:209`

---

## Phase 0f — RLS_ENFORCEMENT_ENABLED feature flag

**What it does:** Wires `RLS_ENFORCEMENT_ENABLED` env var as a feature flag
that enables/disables RLS enforcement globally without a deploy:
- `false` (default) — policies exist in DB but `withOrgContext` is a no-op
- `true` — policies are enforced on every request

Also ensures CI has the flag set to `true` so integration tests run with
enforcement active.

**Completion criteria:**
- `grep -rc "RLS_ENFORCEMENT_ENABLED" src/lib/feature-flags/` returns ≥ 1
- CI yml includes the flag in the test environment

**Blocking:** Yes — this is the kill switch. Must be in place before Phase 1
enforcement is enabled in production.

**Status:** ✅ live
**PR:** #115 — merged 2026-05-23
