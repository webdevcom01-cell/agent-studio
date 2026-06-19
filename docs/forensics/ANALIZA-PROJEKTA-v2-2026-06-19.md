# Agent Studio — Kompletna re-verifikovana analiza v2

> Datum: **2026-06-19**. Prethodna analiza: 2026-06-14 (`ANALIZA-PROJEKTA-Agent-Studio.md`).
> Cilj: ponoviti celu hijerarhijsku dekompoziciju od nule, izmeriti sve sveže iz koda, i potvrditi
> da ništa nije propušteno. Svaka brojka je izmerena komandom; ništa nije pretpostavljeno.
> Za iscrpne liste fajlova po segmentu vidi v1 — ovde je naglasak na **trenutnom stanju + promenama + potvrdi 100% pokrivenosti**.

---

## 0. Šta se promenilo od 14. juna (verifikovano)

**Repo se značajno pomerio: 59 commit-a za 5 dana.** Glavni tokovi:

### 0.1 🟢 RLS rollout — gotovo dovršen (najveća promena)
Ono što smo 14. juna tek započeli (pilot na jednoj ruti) je sada produkciono dovršeno:
- **Pokrivenost ruta: 16 → 54** koje koriste `withOrgContext` (+ `withTenant` 1, + `withAdminBypass` 23 = **78 od 165 ruta** sa eksplicitnim tenant-rukovanjem; ostale ne diraju RLS tabele).
- Naš `prismaAdmin` / bootstrap rad je **commit-ovan** (u HEAD-u) i nadograđen.
- Novi commit-i: `rls/complete-coverage` (batches A/B/C/D), `rls/harden-create-paths` (agent create postavlja org), `rls/auto-provision-personal-org`, `feat(api): bind API keys to an organization`, `fix(api): resolve org context for API-key callers`, `chore(db): enforce org NOT NULL + reconcile org indexes`.
- **Novi CI guard:** `scripts/check-rls-coverage.sh` (pokreće se u lint job-u) — pada build ako fajl dira neku od 20 RLS tabela bez `withOrgContext`/`withTenant`/`withAdminBypass`; hvata i `$transaction`+tenant-model obrazac (bug koji je prošao kod agent-import-a). Ima allowlist.
- **Novi modul:** `src/lib/org/ensure-personal-org.ts` (+ testovi) — auto-provizija lične organizacije.

### 0.2 🟢 Runtime feature-i (N1–N10)
Serija optimizacija izvršnog motora:
- `src/lib/runtime/context-compaction.ts` (N1 — mid-run kompakcija konteksta, safety net).
- `src/lib/runtime/system-prompt.ts` (N7 — stabilan prefiks system prompta za KV-caching).
- `src/lib/runtime/tier-override.ts` (N4 — per-node opt-out za cost-monitor downgrade).
- N5/N2 — konfigurabilan summary model + history window.
- `src/lib/sdk-sessions/session-compaction.ts` (N9 — rolling kompakcija SDK sesija).
- `src/lib/managed-tasks/step-trimmer.ts` (N10 — ograničavanje konteksta po koraku u dugim tool-run-ovima).
- `fix(runtime): loadContext loads 50 most recent messages, not oldest`.

### 0.3 🟢 Higijena (delom rešeno od preporuka v1)
- Duplikat **`call-agent-handler 2.ts` je obrisan** (handleri 72 → 71).
- **Karantin** (`_cleanup-quarantine-2026-06-14/`) premešten na root i **isključen iz typecheck-a** → typecheck sad čist.
- `SOMA-CONTEXT` doc drift ispravljen.

### 0.4 🟡 Novi planski dokumenti (15. jun, nivo SOMA/TI agenata)
`D5-implementation-plan` (TI source-URL integrity — implementirano), `OQ4-dual-mode` (TI adaptive web search — implementirano), `HANDOFF-2026-06-15` (session handoff), `tool-access-design-spec` (DRAFT). Ovo je rad na konfiguraciji živih SOMA agenata (preko MCP), ne izmene core platforme.

### 0.5 Brojke: sada vs 14. jun

| Metrika | 14. jun | 19. jun | Δ |
|---|---|---|---|
| src `.ts/.tsx` fajlova | 982 | **996** | +14 |
| src LOC | ~318.160 | **320.047** | +~1.900 |
| Prisma modela | 63 | **63** | = |
| schema linija | 1.808 | **1.828** | +20 (org NOT NULL + indeksi) |
| node handlera | 72 | **71** | −1 (duplikat obrisan) |
| runtime `.ts` | 193 | **197** | +4 |
| lib poddir. | 53 | **54** | +1 (`org/`) |
| API `route.ts` | 165 | **165** | = |
| RLS-ožičenih ruta | 16 | **54** | +38 |
| test fajlova | 316 | **322** | +6 |
| skripti (top) | 49 | **51** | +2 |

---

## 1. Hijerarhija — 12 glavnih segmenata (potvrđeno, ažurirano)

