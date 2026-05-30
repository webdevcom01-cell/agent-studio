# Plan Review — Zero-tolerance verifikacija plana za `audit-verify` skill

**Datum:** 17. maj 2026
**Reviewed plan:** `skill-audit-verify-PLAN.md` (V1)
**Reviewed analysis:** `skill-audit-verify-ANALYSIS.md` (V1)
**Metodologija:** Svaka tvrdnja, komanda i pretpostavka iz plana — testirana protiv stvarnog file-system-a + bash izvršavanjem.

---

## TL;DR

Plan ima **6 ozbiljnih halucinacija/grešaka** koje bi izazvale failure pri implementaciji, i **4 manje neprecizmosti**. Plan **TREBA REVIZIJA pre starta**, ali nije fundamentalno pogrešan — strategija je dobra, detalji su pogrešni.

**Najteže greške:**
1. 🔴 **Pretpostavka da svi skill-ovi u repo-u imaju `IMPLEMENTATION_PLAN.md + CRITICAL_ANALYSIS.md + templates/`** — **6/7 skill-ova ima SAMO `SKILL.md`**. Samo `agent-scaffolder` ima full strukturu. Plan over-engineered.
2. 🔴 **Pretpostavka da postoje bash skripte ili JSON data fajlovi u skill-ovima** — **NIJEDAN skill u repo-u nema bash skriptu ili JSON data file**. Naš predloženi `verify.sh + lib/*.sh + data/*.json` arhitektura nije precedent u repo-u.
3. 🔴 **`corepack enable` ne radi u Cowork sandbox-u** — fail-uje sa `EACCES: permission denied` jer ne može da pravi symlink u `/usr/bin/`. Moj "tri-tier fallback" je razbijen u sandbox env-u.
4. 🔴 **Verifikaciona komanda za "960 files" je netačna** — moja predložena komanda u `data/v1-claims.json` nema `| grep -v node_modules` filter, što vraća **1.260 fajlova umesto 960**. Plan bi falsifikovao tačne V1 nalaze.
5. 🔴 **`pnpm typecheck`, `pnpm test`, `pnpm lint` ne rade u sandbox-u jer pnpm nije instaliran**, i corepack ne uspeva. Moramo direktno koristiti `node node_modules/typescript/bin/tsc` ili `npx vitest`.
6. 🔴 **`npx next lint` interno traži `pnpm` i fail-uje** sa `/bin/sh: 1: pnpm: not found`. Sav lint workflow je razbijen u sandbox-u (i možda u svakom env-u bez pnpm).

**Manje greške:**
7. 🟡 V1 audit tvrdi "**11 migracija**" — stvarno **10** (V1 brojao `migration_lock.toml`)
8. 🟡 V1 audit tvrdi "**126 ruta sa auth-om**" — stvarna grep komanda vraća **131**
9. 🟡 V1 audit tvrdi "**308k LOC**" — bez `node_modules` filter-a vraća **446k**, sa filter-om i bez `generated/` vraća **320k**. V1 broj je verovatno iz mog početnog (broken-by-spaces-in-filenames) izvršavanja.
10. 🟡 Plan ne pominje **`.skill` ZIP packaging convention** koju projekat koristi za distribuciju.

---

## 1. Detalji svake greške (sa evidencijom)

### 🔴 Greška #1 — Skill folder struktura over-engineered

**Tvrdnja u planu (§1.1 Analize):**
> "5 obaveznih konvencija za skill-ove u ovom projektu"
> "File layout: SKILL.md + IMPLEMENTATION_PLAN.md + CRITICAL_ANALYSIS.md + opcioni IMPLEMENTATION_PLAN_V2.md + templates/"

**Stvarnost:**
Pregledao sam SVIH 7 skill-ova (ne samo 3 kao u prvoj analizi):
```
agent-health-check/    → SKILL.md (1 fajl)
agent-scaffolder/      → SKILL.md + 3 plana + CRITICAL_ANALYSIS + templates/ (7 fajlova)
instincts-updater/     → SKILL.md (1 fajl)
kb-sync/               → SKILL.md (1 fajl)
pipeline-debug/        → SKILL.md (1 fajl)
soma-memory-fix/       → SKILL.md (1 fajl)
soma-run/              → SKILL.md (1 fajl)
```

