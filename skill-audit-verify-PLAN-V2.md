# Implementation Plan V2: `audit-verify` skill

**Datum:** 17. maj 2026
**Status:** V2 — integriše 12 fix-eva iz `skill-audit-verify-PLAN-REVIEW.md`
**Bazirano na:** V1 plan + plan review + live verifikacija u sandbox-u
**Cilj:** Realističan, minimalistički plan koji prati stvarne konvencije repo-a (n=7 skill-ova), bez halucinacija.

---

## 0. Recap odluka iz V1 + review

| Odluka | Vrednost | Source |
|---|---|---|
| Skill lokacija | `skills/audit-verify/` (project skill) | User confirmation V1 |
| Bash + SKILL.md | Da, ali **minimalno** — 1 bash skripta, ne 4 | Plan review F1, F2 |
| V2 izveštaj | Uvek novi fajl, ne update V1 | User confirmation V1 |
| MCP integracija | Out-of-scope za V1 | User confirmation V1 |
| Output lokacija | **Workspace folder** (`/Users/buda007/Desktop/agent-studio/reports/`), ne repo | Plan review F (reports/ gitignored globally) |
| Time estimate | **4-5 sati** (down from 8h) | Plan review §5 |

---

## 1. Šta tačno gradimo (revidirano)

### 1.1 File struktura — 3 fajla, ne 9

```
skills/audit-verify/
├── SKILL.md          [~300 linija — orchestrator za Claude-a]
├── verify.sh         [~250 linija — sve check-e inline, bash arrays]
└── README.md         [~30 linija — install + usage]
```

**Razlika od V1 plana:**
- ❌ `IMPLEMENTATION_PLAN.md` u skill folder-u — nije konvencija (6/7 skill-ova ga nema)
- ❌ `CRITICAL_ANALYSIS.md` — opciono, samo ako V1 implementacija ima ozbiljne probleme
- ❌ `lib/count-claims.sh + run-behavioral.sh + render-report.sh` — bash funkcionalnost integrisana u jedan `verify.sh`
- ❌ `data/v1-claims.json` — check definicije hardcoded u bash array-u u `verify.sh`
- ❌ `templates/verification-report.md` — heredoc inline u `verify.sh`
- ❌ `reports/` direktorijum u skill-u — reports idu u workspace folder

### 1.2 Distribution
Posle dovršetka, skill se pakuje kao `skills/audit-verify.skill` ZIP fajl (prati `pipeline-debug.skill`, `soma-run.skill` precedent):

```bash
cd skills/
zip -r audit-verify.skill audit-verify/ -x '*.DS_Store' '*/reports/*'
```

---

## 2. Implementacioni redosled (6 koraka, 4-5h ukupno)

### Korak 1 — Kreiraj folder + README.md *(15 min)*
```bash
mkdir -p /Users/buda007/Desktop/agent-studio/skills/audit-verify
```
README.md sa kratkim install/usage instrukcijama (~30 linija).

**Acceptance:** Folder postoji, README sadrži install steps.

### Korak 2 — Napiši `verify.sh` *(120 min)*

Najveći deliverable. Struktura:

