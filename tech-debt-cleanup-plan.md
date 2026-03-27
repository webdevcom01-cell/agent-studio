# Agent Studio — Tech Debt Cleanup Plan (Final)

**Date:** March 27, 2026
**Codebase:** 91,878 LOC across 502 TypeScript files
**Current state:** TypeScript compiles cleanly (`tsc --noEmit` exits 0), ESLint skipped during Railway builds via `ignoreDuringBuilds: true`

---

## 1. Trend Analysis — 2026 Landscape

### Industry Context

75% of technology leaders expect moderate-to-severe tech debt by 2026, accelerated by AI-generated code. The QCon London 2026 framework emphasizes that not all tech debt is equal — teams should prioritize debt that blocks velocity, not chase a "zero warning" ideal. Meanwhile, Rust-based tooling (Biome, Oxlint) is maturing rapidly: Biome lints 10,000 files in 0.8 seconds versus ESLint's 45 seconds.

### How Anthropic Approaches Tech Debt

Anthropic surveyed 132 engineers and found that 8.6% of Claude Code tasks involve fixing minor quality-of-life issues. Their 2026 agentic coding report identifies "backlog cleanup and tech debt reduction" as a key trend — agents excel at well-defined, easily-verifiable cleanup. Their principle: delegate the easily-verifiable, keep humans on design decisions.

### How Google Approaches Tech Debt at Scale

Google runs quarterly engineering surveys to identify debt that hinders productivity, dedicates "Fixit" days for batch cleanup, maintains specialized "janitor" teams, and uses automated codemods to safely eliminate thousands of violations per quarter. A PyCon 2025 case study demonstrated reducing 70,000+ pyright-ignore annotations to near-zero (60% → 99.5% type coverage) via automated framework.

### 2026 Tooling Landscape

Knip is the standard tool for dead code detection (unused files, exports, dependencies). ESLint v9 flat config is default; Next.js 16 fully deprecates `next lint`. For CI optimization, the dual-linter approach (Oxlint fast pre-pass + ESLint for type-aware rules) cuts lint time by 15x. Biome is recommended for new projects, but for existing ESLint projects, migration effort is significant.

---

## 2. Current State Analysis

### Deep Scan Results

| Category | Count | Severity | Status |
|----------|-------|----------|--------|
| Potentially unused imports | 67 | Medium | Needs cleanup |
| `eslint-disable` comments | 25 | Medium | Needs audit |
| `any` type usage (via eslint-disable) | 8 | High | Needs proper typing |
| `console.log` in source | 1 | Medium | Quick fix |
| Duplicate files | 1 | Medium | Quick fix |
| TODO/FIXME comments | 2 | Low | Track or resolve |
| Pages without `error.tsx` | 10 of 14 | Medium | Needs error boundaries |
| Pages without `loading.tsx` | 14 of 14 | Low-Medium | Consider for UX |
| Potentially unused dependency (`docx`) | 1 | Low | Verify and remove |
| `@ts-ignore` / `@ts-nocheck` | 0 | ✅ Clean | — |
| `prefer-const` violations | 0 | ✅ Clean | — |
| Empty catch blocks | 0 | ✅ Clean | — |
| Bare `throw new Error()` | 0 | ✅ Clean | — |
| `dangerouslySetInnerHTML` | 0 | ✅ Clean | — |
| Hardcoded secrets | 0 | ✅ Clean | — |
| Large files (>300 LOC) | 0 | ✅ Clean | — |
| Deep nesting (>6 levels) | 0 | ✅ Clean | — |

### ESLint-Disable Breakdown

The 25 `eslint-disable` comments fall into 3 categories:

| Rule Suppressed | Count | Files | Action |
|----------------|-------|-------|--------|
| `@typescript-eslint/no-explicit-any` | 12 | discover/route, traces routes, schedule-hook, agent-tools | Replace `any` with proper types |
| `react-hooks/exhaustive-deps` | 8 | evals page, cli-generator, webhooks, flow-builder, debug-timeline | Audit deps arrays — some are intentional |
| `no-console` | 2 | error-display, flow-builder | Acceptable (error logging) |
| `no-constant-condition` | 1 | chat/route | Audit — may be intentional loop |
| **Other** | 2 | — | Case-by-case |

### What's Missing from Original Plan

