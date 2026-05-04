# Tech Debt Baseline — agent-studio

Last updated: 2026-05-04
Baseline established after Phases 1–6 cleanup. Knip baseline added 2026-04-27.

---

## RLS Rollout Status (F0.8)

| Item | Status |
|------|--------|
| Migration file (`20240108000000_enable_rls`) | ✅ Created |
| `withOrgContext` helper (`src/lib/db/rls-middleware.ts`) | ✅ Created + tested (8 tests) |
| RLS note in `src/lib/prisma.ts` | ✅ Added |
| API routes wired with `withOrgContext` | ❌ TODO — each route needs to wrap prisma calls |
| Schema: `organizationId` column on non-Agent tables | ❌ TODO — needed before RLS can cover those tables |

**Priority routes to migrate first:**
1. `/api/agents` — direct Agent queries, highest tenant-leakage risk
2. `/api/flows` — child of Agent, leaks flow content
3. `/api/knowledge-bases` — child of Agent, leaks KB documents

**Tables currently covered by RLS:** `Agent` only (only table with real `organizationId` column in schema).

**Tables pending schema migration before RLS can be added:**
Flow, KnowledgeBase, WebhookConfig, EvalSuite, EvalRun, EvalResult, AuditLog, ApiKey, MCPServer, AgentSkillPermission

**Note on Prisma v6 middleware:** `$use()` was removed in Prisma v6. `registerRLSMiddleware()` in rls-middleware.ts only activates when a client exposes `$use` (test mocks). Production routes must call `withOrgContext()` per-request.

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

See baseline section below for current numbers.

---

## Knip Baseline (2026-04-27)

Run: `pnpm knip` | knip v5.88.1

| Category | Count |
|----------|-------|
| Unused exports (values + functions) | 44 |
| Unused exported types | 43 |
| **Total unused exports** | **87** |
| Unused files | 8 |
| Unused dependencies (prod) | 12 |
| Unused devDependencies | 6 |
| **Total unused dependencies** | **18** |

### Known False Positives — do not act on these

- **`@radix-ui/*` (7 packages)** — consumed through `src/components/ui/` barrel re-exports; knip cannot trace through them. The associated unused export warnings (`DialogClose`, `DropdownMenuGroup`, `CardFooter`, etc.) are the same root cause.
- **`tailwindcss`** — consumed by PostCSS/build config, not imported in JS files.
- **`eslint` + `eslint-config-next`** — used by the editor and build pipeline, not by `import` statements.

### Budget Rule

Knip count must not grow between quarterly scans. New dead code findings must be resolved or explicitly documented here with a justification.

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
| 7 | Dead file cleanup — deleted `cache/index.ts` (MemoryCache barrel, 0 importers) and `security/index.ts` (re-export barrel, 0 importers); kept `session/session-tracker.ts` with TODO F3; confirmed `schema-drift` import was never broken (`../../types` resolves correctly) | 2026-05-04 | — |
| 8 | F1 cost tracking wired — `recordCost()` added fire-and-forget to `ai-response-handler.ts` and `ai-response-streaming-handler.ts` after token usage recording | 2026-05-04 | — |
| 9 | F6 KEYS→SCAN — replaced `redis.keys()` with SCAN cursor loop in `getAgentCheckouts`; added `scan` to `RedisClient` interface; updated tests to mock `scan` instead of `keys` | 2026-05-04 | — |

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
