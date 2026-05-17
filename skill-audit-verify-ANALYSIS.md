# Pre-Skill Analysis: `audit-verify`

**Datum:** 17. maj 2026
**Cilj:** Pre nego što napišemo bilo jedan red SKILL.md-a, mapirati *sve* što skill treba da uradi, gde su zamke, koje konvencije već postoje u projektu, i koji su realni preduslovi.
**Inputs ovog dokumenta:** V1 audit (`Agent-Studio-Deep-Audit-2026-05-17.md`), Self-critique (`Audit-Review-Self-Critique-2026-05-17.md`), postojeći skills (`agent-health-check`, `agent-scaffolder`, `pipeline-debug`), postojeće skripte (`quarterly-debt-scan.sh`, `pre-push-check.sh`, `smoke-test.sh`).

---

## 0. Šta tačno `audit-verify` skill radi?

**Pitanje koje rešava:** "Pre nego što počnem da izvršavam preporuke iz V1 audita, da li su sve te tvrdnje *tačne*?"

**Konkretan output:** Markdown dokument `Audit-V2-Verification.md` koji:
- Uzima 21 ključnu tvrdnju iz V1 audita (LOC brojevi, security postavke, RLS status, coverage thresholds, dependency hygiene, itd.)
- Za svaku — pokreće realnu komandu (ne grep, već `pnpm test`, `pnpm typecheck`, itd.)
- Beleži stvarni rezultat
- Označava: ✅ POTVRĐENO / ⚠️ DELIMIČNO / ❌ OBORENO / ⏭️ NEMOGUĆE TESTIRATI
- Predlaže ažuriranje V1 audita ako se nalazi ne slažu
- Generiše **baseline brojeve** koje će ostali skill-ovi (rls-rollout, property-panel-extract) koristiti kao polaznu tačku

**Šta NE radi:**
- Ne pravi GitHub issues (to je posao kasnijeg "audit-rollout" skill-a)
- Ne radi izmene u kodu (zero mutation, čista verifikacija)
- Ne menja V1 audit fajl direktno (V2 je *novi* fajl koji referencira V1)
- Ne pokreće E2E testove (preskup, traži aktivnu DB+Redis+server)
- Ne pokreće load testove (traži aktivan service)
- Ne pokreće security scan-ove koji traže API keys (npm audit OK, semgrep OK, ali ne npm audit signatures)

---

## 1. Konvencije iz postojećih skill-ova (`skills/`)

Pregledom `agent-health-check`, `agent-scaffolder`, i `pipeline-debug`, identifikujemo **5 obaveznih konvencija** za skill-ove u ovom projektu:

### 1.1 File layout
```
skills/audit-verify/
├── SKILL.md                       ← Entry point sa YAML frontmatter
├── IMPLEMENTATION_PLAN.md         ← Plan koji pišemo SADA (V1)
├── CRITICAL_ANALYSIS.md           ← Self-critique posle V1 implementacije
├── IMPLEMENTATION_PLAN_V2.md      ← Revizija ako V1 ima problema
├── verify.sh                      ← Glavna izvršna skripta (kao quarterly-debt-scan.sh)
└── templates/
    └── verification-report.md     ← Template za V2 izveštaj
```

### 1.2 SKILL.md YAML frontmatter
```yaml
---
name: audit-verify
version: 1.0.0
description: >
  Multi-line description (50-100 reči) koji opisuje šta skill radi,
  uključujući explicit trigger phrase-ove na engleskom I srpskom.
triggers:
  - "audit verify"
  - "verifikuj audit"
  - "potvrdi nalaze"
  - ... 10-15 trigger-a, bilingvalno
do_not_use_when:
  - When user wants to ... (use other skill instead)
---
```

### 1.3 Mandatory STEP 0 — Task list
Svaki skill **mora** da poziva `TaskCreate` na početku za sve glavne korake. To je u svim 3 pregledana skill-a (`agent-health-check`, `agent-scaffolder`, `pipeline-debug`).

### 1.4 Hard rules — zero hallucination
Najjača norma u postojećim skill-ovima:
- "Root cause is determined ONLY by the explicit IF-THEN table — never by LLM inference"
- "Fix commands use ONLY node_ids and kb_ids obtained from live MCP calls in this session"
- "If a tool call fails → report UNKNOWN for that dimension, do NOT guess the result"

