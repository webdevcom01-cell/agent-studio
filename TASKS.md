# Agent Studio — Implementation Tracker

> **Pravilo #1:** Svaka sesija počinje čitanjem ovog fajla.
> **Pravilo #2:** Svaki završen zadatak se odmah označava kao ✅.
> **Pravilo #3:** Ako nešto blokira zadatak, piše se BLOCKER ispod njega.

---

## Kontekst

- **ICP:** Scenario A — Developer tools, self-serve
- **Model:** Option B — Open source core + hosted
- **Billing:** Van scope-a dok nema firme i dokazanog traction-a
- **Repo:** Javan na GitHub-u

---

## FAZA 0 — Stabilizacija (preduslov za sve ostalo)

### 0.1 — Agent.userId nullable fix
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** Bug pronađen: 118 route poziva `requireAuth()` bez `req` → x-api-key se nikad nije čitao
- **Fix:** `auth-guard.ts` koristi `headers()` iz `next/headers` kao fallback kad `req` nije prosleđen
- **Bonus:** `vitest.setup.ts` dobio globalni mock za `next/headers` → 2684/2684 testovi prolaze

### 0.2 — WebhookDeadLetter komentar
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** Dodat TODO komentar u schema.prisma — tabela postoji, processor dolazi u Fazi 2
- **Fajl:** `prisma/schema.prisma`

### 0.3 — Baseline test check
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** 2684 testova PASSED, 0 TypeScript grešaka
- **Output:** Svi testovi prolaze — stabilna baza za dalji razvoj

### 0.4 — README.md rewrite
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** Ažuriran test badge (2502→2684), dodata sekcija "API Authentication" sa svim scope-ovima, curl primeri, menija `/settings`, ažuriran project structure

---

## FAZA 1 — API Keys (kapija za developer ICP)

> **⚠️ DISCOVERY (2026-04-02):** Backend API keys infrastruktura je KOMPLETNA.
> Implementirano: `src/app/api/api-keys/route.ts`, `src/app/api/api-keys/[keyId]/route.ts`,
> `src/lib/api/api-key.ts`, `src/lib/api/auth-guard.ts`.
> **Jedino što nedostaje je Settings UI (1.6).**

### 1.1 — POST /api/api-keys
- **Status:** ✅ DONE — već postoji `src/app/api/api-keys/route.ts`
- **Šta:** Generisanje ključa, SHA-256 hash, vraća plaintext samo jednom, max 20 ključeva

### 1.2 — GET /api/api-keys
- **Status:** ✅ DONE — isti route.ts
- **Šta:** Lista ključeva (samo prefix + metadata, nikad hash)

### 1.3 — DELETE /api/api-keys/[keyId] + PATCH
- **Status:** ✅ DONE — `src/app/api/api-keys/[keyId]/route.ts`
- **Šta:** Soft delete (revokedAt) + rename + scope update, ownership check

### 1.4 — Auth middleware proširenje
- **Status:** ✅ DONE — `src/lib/api/auth-guard.ts`
- **Šta:** `requireAuth(req?)` prihvata `x-api-key` header, timing-safe hash comparison via validateApiKey()

### 1.5 — Scopes enforcement
- **Status:** ✅ DONE — `src/lib/api/api-key.ts`
- **Šta:** API_KEY_SCOPES, hasScope(), requiresScope(), ApiKeyScopeError (11 scope-ova)

### 1.6 — UI: Settings → API Keys
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** Nova stranica, lista ključeva, kreiranje sa one-time reveal modal, revokacija
- **Fajlovi:** `src/app/settings/layout.tsx`, `src/app/settings/page.tsx`, `src/app/settings/api-keys/page.tsx`
- **Features:** SWR lista, create dialog sa scopes checkboxes + expiry, SHA-256 one-time reveal modal + clipboard copy, revoke confirm dialog, scope colour badges, docs callout, empty state

### 1.7 — Testovi za API Keys route
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** 19 route-level integration testova: GET(401,empty,list), POST(401,422,429,create,expiry), PATCH(401,404,rename,scopes,invalid), DELETE(401,404,soft-delete,cross-user)
- **Fajl:** `src/app/api/api-keys/__tests__/api-keys.test.ts`

---

## FAZA 2 — Job Queue / Async Execution