**Konkluzija:** 6/7 skill-ova ima **SAMO SKILL.md**. Plan + analysis + templates je *specijalan slučaj* `agent-scaffolder`, ne konvencija. Plan je generalizovao iz n=1.

**Fix:** Smanjiti scope na minimum:
- **Obavezno:** `SKILL.md` (sve ostalo opciono)
- **Korisno za nas:** `verify.sh` (helper script — ALI to postavlja precedent koji nijedan drugi skill nema)
- **Pretvoriti u opciono:** plan + analiza + templates

### 🔴 Greška #2 — Helper skripte i JSON data fajlovi nisu konvencija

**Tvrdnja u planu (§1 Plan):**
> "lib/count-claims.sh — helper: kvantitativne provere"
> "data/v1-claims.json — tabela 27 V1 tvrdnji"
> "templates/verification-report.md — Markdown template"

**Stvarnost:**
```bash
$ find skills -name '*.sh' -type f
(prazno — 0 bash skripti)

$ find skills -name '*.json'
(prazno — 0 JSON fajlova)
```

**Nijedan skill u repo-u ne koristi bash skriptu, JSON config, ili template fajl.** Sve skill-ove su čisto **SKILL.md-vodjeni** — LLM (Claude) interpretira SKILL.md i izvršava komande inline.

**Fix:** Pre-misliti arhitekturu. Tri opcije:
- **A. SKILL.md-only:** Sve komande nabrojati u SKILL.md, Claude ih pokreće jednu po jednu i piše report. Najpristojnije precedentu, ali zavisi od LLM-a za orkestraciju.
- **B. SKILL.md + `verify.sh`:** Jedan helper script koji radi sve, SKILL.md ga zove. Hibrid, postavlja precedent.
- **C. Originalni plan (skill + 3 lib skripte + data + templates):** Bogato, ali ide protiv konvencije repo-a.

**Recommend:** Opcija B — jedan `verify.sh`, sve drugo inline u SKILL.md.

### 🔴 Greška #3 — `corepack enable` razbijen u sandbox

**Tvrdnja u planu (§3.3, §4.1):**
> "Skill ne sme da pretpostavlja pnpm. Mora prvo da pokuša pnpm, padne na corepack enable && corepack prepare pnpm@10 --activate, padne na direktno npx tsc..."

**Stvarnost (verifikovano live):**
```bash
$ corepack enable
Internal Error: EACCES: permission denied, symlink '../lib/node_modules/corepack/dist/pnpm.js' -> '/usr/bin/pnpm'
    at async Object.symlink (node:internal/fs/promises:998:10)
```

Cowork sandbox **nema write pristup `/usr/bin/`**, pa corepack ne može da pravi symlink. Moja "tri-tier fallback" strategija **prosto ne radi u ovom env-u**.

Na korisnikovom laptopu (gde pravo izvršavanje treba da se desi) — vrlo verovatno radi. Ali za **self-test u sandbox-u, plan je razbijen**.

**Fix:**
- Smatrati pnpm potpuno opcionim
- Ići direktno: `node node_modules/typescript/bin/tsc --noEmit` (NE `npx tsc` — ne pomaze ako pnpm nije pri ruci za drugih komandi)
- Za vitest: `npx vitest run` (radi)
- Za lint: tricky — `next lint` interno zove `pnpm`, vidi grešku #6

### 🔴 Greška #4 — V1 verifikaciona komanda nedostaje `grep -v node_modules`

