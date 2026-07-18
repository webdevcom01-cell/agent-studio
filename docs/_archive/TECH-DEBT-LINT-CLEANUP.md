# Tech Debt — Lint Cleanup (follow-up)

**Created:** 2026-06-25 (during RLS Phase 1 work) · **Priority:** medium · **Status:** TODO
**Do this AFTER the RLS work is merged. Keep it as its own focused branch/PR
(`chore/lint-cleanup`) — do NOT mix with RLS.**

## Why this exists
`pnpm lint` currently emits many **warnings** (not errors — build/CI pass). They are
**pre-existing**, not introduced by the RLS migration. They're real tech debt and
worth clearing, but they are not urgent and must not block the RLS rollout.

## Triage by rule (different risk levels)

| Rule | Where | Risk | Action |
|------|-------|------|--------|
| `@typescript-eslint/no-unused-vars` | mostly test files (`beforeEach`, `vi`, `mock*`, `result`, `ctx`, …) + a few source | Low | Remove the unused var/import, or prefix with `_` (config allows `^_`). Bulk but reviewed. |
| `react-hooks/exhaustive-deps` | components (`flow-builder`, `use-debug-session`, `variable-input`, `a2a/agent-call-monitor`) | **High — do NOT auto-fix** | One by one: add the dep, wrap init in `useMemo`/`useCallback`, OR per-line disable WITH a justifying comment. Wrong fixes cause infinite re-renders / behaviour changes. |
| `@next/next/no-img-element` | `chat/[agentId]/page.tsx`, `embed/[agentId]/page.tsx` | Medium | Convert `<img>` → `next/image` where dimensions are known; else per-line disable with reason. |
| `no-console` | `src/scripts/read-session.ts` (CLI scripts) | Low | Add an ESLint **override** allowing `console` in `src/scripts/**` instead of editing each line. |
| Unused `eslint-disable` directive | `chat/route.ts`, `theme-provider.tsx`, `GooglePlacesTool.ts`, … | Low | Auto-fixable: `eslint --fix --report-unused-disable-directives` (or `pnpm lint --fix`). |

## Recommended process
1. Branch `chore/lint-cleanup` off `main` (after RLS merge).
2. `pnpm lint --fix` → commit the safe auto-fixes; review the diff.
3. Clean `no-unused-vars` (bulk, mostly tests); review.
4. `src/scripts/**` → ESLint override for `no-console`.
5. `react-hooks/exhaustive-deps` + `no-img-element` — careful, individual, judgement
   required (review together).
6. Verify `pnpm lint` is clean, `pnpm typecheck` + `pnpm test` still green.

## The durable fix (do this last)
Once warnings are at **0**, add **`--max-warnings=0`** to the CI `lint` step
(`pnpm lint -- --max-warnings=0` or update the workflow). This makes any NEW warning
fail CI, so the debt can't silently creep back. Without this gate, cleanup is temporary.

## Notes
- These are warnings only; `next lint` and CI currently pass.
- Some unused vars in tests may indicate dead/incomplete test code — worth a glance
  while cleaning, but generally benign.