Za `audit-verify` ekvivalent:
- Verifikacioni rezultat dolazi **samo** iz stvarne komande pokrenute u trenutnoj sesiji
- Ako komanda padne sa neočekivanog razloga → status je `⏭️ NEMOGUĆE TESTIRATI` + razlog, NIKAD pretpostavka
- Brojevi se ne preuzimaju iz V1 audita — uvek se ponovo broje

### 1.5 Structured constants section
`pipeline-debug` ima sekciju "Confirmed constants (live-verified)" — taj patern definiše koja imena fajlova, putanje, polja smatramo kao ground truth. Za audit-verify, to su baseline brojevi iz `TECH_DEBT.md`.

---

## 2. Inventar V1 tvrdnji za verifikaciju

**21 ključna tvrdnja iz V1 audita.** Tabela: tvrdnja → komanda → očekivani output → ishod.

| # | V1 tvrdnja | Verifikaciona komanda | Očekivani output | Tip |
|---|---|---|---|---|
| 1 | "~308.000 linija TS/TSX koda" | `find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) \| xargs wc -l \| tail -1` | broj ± 5% | Quantitative |
| 2 | "960 izvornih fajlova" | `find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` | broj | Quantitative |
| 3 | "161 API ruta" | `find src/app/api -name 'route.ts' \| wc -l` | broj | Quantitative |
| 4 | "61 Prisma model" | `grep -c '^model ' prisma/schema.prisma` | broj | Quantitative |
| 5 | "70 runtime handlera" | `ls src/lib/runtime/handlers/*.ts \| grep -v index.ts \| wc -l` | broj | Quantitative |
| 6 | "304 unit testa + 11 E2E" | `find src -name '*.test.ts' -o -name '*.test.tsx' \| wc -l; find e2e -name '*.spec.ts' \| wc -l` | dva broja | Quantitative |
| 7 | "7.413 LOC u property-panel.tsx" | `wc -l src/components/builder/property-panel.tsx` | broj | Quantitative |
| 8 | "1.899 LOC u sdlc/orchestrator.ts" | `wc -l src/lib/sdlc/orchestrator.ts` | broj | Quantitative |
| 9 | "10 TODO/FIXME u 308k LOC" | `grep -rEn '\b(TODO\|FIXME\|HACK\|XXX)\b' src --include='*.ts' --include='*.tsx' \| wc -l` | broj | Quantitative |
| 10 | "13 @ts-ignore direktiva" | `grep -rE '@ts-ignore\|@ts-expect-error' src --include='*.ts' --include='*.tsx' \| wc -l` | broj | Quantitative |
| 11 | "9 'as any' upotreba" | `grep -rE '\bas any\b' src --include='*.ts' --include='*.tsx' \| wc -l` | broj | Quantitative |
| 12 | "15 eslint-disable" | `grep -rE 'eslint-disable' src --include='*.ts' --include='*.tsx' \| wc -l` | broj | Quantitative |
| 13 | "0 unused locals" | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters 2>&1 \| grep "error TS6133" \| wc -l` | 0 | Behavioral |
| 14 | "Coverage threshold 30%/30%/25%/30%" | `grep -A 5 'thresholds:' vitest.config.ts` | match | Config check |
| 15 | "`pnpm typecheck` prolazi" | `pnpm typecheck` (ili `npx tsc --noEmit`) | exit code 0 | **Behavioral** |
| 16 | "`pnpm test` prolazi" | `pnpm test` ili `npx vitest run --reporter=summary` | exit code 0 | **Behavioral** |
| 17 | "`pnpm lint` prolazi" | `pnpm lint` ili `npx next lint` | exit code 0 | **Behavioral** |
| 18 | "126/161 ruta koristi auth guard" | `grep -rlE 'requireAuth\|requireAgentOwner\|requireOrgMember\|requireOrgAdmin\|requireOrgOwner\|requireAdmin' src/app/api --include='route.ts' \| wc -l` | broj | Quantitative |
| 19 | "62 ruta koriste Zod" | `grep -rlE 'z\.object\|z\.string\|from "zod"' src/app/api --include='route.ts' \| wc -l` | broj | Quantitative |
| 20 | "11 migracija + 1 RLS (Agent tabela only)" | `ls prisma/migrations/ \| grep -v migration_lock \| wc -l; grep -c 'ALTER TABLE.*ENABLE ROW LEVEL SECURITY' prisma/migrations/20240108000000_enable_rls/migration.sql` | brojevi | Quantitative |
| 21 | "796 commit-a ukupno, 169 u poslednjih 30 dana" | `git log --oneline \| wc -l; git log --since='30 days ago' --oneline \| wc -l` | brojevi | Quantitative |

**Dodatne tvrdnje koje su u self-critique-u označene kao "neverifikovane":**

| # | Critique tvrdnja | Verifikaciona komanda | Tip |
|---|---|---|---|
| 22 | "Knip dead code stvarni broj" | `npx knip@5 --reporter compact --no-exit-code` | Behavioral |
| 23 | "npm audit vulnerabilities" | `npm audit --omit=dev --json` | Behavioral |
| 24 | "Bundle size" | `pnpm build && ls -la .next/standalone/.next/static` | Behavioral |
| 25 | "Outdated deps" | `npm outdated --json` | Behavioral |
| 26 | "License audit" | `npx license-checker --json --production` | Behavioral |
| 27 | "Dependency count" | `jq '.dependencies \| length, .devDependencies \| length' package.json` | Quantitative |

**Ukupno: 27 verifikacionih provera.**

Klasifikacija po riziku failure-a:
- **Behavioral (treba aktivno izvršiti, može da padne):** #13, #15-17, #22-26 → 9 provera
- **Quantitative (grep/count, gotovo nikad ne padne):** ostalih 18 → 18 provera

---

## 3. Environment & preduslovi

### 3.1 Šta sandbox ima (verifikovano live)
```
✅ node v22.22.0
✅ npm (sistemski)
✅ git
✅ bash, grep, find, jq, wc, sed
✅ curl
✅ access to /sessions/laughing-clever-darwin/mnt/agent-studio/ (mounted workspace)
```

### 3.2 Šta sandbox NEMA (verifikovano live)
```
❌ pnpm (mora se preuzeti via corepack ili npm install -g)
❌ yarn
❌ semgrep
❌ bundle-analyzer (može preko npx)
❌ Aktivan PostgreSQL ili Redis (znači: pnpm db:* komande PADAJU)
❌ Aktivan E2B sandbox / Anthropic / OpenAI API keys u env-u
```

### 3.3 Posledica za skill design
1. **Skill ne sme da pretpostavlja pnpm.** Mora prvo da pokuša `pnpm`, padne na `corepack enable && corepack prepare pnpm@10 --activate`, padne na direktno `npx tsc`, `npx vitest`, `npx next lint`.
2. **DB-zavisne komande su out-of-scope za V2.** Ne pokušavamo `prisma migrate`, `db:seed`, `db:studio`. Samo statičke schema provere.
3. **E2E testovi su out-of-scope.** Skill jasno označava: "E2E run nije moguć bez localhosta — preskočeno, vidi Sprint X u roadmap-u."
4. **`pnpm install`** je *neophodan* za type-check, vitest run, knip — bez `node_modules`, sve to pada. Skill ovo mora da uradi *u pravom režimu* (frozen-lockfile ako ima lock fajl, regularan ako nema).

### 3.4 Procena disk/network usage
- `pnpm install` na ovom repo-u: ~1.2 GB node_modules, ~600 MB pnpm-store
- `pnpm build`: dodatnih ~200 MB u `.next/`
- Network: skidanje deps + `knip` + `license-checker` + `bundle-analyzer` preko npm registry-ja
- Vreme: install ~2-3 minuta, build ~3-5 minuta, full vitest run ~2-4 minuta

**Total budget za jedan skill run: ~10-15 minuta + ~2 GB disk.**

---

## 4. Failure modes i guardrails

### 4.1 Failure mode katalog

| Failure | Verovatnoća | Skill response |
|---|---|---|
| `pnpm install` pada (network) | Low | Pokušaj 3x sa back-off, ako ne — fall back na `npm install`, ako ne — bail out sa jasnim error report-om |
| `pnpm typecheck` pada (TS errors u kodu) | Medium | Ne padaj — to je *audit data*. Beleži broj grešaka u izveštaj. |
| `pnpm test` failuje (test errors) | Medium | Isto — beleži pass/fail count u izveštaj, ne treba kao skill failure |
| `pnpm lint` failuje | Medium | Isto. |
| `npm audit` vraća vulnerabilities | High | To je *signal*, ne failure. Beleži high/critical count. |
| Semgrep nije instaliran | High (jeste, na sandbox-u) | Skip + jasna napomena u report-u |
| Git nije u repo-u | Very low | Bail out, skill ne radi van repo-a |
| Workspace folder izmenjen | Low | Detect via `git status --porcelain`, warn ako su nesnimljene izmene |
| OOM tokom builda | Low | Increase Node heap u config-u, ili skip build (samo statičke provere) |
| Tačno trenutno stanje sandbox-a: nema pnpm | Confirmed | Treat as Day 1 — corepack enable, install ide na 2 minuta |

### 4.2 Guardrails koje skill mora imati

1. **Zero side effects po default-u** — skill ne sme da commit-uje, ne sme da pushuje, ne sme da menja postojeće fajlove (samo dodaje novi V2 report).
2. **Idempotent** — pokretanje 2x daje isti rezultat (osim brojeva koji se prirodno menjaju kao commit count).
3. **Eksplicitno dry-run mode** — opcija `--no-install` koja preskače pnpm install (za brza re-runa).
4. **Exit code semantics:**
   - `0` — skill uspešno završio, *bez obzira* na audit nalaze
   - `1` — skill sam padaje (npr. ne može da install-uje)
   - `2` — skill se završio ali sa upozorenjima (npr. semgrep skipped)
5. **Vremenski timeout** — svaka pojedinačna komanda max 5 minuta, ceo skill run max 20 minuta.
6. **Logging** — svaka komanda ima jasan `── Step N: <name> ──` header u stdout-u, izvršni put se piše u `skills/audit-verify/last-run.log`.

---

## 5. Output format

### 5.1 Struktura `Audit-V2-Verification.md`

```markdown
# Audit V2 — Verification Report

