# Tech Debt Baseline — agent-studio

Last updated: 2026-03-27
Baseline established after Phases 1–6 cleanup.

---

## Current State

### ESLint Suppressions (11 total — all intentional)

| Rule | Count | Location | Reason |
|------|-------|----------|--------|
| `react-hooks/exhaustive-deps` | 8 | evals/page, cli-generator/page, webhooks/page (3×), flow-builder (2×), debug-timeline | Intentional — prevents infinite re-render loops |
| `no-console` | 2 | error-display.tsx, flow-builder.tsx | Dev-only `console.error` guards |
| `no-constant-condition` | 1 | chat/route.ts | Infinite streaming loop (by design) |

**Budget rule:** Any new `eslint-disable` comment requires a code review comment explaining why it cannot be fixed properly.

---

### TypeScript Unused Locals (0 errors)

Run: `tsc --noEmit --noUnusedLocals --noUnusedParameters`
Result: **0 errors** (baseline established 2026-03-27, confirmed after full cleanup)

**Budget rule:** This count must not grow. New unused vars should be prefixed with `_`.

---

### Dead Code (Knip)

Run: `pnpm knip:ci`
Requires: `pnpm install` (knip v5 added as devDependency)

Not yet baselined — run after first `pnpm install` to establish baseline.

---

## Completed Cleanup Phases

| Phase | Description | Date | Commit |
|-------|-------------|------|--------|
| 1 | ESLint suppression audit — identified all pre-existing `eslint-disable` comments | 2026-03-27 | — |
| 2 | Removed all 12 `@typescript-eslint/no-explicit-any` suppressions | 2026-03-27 | `29c6379` |
| 3 | Added `error.tsx` to 7 routes + `loading.tsx` to 5 routes (Skeleton UI) | 2026-03-27 | `e87b3ff` |
| 4 | Unused import cleanup — StarOff, Button, unused loop var `c` | 2026-03-27 | `e87b3ff` |
| 5 | ESLint modernization — `no-console` + `no-unused-vars` rules, ESLint step in precheck | 2026-03-27 | `e87b3ff` |
| 6 | Ongoing governance — Knip config, warning budget baseline, quarterly scan script | 2026-03-27 | current |

---

## Quarterly Scan Checklist

Run every quarter (or before major releases):

```bash
# 1. Dead code detection
pnpm knip:ci

# 2. Unused locals (strict)
npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep "error TS6133"

# 3. ESLint suppression count
grep -rn "eslint-disable" src --include="*.tsx" --include="*.ts" | grep -v "node_modules" | wc -l
# Current baseline: 11

# 4. Test coverage trend
pnpm test -- --coverage 2>&1 | tail -5

# 5. Bundle size (production build)
pnpm build 2>&1 | grep "Route\|Size\|First Load"
```

Update this file with new baseline numbers after each quarterly scan.

---

## Governance Rules

1. **No new `any` types** — use proper Prisma/AI SDK types, `unknown`, or generics
2. **No new `eslint-disable` without justification comment** — explain why it can't be fixed
3. **Error boundary coverage** — every new route directory needs `error.tsx`
4. **Loading state coverage** — every new high-traffic route needs `loading.tsx`
5. **Run `pnpm precheck` before every push** — 4 checks must pass
6. **Run `pnpm knip:ci` quarterly** — resolve or document new dead code findings
