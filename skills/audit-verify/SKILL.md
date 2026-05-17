---
name: audit-verify
version: 1.0.1
description: >
  Empirically verifies the 27 key claims from the Agent Studio V1 architectural
  audit by running real commands — typecheck, vitest, lint, knip, npm audit,
  license-checker. Produces a structured V2 verification report that confirms or
  refutes each claim, surfaces new findings, and provides patch instructions for
  V1 corrections. Zero side effects on the codebase.
  Triggers: "verify audit", "audit verify", "verifikuj audit", "potvrdi audit",
  "v2 audit", "validate audit findings", "audit verifikacija",
  "ponovo proveri audit", "phase 2 audit", "audit accuracy check",
  "potvrdi nalaze", "test the audit", "is the audit accurate".
  Do NOT use for: executing audit recommendations (future skill), running E2E or
  load tests (out of scope), threat modeling (human task), live request tracing
  (manual analysis).
triggers:
  - "verify audit"
  - "audit verify"
  - "verifikuj audit"
  - "potvrdi audit"
  - "v2 audit"
  - "phase 2 audit"
  - "validate findings"
  - "validate audit"
  - "audit verifikacija"
  - "ponovo proveri audit"
  - "audit accuracy check"
  - "potvrdi nalaze"
  - "test the audit"
  - "is the audit accurate"
  - "audit ponovo"
do_not_use_when:
  - User wants to execute audit recommendations → future audit-rollout skill
  - User wants to fix specific tech debt item → use targeted skill (rls-rollout, property-panel-extract)
  - User wants E2E or load test runs → out of scope, run manually
  - User wants threat model → human-driven analysis, not this skill
---

# Skill: audit-verify
*Version: 1.0.1*
*Based on: skill-audit-verify-PLAN-V2.md + plan review findings + v1.0.0 first-run feedback*
*Grounded in: live verification of 7 existing skills, sandbox bash testing,*
*V1 audit corrections discovered during plan review (3 numbers pre-corrected).*
*v1.0.1: fixed false-positive bug where missing `timeout` on macOS caused silent confirms*
*for behavioral checks. Now uses portable timeout (timeout → gtimeout → perl → none) and*
*detects invocation failure to mark as could-not-test instead of false-confirm.*

---

## Purpose

Empirically verifies the V1 Agent Studio architectural audit by running real
commands against the current codebase. Replaces 27 manual verification steps
with one skill call.

Produces a V2 verification report that:
- Confirms or refutes each V1 claim with actual numbers
- Records new findings not in V1 (knip dead code, npm audit, license breakdown,
  outdated deps)
- Provides explicit patch instructions for V1 edits (applied manually)

---

## Hard rules — zero hallucination

1. Verification result comes ONLY from a command actually run in this session.
2. If a command fails for an unexpected reason → status is `could-not-test` +
   reason; NEVER guess.
3. Numbers are NEVER carried over from V1 — always re-counted.
4. Behavioral failures (test fails, lint errors) are AUDIT DATA, not skill failure.
5. V1 audit file is NEVER directly modified — V2 report contains patch
   instructions only.

---

## Pre-run checklist

Before triggering `verify.sh`, Claude confirms:

```bash
cd /Users/buda007/Desktop/agent-studio/
git status --porcelain | head -5      # warn if uncommitted
git rev-parse --abbrev-ref HEAD       # warn if not main
ls node_modules/ > /dev/null 2>&1 && echo "✓ node_modules" || echo "⚠ node_modules missing"
ls Agent-Studio-Deep-Audit-2026-05-17.md > /dev/null 2>&1 && echo "✓ V1 found" || echo "⚠ V1 missing"
```