**Datum:** YYYY-MM-DD HH:MM
**Skill version:** audit-verify v1.0.0
**Repo SHA:** <git rev-parse HEAD>
**Repo state:** clean | dirty (<n> changed files)

## Executive Summary
- Total claims verified: X / 27
- Confirmed: A
- Partially confirmed: B
- Refuted: C
- Could not test: D
- Net effect on V1 audit: <prose>

## V1 Claim Verification Table
| # | V1 claim | Method | Result | Status |
|---|---|---|---|---|
| 1 | "308k LOC" | wc -l | 308.094 | ✅ |
| 2 | "960 files" | find | 960 | ✅ |
| ... |

## Behavioral Test Results
- typecheck: ✅ 0 errors (verified)
- test: ⚠️ 298/304 pass, 6 failures in <file>
- lint: ✅ 0 errors, 15 warnings (eslint-disable)
- knip: ⚠️ 23 dead exports, 4 dead files
- npm audit: ❌ 2 HIGH severity (axios, ...)

## New Findings (not in V1)
- Finding A: ...
- Finding B: ...

## Recommended V1 Edits
- [ ] Update §X.Y: change "78 nodes" → "70 handlers"
- [ ] Add §Z: critical npm audit findings

## Skipped Dimensions (require manual)
- E2E test run (needs localhost)
- Load test (needs running service)
- Threat model (needs human analysis)
- Live API trace (needs deployed instance)