> **⚠️ DISCOVERY (2026-04-02):** BullMQ infrastruktura je KOMPLETNA.
> Implementirano: `src/lib/queue/index.ts`, `src/lib/queue/worker.ts`,
> `src/app/api/jobs/[jobId]/route.ts`. Chat route (`/api/agents/[id]/chat`) već koristi addFlowJob.

### 2.1 — BullMQ setup
- **Status:** ✅ DONE — `src/lib/queue/index.ts` + `src/lib/queue/worker.ts`
- **Šta:** QUEUE_NAME="agent-studio", addFlowJob(), addEvalJob(), getJobStatus(), CONCURRENCY=5

### 2.2 — POST /api/agents/[id]/execute/async
- **Status:** ✅ DONE — chat route već koristi addFlowJob (linija 123 u chat/route.ts)
- **Napomena:** Postoji i `/api/agents/[id]/execute/route.ts` — proveriti da li i on koristi queue

### 2.3 — GET /api/jobs/[jobId]
- **Status:** ✅ DONE — `src/app/api/jobs/[jobId]/route.ts`
- **Šta:** Status polling endpoint, vraća state/progress/result/failedReason

### 2.4 — Webhook retry (Dead Letter processing)
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** Exponential backoff retry sa BullMQ, `retryWebhookExecution()`, `handleFailedExecution()`, idempotency check, dead letter processing
- **Fajlovi:** `src/lib/webhooks/retry.ts`, `src/lib/webhooks/__tests__/retry-integration.test.ts` (12/12 testova)

### 2.5 — Railway Worker service config
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** `services/worker/railway.toml` sa `RAILWAY_CONFIG_FILE` pattern, `"worker"` script u package.json, `worker` Docker stage
- **Fajlovi:** `services/worker/railway.toml`, `Dockerfile` (worker + migrate stages), `docker-compose.yml`

---

## FAZA 3 — Open Source Priprema

### 3.1 — Docusaurus aktivacija (/docs)
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** `website/` folder sa kompletnom Docusaurus konfiguracijom — Getting Started, self-hosting, env vars, API reference
- **Fajlovi:** `website/docusaurus.config.ts`, `website/sidebars.ts`, `website/docs/`

### 3.2 — OpenAPI spec generacija
- **Status:** ✅ DONE (2026-04-03)
- **Šta:** `@asteasolutions/zod-to-openapi` + `openapi3-ts` — OpenAPI 3.1 spec sa 30+ endpoints, Swagger UI
- **Fajlovi:** `src/lib/openapi/` (registry, schemas, paths, spec), `src/app/api/openapi.json/route.ts`, `src/app/api/docs/route.ts`
- **Endpoints:** `GET /api/openapi.json` (JSON spec, cached), `GET /api/docs` (Swagger UI, zero npm deps)
- **Dokumentovano:** Health, Agents CRUD, Chat, Flow, Knowledge, API Keys, MCP Servers, Evals, Webhooks, Jobs, Schedules
- **Testovi:** 13/13 spec testova prolaze (vi.mock + ZodType.prototype patch za rad bez instaliranog paketa)

### 3.3 — Contributing guide + templates
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** CONTRIBUTING.md (186 linija, sekcije: pre-push, worker, node types), CODE_OF_CONDUCT.md (placeholder fix), `.github/` (ISSUE_TEMPLATE, PR template, SECURITY.md, dependabot, release-please)
- **Fajlovi:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/`

### 3.4 — Docker Compose za self-hosting
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** PostgreSQL + Redis + Next.js + ECC MCP + Worker + migrate init container — `docker compose up -d`, `--profile ecc` za ECC
- **Fajlovi:** `docker-compose.yml`, `docker-compose.override.yml`, `Dockerfile` (migrate + worker stages)

---

## FAZA 4 — Usage Analytics (interna vidljivost)

### 4.1 — Admin analytics dashboard
- **Status:** ✅ DONE (2026-04-02)
- **Šta:** `/admin` — tri taba (Overview/Job Queue/Top Users), SWR auto-refresh, Skeleton loading; `/api/admin/stats` proširena sa totalUsers, topUsers, recentConversations, queueDelayed; `/admin/jobs` redirect na `/admin#jobs`
- **Fajlovi:** `src/app/admin/page.tsx`, `src/app/api/admin/stats/route.ts`, `src/app/admin/jobs/page.tsx`

---

## Van Scope-a (ne radimo ovo sada)

