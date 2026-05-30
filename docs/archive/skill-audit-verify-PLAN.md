# Implementation Plan: `audit-verify` skill

**Datum:** 17. maj 2026
**Status:** Plan V1 — spreman za implementaciju
**Bazirano na:** `skill-audit-verify-ANALYSIS.md` + 4 user confirmation-a (project skill / Bash+SKILL.md / always new file / no MCP)
**Cilj:** Korak-po-korak, izvršiv plan koji rezultuje radnim skill-om u `skills/audit-verify/` direktorijumu projekta.

---

## 0. Sažetak skill-a (kako je sad jasno definisan)

| Atribut | Vrednost |
|---|---|
| **Ime** | `audit-verify` |
| **Verzija** | `1.0.0` |
| **Lokacija** | `skills/audit-verify/` u agent-studio repo-u |
| **Arhitektura** | Bash skripta (`verify.sh`) + `SKILL.md` koji vodi Claude-a kroz izvršavanje |
| **MCP zavisnost** | Nijedna (čisto file-system + npm/node) |
| **Side effects** | Nijedan (zero mutation; samo dodaje izveštaj) |
| **Output lokacija** | `skills/audit-verify/reports/Audit-V2-Verification-YYYY-MM-DD.md` |
| **Trigger fraze** | "verify audit", "verifikuj audit", "potvrdi nalaze", "v2 audit", + 10 drugih |
| **Wall-time po runu** | 10-15 min full, 3-5 min sa `--no-install` |
| **Disk requirement** | ~2 GB (node_modules + .next/) |

---

## 1. Deliverables (šta tačno pravimo)

```
skills/audit-verify/
├── SKILL.md                                    [obavezan, ~400-500 linija]
├── IMPLEMENTATION_PLAN.md                      [ovaj dokument, premešten ovde]
├── CRITICAL_ANALYSIS.md                        [posle V1 testa, ako bude trebao]
├── verify.sh                                   [glavna izvršna skripta, ~300 linija]
├── lib/
│   ├── count-claims.sh                         [helper: kvantitativne provere #1-12, 18-21]
│   ├── run-behavioral.sh                       [helper: behavioral provere #13, 15-17, 22-26]
│   └── render-report.sh                        [helper: generiše markdown report iz JSON-a]
├── templates/
│   └── verification-report.md                  [Markdown template sa placeholder-ima]
├── data/
│   ├── v1-claims.json                          [tabela 27 V1 tvrdnji + provera + očekivanog rezultata]
│   └── baseline.json                           [tekući baselines, update-uje se nakon svakog runa]
├── reports/                                    [output direktorijum, gitignored osim .gitkeep]
│   └── .gitkeep
└── README.md                                   [kratak install/usage guide]
```

**Komentar:** 9 fajlova + 2 direktorijuma. Veće od trenutnih skill-ova u repo-u (`agent-health-check` ima 1 fajl), ali realno za skill koji pokreće bash skripte sa structured output-om.

---

## 2. Implementacioni redosled (10 koraka)

### Korak 1 — Kreiraj folder strukturu *(15 min)*
```bash
cd /Users/buda007/Desktop/agent-studio/
mkdir -p skills/audit-verify/{lib,templates,data,reports}
touch skills/audit-verify/reports/.gitkeep
```
**Output:** Prazan folder skeleton.
**Acceptance:** `tree skills/audit-verify/` pokazuje očekivanu strukturu.

### Korak 2 — Napiši `data/v1-claims.json` *(45 min)*
JSON sa 27 stavki, svaka u formatu:
```json
{
  "id": "C01",
  "category": "quantitative",
  "v1_claim": "~308.000 linija TS/TSX koda",
  "v1_location": "Agent-Studio-Deep-Audit-2026-05-17.md § 0",
  "verify_command": "find src packages -type f \\( -name '*.ts' -o -name '*.tsx' \\) | xargs wc -l | tail -1 | awk '{print $1}'",
  "expected_value": 308088,
  "tolerance_pct": 5,
  "interpret_as": "loc_count"
}
```
27 takvih objekata u nizu.