Report each finding to user. Do NOT block on warnings — but tell user what they
mean for the V2 result (e.g. "branch=feature/foo → V2 reflects branch state,
not main").

---

## STEP 0 — Task list

Call `TaskCreate` for each:
1. Pre-flight & environment check
2. Run verify.sh (27 checks)
3. Read generated report
4. Surface discrepancies to user
5. (Optional) Apply recommended V1 patches

Mark `in_progress` before starting, `completed` when done.

---

## STEP 1 — Pre-flight

Run the commands listed in the Pre-run checklist above. Report status to user.

If `node_modules` is missing AND `pnpm` is available, ask user if they want
to install (`--install` flag) — installation takes 2-3 minutes.

If `node_modules` is missing AND `pnpm` is NOT available, warn that behavioral
checks (C20-C27) will all skip; only quantitative checks (C01-C19) will run.

---

## STEP 2 — Run verify.sh

Default (skips install, uses existing node_modules):
```bash
bash skills/audit-verify/verify.sh
```

With install (slow, only if node_modules missing or stale):
```bash
bash skills/audit-verify/verify.sh --install
```

Clean macOS Time Machine duplicates first (recommended on macOS):
```bash
bash skills/audit-verify/verify.sh --clean-mac-dups
```

Custom output dir:
```bash
bash skills/audit-verify/verify.sh --output ~/Desktop/audit-reports
```

Combined flags:
```bash
bash skills/audit-verify/verify.sh --clean-mac-dups --verbose --output /tmp/v2
```

**Watch stdout for progress.** Each check is printed with `── header ──` and
`✓/✗/•/?` indicators. Script takes 5-15 minutes (vitest is the slow part).

**Exit codes:**
- `0` — all 27 checks ran cleanly, no behavioral skips
- `2` — some checks skipped due to env limitations (e.g. no pnpm) — STILL VALID
- `1` — skill itself failed (bash error, missing repo)

---

## STEP 3 — Read generated report

Path: `<OUTPUT_DIR>/Audit-V2-Verification-<DATE>.md`

Default output: `$REPO_ROOT/reports/` (gitignored globally).

The report contains:
- Executive summary (X/27 confirmed, etc.)
- V1 audit corrections pre-applied (C01, C14, C16)
- Per-claim verification table (27 rows)
- Recommended V1 patches
- Out-of-scope items

Read the full report with `cat` or open in editor.

---

## STEP 4 — Surface to user

Report key statistics in chat:
1. **N/27 confirmed, M refuted, K could-not-test**
2. **Top 3 most impactful discrepancies** (refuted claims with biggest delta)
3. **Any HIGH severity findings** (npm audit, knip spikes)
4. **Recommended next actions**

Format example:
> "Verification complete: 24/27 confirmed, 3 refuted.
>  Refuted: C02 (files V1=960 actual=949), C14 (auth routes V1=126 actual=131),
>  C16 (migrations V1=11 actual=10).
>  HIGH severity: 2 npm audit findings (next, axios — see C25).
>  Suggested next actions:
>  (1) Update V1 audit with corrected C02/C14/C16 numbers.
>  (2) Open tech debt ticket for npm audit findings.
>  (3) Run skill again after applying patches to confirm clean state."

---

## STEP 5 — Optional follow-ups (only if user requests)

- **Apply V1 patches** — manual edits in `Agent-Studio-Deep-Audit-2026-05-17.md`
  to correct refuted claims.
- **Open GitHub issues** for HIGH severity npm audit items (use `gh issue create`).
- **Update `TECH_DEBT.md`** with new baseline numbers.
- **Re-run verification** after applying patches to confirm clean state.

---

## Confirmed constants (live-verified 2026-05-17)

27 check definitions are hardcoded inline in `verify.sh`. Each check has:
- `id` (C01-C27)
- `description`
- `expected` value (from V1 audit, corrected where applicable)
- `tolerance_pct` (allowed drift; 0 = exact match required)
- `primary_cmd` (preferred command)
- `fallback_cmd` (when primary fails, e.g. pnpm not available)

**Corrections vs V1 audit (pre-applied to expected values):**

| Check | V1 said | V2 expects | Reason |
|---|---|---|---|
| C01 (LOC) | ~308.000 | **320.024** | V1 had silent `wc` failures on macOS Time Machine duplicates (filenames with spaces) |
| C14 (auth routes) | 126 | **131** | V1 used a narrower grep pattern; broader pattern catches 5 more |
| C16 (migrations) | 11 | **10** | V1 counted `migration_lock.toml` as a migration (it's not) |

These corrections are baked into `verify.sh` CHECKS. If V1 is updated to match,
re-run verifies V2 corrections itself.

---

## Edge cases & failure modes

| Scenario | Skill response |
|---|---|
| pnpm not installed | Fall back to direct `node node_modules/typescript/bin/tsc`; corepack is NOT attempted (fails in sandboxed environments) |
| node_modules missing | Suggest `--install` flag; otherwise behavioral checks skip with `could-not-test` |
| Network unavailable | npx-based checks (knip, license-checker) fall back to direct invocation; npm audit may skip |
| Git not a repo | Bail out with error — skill requires repo context |
| Timeout (>90s per check) | Mark `could-not-test`, continue with next check |
| Vitest test failures | Status = `recorded` (data), NOT skill failure |
| `next lint` requires pnpm | Skip — use direct `node node_modules/eslint/bin/eslint.js` instead |
| Disk full | Pre-flight `df -h .` check would help (currently missing — TODO v1.1) |
| Bash 3.x (macOS default) | Tested on bash 5; bash 3 mostly works but some features may degrade |

---

## Constraints

- **Zero side effects on the codebase** (no commits, no file changes outside output dir)
- **Idempotent** (same input → same output, modulo git-derived values like commit count)
- **Max wall time ~15 minutes total** (vitest is dominant)
- **No network beyond npm registry** (no telemetry, no external API calls)
- **No MCP integration** (planned for v2 of this skill)

---

## Maintenance notes

**When V1 audit is revised (e.g. V1.1 or V2 audit):**
1. Update `expected` values in `verify.sh` CHECKS section
2. Add new check entries for new claims
3. Bump `version:` in this SKILL.md frontmatter
4. Re-package as `audit-verify.skill` ZIP:
   ```bash
   cd skills/
   zip -r audit-verify.skill audit-verify/ -x '*.DS_Store' '*/reports/*'
   ```

**Skill version semantics:**
- `1.0.x` → bug fixes in `verify.sh` (fallback paths, command flags)
- `1.x.0` → new check additions
- `2.0.0` → MCP integration or breaking output format change

---

## Quick reference

```bash
# Trigger phrases (Claude detects):
"verify audit"           # English
"verifikuj audit"        # Serbian
"v2 audit"               # Either

# CLI invocation:
bash skills/audit-verify/verify.sh                 # default run
bash skills/audit-verify/verify.sh --help          # show usage
bash skills/audit-verify/verify.sh --clean-mac-dups --verbose
```

Output: `reports/Audit-V2-Verification-YYYY-MM-DD.md`