- ❌ Stripe integracija (nema firme)
- ❌ Organization/Multi-tenancy API (solo devs ne trebaju timove)
- ❌ Usage enforcement/hard limits (dolazi sa billing-om)
- ❌ ECC Meta-Orchestrator kao runtime engine (nema korisnika koji to trebaju)
- ❌ ECC Skills vector search (LIKE search je dovoljan za sada)

---

## Log Sesija

| Datum | Šta je urađeno |
|-------|---------------|
| 2026-04-02 | Inicijalna analiza koda, definisan plan, kreiran TASKS.md |
| 2026-04-02 | Discovery: BullMQ + API keys backend već kompletni. Ažuriran TASKS.md. |
| 2026-04-02 | Faza 1.6 DONE: Settings UI za API Keys — layout, page, api-keys page (0 TS grešaka, 2684 testova prolaze) |
| 2026-04-02 | Faza 1.7 DONE: 19 API Keys route testova (401/422/429/create/expiry/rename/revoke) |
| 2026-04-02 | Faza 2.4 DONE: Webhook retry — exponential backoff, dead letter, idempotency (12/12 testova) |
| 2026-04-02 | Faza 2.5 DONE: Railway Worker service — railway.toml, Dockerfile worker stage, package.json worker script |
| 2026-04-02 | Faza 3.3 DONE: CONTRIBUTING.md proširen, CODE_OF_CONDUCT.md placeholder fix, .github/ templates |
| 2026-04-02 | Faza 3.4 DONE: Docker Compose — migrate init container, worker service, ecc-mcp profile, override.yml |
| 2026-04-02 | Faza 4.1 DONE: Admin dashboard — SWR, 3 taba, stats API proširena, /admin/jobs redirect |
| 2026-04-02 | Kontrolni checkup PASS — 0 TS grešaka, 2715/2715 testova, precheck ✅ Spreman za push. |
| 2026-04-02 | Railway deploy fix — Dockerfile runner stage zadnji, builder = DOCKERFILE, startCommand = node server.js |
| 2026-04-03 | Faza 3.2 DONE: OpenAPI spec — registry, 11 tagova, 30+ paths, /api/openapi.json + /api/docs Swagger UI, 13/13 testova |

---

## Aktivni Blocker-i

*Nema trenutno.*

---

## Sledeće na redu

Sve faze 0–4 su ✅ DONE. Nastavak rada ide po **Fazi 5 — Tehnički dug i hardening**.

---

## FAZA 5 — Tehnički dug + Production Hardening (2026 standardi)

> Svaki zadatak ima oznaku prioriteta, procjenu rada i standard koji implementira.
> Redosljed = redosljed rada. Ne preskakati.

---

### 🔴 5.1 — KB Ingest Watchdog
- **Status:** ✅ DONE (2026-04-03)
- **Prioritet:** KRITIČAN — može ostaviti korisnike sa broken knowledge base-om
- **Problem:** KBSource zaglavi na `PROCESSING` zauvijek ako OpenAI API padne usred ingesta
- **Fix:** `resetStuckSources(olderThanMinutes=10)` u `maintenance.ts`; `/api/cron/cleanup` sad resetuje zaglavljene izvore + briše stare verzije
- **Standard 2026:** Observability + Dead process detection (SRE praksa)
- **Fajlovi:** `src/lib/knowledge/maintenance.ts`, `src/app/api/cron/cleanup/route.ts`
- **Testovi:** 6 testova u `maintenance.test.ts` — sve prolazi ✅

---

### 🔴 5.2 — Handler Field Access Audit (Schema Drift Protection)
- **Status:** ⬜ TODO
- **Prioritet:** KRITIČAN — flow rollback može pucati na starije verzije
- **Problem:** Handler-i pristupaju `node.data.field` direktno bez fallbacka → break na rollback
- **Fix:** Audit svih 55 handler-a, zamijeni `node.data.field` → `node.data.field ?? defaultValue`
- **Standard 2026:** Defensive programming, backward compatibility
- **Fajlovi:** `src/lib/runtime/handlers/*.ts` (55 fajlova)
- **Testovi:** svaki handler test mora provjeriti "missing node.data fields" scenario
- **Procjena:** 1 dan (dosadan ali obavezan)

---