**Output:** Strukturisan JSON koji `verify.sh` čita.
**Acceptance:** `jq '. | length' data/v1-claims.json` returns 27; svaki entry ima sve potrebne ključeve.

### Korak 3 — Napiši `lib/count-claims.sh` *(60 min)*
Bash skripta koja:
- Čita `data/v1-claims.json` preko `jq`
- Filtruje na `category == "quantitative"` (18 stavki)
- Za svaku, izvršava `verify_command`, hvata broj
- Poredi sa `expected_value` ± `tolerance_pct`
- Emituje JSON output: `{ "id": "C01", "actual": 308094, "status": "match", "delta_pct": 0.002 }`
- Output ide u stdout, line-delimited JSON (jedan zapis po liniji)

**Acceptance:** `bash lib/count-claims.sh > out.jsonl && jq '.' out.jsonl | head` pokazuje 18 zapisa.

### Korak 4 — Napiši `lib/run-behavioral.sh` *(90 min)*
Bash skripta koja izvršava 9 bihevioralnih provera:
- Prvo: Detektuj package manager (pnpm → corepack → fall back na npx)
- `--no-install` flag: preskoči install korak
- Pokreni svaku komandu sa timeout-om (5 min default)
- Hvata stdout, stderr, exit code
- Za svaku, određuje status (`passed | warning | failed | skipped`)
- Output: line-delimited JSON, kompatibilan sa `count-claims.sh` output-om

**Pojedinačne provere:**
1. `pnpm install --frozen-lockfile` (preskočeno ako `--no-install`)
2. `pnpm typecheck` → broj TS errors
3. `pnpm test --reporter=summary` → pass/fail count
4. `pnpm lint` → broj errors + broj warnings
5. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → broj unused locals
6. `npx knip@5 --reporter compact --no-exit-code` → broj dead exports/files
7. `npm audit --omit=dev --json` → broj high/critical vulns
8. `npm outdated --json` → broj outdated deps
9. `npx license-checker --json --production` → license breakdown

Za #4 (lint) i #6 (knip) — interpretiraj kao "warning, ne error" jer baseline već ima 15 eslint-disable.

**Acceptance:** Skripta vraća 9 JSON zapisa za 9 provera, čak i ako neke padnu (status `failed`/`skipped` umesto crash).

### Korak 5 — Napiši `lib/render-report.sh` *(45 min)*
Bash skripta koja:
- Čita combined JSONL output od `count-claims.sh` + `run-behavioral.sh`
- Učitava `templates/verification-report.md` template
- Zamenjuje placeholder-e (`{{V1_CLAIM_TABLE}}`, `{{BEHAVIORAL_TABLE}}`, `{{EXECUTIVE_SUMMARY}}`)
- Računa summary brojeve: confirmed/partial/refuted/skipped count
- Output: gotov markdown u `reports/Audit-V2-Verification-YYYY-MM-DD.md`

**Acceptance:** Generisan markdown se otvara, ima sve sekcije iz Analize §5.1.

### Korak 6 — Napiši `templates/verification-report.md` *(30 min)*
Markdown template sa placeholder-ima koji `render-report.sh` zamenjuje. Sledi strukturu iz Analize §5.1.

**Acceptance:** Otvara se kao validan markdown čak i sa neispunjenim placeholder-ima.

### Korak 7 — Napiši `verify.sh` (orchestrator) *(45 min)*
Glavna skripta koju Claude/user pokreće. Logika:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Parse args
DO_INSTALL=true
OUTPUT_DIR="reports"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-install) DO_INSTALL=false; shift ;;
    --output)     OUTPUT_DIR="$2"; shift 2 ;;
    --help)       cat README.md; exit 0 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Step 0: pre-flight
echo "── Step 0/4: Pre-flight ──"
detect_pm  # → exports $PM=pnpm|corepack|npx

# Step 1: quantitative
echo "── Step 1/4: Quantitative claims (18 checks) ──"
bash lib/count-claims.sh > /tmp/quant.jsonl