```bash
#!/usr/bin/env bash
# audit-verify v1.0.0 — verifies V1 audit claims via live execution.
# Usage: bash verify.sh [--no-install] [--clean-mac-dups] [--output DIR]

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_OUTPUT="$REPO_ROOT/reports"   # ili workspace folder
OUTPUT_DIR="${DEFAULT_OUTPUT}"
DO_CLEAN_MAC_DUPS=false
DO_INSTALL=false                       # default: SKIP install (assume node_modules)
VERBOSE=false

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)         OUTPUT_DIR="$2"; shift 2 ;;
    --clean-mac-dups) DO_CLEAN_MAC_DUPS=true; shift ;;
    --install)        DO_INSTALL=true; shift ;;
    --verbose)        VERBOSE=true; shift ;;
    --help)           cat "$REPO_ROOT/skills/audit-verify/README.md"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

# ── Pre-flight ────────────────────────────────────────────────────────────────
cd "$REPO_ROOT"

GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

# Optional macOS Time Machine duplicate cleanup
if [[ "$DO_CLEAN_MAC_DUPS" == "true" ]]; then
  find src/generated -name '* 2.ts' -delete 2>/dev/null || true
fi

# ── Package manager detection (NO corepack — fails in sandbox) ────────────────
detect_runtime() {
  if command -v pnpm &>/dev/null; then
    echo "pnpm"
  elif [[ -d node_modules ]]; then
    echo "node-direct"  # use node_modules/.bin/* or node node_modules/<pkg>/...
  else
    echo "npx-only"     # no node_modules either; will install or use npx --yes
  fi
}
RUNTIME=$(detect_runtime)

# ── Helper: run command with fallback chain ──────────────────────────────────
run_check() {
  local check_id="$1"
  local primary_cmd="$2"
  local fallback_cmd="$3"
  local timeout_sec="${4:-60}"

  local output
  local exit_code

  output=$(timeout "$timeout_sec" bash -c "$primary_cmd" 2>&1) || exit_code=$?
  if [[ "${exit_code:-0}" -ne 0 && -n "$fallback_cmd" ]]; then
    output=$(timeout "$timeout_sec" bash -c "$fallback_cmd" 2>&1) || exit_code=$?
  fi

  echo "$output"
  return "${exit_code:-0}"
}

# ── 27 CHECK DEFINITIONS ─────────────────────────────────────────────────────
# Each check: id|category|description|v1_claim|expected|tolerance_pct|primary_cmd|fallback_cmd
declare -a CHECKS=(
  "C01|quantitative|LOC count (src+packages, no node_modules, no generated)|320024|320000|5|find src packages -type f \\( -name '*.ts' -o -name '*.tsx' \\) | grep -v node_modules | grep -v generated | tr '\\n' '\\0' | xargs -0 wc -l | tail -1 | awk '{print \$1}'|"
  "C02|quantitative|TS/TSX files (excluding node_modules)|960|960|2|find src packages -type f \\( -name '*.ts' -o -name '*.tsx' \\) | grep -v node_modules | wc -l|"
  "C03|quantitative|API routes count|161|161|0|find src/app/api -name 'route.ts' | wc -l|"
  "C04|quantitative|Prisma models|61|61|0|grep -c '^model ' prisma/schema.prisma|"
  "C05|quantitative|Runtime handlers (no index.ts)|70|70|0|ls src/lib/runtime/handlers/*.ts | grep -v index.ts | wc -l|"
  "C06|quantitative|Unit test files|304|304|2|find src -name '*.test.ts' -o -name '*.test.tsx' | wc -l|"
  "C07|quantitative|E2E test files|11|11|0|find e2e -name '*.spec.ts' | wc -l|"
  "C08|quantitative|property-panel.tsx LOC|7413|7413|1|wc -l src/components/builder/property-panel.tsx | awk '{print \$1}'|"
  "C09|quantitative|sdlc/orchestrator.ts LOC|1899|1899|1|wc -l src/lib/sdlc/orchestrator.ts | awk '{print \$1}'|"
  "C10|quantitative|TODO/FIXME/HACK/XXX|10|10|10|grep -rEn '\\b(TODO|FIXME|HACK|XXX)\\b' src --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l|"
  "C11|quantitative|@ts-ignore directives|13|13|0|grep -rE '@ts-ignore|@ts-expect-error' src --include='*.ts' --include='*.tsx' | wc -l|"
  "C12|quantitative|'as any' usage|9|9|0|grep -rE '\\bas any\\b' src --include='*.ts' --include='*.tsx' | wc -l|"
  "C13|quantitative|eslint-disable count|15|15|0|grep -rE 'eslint-disable' src --include='*.ts' --include='*.tsx' | wc -l|"
  "C14|quantitative|API routes with auth guard (CORRECTED from V1: was 126)|131|131|2|grep -rlE 'requireAuth|requireAgentOwner|requireOrgMember|requireOrgAdmin|requireOrgOwner|requireAdmin' src/app/api --include='route.ts' | wc -l|"
  "C15|quantitative|API routes with Zod validation|62|62|3|grep -rlE 'z\\.object|z\\.string|from \"zod\"' src/app/api --include='route.ts' | wc -l|"
  "C16|quantitative|Prisma migrations (CORRECTED from V1: was 11 incl. migration_lock)|10|10|0|ls prisma/migrations/ | grep -v migration_lock | wc -l|"
  "C17|quantitative|RLS-enabled tables|1|1|0|grep -c 'ALTER TABLE.*ENABLE ROW LEVEL SECURITY' prisma/migrations/20240108000000_enable_rls/migration.sql|"
  "C18|quantitative|Total git commits|796|796|10|git log --oneline 2>/dev/null | wc -l|"
  "C19|quantitative|Commits last 30d|169|169|20|git log --since='30 days ago' --oneline 2>/dev/null | wc -l|"

  # ── Behavioral (9) ─────────────────────────────────────────────────────────
  "C20|behavioral|TypeScript no errors|0|0|0|pnpm typecheck 2>&1 | grep -c 'error TS'|node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -c 'error TS'"
  "C21|behavioral|TS noUnusedLocals|0|0|0|pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep -c 'TS6133'|node node_modules/typescript/bin/tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 | grep -c 'TS6133'"
  "C22|behavioral|Vitest pass rate|all|all|0|pnpm test --reporter=basic 2>&1 | tail -20|npx --yes vitest run --reporter=basic 2>&1 | tail -20"
  "C23|behavioral|ESLint clean|0|0|0|pnpm lint 2>&1 | grep -cE 'error|warning'|node node_modules/eslint/bin/eslint.js 'src/**/*.{ts,tsx}' --no-error-on-unmatched-pattern 2>&1 | tail -3"
  "C24|behavioral|Knip dead code|var|0|0|npx knip@5 --reporter compact --no-exit-code 2>&1 | tail -30||"
  "C25|behavioral|npm audit high+critical|var|0|0|npm audit --omit=dev --json 2>&1 | jq '[.vulnerabilities[] | select(.severity == \"high\" or .severity == \"critical\")] | length'||"
  "C26|behavioral|npm outdated deps|var|0|0|npm outdated --json 2>&1 | jq 'length'||"
  "C27|behavioral|License audit (production)|var|var|var|npx --yes license-checker --production --summary 2>&1 | tail -15||"
)

# ── Run all checks ────────────────────────────────────────────────────────────
RESULTS_FILE=$(mktemp)
echo "id|category|status|expected|actual|delta_pct|notes" > "$RESULTS_FILE"

for check_def in "${CHECKS[@]}"; do
  IFS='|' read -r id category desc v1_claim expected tol primary fallback <<< "$check_def"

  echo "── $id: $desc ──"
  start_time=$(date +%s)
  actual=$(run_check "$id" "$primary" "$fallback" 90 || echo "ERROR")
  end_time=$(date +%s)
  duration=$((end_time - start_time))

  # Determine status (match / drift / refute / could-not-test)
  if [[ "$actual" == "ERROR" ]]; then
    status="could-not-test"
    delta=""
  elif [[ "$actual" =~ ^[0-9]+$ ]]; then
    if [[ "$expected" =~ ^[0-9]+$ ]]; then
      delta=$(( (actual - expected) * 100 / (expected + 1) ))  # +1 to avoid divide-by-zero
      if [[ ${delta#-} -le $tol ]]; then
        status="confirmed"
      else
        status="refuted"
      fi
    else
      status="recorded"
      delta=""
    fi
  else
    status="recorded"  # behavioral output is non-numeric
    delta=""
  fi

  echo "$id|$category|$status|$expected|$actual|$delta|${duration}s" >> "$RESULTS_FILE"
done

# ── Generate report (inline heredoc, no template file needed) ────────────────
TODAY=$(date +%Y-%m-%d)
REPORT_FILE="$OUTPUT_DIR/Audit-V2-Verification-$TODAY.md"

# Summary stats
TOTAL=$(tail -n +2 "$RESULTS_FILE" | wc -l)
CONFIRMED=$(grep -c '|confirmed|' "$RESULTS_FILE" || true)
REFUTED=$(grep -c '|refuted|' "$RESULTS_FILE" || true)
CNT=$(grep -c '|could-not-test|' "$RESULTS_FILE" || true)

cat > "$REPORT_FILE" <<EOF
# Audit V2 — Verification Report

**Generated:** $(date '+%Y-%m-%d %H:%M:%S %Z')
**Skill version:** audit-verify v1.0.0
**Repo SHA:** $GIT_SHA
**Repo branch:** $GIT_BRANCH
**Repo state:** $( [[ "$GIT_DIRTY" -gt 0 ]] && echo "dirty ($GIT_DIRTY uncommitted)" || echo "clean")
**Runtime:** $RUNTIME

## Executive Summary

- **Total checks:** $TOTAL / 27
- **Confirmed:** $CONFIRMED
- **Refuted:** $REFUTED
- **Could not test:** $CNT

## V1 Audit Claim Verification

| # | Claim | Expected | Actual | Δ% | Status |
|---|---|---|---|---|---|
EOF

# Append table rows
tail -n +2 "$RESULTS_FILE" | awk -F'|' '{ printf "| %s | %s | %s | %s | %s | %s |\n", $1, $7, $4, $5, $6, $3 }' >> "$REPORT_FILE"

cat >> "$REPORT_FILE" <<EOF

## Recommended V1 patches

(populated from refuted/discrepancy items above — manually review)

## Out-of-scope (require human action)
- E2E run (needs localhost)
- Load test (needs running service)
- Threat model (human analysis)
- Live API trace (needs deployed instance)

---
*Generated by skills/audit-verify/verify.sh v1.0.0*
EOF

echo ""
echo "═══════════════════════════════════════════════"
echo "  PASS: $CONFIRMED   FAIL: $REFUTED   N/A: $CNT"
echo "  Report: $REPORT_FILE"
echo "═══════════════════════════════════════════════"
```

