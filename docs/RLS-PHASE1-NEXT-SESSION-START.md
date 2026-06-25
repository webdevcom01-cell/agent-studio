# RLS Phase 1 — START HERE (next session kickoff)

**Read this entire file before doing anything.** It is the authoritative, self-
contained brief to continue the RLS enforcement rollout. Written 2026-06-25 right
after Phase 1's API zone shipped to production. Companion docs (read in this order):
this → `RLS-PHASE1-PLAYBOOK.md` → `RLS-PHASE1-WORKLIST.md` →
`RLS-AUDIT-AND-ROLLOUT-PLAN-2026-06-25.md` (full plan) → `RLS-PHASE1-HANDOFF-2026-06-25.md`.

---

## 1. The mission (one paragraph)

Agent Studio is multi-tenant (`organizationId`). Postgres RLS policies exist on 48
tables, but **at runtime RLS is bypassed** because the app connects as the `postgres`
**superuser**. Goal: make RLS actually enforced. The plan routes every tenant-scoped
Prisma query through `withOrgContext`/`withTenant` (so the org session var is set),
then switches the app's DB connection to the non-superuser `app_user` role and turns
enforcement on — phased, with rehearsed rollback. **You are continuing Phase 1: the
query-path migration.** Enforcement stays OFF the whole time; these are behaviour-
preserving refactors.

## 2. Current state (verified)