# Step 2: behavioral
echo "── Step 2/4: Behavioral checks (9 checks) ──"
INSTALL_FLAG=""
$DO_INSTALL || INSTALL_FLAG="--no-install"
bash lib/run-behavioral.sh $INSTALL_FLAG > /tmp/behav.jsonl

# Step 3: render
echo "── Step 3/4: Generate report ──"
cat /tmp/quant.jsonl /tmp/behav.jsonl > /tmp/all.jsonl
TODAY=$(date +%Y-%m-%d)
bash lib/render-report.sh /tmp/all.jsonl > "$OUTPUT_DIR/Audit-V2-Verification-$TODAY.md"

# Step 4: summary
echo "── Step 4/4: Summary ──"
print_summary /tmp/all.jsonl
echo "Report: $OUTPUT_DIR/Audit-V2-Verification-$TODAY.md"
```

**Acceptance:** `bash verify.sh --no-install` runs end-to-end u ~3 min, generiše report.

### Korak 8 — Napiši `SKILL.md` *(90 min)*
Najvažniji deliverable. Strukura prema konvencijama iz §1.1 Analize:

```markdown
---
name: audit-verify
version: 1.0.0
description: >
  Verifies claims from the Agent Studio architectural audit (V1) by running real commands —
  typecheck, vitest, knip, npm audit, license-checker — and produces a structured V2 report
  with confirmed/refuted findings. Replaces 27 manual verification steps with one skill call.
  Triggers: "verify audit", "audit verify", "verifikuj audit", "potvrdi audit", "v2 audit",
  "validate findings", "audit verifikacija", "ponovo proveri audit", "phase 2 audit",
  "audit accuracy check", "potvrdi nalaze", "test the audit", "is the audit accurate".
  Do NOT use for: executing audit recommendations (future skill), running E2E or load tests
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
  - User wants to execute audit recommendations → use audit-rollout (future skill)
  - User wants to fix specific tech debt item → use targeted skill
  - User wants E2E/load test runs → out of scope, do manually
---

# Skill: audit-verify
*Version: 1.0.0 | Based on: IMPLEMENTATION_PLAN.md*

## Purpose
Empirically verifies the 27 key claims from the V1 Agent Studio audit by running
real commands. Produces a V2 verification report that confirms/refutes each claim.

## Hard rules — zero hallucination
- Verification result comes ONLY from a command actually run in this session
- If a command fails for unexpected reason → status is "could not test" + reason; NEVER guess
- Numbers are never carried over from V1 — always re-counted

## What this skill does (4 steps)
1. Pre-flight: detect package manager (pnpm/corepack/npx fallback)
2. Quantitative claims (18 checks): grep/count/wc verification
3. Behavioral checks (9 checks): pnpm typecheck, test, lint, knip, npm audit, etc.
4. Render report: structured markdown in skills/audit-verify/reports/

## STEP 0 — Task list
Call TaskCreate for each:
- "Pre-flight & dependency setup"
- "Quantitative claims verification (18 checks)"
- "Behavioral checks (9 checks)"
- "Generate V2 report"
- "Surface discrepancies & recommendations"

## STEP 1 — Run verify.sh
Default: `bash skills/audit-verify/verify.sh`
Fast (skip pnpm install): `bash skills/audit-verify/verify.sh --no-install`

The script handles everything automatically. Claude's role is to:
- Watch the output (real-time stdout)
- After completion, read the generated report
- Surface any discrepancies vs V1 audit to the user
- Propose follow-up actions

## STEP 2 — Read the generated report
Path: `skills/audit-verify/reports/Audit-V2-Verification-<DATE>.md`
The file contains:
- Executive summary (X/27 confirmed, etc.)
- Per-claim verification table
- Behavioral test results
- New findings not in V1
- Recommended V1 patches
- Skipped dimensions

## STEP 3 — Surface to user
Report key statistics:
- N claims confirmed, M refuted, K could-not-test
- Top 3 most-impactful discrepancies (if any)
- Any HIGH severity findings (npm audit, knip dead code spike)