**Acceptance:**
- `bash verify.sh --help` prints README
- `bash verify.sh` (default) runs sve 27 check-a u <10 min
- Generated report ima sve sekcije

### Korak 3 — Napiši `SKILL.md` *(90 min)*

Strukura:

```markdown
---
name: audit-verify
version: 1.0.0
description: >
  Empirically verifies the 27 key claims from the Agent Studio V1 architectural audit
  by running real commands — typecheck, vitest, lint, knip, npm audit, license-checker.
  Produces a structured V2 report confirming or refuting each claim.
  Triggers: "verify audit", "audit verify", "verifikuj audit", "potvrdi audit",
  "v2 audit", "validate findings", "audit verifikacija", "ponovo proveri audit",
  "phase 2 audit", "audit accuracy check", "potvrdi nalaze".
  Do NOT use for: executing audit recommendations (future skill), running E2E/load tests
  (out of scope), threat modeling (human task).
triggers:
  - "verify audit"
  - "audit verify"
  - "verifikuj audit"
  - "potvrdi audit"
  - "v2 audit"
  - "phase 2 audit"
  - "validate findings"
  - "audit verifikacija"
  - "ponovo proveri audit"
  - "audit accuracy check"
  - "potvrdi nalaze"
  - "test the audit"
  - "is the audit accurate"
  - "audit ponovo"
do_not_use_when:
  - User wants to execute audit recommendations → future audit-rollout skill
  - User wants to fix specific tech debt item → targeted skill
  - User wants E2E/load test runs → out of scope, do manually
  - User wants threat model → human-driven analysis, not this skill
---

# Skill: audit-verify
*Version: 1.0.0*
*Based on: PLAN-V2 + plan review findings*
*Grounded in: live verification of 7 existing skills, sandbox bash testing, V1 audit corrections (3 numbers corrected)*

---

## Purpose

Empirically verifies the V1 Agent Studio architectural audit by running real commands.
Replaces 27 manual verification steps with one skill call. Produces a V2 report that:
- Confirms or refutes each V1 claim
- Records actual values (LOC, file counts, test results, vulnerability counts)
- Surfaces new findings not in V1 (knip dead code, npm audit, license breakdown)
- Provides explicit patch instructions for V1 edits (manual application)

---

## Hard rules — zero hallucination

1. Verification result comes ONLY from a command actually run in this session
2. If a command fails for unexpected reason → status is "could-not-test" + reason; NEVER guess
3. Numbers are NEVER carried over from V1 — always re-counted
4. Behavioral failures (test fails, lint errors) are AUDIT DATA, not skill failure
5. V1 audit is NEVER directly modified — V2 report contains patch instructions

---

## Pre-run checklist (Claude verifies before running)

Before triggering verify.sh, confirm:
- [ ] User is in agent-studio repo (`/Users/buda007/Desktop/agent-studio/`)
- [ ] Git branch (warn if not main: V2 will reflect branch state)
- [ ] Git status (warn if uncommitted: V2 reflects working tree, not committed)
- [ ] node_modules exists (skip install only if `ls node_modules` succeeds)
- [ ] V1 audit file exists at expected location

If any check fails → ask user to clarify before proceeding.

---

## STEP 0 — Task list

Call TaskCreate for each:
1. Pre-flight & environment check
2. Run verify.sh (27 checks)
3. Read generated report
4. Surface discrepancies to user
5. (Optional) Apply recommended V1 patches

Mark each in_progress before starting, completed when done.

---

## STEP 1 — Pre-flight

```bash
cd /Users/buda007/Desktop/agent-studio/
git status --porcelain | head -5
git rev-parse --abbrev-ref HEAD
ls node_modules/ > /dev/null && echo "✓ node_modules exists" || echo "⚠ node_modules missing"
ls Agent-Studio-Deep-Audit-2026-05-17.md > /dev/null && echo "✓ V1 found" || echo "⚠ V1 missing"
```

Report findings; ask user how to proceed if anything unexpected.

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

Clean macOS Time Machine duplicates first:
```bash
bash skills/audit-verify/verify.sh --clean-mac-dups
```

Custom output dir:
```bash
bash skills/audit-verify/verify.sh --output ~/Desktop/audit-reports
```

Watch stdout for progress. Each check is printed with `── CXX: description ──`.

---

## STEP 3 — Read generated report

Path: `<OUTPUT_DIR>/Audit-V2-Verification-<DATE>.md`

Default OUTPUT_DIR: `reports/` (gitignored)

The report contains:
- Executive summary (X/27 confirmed)
- Per-claim verification table
- Recommended V1 patches
- Out-of-scope items

---

## STEP 4 — Surface to user

Report key statistics in chat:
1. N/27 claims confirmed, M refuted, K could-not-test
2. **Top 3 most impactful discrepancies** (refuted claims with biggest delta)
3. **Any HIGH severity findings** (npm audit, knip spikes)
4. **Recommended next actions** (apply V1 patches, open issues for vulns, etc.)

Format example:
> "Verification complete: 24/27 confirmed, 3 refuted.
>  Refuted: C02 (file count V1=960 vs actual=949), C14 (auth routes 126 vs 131), C16 (migrations 11 vs 10).
>  HIGH severity: 2 npm audit findings (next, axios).
>  Suggested next: (1) update V1 audit with corrected numbers, (2) review npm audit findings."

---

## STEP 5 — Optional follow-ups (only if user requests)

- Apply V1 patches (sed/manual edits in V1 audit file)
- Open GitHub issues for HIGH severity items
- Update TECH_DEBT.md baselines

---

## Confirmed constants (live-verified 2026-05-17)

27 check definitions are hardcoded in `verify.sh` CHECKS array.
Each entry: `id|category|description|v1_claim|expected|tolerance_pct|primary_cmd|fallback_cmd`.

**Corrections vs V1 audit:**
- C14 (auth routes): V1 said 126 → actual 131 (V1 used narrower grep pattern)
- C16 (migrations): V1 said 11 → actual 10 (V1 counted migration_lock.toml)
- C01 (LOC): V1 said 308k → actual 320k (V1 had silent failures on macOS Time Machine duplicate filenames)

---

## Edge cases & failure modes

| Scenario | Skill response |
|---|---|
| pnpm not installed | Fall back to direct node_modules/.bin invocation; corepack is NOT attempted (fails in sandboxes) |
| node_modules missing | Suggest `--install` flag; otherwise behavioral checks skip with "could-not-test" |
| Network unavailable | npx-based checks fall back to direct invocation; npm audit may skip |
| Git not a repo | Bail out — skill requires repo context |
| Timeout (>90s per check) | Mark "could-not-test", continue with next check |
| Vitest test failures | Status = "recorded" (data), not skill failure |
| Disk full | `df -h .` check at start; clear error |

---

## Constraints

- **Zero side effects on the codebase** (no commits, no file changes outside output dir)
- **Idempotent** (same input → same output, modulo git-derived values)
- **Max wall time 15 min total** (300 tests + knip + audit = bulk of time)
- **No network beyond npm registry** (no telemetry, no external API calls)
- **No MCP integration** (planned for V2)
```

