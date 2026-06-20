# Tech Debt Baseline — agent-studio

Last updated: 2026-06-20 (forensic re-measure)
Previous baseline: 2026-05-04 (Phases 1–6 cleanup; Knip baseline 2026-04-27).

> This file was forensically re-measured on 2026-06-20. The RLS section in
> particular was badly stale: it predated the entire phased RLS rollout.

---

## RLS Rollout Status — RE-MEASURED 2026-06-20

The rollout is now **largely implemented** (~85%), not "TODO". Previous baseline
showed `Agent only / routes TODO`; that snapshot predated all of the work below.

| Item | Status (2026-06-20) |
|------|---------------------|
| `ENABLE ROW LEVEL SECURITY` statements | ✅ **27** across **14** phased migrations |
| Tables with RLS policies | ✅ Agent + cascaded children (Flow, Eval*, Department, ApprovalPolicy, CompanyMission, AgentPermissionGrant, AgentSkillPermission, PolicyDecision, Heartbeat*, …) |
| `organizationId` columns | ✅ **7** tables: Agent, ApiKey, Template, Goal, Department, OrganizationMember, Invitation |
| Child tables (Flow, KnowledgeBase, Eval*, MCPServer…) | ✅ protected via **cascade** through Agent (no own column needed) |
| DB roles | ✅ `app_user` (NOBYPASSRLS) + `admin_user` (BYPASSRLS) — migration `20260519000000_create_app_admin_db_roles` |
| `withOrgContext()` wiring in API routes | ✅ **56** API files use `withOrgContext`/`withTenant` |
| CI enforcement | ✅ `scripts/check-rls-coverage.sh` (CI Lint job) — protects **20** models, blocks merges |
| Rollout toolkit | ✅ `skills/rls-rollout/` (audit, generate-migration, rollback, isolation tests, runbook, verify-staging) + tests |
| Runtime enforcement | 🔴 **gated by feature flag `rls-enforcement`** (read in `rls-middleware.ts` via `isFeatureEnabled`) |

**Mechanism:** `withOrgContext(prisma, orgId, fn)` opens a `$transaction` and runs
`SELECT set_config('app.current_org_id', <orgId>, true)` so RLS policies filter by
org — **only if** the `rls-enforcement` flag is on AND an org is resolved. Admin/cron
paths use `prismaAdmin` (BYPASSRLS / `admin_user`).

### 🔴 Remaining for FULL cutover (the real open work)
1. Flip the **`rls-enforcement`** feature flag ON in production.
2. Point the app's runtime connection at **`app_user`** (`DATABASE_URL_APP_USER` — currently commented out in `.env.example`; primary `DATABASE_URL` likely still a bypass role).
3. Run **cross-tenant isolation tests** in staging (`skills/rls-rollout/` + `docs/rls-phase-0d-test-plan.md`) and verify no read breakage.
4. Confirm cascade policies fully cover standalone child tables, or add `organizationId` where a direct column is needed.
5. Staged enable → monitor → rollback plan ready (`skills/rls-rollout/rollback.sh`).

**Note on Prisma v6:** `$use()` removed in v6; `withOrgContext()` is per-request (no global middleware hook).

---

## Current State

### ESLint Suppressions — 15 (was 11; budget exceeded ⚠️)

| Rule | Count | Notable locations | Note |
|------|-------|-------------------|------|
| `react-hooks/exhaustive-deps` | 9 | evals, cli-generator, webhooks (3×), flow-builder (2×), debug-timeline, **theme-provider** | mostly intentional (re-render guards); theme-provider = mount-once effect |
| `@typescript-eslint/no-explicit-any` | 4 | webhook-trigger route (2×), `queue/events.ts`, `ast/ast-grep-client.ts` | ⚠️ **NEW** — violates "no new `any`" rule; resolve or justify |
| `@next/next/no-img-element` | 1 | settings/profile | NEW |
| `no-constant-condition` | 1 | chat/route.ts | intentional streaming loop |

**Action:** the 4 new `no-explicit-any` suppressions should be typed properly or documented. Budget baseline reset to **15** pending cleanup.

### TypeScript Unused (strict) — 20 (was 0)

