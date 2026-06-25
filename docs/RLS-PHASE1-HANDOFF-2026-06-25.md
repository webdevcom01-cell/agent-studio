# RLS Enforcement — Session Handoff (2026-06-25)

Read this first if you're a new session picking up the RLS work. It captures
everything done so far, the current state, the plan, and exactly where to
continue. **No production behaviour has changed** — all edits are behaviour-
preserving while RLS enforcement is OFF.

---

## 0. TL;DR — where we are

- Goal: make Postgres **RLS actually enforced** at runtime (today the app
  connects as the `postgres` **superuser**, which bypasses all RLS).
- DB/policy foundation is **proven production-ready** (isolation tested under
  `app_user`). Roles exist with passwords set. Enforcement is still **OFF**.
- **Phase 1 (route every tenant query through org context)** is in progress:
  **82 / 298** raw `prisma.<tenantModel>` sites migrated to `withOrgContext`.
  The **entire `authResult`-based API zone is done**; remaining work is lib
  services (184), workers (16), and a few special API routes.
- Branch: `chore/rls-phase4`. Whole-project `tsc` is **green (0 errors)**.

---

## 1. What was accomplished (this session)

1. **Diagnosed "agents invisible on dashboard"** → root cause was NOT the data:
   the user simply wasn't logged in (Google OAuth was broken). 23 agents exist
   across 3 real tenants (webdevcom01=11, Sudip Ghosh=9, Brahim Lee=3) + a test
   user. The MCP server connects as superuser and sees all; the dashboard is
   correctly scoped to the logged-in user.