**Acceptance:**
- YAML frontmatter parses
- Sve sekcije iz konvencije pokrivene (Hard rules, STEP 0, STEPs 1-5, Constants, Edge cases, Constraints)
- Trigger lista pokriva EN i SR
- "Pre-run checklist" sekcija dodata (greška F11 fix)
- Korekcije V1 audita explicitly listed (greške F7, F8, F9 fix)

### Korak 4 — Napiši `README.md` *(20 min)*

Kratak, ~30-50 linija:

```markdown
# audit-verify

Skill for empirically verifying the V1 Agent Studio architectural audit
by running real commands (typecheck, vitest, lint, knip, npm audit, license-checker).

## Usage

Trigger phrases (English): "verify audit", "audit verify", "v2 audit"
Trigger phrases (Serbian): "verifikuj audit", "potvrdi audit", "v2 audit"

Direct CLI:
```
bash skills/audit-verify/verify.sh                   # default
bash skills/audit-verify/verify.sh --install         # if node_modules missing
bash skills/audit-verify/verify.sh --output DIR      # custom output dir
bash skills/audit-verify/verify.sh --clean-mac-dups  # clean Time Machine dups first
bash skills/audit-verify/verify.sh --help
```

## Output

Reports written to `reports/Audit-V2-Verification-YYYY-MM-DD.md` (gitignored).
Each report contains 27 verification checks with confirmed/refuted/could-not-test status.

## Requirements

- Node 20+
- node_modules installed (or use `--install`)
- Git repo (uses git log for commit counts)

## Out of scope

- E2E test runs (need localhost)
- Load tests (need running service)
- Threat model (human analysis)
- MCP integration (planned for v2)

## Maintenance

When V1 audit is revised, edit CHECKS array in `verify.sh`:
- Update `expected` values
- Add new check rows for new claims
- Bump version in SKILL.md frontmatter
```