Ask user: "Da li želiš da: (1) apliciram patches u V1 audit, (2) otvorim GitHub issues
za vulnerable deps, ili (3) samo arhiviramo izveštaj?"

## STEP 4 — Optional follow-ups
Only on user request:
- Update V1 audit (apply patch instructions from V2)
- Open GitHub issues for HIGH severity items
- Update TECH_DEBT.md baselines

## Confirmed constants
[Tabela 27 claim-ova, isto što je u data/v1-claims.json]

## Edge cases
- pnpm not installed → fall back to corepack → fall back to npx
- node_modules missing → must run install (unless --no-install)
- Disk full → fail gracefully with clear message
- Git not a repo → bail out (skill assumes repo context)

## Failure modes
- Script returns exit 1 → skill failed, report partial findings only
- Script returns exit 2 → completed with warnings (semgrep skipped, etc.) — still produce report
- Individual check times out → mark as "could not test", continue

## Constraints
- Zero side effects on the codebase (no commits, no file changes outside reports/)
- Idempotent (same output if re-run with same git SHA)
- Max wall time 20 min total
```

**Acceptance:** Postoje sve obavezne sekcije iz konvencije; YAML frontmatter parsuje; trigger lista pokriva EN i SR/HR.

### Korak 9 — Napiši `README.md` (kratko) *(15 min)*
Brz install + usage guide. ~50 linija. Kako pokrenuti, šta očekivati, kako interpretirati output.

### Korak 10 — Test the skill *(60 min)*
**Self-test plan:** pokrenuti skill protiv trenutnog repo state-a i verifikovati da:
- Skript završava u <20 min
- Generiše report u `reports/`
- Report ima sve sekcije
- Brojevi za quantitative claim-ove tačni (provera ručno za 3-4 stavke)
- Bihevioralni claim-ovi imaju razuman output (čak i ako neki padnu, status je validan)

Ako bilo šta padne neočekivano: piši `CRITICAL_ANALYSIS.md`, predloži `IMPLEMENTATION_PLAN_V2.md`, iteriraj.

---

## 3. SKILL.md structure deep-dive

SKILL.md je *najvažniji* fajl. Mora da:

### 3.1 Trigger-i pokrivaju realne korisničke fraze
Iz Analize §8, finalni trigger list:

**Engleski (8):**
- "verify audit", "audit verify", "validate audit findings", "check audit accuracy"
- "v2 audit", "phase 2 audit", "audit accuracy check", "is the audit accurate"

**Srpski/Hrvatski/Bosanski (6):**
- "verifikuj audit", "potvrdi audit", "provjeri audit", "audit verifikacija"
- "ponovo proveri audit", "potvrdi nalaze"

**Anti-triggers (do_not_use_when):**
- Izvršavanje preporuka iz audita (drugi skill)
- Pojedinačni fix-evi (targetirani skill-ovi)
- E2E / load test runs (out-of-scope)
- Threat modeling (human task)

### 3.2 Hard rules sekcija
Tri "zero hallucination" pravila (vidi Korak 8). Ovo je convention u svim postojećim skill-ovima projekta — bez ovih pravila skill ne odgovara stilu repo-a.

### 3.3 STEP 0 TaskCreate
Obavezno — kao u svim drugim skill-ovima projekta. 5 task-ova:
1. Pre-flight & dependency setup
2. Quantitative claims verification (18 checks)
3. Behavioral checks (9 checks)
4. Generate V2 report
5. Surface discrepancies & recommendations

### 3.4 STEP-ovi 1-4
Svaki STEP eksplicitan, sa exact komandama. Claude *ne* improvizuje — samo izvršava.

### 3.5 Confirmed constants
Tabela 27 verifikacionih provera identična onoj u `data/v1-claims.json`, ali u markdown obliku za čovekovu čitljivost.

---

## 4. Skill self-test plan

Pre nego što kažemo "skill je gotov", treba ga testirati. Plan:

### 4.1 Smoke test
```bash
# Hard reset workspace state
cd /Users/buda007/Desktop/agent-studio/
git status  # workspace mora biti clean