`tsc --noEmit --noUnusedLocals --noUnusedParameters` → **20** `TS6133` (normal build = 0; these only surface under the strict flags). 6 are in `skills/rls-rollout/scripts/`; rest in `src/lib`, `src/app/api`. Latent debt — clean or prefix with `_`.

### Dead Code (Knip) — NOT re-scanned ⏳

Baseline 2026-04-27: 87 unused exports, 18 unused deps (see below). **Not re-measured 2026-06-20** — `knip` is not installed in the working environment (`pnpm install` required). Re-run before next release.

---

## Design-System / UI Debt — NEW (2026-06-20)

| Item | Status |
|------|--------|
| Color tokens standardized across app | ✅ ~440 off-token colors → semantic tokens |
| `scripts/check-color-tokens.sh` (CI Lint job) | ✅ blocks off-token palette/hex/dark-only-overlay outside allowlist |
| Allowlist (intentional) | devsecops SVG diagram, auth-shell brand panel, login Google OAuth, soma `PLATFORM_COLORS`, template-gallery decorative |
| `@tailwindcss/typography` | 🟡 **NOT installed** — `prose` classes are inert; markdown styled via `.markdown-body` (chat wired to it) |
| Chat per-message timestamps | 🟡 deferred — needs `ChatMessage` type + streaming-hook change |
| K4 (on-primary text) | ✅ resolved → white, token-driven (`--primary-foreground`) |
| Theme toggle | ✅ added to sidebar (Sun/Moon → `toggleTheme`); token parity 27/27 verified in dark |

---

## Knip Baseline (2026-04-27 — stale, pending re-scan)

| Category | Count |
|----------|-------|
| Total unused exports | 87 |
| Unused files | 8 |
| Total unused dependencies | 18 |

**Known false positives:** `@radix-ui/*` (barrel re-exports), `tailwindcss` (PostCSS), `eslint`/`eslint-config-next` (build pipeline).

---

## Completed Phases

| Phase | Description | Date |
|-------|-------------|------|
| 1–6 | ESLint/any/error+loading/governance baseline | 2026-03-27 |
| 7–9 | Dead file cleanup, F1 cost tracking, F6 KEYS→SCAN | 2026-05-04 |
| 10 | RLS phased rollout — 14 migrations, 27 RLS tables, app_user/admin_user roles, withOrgContext + `rls-enforcement` flag, 56 routes wired, CI RLS coverage guard, rollout toolkit | through 2026-06 |
| 11 | UI/UX overhaul — Ember design system; landing, login, dashboard, builder, chat redesigned; dashboard KPI + activity endpoints | 2026-06 |
| 12 | Color standardization — ~440 off-token colors → semantic tokens + `check-color-tokens.sh` CI guard | 2026-06-20 |
| 13 | Chat readability — markdown-body wiring, generic human renderer for structured output, message copy, richer empty state | 2026-06-20 |
| 14 | Dark-mode pass + K4 (white-on-primary) + sidebar theme toggle; token parity 27/27 verified | 2026-06-20 |

---

## Quarterly Scan Checklist

```bash
pnpm knip:ci                                                    # dead code (needs pnpm install)
npx tsc --noEmit --noUnusedLocals --noUnusedParameters | grep TS6133   # strict unused (baseline 20)
grep -rn "eslint-disable" src --include="*.tsx" --include="*.ts" | grep -v node_modules | wc -l  # baseline 15
bash scripts/check-rls-coverage.sh src                          # RLS coverage guard
bash scripts/check-color-tokens.sh src                          # color-token guard
pnpm test -- --coverage | tail -5
```

---

## Governance Rules

1. **No new `any`** — use proper types/`unknown`/generics. (Currently 4 violations to clean up.)
2. **No new `eslint-disable` without justification comment.**
3. **Error boundary + loading coverage** — every new route dir needs `error.tsx` / `loading.tsx`.
4. **RLS coverage guard** — every tenant-model query must go through `withOrgContext`/`withTenant`/`withAdminBypass` (CI-enforced).
5. **Color-token guard** — no off-token palette/hex/dark-only-overlay outside the documented allowlist (CI-enforced).
6. **Run `pnpm precheck` before every push.**
7. **Run `pnpm knip:ci` quarterly.**
