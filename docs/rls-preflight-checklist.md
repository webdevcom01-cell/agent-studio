# RLS Cutover — Pre-Flight Checklist

Companion to `docs/rls-phase-1-cutover-runbook.md`. Verified 2026-06-21.
Run order: **code sign-off (done) → infra prerequisites → execute runbook**.

---

## A. Code-side readiness — ✅ VERIFIED (2026-06-21)

| Check | Result |
|-------|--------|
| All tenant-model queries wrapped (`withOrgContext`/`withTenant`/`withAdminBypass`) | ✅ `check-rls-coverage.sh` passes (CI-enforced) |
| RLS policies require only `app.current_org_id` (app sets exactly this) | ✅ 149 policy refs, **zero** `current_user_id` dependencies |
| Background workers set org context | ✅ heartbeat-worker (`withOrgContext`), queue worker (`withTenant`) |
| Admin/cron cross-org paths use BYPASSRLS | ✅ stats/evolve/migrate-* use `prismaAdmin`/`withAdminBypass` |
| `cron/trigger-scheduled-flows` scan | ✅ `FlowSchedule` has **no** RLS — scan without context is safe |
| Guard covers every RLS-enabled table | ✅ 19 ENABLE-RLS tables all in guard's 20-model list |
| Typecheck | ✅ 0 errors |

**Code is ready for enforcement. No blocking gaps.**

---

## B. Infra prerequisites — ⚠️ USER must complete on Railway (BEFORE any apply)

- [ ] **Enable Railway "Wait for CI" toggle** (`agent-studio` service → Settings → Source). HIGH — without it Railway deploys app code before the migration applies → startup failure. (See `rls-tech-debt.md` item 3.)
- [ ] **Set role passwords** in prod DB: `ALTER ROLE app_user PASSWORD '<gen>';` and `ALTER ROLE admin_user PASSWORD '<gen>';` (roles already exist via migration `20260519...`).
- [ ] **Set env vars** on Railway: `DATABASE_URL_APP_USER` (app_user), `DATABASE_URL_ADMIN_USER` (admin_user). Confirm `prismaAdmin` picks up the admin URL.
- [ ] **Verify roles**: `psql "$ADMIN_URL" -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user','admin_user');"` → app_user=f, admin_user=t.
- [ ] Keep `RLS_ENFORCEMENT_ENABLED` **unset/false** in prod until staging soak passes.

---

## C. Execution — follow the runbook (USER-operated, staged)

Per `docs/rls-phase-1-cutover-runbook.md`:

1. [ ] **Backup** (mandatory): `pg_dump --format=custom` + Railway dashboard backup. Verify ≥61 tables.
2. [ ] **Staging first**: `RLS_ENFORCEMENT_ENABLED=true`, apply 14 tables **in runbook order** (OrganizationMember → … → Agent last), smoke-test each (3-query isolation: app_user scoped count, admin full count, wrong-org write = expect `42501`).
3. [ ] **24h staging soak** + full Playwright E2E, zero `42501`.
4. [ ] **Production window** (off-peak, 3–4 tables/session): apply → smoke test → **60-min Sentry watch** → pass gate → next.
5. [ ] **Rollback ready**: `42501` spike → `RLS_DISABLED_TABLES=<table>` (or flag off); last resort = restore from backup.

---

## D. Go / No-Go gate

**GO** only when: A ✅ (done) · B all checked · staging soak clean (zero `42501`) · backup verified · off-peak window · rollback rehearsed.

> My role (assistant): verify each gate's evidence and help with any code fix. I do **not** run prod migrations, set env vars, or flip prod flags — those are operator actions.