# Run skill
bash skills/audit-verify/verify.sh --no-install

# Verify outputs
ls -la skills/audit-verify/reports/Audit-V2-Verification-*.md
cat skills/audit-verify/reports/Audit-V2-Verification-*.md | head -50
```

**Acceptance:**
- ✅ Skripta završila u <5 min (sa --no-install)
- ✅ Report generisan
- ✅ Report ima sve sekcije
- ✅ Quantitative claims status: barem 15/18 confirmed
- ✅ Behavioral claims status: barem 5/9 attempted (2-3 mogu biti skipped zbog sandbox limitacija)

### 4.2 Spot-check tačnosti
Za 3 random claim-a iz quantitative liste, ručno izvršiti komandu i potvrditi da je `actual` u izveštaju identičan ručno izračunatom broju.

### 4.3 Failure mode test
Simulirati 2 failure mode-a:
- Bez `node_modules` → pokrenuti sa default flag (treba da pokuša install)
- Sa `--no-install` ali bez `node_modules` → behavioral checks treba da skipuju, ne crash-uju

### 4.4 Re-run idempotency
Pokrenuti skill 2x. Diff izveštaja treba da bude samo: timestamp + commit count + datestamp. Ostali brojevi identični.

---

## 5. Acceptance criteria (za completion skill-a)

Skill je "gotov" kad:

1. ✅ Svi 9 fajlova iz §1 postoje
2. ✅ `bash verify.sh --no-install` prolazi smoke test (§4.1)
3. ✅ Spot-check 3 brojeva: tačni (§4.2)
4. ✅ Re-run idempotency: prolazi (§4.4)
5. ✅ SKILL.md prolazi sve konvencije iz Analize §1.1
6. ✅ README.md ima clear install + usage instrukcije
7. ✅ `git status` posle skill run-a: clean (samo .gitignore-d reports/ ne računa se)

---

## 6. Rollout plan (posle uspeha self-testa)

### Faza A — Commit u repo (15 min)
```bash
cd /Users/buda007/Desktop/agent-studio/
git checkout -b feat/audit-verify-skill
git add skills/audit-verify/
git commit -m "feat(skills): add audit-verify skill v1.0.0

Verifies 27 claims from V1 architectural audit by running real commands
(typecheck, vitest, knip, npm audit, license-checker). Produces V2 report
in skills/audit-verify/reports/.

Refs: Agent-Studio-Deep-Audit-2026-05-17.md
"
git push origin feat/audit-verify-skill
```

### Faza B — Otvori PR (10 min)
PR opis: link ka V1 audit, link ka self-critique, link ka analizi/planu.
Reviewer: webdevcom01-cell (sebi).

### Faza C — Prvi pravi run (30 min)
Pokrenuti skill na main grani, prvi *zvanični* V2 report. Aplicirati patch instructions u V1 audit (ručno). Update TECH_DEBT.md baselines.

### Faza D — Update CHANGELOG.md
```markdown
### Added (2026-05-17)
- **AUDIT-V2** — `audit-verify` skill: empirically verifies 27 V1 audit claims
  with real commands (typecheck, vitest, knip, npm audit). Generates structured
  V2 report. First production run: X/27 confirmed, Y refuted.