Struktura iz v1 i dalje važi. Sažeto, sa ažuriranim brojevima i izmenama:

### SEGMENT 1 — Web/UI (`src/app`, `src/components`)
22 frontend rute (+`api/`); komponente **124 .tsx** (builder, chat, dashboard, evals, mcp, templates, a2a, webhooks, layout, ui). Bez strukturnih promena.

### SEGMENT 2 — API sloj (`src/app/api`) — 35 grupa, 165 `route.ts`
**Izmena:** 54 ruta sad ide kroz `withOrgContext`/`withTenant`, 23 kroz `withAdminBypass`. Nova logika: API ključevi vezani za org; `requireAuth` rešava org za API-key pozivaoce.

### SEGMENT 3 — Runtime Engine (`src/lib/runtime`) — **197 .ts**
**Izmena:** +4 fajla (N1–N10): `context-compaction.ts`, `system-prompt.ts`, `tier-override.ts` + dopune `engine`/`context`. Jezgro (`engine.ts`, `engine-streaming.ts`, `execution-prelude.ts`) i dalje nosi izvršavanje.

### SEGMENT 4 — Node biblioteka (`handlers/`) — **71 handlera**
**Izmena:** duplikat obrisan. Iste kategorije (AI/LLM, control flow, orkestracija, IO, knowledge, kod/SDLC, MCP, kvalitet, okidači).

### SEGMENT 5 — Knowledge/RAG (`src/lib/knowledge`) — 44 .ts
Bez strukturnih promena (ingest, embeddings, retrieval, grounding, ragas).

### SEGMENT 6 — Data/Prisma — **63 modela, 1.828 linija, 34 migracije**
**Izmena:** `org NOT NULL` enforce + reconcile org indeksa; `SomaReviewPost.qualityFlags` na fresh replay; backfill Agent/Template org indeksa. 19 tabela pod `FORCE` RLS (potvrđeno ranije).

### SEGMENT 7 — Orkestracija (A2A, agent-as-tool, SOMA, ECC, memorija, heartbeat)
**Izmena:** `src/lib/managed-tasks/step-trimmer.ts` (N10), `src/lib/sdk-sessions/session-compaction.ts` (N9), `src/lib/org/ensure-personal-org.ts` (nov). SOMA/TI konfiguracija aktivno menjana (D5, OQ4).

### SEGMENT 8 — Evals (`src/lib/evals`) — 26 .ts
**Izmena:** eval rute sad RLS-omotane (batch A). Struktura ista.

### SEGMENT 9 — SDLC/DevSecOps (`src/lib/sdlc`) — 43 .ts
Bez strukturnih promena.

### SEGMENT 10 — MCP & servisi
- `mcp-server/` (48 fajlova), `src/lib/mcp` (21), `packages/cli` (15).
- **`services/`** (174 fajla): `notebooklm-mcp` (161, Node), `ecc-skills-mcp`/`gh-bridge-mcp`/`security-scanner-mcp` (po 4, Python), `worker` (1).

### SEGMENT 11 — Governance/Security/Safety/Cost
**Izmena:** RLS coverage guard u CI; API-key↔org vezivanje; `prismaAdmin` BYPASSRLS klijent (naš rad, commit-ovan). Ostalo (security, safety, gdpr, budget, cost) bez strukturnih promena.

### SEGMENT 12 — Infra, alati, dokumentacija
**Izmena:** `scripts/check-rls-coverage.sh` (nov), karantin isključen iz typecheck-a, +2 skripte, novi planski docs. k8s/CI/Docker/website bez strukturnih promena.

---

## 2. Potvrda 100% pokrivenosti — checklist svakog top-level direktorijuma

Svaki direktorijum u repo-u (osim `node_modules`/`.git`/`.next`) je proveren i svrstan:

| Direktorijum | Fajlova | Segment / uloga | Status |
|---|---|---|---|
| `src/` | 996 ts/tsx | S1–S11 (jezgro) | ✅ pokriveno |
| `services/` | 174 | S10 (4 MCP mikroservisa + worker) | ✅ |
| `website/` | 77 | S12 (Docusaurus docs sajt) | ✅ |
| `skills/` | 63 | S12 (10 agent skills) | ✅ |
| `mcp-server/` | 48 | S10 (MCP server) | ✅ |
| `prisma/` | 40 | S6 (šema, 34 migracije, seed) | ✅ |
| `docs/` | 82 | S12 (interna dok.) | ✅ |
| `reports/` | 31 | S12 (fazni izveštaji) | ✅ |
| `deal-flow-agent/` | 25 | **Zaseban Python proizvod** (vidi 3) | ✅ |
| `sdlc-prompts/` | 26 | S9 (promptovi) | ✅ |
| `e2e/` | 24 | S12 (Playwright) | ✅ |
| `packages/` | 15 | S10 (CLI npm paket) | ✅ |
| `k8s/` | 12 | S12 (Kubernetes) | ✅ |
| `data/` | 28 | S11/ops (security-audits, flow backupi) | ✅ |
| `n8n-workflows/` | 4 | S10 (eksterna automatizacija) | ✅ |
| `prompts/` | 3 | S7 (SOMA agent promptovi) | ✅ |
| `memory/` | 2 | S7 (perzistentni kontekst) | ✅ |
| `agent-architect/`, `soma-agent-debugger/` | skills | S12 (korenski skill paketi) | ✅ |
| `benchmarks/`, `k6/`, `load-tests/`, `test-results/`, `playwright-report/` | perf/test artefakti | S12 | ✅ |
| `backups/`, `patches/`, `public/`, `soma-vault/` | ops/asseti/vault | S12/S7 | ✅ |
| `_cleanup-quarantine-2026-06-14/` | karantin | otpad (isključen iz typecheck-a) | ⚠️ za brisanje |