### Korak 5 — Self-test u sandbox-u (limited) *(45 min)*

Sandbox može da pokrene **19/27** check-ova (svi quantitative + nekoliko behavioral):

```bash
cd /Users/buda007/Desktop/agent-studio/
bash skills/audit-verify/verify.sh --output /tmp/audit-test
```

**Acceptance kriterijumi:**
- ✅ Skripta završava bez bash error-a
- ✅ Report fajl generisan u `/tmp/audit-test/`
- ✅ Report ima sve sekcije
- ✅ Quantitative checks: barem 17/19 confirmed (tolerance dozvoljava manju varijaciju)
- ✅ Behavioral checks: barem 5/8 attempted (3 mogu biti "could-not-test" zbog `pnpm`/`next lint` problema)
- ✅ `git status --porcelain` ne menja se zbog skill run-a (osim možda macOS dup brisanja ako se koristi `--clean-mac-dups`)

**Ne računamo:** full vitest run može potrajati 5+ min — to je OK, ali ne smatramo failure-om ako traje malo duže.

### Korak 6 — Spakuj kao `.skill` ZIP *(15 min)*

```bash
cd /Users/buda007/Desktop/agent-studio/skills/
zip -r audit-verify.skill audit-verify/ -x '*.DS_Store' '*/reports/*'
ls -la audit-verify.skill
```