```

---

## 7. Maintenance plan

### 7.1 Update triggers
Kad `data/v1-claims.json` treba update:
- V1 audit se izmeni (novo izdanje audita) → re-mapiraj sve claim-ove
- Novi check-ovi se dodaju → append u JSON + update SKILL.md "Confirmed constants" tabelu
- Postojeći check pukne na novom commit-u → update tolerance ili expected_value

### 7.2 Skill version bump
- `1.0.x` → bug fix u `verify.sh` (npr. fallback path-evi)
- `1.x.0` → dodavanje novih provera
- `2.0.0` → MCP integracija ili breaking change u output format-u

### 7.3 Quarterly review
Svaki kvartal:
1. Pokrenuti skill
2. Uporediti baseline.json sa starim → da li je tech debt rastao/padao?
3. Update CHANGELOG sa nalazima

---

## 8. Open risks (poznata ograničenja)

| Risk | Verovatnoća | Mitigacija |
|---|---|---|
| `pnpm install` ne radi u korisničkom env-u | Medium | Tri-tier fallback u verify.sh |
| Vitest test crashuje (broken test, ne broken code) | Medium | Hvata exit code, beleži broj failed testova; ne baca skill |
| `npm audit` API se menja | Low | Parsiraj JSON sa fallback-om na text mode |
| `knip` v6+ menja CLI | Low | Lockuje na `knip@5` u verify.sh |
| Bash 3.x (macOS default) ne podržava neke features | Medium | Test na bash 3 + bash 5; izbeci `[[ -v ]]`, koristi `${var:-}` |
| Disk full tokom builda | Low | `df -h` check pre kreiranja, jasan error |
| V1 audit dokument se preimenuje/premesti | High | SKILL.md kaže "pretpostavlja da V1 živi u workspace folder-u"; verify.sh ne čita V1 direktno, koristi snapshot u v1-claims.json |

---

## 9. Effort estimate (recap)

| Faza | Vreme |
|---|---|
| Korak 1 (folder) | 15 min |
| Korak 2 (v1-claims.json) | 45 min |
| Korak 3 (count-claims.sh) | 60 min |
| Korak 4 (run-behavioral.sh) | 90 min |
| Korak 5 (render-report.sh) | 45 min |
| Korak 6 (template) | 30 min |
| Korak 7 (verify.sh) | 45 min |
| Korak 8 (SKILL.md) | 90 min |
| Korak 9 (README) | 15 min |
| Korak 10 (test) | 60 min |
| **TOTAL** | **~8 sati / 1 radni dan** |

Plus 30 min rollout (PR + first run + CHANGELOG).

---

## 10. Otvoreno pitanje pre starta

Pre nego što krenem da pišem fajl-po-fajl, jedna stvar koju treba razjasniti:

**Sandbox limitation problem:** Cowork sandbox u kome trenutno radim nema `pnpm`. Skill će na korisnikovom sistemu raditi normalno (ima `pnpm` instaliran u projektu), ali ako pokušamo *self-test* u sandbox-u, ne možemo realno testirati behavioral checks. Za self-test (Korak 10) imamo 2 opcije:

**Opcija A — Self-test u sandbox-u (limitirano):**
- Kvantitativne provere: full test (svih 18 ✓)
- Behavioral provere: skip + verify da skripta ne crash-uje
- Acceptance niža: "skripta radi do behavioral koraka, fallback logic OK"

**Opcija B — Self-test instrukcije ka korisniku:**
- Skill napravimo end-to-end
- Korisnik pokrene `bash skills/audit-verify/verify.sh` na svom laptopu (gde ima pnpm)
- Vraća output meni, ja interpretiram, predlažem fix-eve ako treba

**Opcija C — Instaliraj pnpm u sandbox preko corepack:**
- Pre Korak 10, pokušaj `corepack enable && corepack prepare pnpm@10 --activate`
- Ako uspe, full self-test moguć
- Ako ne, padni nazad na Opciju A

Predlog: **Opcija C → fallback na Opciju B**. To je najsigurnije.

---

## Status checkpoint

Pre nego što počnem implementaciju, sažetak:

✅ Plan razdvojen u 10 koraka, ~8h ukupno
✅ Sve datoteke definisane (9 + 2 direktorijuma)
✅ SKILL.md struktura mapirana
✅ Self-test plan definisan (3 nivoa testa)
✅ Rollout + maintenance plan razrađen
✅ Otvoreni rizici identifikovani sa mitigacijama
⚠️ Sandbox limitation se rešava sa Opcijom C+B

**Ako sve ovo deluje OK — krećem sa implementacijom Korakom 1.** Ako nešto želiš da prilagodiš (estimate, scope, ime), reci sada — kasnije će biti skuplje.