1. **`loading.tsx` for all routes** — Zero routes have loading states. Users see blank screens while data fetches.
2. **ESLint-disable audit was underspecified** — The original plan mentioned "review 25 comments" but didn't categorize them. The 12 `no-explicit-any` suppressions are the biggest issue — they mask real type safety problems.
3. **Unused dependency cleanup** — `docx` is in `package.json` but not imported anywhere in source code.
4. **Pre-push script doesn't run ESLint** — `scripts/pre-push-check.sh` only runs TypeScript check + Vitest + icon mocks + string consistency. ESLint violations can still be pushed.
5. **ESLint config uses legacy FlatCompat bridge** — The current config wraps old-style `extends` instead of using native flat config. This will break when `@eslint/eslintrc` compat layer is dropped.
6. **Knip integration for dead code** — The scan found 67 potentially unused imports via regex, but a proper tool like Knip would also find unused exports, files, and types that regex can't catch.
7. **No CI-level warning tracking** — Warnings can accumulate silently. No mechanism to alert when warning count increases.

---

## 3. Implementation Plan

Six phases, ordered by impact/effort ratio. Each phase produces a single commit or PR.

### Phase 1: Quick Wins (1 session, ~30 min)

**Goal:** Zero-risk fixes that anyone can verify at a glance.

| # | Task | Files | Risk | Verification |
|---|------|-------|------|-------------|
| 1 | Delete `src/components/builder/property-panel 2.tsx` duplicate | 1 | None | `pnpm precheck` |
| 2 | Remove `console.log` in `src/lib/crypto.ts:24` | 1 | None | `pnpm precheck` |
| 3 | Remove unused `docx` dependency from `package.json` | 1 | Low | `pnpm install && pnpm precheck` |
| 4 | Convert 2 TODO comments to GitHub issues with tracking | 2 | None | Manual |

**Commit message pattern:** `fix(tech-debt): phase 1 — remove duplicate file, console.log, unused dep`

### Phase 2: Type Safety — Eliminate `any` (1 session, ~1 hour)

**Goal:** Replace the 12 `eslint-disable @typescript-eslint/no-explicit-any` with proper types.

**Why this moved up from Phase 5:** `any` types are the highest-severity tech debt — they break type inference downstream and hide real bugs. Anthropic's research shows these are exactly the kind of well-defined tasks where AI-assisted cleanup excels.

| File Group | Count | Approach |
|-----------|-------|----------|
| `discover/route.ts` | 5 | Type the Prisma query results with generated types |
| `traces/route.ts` + `[traceId]/route.ts` | 3 | Type the trace log entries from Prisma |
| `schedule-hook.ts` | 2 | Type the cron evaluation function params |
| `agent-tools.ts` | 2 | Type the dynamic tool definition builder |

**Method per file:**
1. Read the full file to understand context
2. Identify what the `any` actually represents (usually a Prisma query result or JSON field)
3. Create a typed interface
4. Replace `any` with the interface
5. Remove the `eslint-disable` comment
6. Run `tsc --noEmit` to verify

**Verification:** `pnpm precheck` + verify no new type errors.

### Phase 3: Error Boundaries + Loading States (1-2 sessions, ~1.5 hours)

**Goal:** Add `error.tsx` to 10 routes + `loading.tsx` to high-traffic routes.

**Error boundaries (10 routes):**

| Route | Priority | Rationale |
|-------|----------|-----------|
| `/evals/[agentId]` | High | Complex data, API-dependent |
| `/cli-generator` | High | Multi-phase pipeline, async state |
| `/analytics` | High | Dashboard with external data |
| `/discover` | Medium | Marketplace search, pagination |
| `/webhooks/[agentId]` | Medium | Webhook management |
| `/skills` | Medium | ECC feature |
| `/` (dashboard) | Medium | Main entry point |
| `/evals/standards` | Low | Static content |
| `/templates` | Low | Static-ish content |
| `/embed/[agentId]` | Low | Widget |
| `/login` | Low | Auth flow |

**Pattern:** Each `error.tsx` reuses `ErrorDisplay` component (~15 lines each).

**Loading states (top 5 priority routes):**

| Route | Skeleton Pattern |
|-------|-----------------|
| `/` (dashboard) | Card grid skeleton |
| `/discover` | Search bar + card grid skeleton |
| `/analytics` | Chart placeholder + stat skeletons |
| `/evals/[agentId]` | Two-panel skeleton |
| `/cli-generator` | Pipeline progress skeleton |

**Pattern:** Each `loading.tsx` uses Tailwind `animate-pulse` on gray blocks (~20 lines each).

**Verification:** Visual check in browser + `pnpm precheck`.

### Phase 4: Unused Import Cleanup (1-2 sessions, ~1 hour)

**Goal:** Clean up 67 potentially unused imports.

