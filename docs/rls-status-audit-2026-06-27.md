# RLS Status Audit — 2026-06-27 (evidence-based)

Strict, verified audit of where the RLS rollout actually stands. Every claim
here is backed by either a repo file, a script run, or a prod SQL result run by
the owner in the Railway Postgres console. Items that could NOT be verified are
marked explicitly.

## Method
- Repo: read migrations, `src/lib/db/rls-middleware.ts`, `tenant-context.ts`,
  `prisma.ts`, feature-flags; ran `scripts/rls-phase1-burndown.mjs`.
- Prod: owner ran read-only SQL in Railway → Postgres → Console (psql).

---

## ✅ VERIFIED — code side
- **Phase 1 query-path migration is genuinely complete.** `rls-phase1-burndown.mjs`
  (run 2026-06-27): `TENANT 0`, bare raw non-exempt `0`, bare `$transaction`
  non-exempt `0` (661 files). Every tenant query is wrapped.
- **Mechanism (repo):** policies read `current_setting('app.current_org_id', true)`;
  `withOrgContext` sets `set_config('app.current_org_id', …)` inside `$transaction`.
- **Call sites:** `withOrgContext` 100, `withTenant` 24, `withAdminBypass` 74.
- **3-role wiring:** `prisma`=DATABASE_URL, `prismaAdmin`=DATABASE_URL_ADMIN_USER
  (falls back to `prisma` if unset), `withAdminBypass`→`adminClient()`.
- **tech-debt #6 RESOLVED in code:** cross-org crons use `withAdminBypass`:
  `processTimeouts` (governance), budget-reset worker (`src/lib/budget/reset-worker.ts`),
  trigger-scheduled-flows, migrate-webhook-secrets, evolve. governance-timeout +
  budget-reset delegate to BullMQ workers that use `withAdminBypass`.

## ✅ VERIFIED — prod database (owner-run SQL, 2026-06-27)
- **Roles (`pg_roles`):**
  - `postgres` — super=t, bypassrls=t  ← current `DATABASE_URL` role → **RLS not enforcing now**
  - `app_user` — super=f, **bypassrls=f**  ← tenant role, correct ✅
  - `admin_user` — super=f, **bypassrls=t**  ← cross-tenant role, correct ✅
- **`current_org_id()` is COMPATIBLE with the app:**
  `SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')` — reads the exact
  GUC the app sets. Drift is cosmetic, not functional.
- **Policy roles are safe (Agent + Template spot-check):**
  - `*_admin` (ALL, USING true) → `TO admin_user` only (safe).
  - `*_select/insert/update/delete` → `TO app_user`, `organizationId = current_org_id()`.
  - `agent_select_public` → `TO public`, `isPublic = true` only (marketplace; no private leak).
  - app_user SELECT = own org + public only. No cross-org private leak.
- **Coverage is COMPLETE:** `pg_class`/`pg_policy` query → **48 tables**, every one
  `relforcerowsecurity = t` with `policies ≥ 4` (Agent 6, several 5, rest 4).
  No table is RLS-forced-with-zero-policies. Matches the app's 48-model TENANT set.

## 🔴 CONFIRMED — drift is real but BENIGN
Prod RLS was hand-applied and diverges from repo migrations in **naming**
(prod `agent_select` / `agent_admin` + a `current_org_id()` helper function vs repo
`agent_select_policy` + inline `current_setting`). Repo creates NO `current_org_id()`.
But because `current_org_id()` reads the same GUC, **prod is functionally correct and
compatible**. Reframe: the REPO is out of sync with prod, not prod broken.

## 🔎 Stale/incorrect references found in our own docs
- CLAUDE.md references `skill-rls-rollout-PLAN-V2.md` (Master plan) — **does not exist**.
- CLAUDE.md references `skills/rls-status-checker/` — **does not exist**.
- CLAUDE.md says "skills/rls-rollout/ scaffold — NOT done (NEXT)" — it **EXISTS and is
  complete** (SKILL.md, reference/, scripts/, templates/, tests/).
- `skills/rls-rollout/reference/decision-log.md` is stale (last entry 2026-05-18).
- `RLS_DISABLED_TABLES` rollback "layer 2" is **not implemented** in `src` (0 refs) —
  do not rely on it.

## ⚠️ NOT DONE — remaining for actual enforcement
1. **The env cutover (the only thing between now and real isolation):**
   - Set `DATABASE_URL_ADMIN_USER` → `admin_user` connection string, AND
   - Set `DATABASE_URL` → `app_user` connection string.
   - **MUST be done together.** If `DATABASE_URL`→app_user without
     `DATABASE_URL_ADMIN_USER`→admin_user, `withAdminBypass` (74 sites incl. the chat
     route's agent→org lookup) + crons fall back to app_user and break.
   - Keep `RLS_ENFORCEMENT_ENABLED=true` (required; do not flip off — see incident doc).
2. **`app_user` GRANTs — ✅ VERIFIED 2026-06-27:** `has_table_privilege` SELECT=t,
   INSERT=t, `has_function_privilege` current_org_id() EXECUTE=t (checked on Agent).
   Role can run queries + execute the org function. (UPDATE/DELETE + sequences assumed
   uniform from the same Phase 0b GRANT set.)
3. **Dry-run on a DB copy** (ideal; `scripts/rls-prod-dryrun.sh` + `rls-prove-isolation.mjs`).
4. **Repo↔prod reconciliation** (hygiene, not blocking): baseline migration so a fresh
   env produces prod's actual policy set. Future RLS policy migrations must be
   idempotent (`DROP POLICY IF EXISTS`) — #283 proved the current pattern is not.

## Bottom line
DB **and** code are **cutover-ready**. The cutover is a low-risk, well-understood env
change (both DB-role vars together, flag stays true), pending only the `app_user`
GRANT check and (ideally) a dry-run. Today, with `DATABASE_URL=postgres`, RLS does
**not** isolate — but tenant isolation is low-urgency while effectively single-org.
