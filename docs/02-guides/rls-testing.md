# RLS cross-tenant testing — runbook

How to run the Row-Level Security (RLS) cross-tenant isolation test and what it proves.
Last validated: 2026-06-22 — **10/10 pass** against the `railway` database.

## What it is

`skills/rls-rollout/tests/cross-tenant.test.ts` verifies that Postgres RLS actually
isolates tenants. It seeds two orgs (A, B) via the `admin_user` (BYPASSRLS) role, then,
acting as the RLS-enforced `app_user`, checks that org A can never read/update/delete/insert
across into org B — for SELECT, UPDATE, DELETE, INSERT, the indirect Flow→Agent cascade,
and that admin bypass still works.

If all tests pass, tenant isolation is enforced. If any fails, the failing block names the
exact leaking operation.

## Prerequisites

- The target database has all migrations applied (`pnpm prisma migrate status` → up to date),
  including the `app_user` / `admin_user` roles (`20260519000000_create_app_admin_db_roles`).
- `.env.test` provides the two role connection strings (already configured → `railway`):
  - `DATABASE_URL_APP_USER`   (role `app_user`, RLS-enforced)
  - `DATABASE_URL_ADMIN_USER` (role `admin_user`, BYPASSRLS)

> Note: roles in Postgres are cluster-wide; table/column/policy/grant state is per-database.
> The test currently runs against `railway` (the staging app DB). It creates and then deletes
> `test-rls-*` rows. See Cleanup below.

## How to run

```bash
pnpm vitest run --config vitest.rls.config.ts skills/rls-rollout/tests/cross-tenant.test.ts
```

`vitest.rls.config.ts` exists because the main `vitest.config.ts` `include` is scoped to
`src/**` and would otherwise skip this test. The RLS config also loads `.env.test` into
`process.env` (vitest does not do that automatically).

### Optional: add a convenience script

Add this line to the `"scripts"` block in the root `package.json`:

```json
"test:rls": "vitest run --config vitest.rls.config.ts skills/rls-rollout/tests/cross-tenant.test.ts",
```

Then simply: `pnpm test:rls`

## Cleanup (only if a run is interrupted)

On a clean pass the test's `afterAll` deletes its rows. If a run is interrupted, remove
leftovers via the **admin** connection:

```sql
DELETE FROM "Flow"               WHERE id   LIKE 'test-rls-%';
DELETE FROM "Agent"              WHERE id   LIKE 'test-rls-%';
DELETE FROM "OrganizationMember" WHERE "organizationId" LIKE 'test-rls-%';
DELETE FROM "User"               WHERE id   LIKE 'test-rls-%';
DELETE FROM "Organization"       WHERE id   LIKE 'test-rls-%';
```

(Delete children before parents to respect FKs.)

## Troubleshooting (lessons from setup)

| Symptom | Cause | Fix |
|---|---|---|
| `No test files found, exiting with code 1` | main config `include` = `src/**` | use `--config vitest.rls.config.ts` |
| `env var for role 'app_user' is not set` | vitest didn't load `.env.test` | the RLS config now loads it; don't override with bad shell exports |
| `Can't reach database server at 'PRAVI_HOST'` | placeholder left in a connection string | use real host; or rely on `.env.test` |
| `column "User.currentOrgId" does not exist` | DB behind schema (pending migration) | `prisma migrate deploy` on the **same** DB the test uses |
| `P1000: credentials for 'postgres' are not valid` | placeholder password / wrong role | use the real `postgres` password from `.env` |
| `migrate status` says "up to date" but test still fails | migrations applied to a **different DB** (`railway` vs `XB1Dp83…`) | point migrations and test at the same database |

## Verification log

| Date | DB | Role | Result | Notes |
|---|---|---|---|---|
| 2026-06-22 | `railway` (`tramway.proxy.rlwy.net:54364`) | `app_user` (RLS-enforced) | **10/10 pass** (~11s) | Live DB with real data (5 users / 23 agents / 5 orgs). No real data touched — only self-cleaned `test-rls-*` scratch rows; `afterAll` left no leftovers. Covered SELECT, UPDATE, DELETE, INSERT, TENANT_INDIRECT (Flow→Agent), admin bypass. |

## CI (optional, future)

To run this in CI, add a job that sets `DATABASE_URL_APP_USER` / `DATABASE_URL_ADMIN_USER`
(as secrets) and runs `pnpm test:rls`. Keep it separate from the default `pnpm test` so the
main unit suite doesn't require a live RLS database.
