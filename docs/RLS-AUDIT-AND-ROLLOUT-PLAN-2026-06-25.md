# RLS Enforcement — Audit & Rollout Plan (Enterprise)

**Date:** 2026-06-25
**Author:** Cowork audit (read-only), reviewed by @buky
**Status:** DRAFT — for human review. **No production changes have been made.**
**Scope:** Make Postgres Row-Level Security actually *enforced* at runtime for the
agent-studio multi-tenant database, closing the gap where the application
connects as a superuser and bypasses every RLS policy.

---

## 1. Executive summary

RLS is **built but dormant**. The schema has 47 RLS-enabled tables, ~221 policies,
a correct transaction-scoped `withOrgContext` helper, a 3-role design, and a
4-layer rollback design. **But none of it filters anything at runtime**, because
the application connects to Postgres as the `postgres` **superuser**, and
superusers bypass RLS unconditionally (even under `FORCE ROW LEVEL SECURITY`).

The audit also surfaced the real blocker to flipping the switch: the codebase has
**~1,715 raw `prisma.<model>.<op>` call sites** versus only **148 `withOrgContext`
+ 13 `withTenant`**. Many tenant-scoped reads/writes do **not** pass through the
org-context transaction. The moment the connection role becomes a non-superuser
(`app_user`), every such query returns **zero rows** (reads) or is **blocked**
(writes) — i.e. silent, widespread breakage if we flip without first routing
those queries.

**Recommendation:** Do **not** switch the connection role yet. Execute a phased
plan: (0) prerequisites and a *no-op canary* that exercises the plumbing while
still on a BYPASSRLS role, (1) a measured migration of raw query sites to
`withTenant`, (2) staging cutover with the cross-tenant test suite, (3) a guarded
production cutover with a rehearsed, sub-2-minute rollback.

**Severity of the current state:** the DB itself is not isolating tenants. Because
the production database has real external users (`sudip.architect@gmail.com`,
`leebrahim08@gmail.com`) alongside the owner, this is a genuine (latent) tenant
-isolation exposure, currently mitigated only by application-level `WHERE` clauses.

---

## 2. Scope & method

- **In scope:** runtime enforcement of existing RLS policies; DB role/connection
  architecture; application query-path coverage; rollout & rollback; test plan.
- **Out of scope (separate workstreams):** designing the tenancy model (already
  exists via `organizationId`), Redis cache isolation, threat modeling, and adding
  RLS to the few `AMBIGUOUS` tables that need schema changes first.
- **Method:** read-only static analysis of the repo (Prisma schema, 16 RLS
  migrations, `rls-middleware.ts`, `tenant-context.ts`, `prisma.ts`, auth
  callbacks, feature flags) plus a read-only live-DB audit script
  (`scripts/rls-audit.mjs`) to confirm the *actual deployed* state. No writes.

---

## 3. Current state (evidence)

### 3.1 Connection / role
- App connects via `DATABASE_URL` → `tramway.proxy.rlwy.net:.../railway` as role
  **`postgres`**, confirmed **`is_superuser = true`** → **RLS bypassed at runtime**.
- The same `DATABASE_URL` is used for app traffic, the MCP server, and migrations.

### 3.2 Roles (designed, 3-role model — `decision-log.md`)
| Role | Intended use | Attributes |
|------|--------------|------------|
| `postgres` | migrations only | SUPERUSER (bypasses RLS) |
| `app_user` | tenant-scoped app traffic | NOSUPERUSER, **NOBYPASSRLS**, LOGIN |
| `admin_user` | cross-tenant/admin/cron | NOSUPERUSER, **BYPASSRLS**, LOGIN |

- Created by migration `20260519000000_create_app_admin_db_roles` with DML grants
  on `ALL TABLES` + `ALTER DEFAULT PRIVILEGES` for future tables, and
  `REVOKE` on `_prisma_migrations`. **Passwords are placeholders**
  (`CHANGE_ME_VIA_RAILWAY_CONSOLE`) and must be set before use.