**Zaključak: nijedan direktorijum nije nepokriven.**

---

## 3. Stvari koje su i u v2 potvrđene kao „lako previdljive" (ostaju tačne)
- **`deal-flow-agent/`** — i dalje zaseban Python/FastAPI multi-agent proizvod (25 fajlova, 5 domenskih agenata: screening/financial/legal/competitive/risk + Crunchbase/LinkedIn + memo generator). Deli repo sa glavnim TS proizvodom. **Preporuka iz v1 ostaje: izdvojiti u zaseban repo.**
- **`services/notebooklm-mcp`** (161 fajlova) — najveći mikroservis.
- **`data/security-audits/`** — živi scan-ovi + backup-i produkcionih flow-ova, i dalje se commit-uju.

---

## 4. Stanje rizika iz v1 — šta je rešeno, šta ostaje (iskreno)

| Rizik (v1) | Stanje 19. jun |
|---|---|
| 🔴 RLS samo na konekciji superuser / nedovršeno ožičavanje | 🟢 **Velikim delom rešeno** — 54 ruta ožičeno, CI guard, app_user/admin_user u E2E. (Ostaje potvrditi produkcioni cutover na `app_user` + uključenje flag-a.) |
| 🟠 Nevalidirani javni JSON-RPC ulazi (A2A/MCP) | 🟡 Treba ponovo proveriti (nije u ovom skeniranju potvrđeno da je zatvoreno) |
| 🟠 `as any` (206) | 🟡 Nije mereno ponovo u v2 |
| 🟠 Higijena korena / duplikati / tmp | 🟢 Delom: duplikat handlera obrisan, karantin izolovan. Koren i dalje pretrpan (mnogo .md). |
| ✅ Tajne u Git-u | 🟢 I dalje uredno ignorisane |
| ✅ Test disciplina | 🟢 +6 test fajlova, RLS coverage guard u CI |

**Preostalo za potpuni RLS završetak (iz Faza-0):** produkcioni `DATABASE_URL` i dalje treba prebaciti na `app_user` (non-bypass) i uključiti `rls-enforcement` flag staženo — to je jedini korak posle kog RLS stvarno izoluje u produkciji. CI/E2E već koriste app_user/admin_user, što je dobar znak da je cutover blizu.

---

## 5. Iskren zaključak v2

Za 5 dana je urađeno mnogo i — što je najvažnije — **u pravom smeru**: RLS rollout koji smo isplanirali je gotovo kompletno sproveden, sa CI guardom koji sprečava regresiju (to je znak zrelog procesa, ne ad-hoc krpljenja). Runtime je dobio ozbiljne optimizacije konteksta/troška. Higijenske preporuke iz v1 su delom ispoštovane (duplikat, karantin).

Ono što i dalje stoji kao iskren savet:
1. **Produkcioni RLS cutover** (`app_user` + flag) je poslednji i najvažniji korak — bez njega je sav RLS rad i dalje neaktivan u produkciji. Vredi ga prioritetno završiti i verifikovati upitom iz Faza-0.
2. **`deal-flow-agent` izdvojiti** u zaseban repo (i dalje preporuka).
3. **Koren očistiti** — i dalje mnogo `.md`/planskih dokumenata na vrhu; predlog kategorizacije iz v1 stoji.
4. **Ponovo izmeriti** zatvorenost javnih JSON-RPC ulaza (A2A/MCP) i `as any` dug — nisu re-mereni u ovom prolazu.

**Potvrda kompletnosti:** svi top-level direktorijumi su pregledani i svrstani (sekcija 2), svi core brojevi re-izmereni iz koda (sekcija 0.5), sve promene od 14. juna identifikovane iz 59 commit-a. Analiza je kompletna do nivoa modula; iscrpne liste fajlova po segmentu su u v1 i i dalje važe uz gornje izmene.

---

*Sve brojke izmerene iz repo-a 2026-06-19. Promene izvedene iz git istorije (59 commit-a od 2026-06-14). Tvrdnje o produkcionoj bazi nisu davane — za njih važi Faza-0 procedura.*