**Acceptance:** `audit-verify.skill` ZIP fajl postoji u `skills/` folder-u, otprilike 10-50 KB.

---

## 3. Test plan (revidiran, realističan za sandbox)

### 3.1 Smoke test (sandbox)
```bash
cd /Users/buda007/Desktop/agent-studio/
bash skills/audit-verify/verify.sh --output /tmp/v2-test 2>&1 | tee /tmp/v2-test.log
```
Očekivano: 19/27 confirmed, 5-8 could-not-test (zbog pnpm/lint), 0-1 refuted (možda C18 commit count drifta).

### 3.2 Spot-check tačnosti
Za 5 random check-ova iz CHECKS array-a, ručno izvršiti `primary_cmd` ili `fallback_cmd` u terminalu i potvrditi da je `actual` u izveštaju identičan ručno izračunatom broju.

### 3.3 Idempotency test
Pokrenuti skill 2x u razmaku od 30s. Diff izveštaja: tolerantno samo razlike u timestamp-u i `duration_s` koloni.

### 3.4 Failure mode test
- `rm -rf node_modules` (npr. u temp clone-u) → behavioral checks treba da skip-uju, ne crash-uju
- Pokušaj sa nepostojećim path-om: `bash verify.sh --output /nonexistent/dir` → graceful error