- **Phase 1 API zone is DONE, merged to `main` (PR #266, 8 checks green), deployed.**
  The `chore/rls-phase4` branch was merged and deleted. Start fresh from `main`.
- **Burn-down: 298 → 216 tenant raw sites remaining.** Run:
  `node scripts/rls-phase1-burndown.mjs` (prints `TENANT: N`). Target: **0**.
- DB/policy foundation proven: `app_user` (NOBYPASSRLS) + `admin_user` (BYPASSRLS)
  exist with passwords; isolation verified 11/9/3/0, no leak
  (`node scripts/rls-prove-isolation.mjs`, needs `APP_USER_PASSWORD`).
- `withOrgContext` (`src/lib/db/rls-middleware.ts`) is correct (txn-scoped set_config,
  gated by feature flag `rls-enforcement` / env `RLS_ENFORCEMENT_ENABLED`, currently off).
- Dual client (`src/lib/prisma.ts`): `prisma`→DATABASE_URL, `prismaAdmin`→
  DATABASE_URL_ADMIN_USER, `prismaRead`→DATABASE_READ_URL. `withAdminBypass`
  (`src/lib/api/tenant-context.ts`) uses `prismaAdmin`. `DATABASE_URL_ADMIN_USER` is
  wired in `.env.local`.

## 3. What remains (216 sites) — your work, by bucket

| Bucket | ~Sites | Org source | Helper |
|--------|--------|-----------|--------|
| **lib SERVICE** `src/lib/**` | ~184 | **NO `authResult`** — derive org explicitly (from the entity, a passed-in arg, or the job); many are system-level | `withTenant(fn, orgId)` OR `withAdminBypass((db)=>…)` |
| **WORKER/cron** (BullMQ, scheduler, heartbeat) | ~16 | `orgId` must be carried in the **job payload** | `withTenant(fn, orgId)` |
| **special API** | 3 | no-auth system routes: `cron/trigger-scheduled-flows`, `webhooks/.../[executionId]/replay`, `pipelines/webhook-trigger/[webhookId]` | **`withAdminBypass`** |
| **analytics/summary** | ~6 | uses `prismaRead` | `withOrgContext(prismaRead, orgId, …)` |
| **discover** (isPublic) | few | marketplace cross-tenant read | special — SELECT policy already allows `isPublic`; handle deliberately |

Top hotspot files (≈40% of the work): `lib/managed-tasks/manager.ts` (17),
`lib/sdlc/pipeline-manager.ts` (17), `lib/ecc/instinct-engine.ts` (11),
`lib/versioning/version-service.ts` (10), `lib/knowledge/ingest.ts` (9),
`lib/webhooks/execute.ts` (9), `lib/analytics.ts` (7), `lib/evals/runner.ts` (6),
`lib/runtime/handlers/memory-{read,write}-handler.ts` (6+5),
`lib/scheduler/execution-engine.ts` (6). Full `file:line` list:
`docs/RLS-PHASE1-WORKLIST.md` (regenerate after edits).

## 4. The decision per query site (CRITICAL — this is the judgement part)

For each raw `prisma.<model>.<op>(...)` where `<model>` is one of the 48 RLS tables:

1. **Is the owning org available in scope?** (entity already loaded, an `orgId`
   param, ALS context, or fetchable) → `withTenant((tx) => tx.<model>...)` passing
   that orgId. Inside the callback use `tx.`, never `prisma.`.
2. **Is this a legitimately cross-tenant / system path?** (cron, scheduler sweeping
   all orgs, GDPR export, admin maintenance, webhook ingress before auth) →
   `withAdminBypass((db) => db.<model>...)` (runs as admin_user, BYPASSRLS).
3. **GLOBAL table** (User, MCPServer, Skill, ApiKey, Organization, …) → leave raw.

When unsure between (1) and (2): if the operation conceptually belongs to ONE tenant,
it's (1); if it spans/serves all tenants by design, it's (2). Prefer asking the user
on genuinely ambiguous service paths rather than guessing.

Pattern + the closure-narrowing gotcha (hoist `obj.maybeNull.x` to a const before the
`(tx) =>`): see `docs/RLS-PHASE1-PLAYBOOK.md`.

## 5. Operational environment — hard-won lessons (saves hours)

- **Do all git in the USER's terminal.** The agent sandbox can create a
  `.git/index.lock` it cannot delete (virtiofs unlink restriction) → blocks commits.
  Never run `git` from the sandbox. Give the user the commands to run.
- **`Edit`/`Write` tool may return EPERM on existing `src/` files** (mount perms).
  Apply source edits via `bash`/`python` (runs as root), with exact string matching,
  then show a diff. New files in `docs/`/`scripts/` via the file tools are fine.
- **`pnpm` is NOT in the sandbox PATH; the DB is NOT reachable from the sandbox**
  (network allowlist). So: typecheck/lint/tests and DB scripts run in the USER's
  terminal. `npx tsc --noEmit -p tsconfig.json` DOES work in-sandbox for type checks.
- **Local `vitest` is broken** on this Mac (missing `@rolldown/binding-darwin-arm64`
  native binding). Don't rely on local `pnpm test`/`test:rls` — **CI runs them clean.**
  For local isolation evidence use `scripts/rls-prove-isolation.mjs` (plain `pg`, works).
- **Do NOT rotate the `app_user`/`admin_user` passwords.** `.env.test` and CI hold the
  originals; rotating breaks them. (We rotated once for a proof and had to restore via
  `scripts/restore-rls-passwords.mjs`.) Password rotation belongs to the real cutover.
- `.mjs` is gitignored (`*.mjs`); commit ops scripts with `git add -f` if needed.

## 6. Workflow per theme (repeat until burn-down = 0)

1. Pick a theme (start: `managed-tasks`). Read each file; classify every tenant site
   per §4.
2. Apply edits (bash/python as root; exact-match replacements; expected-count asserts).
3. `npx tsc --noEmit -p tsconfig.json` → fix any errors (watch the closure-narrowing
   gotcha).
4. `node scripts/rls-phase1-burndown.mjs` → confirm the count dropped.
5. Show diffs; the USER commits + pushes per theme (or batches), opens PR, CI validates.
   Keep PRs focused and behaviour-preserving.

## 7. Guardrails (do NOT cross)
- Enforcement stays OFF; do not set `RLS_ENFORCEMENT_ENABLED=true` and do not point
  `DATABASE_URL` at `app_user` until Phase 1 = 0 AND staging tests are green.
- Migrations run as `postgres` only.
- Don't touch role passwords (see §5).
- Don't bundle unrelated work (e.g., the `collector/*` routes) into RLS commits.

## 8. After Phase 1 = 0 (later phases — brief)
Phase 2 canary (flag ON while still on a BYPASSRLS role → no-op, proves plumbing) →
Phase 3 staging cutover (DATABASE_URL→app_user, RLS_ENFORCEMENT_ENABLED=true, run
cross-tenant suite, seed 2nd tenant, prove isolation, check p95) → Phase 4 prod cutover
(off-peak, synthetic checks, rollback = revert DATABASE_URL to a BYPASSRLS role +
redeploy, ~1–2 min; the feature flag alone is NOT a safe rollback once role=app_user).
Full detail + risk register: `docs/RLS-AUDIT-AND-ROLLOUT-PLAN-2026-06-25.md`.

## 9. Separate follow-ups (not part of Phase 1 — don't mix)
- **Lint cleanup** + add `--max-warnings=0` to CI: `docs/TECH-DEBT-LINT-CLEANUP.md`.
- **Google OAuth secret** is invalid (`invalid_client`); login works via email+password.
  Fix the secret in Google Cloud Console (client `525418893034-…`).
- **Dependabot**: ~25 vulnerabilities on `main` (6 high) — review as a security chore.

## 10. First action for the new session
Run `node scripts/rls-phase1-burndown.mjs` to confirm 216, then open
`src/lib/managed-tasks/manager.ts`, classify its ~17 tenant sites per §4, and propose
the diff. Create a new branch off `main` first (e.g. `chore/rls-phase1-services`).