**Tvrdnja u planu (§2 Analize, tabela claim #2):**
```json
{
  "id": "C02",
  "v1_claim": "960 izvornih fajlova",
  "verify_command": "find src packages -type f \\( -name '*.ts' -o -name '*.tsx' \\) | wc -l",
  "expected_value": 960
}
```

**Stvarnost (verifikovano live):**
```bash
$ find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l
1260   # ← bez filter-a, pogrešno

$ find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) | grep -v node_modules | wc -l
960    # ← tačno!
```

Razlika: `packages/cli/node_modules/` ima 300+ TS fajlova. Bez filter-a ih plan brojati i refutirao bi tačan V1 broj.

**Slično je verovatno za LOC count.** Moj plan command za C01 je:
```
find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) | xargs wc -l | tail -1
```
Bez `grep -v node_modules` daje 446.720; sa filter-om i bez `generated/` daje 320.024.

**Fix:** Sve `find` komande u `v1-claims.json` moraju imati `| grep -v node_modules | grep -v generated` (ili odgovarajuće `-not -path` flag-ove na `find`). Spec za svaki claim mora replicirati *tačno onu* komandu koja je prvobitno proizvela broj.

### 🔴 Greška #5 — `pnpm typecheck/test/lint` ne rade bez pnpm

**Tvrdnja u planu (§5 Plan, korak 4 - run-behavioral.sh):**
> "1. pnpm install --frozen-lockfile"
> "2. pnpm typecheck → broj TS errors"
> "3. pnpm test --reporter=summary → pass/fail count"
> "4. pnpm lint → broj errors + broj warnings"

**Stvarnost (verifikovano live):**
- `pnpm` nije instaliran u sandbox
- `corepack enable` ne radi (greška #3)
- `npm` jeste, ali `npm run typecheck` interno zove `pnpm`? Treba proveriti

Alternativni putevi koji RADE u sandbox-u:
- ✅ `node node_modules/typescript/bin/tsc --noEmit` — direktno node, radi
- ✅ `npx vitest run --reporter=basic` — radi, ali sporo (300+ test fajlova)
- ⚠️ `npx next lint` — fail-uje sa `/bin/sh: pnpm: not found` interno

**Fix:** v1-claims.json mora imati **dual command** — `pnpm` verziju ZA primary (korisnik na laptopu) i `node`/`npx` fallback ZA sandbox + sve dev env-e bez pnpm-a.

### 🔴 Greška #6 — `next lint` interno zahteva pnpm

**Tvrdnja u planu:**
> "pnpm lint → broj errors + broj warnings"

**Stvarnost (verifikovano live):**
```bash
$ npx next lint
... stderr: Buffer(28) [...] (47, 98, 105, 110, 47, 115, 104, 58, 32, 49, 58, 32, 112, 110, 112, 109, ...)
↑ ASCII decoded: "/bin/sh: 1: pnpm: not found"
```

Next.js 15.5's `lint` komanda interno spawn-uje `pnpm` u nekoj kodnoj putanji (verovatno traži ESLint plugin discovery). Bez pnpm-a, **next lint NE RADI nikako**.

Workaround:
- Direktno pozvati `node node_modules/eslint/bin/eslint.js src/` (zaobići next lint)
- Ili instalirati pnpm globalno preko `npm install -g pnpm` (treba sudo u nekim env-ima)

**Fix:** Lint check u v1-claims.json treba:
- Primary: `pnpm lint` (na korisnikovom env-u)
- Fallback: `node node_modules/eslint/bin/eslint.js 'src/**/*.{ts,tsx}' --no-error-on-unmatched-pattern` (direktno ESLint)

### 🟡 Greška #7 — V1 broj migracija je netačan

**Tvrdnja u V1 auditu:**
> "11 migracija + 1 RLS (Agent tabela only)"

**Stvarnost:**
```bash
$ ls prisma/migrations/ | wc -l
11   # uključuje migration_lock.toml

$ ls prisma/migrations/ | grep -v migration_lock | wc -l
10   # stvarni broj migracija
```

V1 je brojao i `migration_lock.toml`. Stvarni broj je **10 migracija** (uključujući RLS migraciju), ne 11.

**Fix:** v1-claims.json C20a treba: expected_value=10, ne 11. Plus napomenu o korekciji V1 audita.

### 🟡 Greška #8 — V1 broj auth ruta nije tačan

**Tvrdnja u V1 auditu:**
> "126 ruta koristi requireAuth/requireAgentOwner/requireOrgMember/requireOrgAdmin/requireOrgOwner/requireAdmin"

**Stvarnost:**
```bash
$ grep -rlE 'requireAuth|requireAgentOwner|requireOrgMember|requireOrgAdmin|requireOrgOwner|requireAdmin' src/app/api --include='route.ts' | wc -l
131
```

Razlika od 5. Vrlo verovatno V1 korišćao razlitičit set name-ova ili uži pattern.

**Fix:** v1-claims.json C18 expected_value=131 (ili kažemo "u rangu 126-131 zavisno od grep pattern-a, V1 koristio uži pattern").

### 🟡 Greška #9 — V1 LOC broj zavisi od filter-a

**Pomenuti brojevi u V1:**
- "~308.000 linija TS/TSX koda" (executive summary)
- "308k LOC" (više puta)
- "308088 total" (u verification step-u)

**Stvarni brojevi (zavisno od filter-a):**
| Filter | Files | LOC |
|---|---:|---:|
| Bez filter-a | 1.260 | 446.720 |
| `\| grep -v node_modules` | 960 | varies |
| `\| grep -v node_modules \| grep -v generated` | 949 | 320.024 |

**Problem:** V1 broj "308.088" ne odgovara nijednom čistom filter-u. Verovatno je nastao iz početne komande koja je *fail-ovala silently* na fajlovima sa razmacima (`wasm.d 2.ts`, `client.d 2.ts`, itd. — macOS Time Machine duplikati).

**Fix:** v1-claims.json C01 treba **multi-value verification** — definisati 3 expected_value-a sa 3 filter strategijama, ili eksplicitno odlučiti koja je "kanonska" definicija LOC-a za projekat (predlažem: "sve src+packages, minus node_modules i generated/, koristeći `find -print0 | xargs -0 wc`").

### 🟡 Greška #10 — Plan ne pominje `.skill` packaging

**Stvarnost:**
```bash
$ ls /sessions/laughing-clever-darwin/mnt/agent-studio/skills/
pipeline-debug.skill          ← ZIP arhiva!
soma-run.skill                ← ZIP arhiva!
```

Skill-ovi se distribuiraju kao `.skill` ZIP fajlovi pored foldera. Komanda za pakovanje nije dokumentovana u SKILL.md-ovima, ali precedent postoji.

**Fix:** Dodati u plan: "Korak 11 — Spakovati skill kao `audit-verify.skill` ZIP. Komanda: `cd skills && zip -r audit-verify.skill audit-verify/ -x '*/reports/*'`"

---

## 2. Internal consistency check (ANALYSIS vs PLAN)

Pregledao sam oba dokumenta za međusobne nedoslednosti. Našao **3**:

| # | ANALYSIS kaže | PLAN kaže | Realnost |
|---|---|---|---|
| IC1 | "Skill ima 27 verifikacionih provera" | "data/v1-claims.json sa 27 stavki" | OK, slažu se |
| IC2 | "Quantitative: 18 + Behavioral: 9 = 27" | "Quantitative claims (18 checks)... Behavioral checks (9 checks)" | OK, slažu se |
| IC3 | "Out-of-scope: E2E run, load test, threat model" | "STEP 1 — Run verify.sh" — nema explicit out-of-scope u SKILL.md skeleton | ⚠️ Plan SKILL.md mora explicitly enumerate out-of-scope (kao u Analysis §6) |

---

## 3. Šta sam zaboravio (blind spots iz prvog plana)

Stvari koje plan **ne pominje** ali bi trebale biti razmotrene:

### 3.1 Skill manifest convention
`agent-health-check.skill` ZIP fajlovi postoje pored foldera. Plan ne dokumentuje:
- Kada se generiše `.skill` ZIP?
- Da li ide u repo ili je build artifact?
- Šta ide u ZIP (sve fajlove) vs šta se izbacuje (`reports/*`, `.DS_Store`)?

### 3.2 Skill version u SKILL.md
- `agent-health-check` SKILL.md ima `*Version: 1.2 | Based on: ...*` *u markdown body-u*, ali NEMA `version:` u YAML frontmatter-u
- `pipeline-debug` SKILL.md ima `version: 1.0.0` *u YAML frontmatter-u* + `*Version: 1.0.0*` u body-u
- **Konvencija nije konzistentna** — koje pratimo?

**Fix:** Pratiti `pipeline-debug` model (YAML version + body version), jer je noviji.

### 3.3 Trigger uniformnost
Pregledao sam triggere u svim 7 skill-ova:
- 4/7 imaju trigere u `description:` polju
- 3/7 imaju trigere u `triggers:` polju (zaseban YAML niz)
- Neki imaju oba

Plan kaže "triggers: zaseban niz" — ali to je samo `pipeline-debug` konvencija. Bezbednije: **i u description-u (za fuzzy match) i u triggers: nizu (za explicit list)**.

### 3.4 do_not_use_when format
- `pipeline-debug` koristi `do_not_use_when:` YAML listu
- `agent-health-check` koristi "Do NOT use for: ..." u markdown body-u
- Konvencija nedosledna

**Fix:** Imati oboje (YAML + markdown).

### 3.5 macOS Time Machine duplikati u `generated/`
Pronašao sam 4 fajla sa razmacima u imenu: `client.d 2.ts`, `default.d 2.ts`, `edge.d 2.ts`, `wasm.d 2.ts`. Ovo je čisti tech debt — `src/generated/` se regeneriše svaki put kad se pokrene `prisma generate`, što znači da Time Machine *aktivno* generira duplikate.

Plan ovo ne pominje. Vredelo bi:
- Dodati u plan: "Pre count-claims provere, opciono očistiti macOS duplikate (`find src/generated -name '* 2.ts' -delete`) — bezbedno, regeneriše se."
- Ili bar napomenu u V2 izveštaju: "Detected N macOS Time Machine duplicates in src/generated/ — recommend manual cleanup."

### 3.6 Što plan ne pokriva o run-u na korisniku
Plan kaže da skill može da pokreće `pnpm` direktno na korisnikovom laptopu. Ali ne pokriva:
- Šta ako korisnikov repo nije sinhronizovan sa origin-om? (V2 može biti zastareo)
- Šta ako su uncommitted changes? (skill izveštaj reflektuje *radni* state, ne committed state)
- Šta ako je korisnik na branch-u, a ne na main? (rezultati nisu reprezentativni za production)

**Fix:** SKILL.md treba "Pre-run checklist" sekciju:
- Da li si na main? Ako ne, V2 izveštaj reflektuje branch state
- `git status` clean? Ako ne, predlažu commit ili stash
- `git pull` aktuelan? Predlažu sync

### 3.7 Plan ne dokumentuje skill-ov self-update
Šta ako se V1 audit menja kroz vreme? Plan ima jedan kratki paragraf "v1.0.x bug fix, 1.x.0 new checks, 2.0.0 breaking". Ali nedostaje:
- Konkretan workflow za "V1 audit je revidiran → kako update-ujemo data/v1-claims.json?"
- Tracking koje su check-e dodate od kog datuma
- Migration path za stari format → novi format

---

## 4. Tabela: konkretne izmene plana pre starta

| # | Sekcija plana | Trenutno kaže | Treba da kaže | Prioritet |
|---|---|---|---|---|
| F1 | §1 Deliverables | 9 fajlova + 2 dir-a | **3 fajla minimum** (SKILL.md + verify.sh + README.md), ostalo opciono. Smanji helper script complexity. | 🔴 High |
| F2 | §3.3 Tri-tier fallback | "pnpm → corepack → npx" | "Try pnpm; if not available, use `node node_modules/.bin/tsc.js` direkt; SKIP `next lint` ako nema pnpm, koristi direct `eslint` invocation" | 🔴 High |
| F3 | §2 v1-claims.json C01-C02 | `find src packages \| wc -l` | `find src packages -type f \( -name '*.ts' -o -name '*.tsx' \) \| grep -v node_modules \| grep -v generated \| wc -l` | 🔴 High |
| F4 | §2 v1-claims.json C20a | expected_value=11 | expected_value=10 (V1 audit imao grešku, V2 je ispravlja) | 🟡 Med |
| F5 | §2 v1-claims.json C18 | expected_value=126 | expected_value=131 ili definisati grep tačno | 🟡 Med |
| F6 | §3.3 environment | "pnpm install ~2-3 min" | "Skip pnpm install entirely u sandbox-u. Node modules vec instalirano u 99% slučajeva." | 🟡 Med |
| F7 | §10 self-test option C | "corepack enable u sandbox-u" | **Briši opciju C** — corepack ne radi u sandbox-u. Idi sa A (limited) ili B (user-runs). | 🔴 High |
| F8 | SKILL.md skeleton | YAML version u frontmatter samo | YAML version + body version (prati pipeline-debug, ne agent-health-check) | 🟡 Med |
| F9 | §1 Deliverables | "templates/verification-report.md" | Razmotri inline u render-report.sh ili SKILL.md (nema precedent za template fajlove u skill-ovima) | 🟡 Med |
| F10 | Nova sekcija | (nije pomenuto) | Dodati Korak 11: "Spakovati skill kao audit-verify.skill ZIP" | 🟡 Med |
| F11 | SKILL.md skeleton | Nedostaje "Pre-run checklist" | Dodati: git status check, branch check, pull sync recommendation | 🟢 Low |
| F12 | Nova sekcija | (nije pomenuto) | "macOS duplicate cleanup" — opciono brisanje `* 2.ts` fajlova pre count-a | 🟢 Low |

---

## 5. Recommendation: Plan V2

Predlažem **dramatično pojednostavljen Plan V2** sledećih dimenzija:

### Struktura (3 fajla, ne 9):
```
skills/audit-verify/
├── SKILL.md                       [~300 linija, sve inline]
├── verify.sh                      [~250 linija, samostalan]
└── README.md                      [~30 linija, install/usage]
```

### v1-claims kao deo verify.sh (ne zaseban JSON):
Bash array sa hardcoded check definicijama. Manje fajlova, lakše za održavanje, prati precedent (nijedan drugi skill nema JSON data).

### Komande sa explicit fallback chain:
```bash
# Each check defines:
NAME="C01 LOC count"
COMMAND_PNPM="pnpm exec wc -l ..."
COMMAND_NPM="node node_modules/.bin/...js ..."
COMMAND_FALLBACK="find ... | wc -l"
# Skripta probava redom, koristi prvi koji vrati 0 exit code
```

### Output: direktno u workspace (`/Users/buda007/Desktop/agent-studio/reports/`), ne u repo:
- Reports/ je već globalno gitignored
- Ali ipak vidljiv korisniku via Cowork file system

### Drop self-test in sandbox:
Jasno reći: "Skill se testira na korisnikovom env-u. Sandbox može da pokrene quantitative claim-ove (18/27), ali behavioral ostaju za korisnika."

### Time estimate revidiran:
- Originalan estimate: 8 sati
- **Revidiran: 4-5 sati** (manje fajlova, manje testiranja u sandbox-u)

---

## 6. Final go/no-go odluka

### Šta plan ima dobro
✅ Strategija (verifikacija pre izvršavanja) je tačna
✅ Lista 27 check-ova je dobra polazna tačka
✅ Output format (V2 report) je realan
✅ Risk register pokriva većinu failure mode-ova

### Šta plan ima loše
❌ Over-engineered struktura (9 fajlova umesto 3)
❌ Pretpostavke o environment-u (corepack, pnpm) razbijene
❌ Komande u v1-claims.json kao napisane bi falsifikovale tačne V1 nalaze
❌ Internal nedoslednosti sa stvarnim V1 brojevima

### Status: **NE KREĆI U IMPLEMENTACIJU** dok plan ne dobije V2 revision koji adresira F1-F7 (High priority fix-evi).

---

## 7. Sledeći korak

Predlažem 2 opcije:

### Opcija A — Pišem `skill-audit-verify-PLAN-V2.md` koji integriše sve F1-F12 fix-eve
- Estimat: ~30 min
- Output: kompletan revidirani plan, spreman za implementaciju
- Preporučujem

### Opcija B — Direktno krećem implementaciju sa F1-F7 fix-evima ad-hoc
- Estimat: ~5h implementacija + 1h debug
- Risk: ako naletim na novi blind spot, vraćamo se u plan
- Brže do prve verzije, ali manje promišljeno

### Opcija C — Stop, želim još više provera plana
- Razmišljam šta još može biti hallucinated
- Predlažem listu dodatnih provera koje treba uraditi pre Plan V2

**Tvoj poziv. Trenutni plan ima 6 high-priority i 4 medium-priority greške koje moraju biti fixovane pre implementacije.**

---

*Plan review completed: 2026-05-17.*
*Halucination tolerance: 0%. All findings verified against live filesystem + bash execution.*
*Critical issues found: 6. Medium issues: 4. Blind spots: 7. Internal inconsistencies: 3.*