**Strategy: group by pattern (Google's codemod approach):**

| Batch | Pattern | Count | Risk Level |
|-------|---------|-------|-----------|
| A | `NodeProps` from `@xyflow/react` in node components | ~15 | Low — easily verified |
| B | `VariantProps` from cva in UI components | 2 | Medium — may be used by type system |
| C | Type-only imports (`type FlowContent`, `type ChatMessage`, etc.) | ~10 | **HIGH** — FlowContent lesson |
| D | Test file imports (unused mocks/utilities) | ~5 | Low |
| E | Individual remaining imports | ~35 | Medium |

**Critical rule for Batch C (type imports):**
After the FlowContent incident, we follow a strict protocol:
1. `grep -n "TypeName"` across the ENTIRE file (not just imports)
2. Read 50 lines around each match to understand if it's a true usage
3. If the type is used in an interface/type definition 600+ lines away, DO NOT remove
4. When in doubt, leave it

**Verification:** `pnpm precheck` after each batch. Never combine batches A-E into one commit.

### Phase 5: ESLint Modernization (1-2 sessions, ~1.5 hours)

**Goal:** Future-proof the linting setup for Next.js 16, add warning tracking.

**5 sub-tasks:**

**5a. Migrate ESLint to native flat config**

Current config uses `FlatCompat` bridge — this will break when Next.js drops legacy support.

```javascript
// eslint.config.mjs — target state
import { dirname } from "path";
import { fileURLToPath } from "url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  { ignores: ["src/generated/**", "node_modules/**", ".next/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
      "react": reactPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": ["warn", {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
```

**5b. Add ESLint to pre-push script**

Add a 5th check to `scripts/pre-push-check.sh`:
```bash
step "ESLint"
if npx eslint src/ --max-warnings 100 2>&1; then
  ok "ESLint OK (under warning budget)"
else
  fail "ESLint warnings exceeded budget"
fi
```

**5c. Warning budget baseline**

After cleanup phases 1-4, count total warnings and set that as the budget in CI:
```yaml
# In GitHub Actions
- run: npx eslint src/ --max-warnings $WARNING_BUDGET
```

This prevents ratchet: warnings can only decrease, never increase.

**5d. Audit react-hooks/exhaustive-deps suppressions**

The 8 `react-hooks/exhaustive-deps` disables need case-by-case review:

| Location | Likely Reason | Action |
|----------|--------------|--------|
| `evals/[agentId]/page.tsx` | Intentional — fetch only on mount | Add comment explaining why |
| `cli-generator/page.tsx` | Intentional — auto-resume effect | Add comment explaining why |
| `webhooks/[agentId]/page.tsx` (3x) | May be fixable | Investigate |
| `flow-builder.tsx` (2x) | Complex deps | Investigate |
| `debug-timeline.tsx` | Animation frame | Add comment |

**5e. Keep `eslint: { ignoreDuringBuilds: true }` in next.config.ts**

This is NOT tech debt — it's an intentional safety net. Railway builds should never be blocked by lint warnings. ESLint runs in CI as a separate step.

**Verification:** `pnpm lint` must exit 0 with warnings under budget. `pnpm precheck` must pass.

### Phase 6: Ongoing Governance (continuous)

**Goal:** Prevent debt from re-accumulating.

| Practice | Cadence | Tool |
|----------|---------|------|
| `pnpm precheck` before every push | Every push | `scripts/pre-push-check.sh` |
| ESLint warning budget in CI | Every PR | `--max-warnings N` |
| Knip dead code scan | Monthly | `npx knip` |
| Full tech debt scan (Python script) | Quarterly | Custom scanner |
| `eslint-disable` audit | Quarterly | `grep -rn eslint-disable src/` |
| Dependency audit | Monthly | `pnpm audit` + `npx knip --dependencies` |
| `no-constant-condition` review | One-time | Phase 5d |

**Knip setup (one-time):**
```bash
pnpm add -D knip
```

Create `knip.json`:
```json
{
  "entry": ["src/app/**/page.tsx", "src/app/**/route.ts", "src/app/layout.tsx"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignore": ["src/generated/**"],
  "ignoreDependencies": ["@types/*"]
}
```

Knip will find: unused files, unused exports, unused dependencies, unlisted dependencies, unused types — things the regex scanner cannot catch.

---

## 4. Priority Matrix

```
HIGH IMPACT ─────────────────────────────────────
│                                                │
│  Phase 2 (any→types)    Phase 3 (boundaries)   │
│  ★★★ type safety        ★★★ user experience    │
│                                                │
│  Phase 5 (ESLint)       Phase 1 (quick wins)   │
│  ★★ future-proofing     ★★ low-hanging fruit   │
│                                                │
│        Phase 4 (imports)    Phase 6 (govern.)  │
│        ★ cleanliness        ★ sustainability   │
│                                                │
LOW IMPACT ──────────────────────────────────────
    LOW EFFORT ──────────────── HIGH EFFORT
```

**Recommended execution order:**

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Rationale: Phase 1 builds confidence (zero risk). Phase 2 fixes the highest-severity issues (any types). Phase 3 adds user-facing value. Phase 4 is the bulk cleanup. Phase 5 locks it all in with tooling. Phase 6 keeps it clean forever.

**Estimated total effort:** 6-8 sessions (~6-8 hours over 1-2 weeks)

---

## 5. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Removing a used type import (FlowContent incident) | Medium | High — breaks build | Read FULL file before removing any type import. Grep for type name across entire file. |
| Breaking CI with ESLint rule changes | Medium | Medium — blocks merges | Add all new rules as `warn` first. Only promote to `error` after codebase is clean. |
| Railway deploy failure | Low | High — production down | Keep `eslint: { ignoreDuringBuilds: true }`. Test locally before push. |
| `react-hooks/exhaustive-deps` fix causes infinite re-render | Medium | Medium — broken page | Test each deps fix in browser. Keep disable comment if fix would cause loop. |
| Knip false positives (reports dynamic imports as unused) | Medium | Low — wasted time | Use `ignore` config for known dynamic patterns. |
| Merge conflicts from batch cleanup | Medium | Low — rework | One phase per PR, merge within 24h. |

---

## 6. Success Metrics

| Metric | Before | After Phase 4 | After Phase 5 |
|--------|--------|--------------|--------------|
| `eslint-disable` comments | 25 | ~5 (justified only) | ~5 |
| `any` type suppressions | 12 | 0 | 0 |
| Unused imports | 67 | ~0 | 0 |
| Pages with error boundary | 4/14 | 14/14 | 14/14 |
| Pages with loading state | 0/14 | 5/14 | 5/14 |
| ESLint warning budget | unbounded | baselined | enforced in CI |
| Dead code (Knip) | unknown | scanned | monitored monthly |

---

## 7. Differences from Original Plan

| Aspect | Original Plan | Final Plan |
|--------|--------------|-----------|
| Phases | 5 | 6 (added governance detail) |
| `any` types | Listed as 3 in Phase 1 | Promoted to own Phase 2 with 12 actual `any` suppressions |
| Error boundaries | Phase 3 only | Phase 3 now includes `loading.tsx` for top routes |
| ESLint-disable audit | Single bullet in Phase 5 | Full categorized breakdown (25 comments, 4 categories) |
| Unused dependencies | Not mentioned | `docx` identified + Knip for ongoing detection |
| Pre-push ESLint | Not mentioned | Added to Phase 5b |
| Warning budget | Mentioned as idea | Concrete CI implementation in Phase 5c |
| Knip integration | Mentioned as "consider" | Full setup instructions in Phase 6 |
| `react-hooks/exhaustive-deps` | Not mentioned | 8 cases audited in Phase 5d |
| Success metrics | None | Quantified before/after targets |
| Risk matrix | 4 risks | 6 risks with probability/impact ratings |

---

## 8. Sources

- [Anthropic: How AI is Transforming Work](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic) — 8.6% of Claude tasks = quality fixes, strategic task delegation
- [Anthropic: 8 Agentic Coding Trends for 2026](https://tessl.io/blog/8-trends-shaping-software-engineering-in-2026-according-to-anthropics-agentic-coding-report/) — backlog cleanup and tech debt as major trend
- [AI-Generated Code Tech Debt](https://dev.to/harsh2644/ai-is-creating-a-new-kind-of-tech-debt-and-nobody-is-talking-about-it-3pm6) — 75% of leaders expect moderate-to-severe debt
- [Biome vs ESLint vs Oxlint: JS Linters 2026](https://www.pkgpulse.com/blog/biome-vs-eslint-vs-oxlint-2026) — Biome 15x faster, dual-linter strategy
- [Knip — Dead Code Detection](https://knip.dev/) — unused files, exports, dependencies, types
- [Rust-Based Tooling Dominance in 2026](https://dev.to/dataformathub/deep-dive-why-rust-based-tooling-is-dominating-javascript-in-2026-3dbl) — Biome, Oxlint, SWC ecosystem
- [Biome Migration Guide for 2026](https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m) — ESLint → Biome migration
- [ESLint Flat Config Migration](https://eslint.org/docs/latest/use/configure/migration-guide) — FlatCompat → native flat config
- [typescript-eslint Shared Configs](https://typescript-eslint.io/users/configs/) — recommended vs strict
- [Next.js 15.5 Changelog](https://nextjs.org/blog/next-15-5) — `next lint` deprecation path