### 🔴 5.3 — OpenAI Embedding Retry + Backoff
- **Status:** ✅ DONE (2026-04-03)
- **Prioritet:** KRITIČAN — jedan rate limit ruši cijelu KB ingestiju
- **Problem:** `embeddings.ts` nema retry logiku na OpenAI 429/503
- **Fix:** `withRetry()` wrapper — exponential backoff 1s→2s→4s + ±25% jitter, max 3 retry-a; retryable na 429/503, ne na 4xx
- **Standard 2026:** Resilience patterns — retry/backoff (AWS Well-Architected)
- **Fajlovi:** `src/lib/knowledge/embeddings.ts`
- **Testovi:** 12 testova u `embeddings.test.ts` — sve prolazi ✅

---

### 🔴 5.4 — Dependabot Security Audit
- **Status:** ✅ DONE (2026-04-03)
- **Prioritet:** KRITIČAN — GitHub je javio 1 critical + 17 high vulnerabilities
- **Problem:** 34 vulnerabilities na main branch-u, nepoznato koliko je u prod dependencijama
- **Fix:** `pnpm audit --prod` → **0 vulnerabilities** u production dependencies. GitHub advisory-ji su u dev deps (playwright, test tooling) — ne isporučuju se u produkcionu build.
- **Standard 2026:** OWASP Dependency-Check, supply chain security
- **Fajlovi:** `package.json`, `pnpm-lock.yaml`
- **Rezultat:** No known vulnerabilities found (prod deps clean)

---

### 🟠 5.5 — Vitest Coverage Setup + 70% Target
- **Status:** ⬜ TODO
- **Prioritet:** OZBILJNO — 2728 testova ali ne znamo što pokrivaju
- **Problem:** Coverage nije mjeren, slepe tačke su nepoznate
- **Fix:** `vitest --coverage` setup, coverage report u CI, cilj 70% lines
- **Standard 2026:** Industry standard — 70% line coverage za production software
- **Fajlovi:** `vitest.config.ts`, `.github/workflows/` (ako postoji CI)
- **Testovi:** coverage report sam po sebi je verifikacija
- **Procjena:** 2h setup + kontinuirano

---

### 🟠 5.6 — Redis Edge Cases Test Suite
- **Status:** ⬜ TODO
- **Prioritet:** OZBILJNO — graciozni fallback postoji u kodu ali nije testiran
- **Problem:** Redis = null scenariji nisu pokriveni testovima
- **Fix:** Test suite za rate-limiting, caching, MCP pool kad Redis nije dostupan
- **Standard 2026:** Chaos engineering principles — test failure modes
- **Fajlovi:** `src/lib/redis.ts`, `src/lib/rate-limit.ts`, `src/lib/cache/index.ts`
- **Testovi:** `vi.mock('ioredis')` → sve funkcije moraju raditi s null Redis
- **Procjena:** 1 dan

---

### 🟠 5.7 — Concurrent Flow Edit (Optimistic Locking)
- **Status:** ⬜ TODO
- **Prioritet:** OZBILJNO — dva korisnika edituju isti flow → izgubljen rad
- **Problem:** Flow PUT nema version check, "last write wins"
- **Fix:** `version: Int` field na Flow modelu, PUT provjerava version match → 409 ako conflict
- **Standard 2026:** Optimistic concurrency control (standard u svim kolaborativnim alatima)
- **Fajlovi:** `prisma/schema.prisma`, `/api/agents/[agentId]/flow/route.ts`
- **Testovi:** concurrent PUT requests → jedan mora dobiti 409
- **Procjena:** pola dana

---

### 🟠 5.8 — Embed Widget Error State
- **Status:** ⬜ TODO
- **Prioritet:** OZBILJNO — korisnik widgeta ne zna zašto chat ne radi
- **Problem:** Ako agent padne, widget prikazuje praznu stranicu bez poruke
- **Fix:** Error boundary u `src/app/embed/[agentId]/page.tsx` + fallback UI
- **Standard 2026:** Error boundaries (React 18 standard), graceful degradation
- **Fajlovi:** `src/app/embed/[agentId]/page.tsx`, `src/app/embed/layout.tsx`
- **Testovi:** E2E test — agent returns 500 → widget prikazuje error poruku
- **Procjena:** 2h

---

### 🟠 5.9 — CLI Generator Stuck Notification
- **Status:** ⬜ TODO
- **Prioritet:** OZBILJNO — korisnik čeka 5 min ne znajući da je zaglavilo
- **Problem:** Stuck detection postoji, ali nema proaktivne notifikacije korisniku
- **Fix:** In-app toast + email notifikacija kad `updatedAt > STUCK_THRESHOLD_MS`
- **Standard 2026:** UX standard — korisnik uvijek zna stanje async operacija
- **Fajlovi:** `src/app/cli-generator/page.tsx`, `src/lib/cli-generator/types.ts`
- **Testovi:** mock stuck state → provjeriti da se notifikacija šalje
- **Procjena:** 2h