2. **Fixed login**: Google OAuth fails with `invalid_client` ("client secret is
   invalid") at the callback — the `AUTH_GOOGLE_SECRET` in `.env.local` is stale.
   Worked around it via email+password: set a password on `webdevcom01@gmail.com`
   (`scripts/set-local-password.mjs`) and marked onboarding complete
   (`scripts/complete-onboarding.mjs`). User now logs in and sees 11 agents.
   *(Google secret still needs a real fix in Google Cloud Console — optional.)*
3. **Deep RLS audit + rollout plan** (`docs/RLS-AUDIT-AND-ROLLOUT-PLAN-2026-06-25.md`).
4. **Proved tenant isolation under `app_user`** (read-only,
   `scripts/rls-prove-isolation.mjs`): 11/9/3/0 PASS, no leak with no org context.
5. **Phase 1 inventory** (`docs/RLS-PHASE1-INVENTORY-2026-06-25.md`,
   `docs/RLS-PHASE1-WORKLIST.md`): 298 tenant raw sites (not 1,715), 112 global.
6. **Phase 1 migration started** — see §3.

## 2. Current production/DB state (verified live)

- App connects as `postgres` (SUPERUSER, BYPASSRLS) via `DATABASE_URL`. RLS not
  enforced at runtime.
- Roles `app_user` (NOBYPASSRLS) and `admin_user` (BYPASSRLS) **exist, can log in,
  have passwords set** (the user rotated them this session — values are NOT in the
  repo; ask the user).
- 48 tables RLS-enabled + FORCED; full policy coverage; all 16 RLS migrations
  applied (no drift); 0 NULL-org agents; composite indexes present on direct-tenant
  tables.
- `withOrgContext` (`src/lib/db/rls-middleware.ts`) is correct (transaction-scoped
  `set_config('app.current_org_id', …, true)`), gated by feature flag
  `rls-enforcement` (env `RLS_ENFORCEMENT_ENABLED`, currently unset/false).
- Two-client setup (`src/lib/prisma.ts`): `prisma` (→DATABASE_URL),
  `prismaAdmin` (→`DATABASE_URL_ADMIN_USER`), `prismaRead` (→`DATABASE_READ_URL`).
  `withAdminBypass` (`src/lib/api/tenant-context.ts`) uses `prismaAdmin`.
  **TODO/verify:** confirm whether `DATABASE_URL_ADMIN_USER` was wired in
  `.env.local` (`scripts/wire-admin-user.mjs`). If not, do it before cutover (R3).

## 3. Phase 1 progress — migration burn-down

Target: every raw `prisma.<tenantModel>.<op>` → `withOrgContext(prisma, orgId, (tx) => tx.<model>...)`.

- **Start:** 298 tenant raw sites · **Now:** **216** · **Done:** 82.
- **API zone (`authResult.organizationId`): DONE.** Files migrated (41):
  all `agents/[agentId]/*` CRUD (mcp, memory, budget, goals, schedules*, traces*,
  knowledge/sources*, department, heartbeat*, a2a, evals*, flow/versions*,
  webhooks/executions*, instincts, permissions, pending-approvals, execute, chat,
  conversations*, pipelines/[runId]/retry), plus `agent-calls*`, `approvals*`,
  `departments/[departmentId]`, `policies`, `integrations/obsidian`.
- Method: batches 1–3 by hand; batch 4 via a codemod (`/tmp/codemod.mjs`, logic in
  the playbook) that only touches files using `authResult`, excluding admin/discover/
  cron/webhook-trigger/replay. `tsc` was the safety net (2 manual fixes: a closure
  narrowing hoist, and one route using `execOrgId` instead of `authResult`).

### Re-run the burn-down
```bash
node /tmp/phase1.mjs   # prints "RAW prisma.<model> sites — TENANT: N"
# (script logic also documented; regenerate docs/RLS-PHASE1-WORKLIST.md via the analysis)
```

## 4. What remains (216 sites) and how to do it

| Bucket | ~Sites | Org source | Helper |
|--------|--------|-----------|--------|
| **lib SERVICE** (`src/lib/**`) | ~184 | **no `authResult`** — must thread an explicit `orgId` (from the entity / job / caller) OR it's a system path | `withTenant(fn, orgId)` or `withAdminBypass` |
| **WORKER/cron** (BullMQ, scheduler, heartbeat) | ~16 | `orgId` must travel in the **job payload** | `withTenant(fn, orgId)`; tests: `worker-tenant-context` |
| **special API** | 3 | no-auth system routes: `cron/trigger-scheduled-flows`, `webhooks/[webhookId]/executions/[executionId]/replay`, `pipelines/webhook-trigger/[webhookId]` | **`withAdminBypass`** (cross-tenant) |
| **analytics/summary** | ~6 | uses `prismaRead` client | wrap with `withOrgContext(prismaRead, orgId, …)` or route through `withTenant` |
| **discover** | (isPublic) | marketplace cross-tenant read | special: SELECT policy already allows `isPublic` — likely leave/handle explicitly |

> The codemod does **not** work for services/workers — they have no `authResult`.
> Each needs judgement: is this tenant-scoped (thread orgId) or system-level
> (withAdminBypass)? Do it in themed groups: `managed-tasks`, `sdlc`,
> `ecc/instinct-engine`, `knowledge/ingest`, `webhooks/execute`, `scheduler`,
> `runtime/handlers`, `versioning`, `analytics`, `evals`.

## 5. The migration pattern
See `docs/RLS-PHASE1-PLAYBOOK.md` (before/after, rules, the closure-narrowing
gotcha). Rule of thumb:
- TENANT model on bare `prisma` → wrap in `withOrgContext`/`withTenant`.
- GLOBAL table (User, MCPServer, Skill, ApiKey, …) → leave raw.
- Cross-tenant/admin/cron/GDPR → `withAdminBypass`.
- Inside the `(tx) =>` closure, use `tx.`; hoist any `obj.maybeNull.x` to a const first.

## 6. Rollout plan (after Phase 1 hits 0)
Phase 2 canary (flag ON while still on superuser → no-op, proves plumbing) →
Phase 3 staging cutover (DATABASE_URL→app_user, DATABASE_URL_ADMIN_USER→admin_user,
RLS_ENFORCEMENT_ENABLED=true, run cross-tenant suite) → Phase 4 prod cutover.
**Rollback (post-cutover):** revert `DATABASE_URL` to a BYPASSRLS role + redeploy
(~1–2 min). The feature flag alone is NOT a safe rollback once role=app_user.
Full detail + risk register in `docs/RLS-AUDIT-AND-ROLLOUT-PLAN-2026-06-25.md`.

## 7. Key files
- Docs: `docs/RLS-AUDIT-AND-ROLLOUT-PLAN-2026-06-25.md`,
  `docs/RLS-PHASE1-INVENTORY-2026-06-25.md`, `docs/RLS-PHASE1-PLAYBOOK.md`,
  `docs/RLS-PHASE1-WORKLIST.md`, this handoff.
- Ops scripts (read-only unless noted): `scripts/rls-audit.mjs`,
  `scripts/rls-prove-isolation.mjs`, `scripts/set-app-user-password.mjs` (writes role pw),
  `scripts/wire-admin-user.mjs` (writes .env.local), `scripts/set-local-password.mjs`,
  `scripts/complete-onboarding.mjs`, `scripts/diag-agent-visibility.mjs`.
- Core code: `src/lib/db/rls-middleware.ts`, `src/lib/api/tenant-context.ts`,
  `src/lib/prisma.ts`, `src/lib/api/auth-guard.ts`, `src/lib/feature-flags/index.ts`.

## 8. Immediate next steps
1. Verify `DATABASE_URL_ADMIN_USER` is wired (run `scripts/wire-admin-user.mjs` if not).
2. Migrate the 3 special API routes → `withAdminBypass`; analytics/summary → wrap.
3. Start the lib SERVICE bucket in themed groups (judge org source per file).
4. After each group: `tsc` + burn-down; eventually the cross-tenant test suite.
5. Do NOT switch `DATABASE_URL` to app_user until Phase 1 = 0 and tests green.

## 9. Guardrails
- Enforcement stays OFF until Phase 1 done + staging-tested.
- Migrations run as `postgres` only (app_user has no DDL).
- Passwords/secrets are the user's — never commit them; `.env.local` is gitignored.