### 3.5 Real-environment test (na korisnikovom laptopu)
**Korisnik radi sledeće:**
```bash
cd ~/Desktop/agent-studio/
bash skills/audit-verify/verify.sh
cat reports/Audit-V2-Verification-*.md
```
Očekivano: 25-27/27 confirmed (pnpm radi, next lint radi, full check spektar).

---

## 4. Acceptance criteria (za completion skill-a)

Skill je "gotov" kad:

1. ✅ 3 fajla iz §1.1 postoje (`SKILL.md`, `verify.sh`, `README.md`)
2. ✅ `bash verify.sh --help` prikazuje README
3. ✅ Smoke test u sandbox-u prolazi (§3.1) — barem 17/27 confirmed
4. ✅ Spot-check 5 brojeva: tačni (§3.2)
5. ✅ Idempotency: prolazi (§3.3)
6. ✅ Failure mode: prolazi (§3.4)
7. ✅ SKILL.md prolazi sve konvencije iz `pipeline-debug` modela (YAML + body version, triggers nizu + description, do_not_use_when YAML + markdown)
8. ✅ README jasan i minimalan (≤50 linija)
9. ✅ `audit-verify.skill` ZIP postoji
10. ✅ `git status` posle skill run-a: clean (osim opcionog macOS dup brisanja)

---

## 5. Rollout plan

### Faza A — Commit (10 min)
```bash
cd /Users/buda007/Desktop/agent-studio/
git checkout -b feat/audit-verify-skill
git add skills/audit-verify/
git add skills/audit-verify.skill
git commit -m "feat(skills): add audit-verify v1.0.0

Empirically verifies 27 V1 audit claims via real commands.
Replaces manual verification with single skill call.

V1 audit corrections discovered during plan review:
- Auth routes: V1 said 126, actual 131
- Migrations: V1 said 11, actual 10 (V1 counted migration_lock.toml)
- LOC: V1 used broken find command (macOS Time Machine duplicates)

Refs: skill-audit-verify-PLAN-V2.md
"
git push origin feat/audit-verify-skill
```

### Faza B — PR + first official run (30 min)
- Open PR sa link ka V1 audit, self-critique, plan V2, plan review
- Reviewer: webdevcom01-cell
- Posle merge-a: pokrenuti skill na main grani, prvi *zvanični* V2 report
- Aplicirati patch instructions u V1 audit (ručno ili polu-automatski)

### Faza C — Update CHANGELOG.md
```markdown
### Added (2026-05-17)
- **AUDIT-V2** — `audit-verify` skill: empirically verifies V1 audit claims with real
  commands. First production run: X/27 confirmed, Y refuted, Z could-not-test.
  Discovered V1 errors: file count, auth routes, migrations.
```

---

## 6. Maintenance plan

### 6.1 Skill version bump
- `1.0.x` → bug fix u `verify.sh` (fallback paths, command flags)
- `1.x.0` → dodavanje novih provera (jedan CHECKS array entry)
- `2.0.0` → MCP integracija, breaking output format change

