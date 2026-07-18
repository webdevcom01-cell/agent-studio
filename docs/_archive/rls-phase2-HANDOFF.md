# RLS Enforcement Cutover — HANDOFF / Pause Point

> **Status: PAUSED before cutover. Nothing is half-applied. Production is safe.**
> `RLS_ENFORCEMENT_ENABLED` is still `false` and the app still connects as the
> superuser, so no RLS is enforced and behaviour is unchanged. This document
> captures everything found so a calm, deliberate session can resume cleanly.

## 1. TL;DR

- **Production RLS is already fully set up — and is MORE advanced than the repo migrations.** It was **hand-applied directly to the prod database** (outside the migration system).
- The repo migrations and prod's actual RLS policies **do not match** (schema drift). This must be reconciled before trusting migrations for prod or doing the cutover.
- The cutover itself was NOT performed. Do not flip `DATABASE_URL`→`app_user` or `RLS_ENFORCEMENT_ENABLED`→`true` until the steps in §5 are done.

## 2. What is DONE and live (safe, on `main`)

- **Query-path migration ("Phase 1")** — every tenant-scoped Prisma call routes through `withOrgContext`/`withTenant`/`withAdminBypass`/`withOrgVectorTx`. Burn-down 0/0/0. (#267–#280)
- **CI lint gate** at `--max-warnings=0` (#279/#280).
- **Dependabot**: mcp-server hono (2 high) fixed; root overrides (#281). Demo alerts still need dismissing in the Security tab.
- **#283** — added 2 RLS migrations (`agent_select_public`, `rls_phase1_template`) + tests + analysis doc. ⚠️ See §4 — these are based on the repo's (stale) view and are redundant/conflicting for prod.

## 3. The key finding — prod RLS was hand-applied (verified, not assumed)

Evidence (all read-only, from prod via Railway → Postgres → Console):

- **Migration checksums MATCH the repo exactly** (`enable_rls`, `hal8`, `rls_agent_cascaded_tables`, `tenant_indirect`) → prod ran the *same* migration files; files were NOT rewritten.
- **But prod has policies that NO migration creates:**
  - `Agent`: `agent_select` = `("organizationId" = current_org_id()) OR ("isPublic" = true)`, plus `agent_admin (ALL true)`, `agent_insert/update/delete`. (The repo's hal8 creates `agent_select_policy` with `current_setting(...)` and **no isPublic**.)
  - `Template`: full set `template_select/insert/update/delete/admin` + RLS enabled. (No repo migration creates any Template policy.)
  - Naming (`agent_select`, `agent_admin`, `template_*`) appears **nowhere** in the repo migrations.
- Prod is **PostgreSQL 18.4**; the earlier local dry-run was PG16 — another reason that dry-run did not faithfully rehearse prod.

**Conclusion:** someone applied a newer RLS design directly to prod (CREATE POLICY / functions) without committing migrations. Prod's `_prisma_migrations` history is clean, but the live DB DDL has drifted ahead of the repo.

### Open question (needs a human answer)
Who hand-applied prod's RLS, and when? This matters because hand-applied RLS never went through the test harness against prod's *actual* state — so we cannot yet fully trust it is complete/consistent across all ~48 tables. Find this out before cutover if possible.

## 4. ⚠️ The #283 landmine

The two migrations added in #283 are wrong for prod:
- `20260626000000_rls_agent_public_select` — **redundant** (prod's `agent_select` already has `isPublic`).
- `20260626000001_rls_phase1_template` — **would FAIL** on prod (`policy "template_select" already exists`).

Prod does **not** auto-run migrations (the build script only does `prisma generate`), so this is a **latent trap**: the next person to run `prisma migrate deploy` against prod will hit the Template conflict. Options to defuse (decide during reconciliation, §5):
- Revert #283 from `main`, or
- `prisma migrate resolve --applied 20260626000000_… 20260626000001_…` on prod (mark as applied without running), or
- Fold them into a proper reconciliation migration.

(These migrations ARE fine for fresh DBs / CI — they only conflict with prod's hand-applied state.)

## 5. Remaining steps to cutover (in order)

1. **Faithful dry-run against prod's ACTUAL schema** (not migrations). Use the turnkey script `scripts/rls-prod-dryrun.sh` (§6): it dumps prod's schema (PG18) → restores to a fresh local PG18 container → runs the RLS harness. This proves whether prod's hand-applied RLS truly isolates + is complete.
   - If the harness passes → prod RLS is trustworthy.
   - If anything fails (e.g. empties because `current_org_id()` reads a different GUC than `app.current_org_id` that `withRLSContext` sets) → fix before cutover.
2. **Reconcile repo ↔ prod** so migrations reflect prod's real RLS (baseline migration capturing prod state), and defuse the #283 landmine (§4).
3. **Backup prod** (runbook §1) before any change.
4. **Confirm prereqs** (already verified once, re-confirm): `app_user` NOBYPASSRLS + `admin_user` BYPASSRLS exist; `DATABASE_URL_ADMIN_USER` set; app_user has SELECT + IUD grants on all tables; isolation proof passes.
5. **Cutover (Faza D)**: flip `DATABASE_URL`→app_user connection, set `RLS_ENFORCEMENT_ENABLED=true`, smoke test (runbook §3), watch Sentry `42501` + latency for 60 min.
6. **Rollback** (primary): revert `DATABASE_URL` to the superuser. (NOT flag-off — see runbook §4.3 correction.)

## 6. Turnkey dry-run script

See `scripts/rls-prod-dryrun.sh`. Run from repo root with the prod **public** URL
(Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`):

```bash
bash scripts/rls-prod-dryrun.sh "postgresql://postgres:…@…proxy.rlwy.net:PORT/railway"
```

It: dumps prod schema (PG18) → fresh local PG18 container on port 5434 → creates
`app_user`/`admin_user` roles → restores the dump → writes `.env.test` → runs the
harness. The prod URL is passed as an argument and never written to a file.

## 7. Reference docs
- `docs/rls-phase2-cutover-analysis.md` — full analysis + coverage audit (§6).
- `docs/rls-phase-1-cutover-runbook.md` — cutover runbook (backup, smoke SQL, rollback; §4.3 corrected).
- `scripts/rls-prove-isolation.mjs` — read-only isolation proof.