## Baselines Established (for downstream skills)
- Property panels: 1 monolithic file (7.413 LOC) — input for property-panel-extract
- Tables needing RLS: 10 (from TECH_DEBT.md) — input for rls-rollout
- @ts-ignore locations: <file-by-file list> — input for ts-ignore-cleanup
- knip baseline: <count>
- npm audit HIGH baseline: <count>
```

### 5.2 Integracija sa V1 auditom

**Pravilo:** V2 *nikad* ne modifikuje V1 fajl. Umesto toga:
1. V2 produkuje *patch instructions* — explicit list "u V1 §X.Y promeniti Z → W"
2. Korisnik manuelno aplikuje patch, ili u sledećem skill run-u (audit-patch skill) automatski
3. V1 fajl dobija na vrhu napomenu "Verified by V2 on YYYY-MM-DD — see Audit-V2-Verification.md"

### 5.3 Integracija sa `TECH_DEBT.md`

V2 može da predloži update baseline-a u TECH_DEBT.md (slično `quarterly-debt-scan.sh` logici). Ali konzervativno: skill samo *generiše blok* koji se može copy-paste, ne menja fajl automatski.

---

## 6. Šta skill *neće* raditi (out-of-scope)

Eksplicitno isključeno iz V1 skill-a:

1. **Threat model** — STRIDE / OWASP LLM Top 10 mapping. To je human-driven analiza.
2. **E2E run** — traži deployed service ili docker-compose up. Kompleksno za sandbox.
3. **Load test (k6)** — traži aktivnu instancu.
4. **Live API trace** — request flow tracing kroz middleware/auth-guard/Prisma traje dosta ručno.
5. **Cost analiza** — traži pristup ka AI provider billing API-jima.
6. **Performance profile (Lighthouse)** — traži running browser instance.

Sve gore navedeno je *kandidat za buduće skill-ove*, ali ne za V1 `audit-verify`-ja.

---

## 7. Šta će skill *dodatno* otkriti (bonus)

Pored verifikacije V1 tvrdnji, skill će proizvesti **novi data** koji V1 nije imao:

- **Knip baseline** — broj dead exports/files, ranije nepoznato
- **npm audit baseline** — broj HIGH/CRITICAL vulnerabilities
- **License audit** — koji deps su GPL/AGPL (compliance risk)
- **Bundle size baseline** — first/main chunk veličina (za perf tracking)
- **Outdated deps count** — koliko deps zaostaje za latest
- **Pristup `package.json` zip-a iz `dist/`** — verifikacija da build artifact je smislen

Ovo postaje *baseline* za `quarterly-debt-scan.sh` proširenje.

---

## 8. Skill triggers (preliminarno, biće finalizovano u SKILL.md)

**EN:** "verify audit", "audit verify", "validate audit findings", "check audit accuracy", "run audit verification", "v2 audit", "phase 2 audit"

**SR/HR/BS:** "verifikuj audit", "potvrdi audit", "provjeri audit", "v2 audit", "ponovo proveri audit", "audit verifikacija", "da li je audit tačan", "potvrdi nalaze"

**Anti-triggers (do_not_use_when):**
- User wants to *execute* audit recommendations → use `audit-rollout` (future skill)
- User wants to fix specific tech debt item → use targeted skill (rls-rollout, property-panel-extract)
- User wants new audit from scratch → use the original audit prompt, not this verifier

---

## 9. Resource budget (final)

| Resurs | Estimat |
|---|---|
| Wall time po skill run-u | 10-15 min (sa `--no-install`: 3-5 min) |
| Disk peak | ~2 GB (sa node_modules + .next/) |
| Network | ~50 MB (deps + knip + license-checker) |
| Memory peak | ~2 GB (Node build može pod opterećenje) |
| CPU | Moderate (vitest, tsc) — ~5 min od 15 |

---

## 10. Otvorena pitanja pre nego što krenemo u plan

1. **Da li skill treba da bude Cowork skill (instalabilan u Claude profile-u korisnika) ili project skill (živi u `skills/audit-verify/`)?**
   - Predlog: project skill. Audit je projekat-specifičan, ne treba ga deliti preko drugih projekata.

2. **Da li skill aktivno koristi `pnpm install` ili samo *probava* sa već postojećim `node_modules`?**
   - Predlog: pokušaj prvo bez install-a (brz path). Ako node_modules nedostaje ili je outdated (compare lock vs deps), onda install. Ima `--no-install` flag da forsira "use what's there".

3. **Da li skill može da koristi MCP tools (npr. as_list_agents) za extra context?**
   - Predlog: ne za V1. Skill je čisto statički — file-system + npm/node only. AgentStack MCP integracija je out-of-scope.

4. **Da li sklill izveštaj prebaci u `/Users/buda007/Desktop/agent-studio/` (workspace) ili u `skills/audit-verify/reports/`?**
   - Predlog: oba. Definitivni izveštaj u repo (`reports/`), workspace dobija samo simbolicni link / shortcut.

5. **Da li skill update-uje CHANGELOG.md?**
   - Predlog: ne automatski. Predlaže CHANGELOG entry u izveštaju, čovek copy-paste-uje.

---

## 11. Sledeći korak

Ako se slažeš sa ovom analizom, sledeći dokument je `skill-audit-verify-PLAN.md` — konkretan plan implementacije koji:
- Definiše tačnu strukturu `skills/audit-verify/` foldera
- Daje skeleton SKILL.md sa svim sekcijama
- Daje skeleton `verify.sh` skripte
- Razlaže izvršavanje na 10-12 zasebnih koraka sa exact bash komandama
- Definiše test plan za sam skill (kako verifikujemo da skill radi pre nego što ga koristimo na pravom problemu)

**Pre nego što napišem plan, želim potvrdu od tebe za sledeće 4 odluke:**

1. ✅ / ❌ — Project skill (u `skills/audit-verify/`), ne Cowork skill
2. ✅ / ❌ — Bash skripta + SKILL.md (kao `pipeline-debug`), ne čista LLM-vodjenost
3. ✅ / ❌ — V2 izveštaj se generiše *uvek* kao novi fajl, ne update-uje V1
4. ✅ / ❌ — MCP integracija je out-of-scope za V1

Odgovori — pa pišem plan.