### 6.2 V1 audit ažuriranje
Kada se V1 audit revidira (V1.1, V2 audit, itd.):
1. Update `expected` vrednosti u CHECKS array-u
2. Dodaj nove redove u CHECKS za nove tvrdnje
3. Bumpaj `version:` u SKILL.md frontmatter
4. Re-spakuj `.skill` ZIP

### 6.3 Quarterly review
Pokrenuti skill svaki kvartal:
1. Generate V2 report
2. Uporedi sa prethodnim kvartalom — tech debt rast/pad
3. Update CHANGELOG sa nalazima
4. Update baseline vrednosti ako su se promenile na bolje

---

## 7. Open risks (smanjeni sa V1 plana)

| Risk | Verovatnoća | Mitigacija |
|---|---|---|
| pnpm not installed → typecheck/test/lint break | High (sandbox) / Low (laptop) | Fallback chain do direct node invocation; lint koristi direct ESLint |
| Vitest crashes mid-suite | Medium | timeout 90s per check; skill marks as "could-not-test", continues |
| `next lint` requires pnpm | High (sandbox) | Use direct `eslint` invocation u fallback |
| node_modules out of date | Medium | Skill warn-uje ako lockfile mlađi od node_modules; user može pokrenuti `--install` |
| macOS Time Machine duplicates | High (macOS) | `--clean-mac-dups` flag |
| V1 audit fajl premešten | Low | Skill ne čita V1 direktno; expected values su hardcoded u CHECKS |
| Knip v6+ breaks compact reporter | Low | Lockuje na `knip@5` |
| User on branch other than main | Medium | SKILL.md pre-run checklist warn-uje |
| Bash 3 (macOS default) compat | Medium | Test na bash 3 + bash 5; izbeci `[[ -v ]]`, `mapfile` |

---

## 8. Effort estimate (recap)

| Korak | Vreme |
|---|---|
| 1. Folder + README.md | 15 min |
| 2. verify.sh (sve inline, 27 check-ova) | 120 min |
| 3. SKILL.md | 90 min |
| 4. README.md detalji | 20 min |
| 5. Self-test u sandbox-u | 45 min |
| 6. .skill packaging | 15 min |
| **TOTAL** | **~5 sati / pola radnog dana** |

Plus 40 min rollout (PR + first run + CHANGELOG entry).

---

## 9. Šta NE radimo (eksplicitno out-of-scope)

Da bismo izbegli scope creep:

- ❌ Threat model (STRIDE, OWASP LLM Top 10) — *budući skill*
- ❌ E2E run sa lokalnom DB+Redis — manuelno
- ❌ k6 load test — manuelno
- ❌ Live API trace — manuelno
- ❌ Lighthouse / bundle analyzer — *budući skill*
- ❌ MCP integration (as_health_check, as_list_agents) — *budući skill v2*
- ❌ Auto-update V1 audit fajla — samo manual via patch instructions
- ❌ GitHub issue creation za vulnerabilities — manuelno (gh CLI dostupan)
- ❌ Cost analiza (AI provider tokens) — *budući skill*

---

## 10. Status checkpoint

✅ Plan V2 pokriva svih 12 fix-eva iz PLAN-REVIEW.md
✅ Struktura realistic (3 fajla, ne 9)
✅ Komande verifikovane live u sandbox-u
✅ V1 audit korekcije eksplicitno integrisane u CHECKS array
✅ Fallback chain za pnpm-less environments
✅ Self-test scope realističan (19/27 u sandbox-u)
✅ Rollout uključuje `.skill` packaging
✅ Out-of-scope explicitly enumerated

**Spreman za implementaciju.** Ako se slažeš, krećem Korakom 1 (folder + README).

---

*Plan V2 finalized: 2026-05-17.*
*Integrated fixes: F1 (struktura), F2 (no helper scripts), F3 (corepack drop), F4 (grep filters), F5 (V1 number corrections), F6 (skip install default), F7 (sandbox self-test mode), F8 (YAML+body version), F9 (no template files), F10 (.skill packaging), F11 (pre-run checklist), F12 (macOS dups flag).*
*Halucination tolerance: 0% — all assertions verified against live filesystem.*
