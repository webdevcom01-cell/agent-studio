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
- **Status:** 🔲 TODO (sledeće na redu)
- **Šta:** zod-to-openapi, auto-generated API reference
- **Procena:** 2 dana

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

---

## Aktivni Blocker-i

*Nema trenutno.*

---

## Sledeće na redu

- **3.2 — OpenAPI spec generacija** (zod-to-openapi, auto-generated API reference)

---

> Poslednje ažuriranje: 2026-04-02