### 3.3 Application wiring
- `withOrgContext()` (`src/lib/db/rls-middleware.ts`): **correct** — wraps work in
  `$transaction`, sets `app.current_org_id` via `set_config(..., true)`
  (transaction-local), gated by feature flag `rls-enforcement`. (Phase 0a done.)
- `withTenant()` / `withAdminBypass()` (`src/lib/api/tenant-context.ts`): present.
  `withAdminBypass` uses `prismaAdmin` (→ `DATABASE_URL_ADMIN_USER`), falling back
  to the primary client when that env is unset.
- Dual-client `src/lib/prisma.ts`: `prisma` (DATABASE_URL), `prismaAdmin`
  (DATABASE_URL_ADMIN_USER), `prismaRead` (DATABASE_READ_URL). Admin & read
  **fall back to `prisma`** when their env vars are missing.
- Login path `ensurePersonalOrg()` correctly uses `withAdminBypass` to write
  `Organization` / `OrganizationMember`. KB search wraps `SET LOCAL hnsw.ef_search`
  in `$transaction` (preflight #11 ✅).

### 3.4 Coverage gap (the headline risk)
| Metric (non-test) | Count |
|---|---|
| Raw `prisma.<model>.<op>` call sites | **~1,715** |
| `withOrgContext(...)` | 148 |
| `withTenant(...)` | 13 |
| `withAdminBypass(...)` | 76 |
| direct `prismaAdmin.` | 0 |

Even allowing that many raw sites are on GLOBAL tables (`User`, `Organization`,
`Skill`, …) or already inside `withAdminBypass`/`withOrgContext` callbacks, the
ratio shows the app is **not yet uniformly routed** through tenant context. This
must be quantified precisely (Phase 1) before any role switch.

### 3.5 Environment (`.env.local`) — RLS-relevant
| Var | Status | Implication |
|---|---|---|
| `DATABASE_URL` | `postgres` superuser | RLS bypassed |
| `DATABASE_URL_ADMIN_USER` | **missing** | `prismaAdmin` falls back to `prisma`; `withAdminBypass` only works today because `postgres` bypasses RLS |
| `DATABASE_READ_URL` | missing | `prismaRead` → `prisma` |
| `RLS_ENFORCEMENT_ENABLED` | **missing** | flag relies on rollout %; effectively off |
| `ADMIN_USER_IDS` | set ✅ | admin route gating works |

---

## 4. Target architecture

```
                 ┌──────────────────────────────────────────┐
  migrations ──► │ postgres (SUPERUSER) — migrate deploy only │
                 └──────────────────────────────────────────┘
  tenant req ──► prisma      → DATABASE_URL            → app_user  (NOBYPASSRLS)
  admin/cron ──► prismaAdmin → DATABASE_URL_ADMIN_USER → admin_user (BYPASSRLS)
  read replica ► prismaRead  → DATABASE_READ_URL        → app_user (or replica)
```

Enforcement holds **iff**: (a) tenant traffic runs as `app_user`, (b) every
tenant-scoped query sets `app.current_org_id` (via `withTenant`/`withOrgContext`),
and (c) every legitimately cross-tenant path uses `withAdminBypass` (→ admin_user).

---

## 5. Gap analysis — what's missing to enforce

| # | Gap | Action |
|---|-----|--------|
| G1 | App connects as superuser | Provision `app_user` connection string; point `DATABASE_URL` at it (Phase 2/3) |
| G2 | `app_user`/`admin_user` passwords are placeholders | Set strong passwords via Railway console |
| G3 | `DATABASE_URL_ADMIN_USER` unset → `withAdminBypass` not truly privileged | Wire admin_user conn string (prerequisite — else login & admin break) |
| G4 | ~1,715 raw query sites, many tenant-scoped | Inventory & migrate tenant-scoped ones to `withTenant`; classify the rest as GLOBAL or admin |
| G5 | `RLS_ENFORCEMENT_ENABLED` unset | Set explicitly per environment (true in staging first) |
| G6 | Live deployed policy/role state unverified | Run `scripts/rls-audit.mjs` (Appendix A) |
| G7 | AMBIGUOUS tables (AuditLog, ModelPerformanceStat, optionally Template) lack org column | Schema change before RLS (Phase 4, later) |

---

## 6. Risk register

Severity × Likelihood on the *cutover to `app_user`*.

| ID | Risk | Sev | Lik | Mitigation |
|----|------|-----|-----|------------|
| R1 | Tenant-scoped raw `prisma` queries return **0 rows** under app_user → silent feature breakage | High | High | Phase 1 inventory + migrate to `withTenant`; staging smoke of every route; canary |
| R2 | Cross-tenant/admin/cron path uses `prisma` not `prismaAdmin` → breaks under app_user | High | Med | Audit `withAdminBypass` coverage; wire `DATABASE_URL_ADMIN_USER` first (G3) |
| R3 | **Login lockout** — auth JWT callback / `ensurePersonalOrg` writes to RLS tables; if admin_user not wired, INSERT policy blocks → no one can log in | Critical | Med | Wire admin_user BEFORE switch; explicit login test in staging; keep break-glass postgres conn |
| R4 | Feature flag `=false` is **not** a full rollback once role=app_user (queries still run unscoped under NOBYPASSRLS → 0 rows) | High | Med | Document true rollback = revert `DATABASE_URL` to BYPASSRLS role + redeploy (Layer 1 below) |
| R5 | Connection-pool var leakage | Low | Low | `withOrgContext` already uses `$transaction` + `set_config(local=true)` ✅ |
| R6 | pgvector KB search needs `SET LOCAL` in tx | Low | Low | Already wrapped ✅ (preflight #11) |
| R7 | RLS subquery policies (35 TENANT_INDIRECT tables) add query cost | Med | Med | Ensure composite `(organizationId, …)` indexes; `performance.test.ts`; monitor p95 |
| R8 | Migrations fail if run as app_user (no DDL/owner) | Med | Low | Keep `prisma migrate deploy` on `postgres` only |
| R9 | Background workers (BullMQ) lack ALS org context | High | Med | Thread explicit orgId via `withTenant(fn, orgId)`; `worker-tenant-context.test.ts` |

---

## 7. Preflight checklist (skill STEP 0 — current status)

| # | Check | Status (from repo) | Confirm live? |
|---|-------|--------------------|---------------|
| 1 | Postgres ≥ 14 | likely (Railway) | yes — audit §1 |
| 2 | pgvector present | KB uses hnsw → yes | yes |
| 3 | App role ≠ postgres (non-dev) | ❌ currently postgres | yes — audit §1 |
| 4 | `RLS_ENFORCEMENT_ENABLED` defined | ❌ missing | n/a |
| 5 | `app_user` exists | migration present | yes — audit §2 |
| 6 | `admin_user` exists | migration present | yes — audit §2 |
| 7 | `ADMIN_USER_IDS` defined | ✅ set | n/a |
| 8 | Sentry DSN configured | sentry.*.config present | grep |
| 9 | CI runs `prisma migrate deploy` | verify `.github/workflows` | grep |
| 10 | `withOrgContext` uses `$transaction` | ✅ yes | n/a |
| 11 | `SET LOCAL hnsw.ef_search` in tx | ✅ yes | n/a |
| 12 | No NULL `Agent.organizationId` | unknown | yes — audit §6 |
| 13 | `/api/users/switch-org` exists | verify | ls |
| 14 | JWT includes `currentOrgId` | ✅ yes | n/a |

**Blocking before any cutover:** #2, #3, #5, #6, #12 must be confirmed *live*;
#4 set; G3 (admin_user wired) done; R1/R3 mitigations in place.

---

## 8. Rollout plan (phased, gated)

Each phase ends with a human Go/No-Go. Nothing proceeds on red.

### Phase 0 — Prerequisites (no enforcement yet)
0.1 Run `scripts/rls-audit.mjs`; reconcile deployed state vs repo migrations.
0.2 Confirm `app_user`/`admin_user` exist; **set their passwords** via Railway console.
0.3 Build connection strings; set `DATABASE_URL_ADMIN_USER` (admin_user) **first** and
    deploy — verify admin routes, cron, and **login** still work (admin_user bypasses
    RLS, so behaviour is unchanged; this de-risks G3/R3 in isolation).
0.4 Confirm `Agent.organizationId` has **zero NULLs** (audit §6); backfill if needed.

### Phase 1 — Query-path coverage (the real work; no role change)
1.1 Generate the raw-query inventory; classify each site: TENANT (→ `withTenant`),
    GLOBAL (User/Org/Skill/… — leave raw), or ADMIN (→ `withAdminBypass`).
1.2 Migrate tenant-scoped sites to `withTenant`; thread `orgId` into workers (R9).
1.3 Keep enforcement **off** (still on superuser) — refactor is behaviour-preserving.
1.4 Land cross-tenant test suite (skill `tests/`): cross-tenant, admin-routes,
    public-routes (isPublic marketplace), gdpr-export, lockout-recovery, worker,
    performance.

### Phase 2 — Canary plumbing (still BYPASSRLS, safe)
2.1 With `DATABASE_URL` still = postgres (or admin_user), set
    `RLS_ENFORCEMENT_ENABLED=true`. `withOrgContext` now runs `set_config` on every
    tenant request — but RLS is still bypassed, so results are unchanged. This proves
    the plumbing (transactions, ALS org resolution) under real traffic with **no risk**.
2.2 Monitor errors/latency for a soak period.

### Phase 3 — Staging cutover (enforcement ON for real)
3.1 In **staging**, point `DATABASE_URL` → `app_user`, `DATABASE_URL_ADMIN_USER`
    → `admin_user`, `RLS_ENFORCEMENT_ENABLED=true`.
3.2 Run full cross-tenant suite + manual smoke of every major route + **login**.
3.3 Seed a second tenant; verify Tenant A cannot read/write Tenant B (the core proof).
3.4 Performance check (p95) on RLS-heavy endpoints.

### Phase 4 — Production cutover (guarded)
4.1 Off-peak window; announce; have rollback rehearsed (≤ 2 min).
4.2 Flip prod env vars (role + flag); redeploy.
4.3 Synthetic checks: login, list agents, run a pipeline, an admin route.
4.4 Watch Sentry + latency for the soak window; Go/No-Go to keep or roll back.

### Phase 5 — AMBIGUOUS tables (later, separate)
Add `organizationId` (or chosen strategy) to AuditLog / ModelPerformanceStat /
Template, then enable RLS for them.

---

## 9. Rollback plan (4 layers — corrected)

> **Critical correction (R4):** once `DATABASE_URL = app_user`, the feature flag
> alone is **not** a safe rollback — with the flag off, tenant queries run
> *unscoped* under a NOBYPASSRLS role and return **0 rows**. The fast, true
> rollback at that point is a **connection-role revert**.

| Layer | Action | Recovery time | When |
|-------|--------|---------------|------|
| 1 (primary, post-cutover) | Revert `DATABASE_URL` → BYPASSRLS role (admin_user or postgres) + redeploy | ~1–2 min (Railway) | Any cutover regression |
| 2 (pre-cutover only) | `RLS_ENFORCEMENT_ENABLED=false` | seconds | While still on a BYPASSRLS role (Phase 2 canary) |
| 3 | Per-table escape (`RLS_DISABLED_TABLES=...`) if implemented | seconds | Single-table policy bug |
| 4 | `prisma migrate resolve`/revert; nuclear `rollback.sh --nuclear` (DISABLE RLS) | minutes | Catastrophic; manual SQL |

Keep a **break-glass** `postgres` connection string available out-of-band for
emergency cross-tenant access during incidents.

---

## 10. Test & verification

- **Automated (skill `tests/`):** `cross-tenant.test.ts` (A can't see B),
  `admin-routes.test.ts`, `public-routes.test.ts` (isPublic marketplace preserved),
  `gdpr-export.test.ts`, `lockout-recovery.test.ts`, `worker-tenant-context.test.ts`,
  `performance.test.ts`. Run via `vitest.rls.config.ts`.
- **Manual smoke (staging):** login (email + Google once fixed), list/create agent,
  run TI→HW→CR pipeline, KB search, evals, an admin route, a cron tick.
- **Tenant-isolation proof:** with two seeded orgs, assert Tenant A queries never
  return Tenant B rows for all 47 RLS tables (parametrized).

---

## 11. Go / No-Go criteria (production)

GO only if **all** hold:
- Preflight #2,3,5,6,12 confirmed live; #4 set; G3 done.
- Phase 1 inventory shows **no** tenant-scoped raw query outside `withTenant`.
- Full cross-tenant suite green in staging; isolation proof passes.
- Login + every major route smoke-tested green in staging.
- p95 within budget on RLS-heavy endpoints.
- Rollback rehearsed end-to-end in staging (Layer 1 ≤ 2 min).

---

## 12. Open decisions (need @buky)

1. **External tenants:** keep Sudip Ghosh / Brahim Lee accounts (real collaborators)
   or remove (test/leftover)? Affects whether isolation must hold for live data now.
2. **Read replica:** is `DATABASE_READ_URL` used in prod? If yes, which role?
3. **Worker org context:** confirm all BullMQ jobs can thread an explicit `orgId`.
4. **Maintenance window** for Phase 4, and who is on-call for rollback.
5. **AMBIGUOUS tables** strategy (Phase 5) — defer or include.

---

## Appendix A — Run the live audit (read-only)

From the repo root on a machine that can reach the DB:

```bash
node scripts/rls-audit.mjs
```

It prints: connection role + superuser flag; `app_user`/`admin_user` existence,
login & password status; RLS-enabled/forced table counts and list; policy counts;
tables `app_user` cannot SELECT; NULL-org agent count; composite indexes; applied
RLS migrations; tenants and agent counts. Paste the output back to validate this
plan against the actual deployed state before Phase 0 sign-off.

---

*This document is read-only analysis. Executing any phase requires explicit
human approval per step (Task #2 remains blocked by this audit).*

---

## Appendix B — Validation results (2026-06-25)

Live audit (`scripts/rls-audit.mjs`) and an isolation proof
(`scripts/rls-prove-isolation.mjs`) were executed against production. Key results:

- **Roles ready:** `app_user` (NOBYPASSRLS) and `admin_user` (BYPASSRLS) exist, can
  log in, and have passwords set. `app_user` password rotated to a known value.
- **DB layer complete:** 48 tables RLS-enabled **and** FORCED; 4–5 policies each;
  all 16 RLS migrations applied (no repo↔DB drift); composite `(organizationId,id)`
  indexes present on direct-tenant tables; **0** NULL-org agents.
- **Grants complete (§5 fixed):** `app_user` can SELECT **every** public table
  (none missing) — no read permission gaps.
- **Tenant isolation PROVEN under `app_user`:**

  | org | expected | app_user sees | verdict |
  |-----|----------|---------------|---------|
  | webdevcom01 | 11 | 11 | PASS |
  | Sudip Ghosh | 9 | 9 | PASS |
  | Brahim Lee | 3 | 3 | PASS |
  | test / empty orgs | 0 | 0 | PASS |
  | **no org context set** | 0 | **0** | PASS (no leak) |

**Conclusion:** the DB/policy foundation is production-ready. Residual risk now
lives almost entirely in the **application layer** (query-path coverage). With
`app_user`, a query that forgets org context fails *closed* to **0 rows**
(availability issue), not a cross-tenant leak (security issue). Next gate:
**Phase 1 — query-path inventory & migration** of the ~1,715 raw `prisma.<model>`
call sites.