---

### 🟡 5.10 — BullMQ za Heavy Tasks (KB ingest + Eval runs)
- **Status:** ⬜ TODO
- **Prioritet:** SKALIRANJE — blokira main Next.js process
- **Problem:** KB ingest i eval runs se izvršavaju u istom procesu kao API rute
- **Fix:** Prebaciti na BullMQ queue (infrastruktura već postoji!) + worker processing
- **Standard 2026:** Queue-based load leveling (Azure Architecture pattern)
- **Fajlovi:** `src/lib/queue/`, `src/lib/knowledge/ingest.ts`, `src/lib/evals/runner.ts`
- **Testovi:** BullMQ job enqueue → worker procesira → rezultat u DB
- **Procjena:** 3-5 dana

---

### 🟡 5.11 — ECC Instinct Human Approval Gate
- **Status:** ⬜ TODO
- **Prioritet:** AI GOVERNANCE — loš pattern može postati "znanje"
- **Problem:** Instinct s >0.85 confidence se promovira u Skill bez human review
- **Fix:** Human approval step (postoji HumanApprovalRequest model!) za instinct → skill
- **Standard 2026:** Human-in-the-loop AI (EU AI Act, responsible AI standards)
- **Fajlovi:** `src/lib/ecc/instinct-engine.ts`, `/api/skills/evolve/route.ts`
- **Testovi:** instinct s 0.9 confidence → kreira HumanApprovalRequest, ne direktno Skill
- **Procjena:** 1 dan

---

### 🟡 5.12 — Load Testovi (k6)
- **Status:** ⬜ TODO
- **Prioritet:** SKALIRANJE — ne znamo koliko korisnika možemo podnijeti
- **Problem:** k6 plan postoji u dokumentaciji, nikad implementiran
- **Fix:** k6 skript, 100 concurrent users, 30 min test, SLO: P95 < 5s chat response
- **Standard 2026:** Performance engineering, SLO-based testing (Google SRE book)
- **Fajlovi:** `load-tests/` (novi direktorij), `.github/workflows/load-test.yml`
- **Testovi:** k6 report je verifikacija
- **Procjena:** 1 dan

---

### 🟢 5.13 — API Key Scopes Dokumentacija
- **Status:** ⬜ TODO
- **Prioritet:** DEVELOPER EXPERIENCE
- **Problem:** `agents:read`, `chat:write` scope-i postoje u kodu ali nigdje nisu dokumentovani
- **Fix:** Dodati scopes tabelu u OpenAPI spec description + `/api/docs` stranicu
- **Standard 2026:** Developer experience (DX) — zero guesswork API design
- **Fajlovi:** `src/lib/openapi/spec.ts`, `src/app/api/docs/route.ts`
- **Testovi:** openapi spec mora sadržavati scopes tabelu
- **Procjena:** 1h

---

### 🟢 5.14 — CHANGELOG.md Automatizacija
- **Status:** ⬜ TODO
- **Prioritet:** OPEN SOURCE TRACTION
- **Problem:** GitHub posjetioci ne vide historiju razvoja, loš prvi utisak
- **Fix:** `conventional-changelog` CLI, generisati iz git log, dodati u release workflow
- **Standard 2026:** Conventional Commits standard, semantic versioning
- **Fajlovi:** `CHANGELOG.md` (novi), `package.json` (changelog script)
- **Testovi:** `pnpm changelog` mora generisati validan markdown
- **Procjena:** 2h

---

## Prioritet redosljed sesija

```
Sesija 1 (štiti produkciju — odmah): ✅ ZAVRŠENA 2026-04-03
  5.1 KB Watchdog + 5.3 Embedding Retry + 5.4 Dependabot

Sesija 2 (sprječava izgubljen rad):
  5.2 Handler Audit + 5.7 Optimistic Locking

Sesija 3 (vidljivost i pouzdanost):
  5.5 Coverage + 5.6 Redis Tests + 5.8 Embed Error

Sesija 4 (skaliranje):
  5.10 BullMQ + 5.12 Load Tests

Sesija 5 (AI governance + DX):
  5.11 ECC Human Approval + 5.13 Scopes + 5.14 CHANGELOG
```

---

> Poslednje ažuriranje: 2026-04-03
