# Agent Studio — SaaS Migration Plan

> **Cilj:** Transformacija single-user AI agent buildera u production-ready multi-tenant SaaS.
> **Timeline:** 24 nedelje (6 meseci) — target: oktobar 2026.
> **Autor:** buky + Claude Code audit (april 2026)
> **Billing:** Odložen do Faze 5 (firma potrebna za Stripe/Lemon Squeezy).

---

## Status pre migracije — Audit nalazi (april 2026)

### Šta radi dobro
- Streaming arhitektura (NDJSON protocol, heartbeat, StreamChunk union) ✅
- RAG pipeline (HNSW indeksi, hybrid search, query transformation, embedding cache) ✅
- Eval framework (3-layer: deterministic + semantic + LLM-as-Judge, 12 assertion types) ✅
- Webhook sistem (HMAC-SHA256, idempotency, event filtering, provider presets) ✅
- CLI Generator (6-phase pipeline, dual-target Python/TypeScript) ✅
- CDN/Static assets (assetPrefix, cache headers) ✅
- 2502+ unit testova, 10 E2E spec fajlova, k6 load testovi ✅

### Kritični problemi
| Problem | Fajl/Lokacija | Opis |
|---------|--------------|------|
| Sinhrono izvršavanje | `src/lib/runtime/engine.ts` L138-219 | While loop blokira HTTP request. Nema queue-a. |
| Nema Organization modela | `prisma/schema.prisma` | Izolacija samo po `userId`. Nema tima, nema workspace-a. |
| RBAC nije enforced | `src/lib/mcp/client.ts` L22-93 | `checkSkillAccess()` postoji ali se ne poziva. |
| ECC single replica | `services/ecc-skills-mcp/railway.toml` L10 | `numReplicas = 1` — SPOF. |
| AuditLog underused | `src/lib/security/audit.ts` | Funkcije postoje ali se gotovo nigde ne pozivaju. |
| OTEL opcionalan | `src/instrumentation.ts` L33-43 | Samo loguje ako je endpoint setovan. |

### Propusti otkriveni u analizi
| Problem | Ozbiljnost | Opis |
|---------|-----------|------|
| GDPR compliance | KRITIČNO | Nema account deletion, nema data export, nema retention policy. |
| Email sistem | KRITIČNO | Nema transactional email library. Nema welcome/reset/notification email. |
| Error monitoring | VISOK | Nema Sentry, nema alerting. Silent production failures. |
| CSP header | VISOK | Content-Security-Policy ne postoji. XSS ranjivost. |
| Session management | VISOK | JWT 24h bez refresh rotation. Nema concurrent session limit. |
| File upload security | VISOK | Nema virus scanning, nema magic number validacija. |
| Webhook retry | SREDNJI | Nema retry za failed webhook deliveries. Nema dead letter queue. |
| Backup strategija | SREDNJI | Samo Railway built-in. Nema dokumentovan RTO/RPO. |
| Rate limiting | SREDNJI | 20 req/min globalno. Nema per-IP, nema per-endpoint. |
| Feature flags | NIZAK | Samo `ECC_ENABLED`. Nema gradual rollout. |
| API versioning | NIZAK | Nema verzioniranja. Breaking changes forsiraju sve klijente. |

---

## Faza 0 — Stabilizacija (Nedelje 1–2)

> **Cilj:** Popraviti poznate bugove i ojačati ono što postoji. Bez user-facing promena.

### 0.1 ECC numReplicas → 2
- **Fajl:** `services/ecc-skills-mcp/railway.toml`
- **Promena:** `numReplicas = 1` → `numReplicas = 2`
- **Rizik:** Nizak
- **Test:** Health check oba replica, verify load balancing

### 0.2 RBAC enforcement u MCP tool handler
- **Fajl:** `src/lib/runtime/handlers/mcp-tool-handler.ts`
- **Promena:** Dodati `checkSkillAccess(agentId, skillId, 'EXECUTE')` pre svakog MCP tool poziva
- **Zavisnost:** `src/lib/security/rbac.ts` (već implementirano)
- **Test:** Unit test — agent bez permisije dobija graceful error, ne tool rezultat

### 0.3 AuditLog u flow handlers
- **Fajlovi:**
  - `src/lib/runtime/engine.ts` — `auditExecution()` na start i end
  - `src/lib/runtime/engine-streaming.ts` — isto
  - `src/lib/runtime/handlers/ai-response-handler.ts` — audit AI poziv
  - `src/lib/runtime/handlers/call-agent-handler.ts` — audit agent-to-agent poziv
- **Test:** Verify AuditLog records u bazi posle flow execution

### 0.4 OTEL obavezan
- **Railway env:** Setovati `OTEL_EXPORTER_OTLP_ENDPOINT` na Grafana Cloud
- **Fajl:** `src/instrumentation.ts` — log warning ako nije setovan (ne crash)
- **Test:** Verify spans stižu u Grafana

### Acceptance Criteria — Faza 0
- [ ] ECC ima 2 replike i obe odgovaraju na health check
- [ ] MCP tool pozivi proveravaju AgentSkillPermission
- [ ] AuditLog ima zapise za svako flow execution
- [ ] OTEL spanovi vidljivi u Grafana dashboardu
- [ ] `pnpm precheck` prolazi
- [ ] Svi postojeći testovi prolaze

---

## Faza 1 — Async Execution (Nedelje 3–6)

> **Cilj:** Flow execution prebaciti u background worker. HTTP request ne blokira.

### 1.1 BullMQ 5.71 + Redis queue setup
- **Novi paketi:** `bullmq@^5.71`
- **Novi fajlovi:**
  - `src/lib/queue/index.ts` — queue konfiguracija, job definitions
  - `src/lib/queue/worker.ts` — BullMQ worker koji izvršava flow
  - `src/lib/queue/events.ts` — job progress events (SSE/WebSocket)
- **Ključne odluke:**
  - Worker je ODVOJEN proces od Next.js app-a (Railway separate service ili `concurrently` u dev)
  - Dead letter queue za failovane jobove (3 retry-a, exponential backoff)
  - Job prioriteti: chat (high), pipeline (normal), eval (low)
  - OpenTelemetry built-in u BullMQ 5.71 — koristiti automatski

### 1.2 Chat API → Job-based
- **Fajl:** `src/app/api/agents/[agentId]/chat/route.ts`
- **Promena:**
  - `stream: false` → kreira BullMQ job, vraća `{ jobId }`, klijent poll-uje
  - `stream: true` → kreira job, vraća SSE stream koji prima progress events od workera
- **Backward compat:** Embed widget i eval runner koriste `stream: false` — moraju raditi sa novim API-jem

### 1.3 Worker Railway service
- **Novi fajl:** `services/worker/` — BullMQ worker process
- **Railway:** Novi servis, internal networking, deli Redis sa main app
- **Scaling:** `numReplicas = 2` minimum, auto-scale na osnovu queue depth

### 1.4 Job monitoring dashboard
- **Fajl:** `src/app/admin/jobs/page.tsx` (novi)
- **Prikazuje:** Active jobs, failed jobs, retry queue, dead letter, throughput

### Acceptance Criteria — Faza 1
- [ ] Chat API vraća odgovor za <200ms (job kreiran, ne izvršen)
- [ ] Flow execution se dešava u worker procesu
- [ ] Railway deploy NE ubija aktivne pipeline-ove
- [ ] Failed jobovi idu u dead letter queue posle 3 retry-a
- [ ] Job progress vidljiv u real-time (SSE)
- [ ] Embed widget radi bez promena
- [ ] k6 load test: 100 concurrent users, 0 dropped requests
- [ ] `pnpm precheck` prolazi

---

## Faza 1.5 — Email + Error Monitoring (Nedelje 5–6)

> **Cilj:** Transactional email i proactive error alerting.

### 1.5.1 Resend email integration
- **Novi paket:** `resend@^4`
- **Novi fajlovi:**
  - `src/lib/email/client.ts` — Resend client singleton
  - `src/lib/email/templates/` — welcome, password-reset, pipeline-failed, weekly-digest
- **Email triggers:**
  - Welcome email on first login
  - Pipeline failure notification
  - Weekly usage digest (opciono, BullMQ scheduled job)
- **Env var:** `RESEND_API_KEY`

### 1.5.2 Sentry error monitoring
- **Novi paket:** `@sentry/nextjs@^9`
- **Setup:**
  - `sentry.client.config.ts` + `sentry.server.config.ts`
  - Source maps upload u build stepu
  - Slack webhook za P1 alertove
- **Env vars:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

### Acceptance Criteria — Faza 1.5
- [ ] Novi korisnik dobija welcome email unutar 30s od prvog login-a
- [ ] Failed pipeline šalje email korisniku
- [ ] Sentry hvata sve unhandled exceptions
- [ ] Slack prima alert za P1 greške unutar 60s
- [ ] `pnpm precheck` prolazi

---

## Faza 2 — Multi-tenancy (Nedelje 7–10)

> **Cilj:** Organization model + PostgreSQL RLS za izolaciju podataka.

### 2.1 Prisma schema — Organization model
- **Fajl:** `prisma/schema.prisma`
- **Novi modeli:**
```prisma
model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  plan        PlanTier @default(FREE)
  members     OrganizationMember[]
  agents      Agent[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slug])
}

model OrganizationMember {
  id             String       @id @default(cuid())
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           OrgRole      @default(MEMBER)
  joinedAt       DateTime     @default(now())

  @@unique([userId, organizationId])
}

model Invitation {
  id             String       @id @default(cuid())
  email          String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           OrgRole      @default(MEMBER)
  token          String       @unique
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime     @default(now())

  @@index([token])
  @@index([email, organizationId])
}

enum PlanTier {
  FREE
  PRO
  TEAM
}

enum OrgRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}
```

### 2.2 PostgreSQL Row Level Security
- **Migration SQL:**
  - Enable RLS na Agent, Conversation, Flow, KnowledgeBase, EvalSuite tabelama
  - Policy: `USING (organization_id = current_setting('app.organization_id'))`
- **Middleware:** `src/middleware.ts` — setuje `app.organization_id` na svakom request-u

### 2.3 Auth guard refactor
- **Fajl:** `src/lib/api/auth-guard.ts`
- **Nove funkcije:**
  - `requireOrgMember(orgId)` — proveri da user pripada organizaciji
  - `requireOrgAdmin(orgId)` — proveri ADMIN ili OWNER rolu
  - `requireOrgOwner(orgId)` — samo OWNER
- **Migracija:** `requireAgentOwner()` → koristi org membership umesto direktnog userId

### 2.4 Invite flow
- **API routes:**
  - `POST /api/orgs/[orgId]/invite` — šalje invite email (Resend)
  - `POST /api/invites/[token]/accept` — prihvata pozivnicu
  - `GET /api/orgs/[orgId]/members` — lista članova
  - `DELETE /api/orgs/[orgId]/members/[memberId]` — ukloni člana
- **UI:** Settings page sa member management

### 2.5 Data migration
- **Script:** `scripts/migrate-to-orgs.mjs`
  - Svaki postojeći user dobija personal Organization
  - Svi njegovi agenti se linkuju na tu organizaciju
  - Zero downtime — read from both during migration window

### Acceptance Criteria — Faza 2
- [ ] Novi user automatski dobija personal organizaciju
- [ ] Agent CRUD filtrira po organizaciji, ne po userId
- [ ] RLS na PostgreSQL nivou — direktan SQL ne može da vidi tuđe podatke
- [ ] Invite email funkcioniše end-to-end
- [ ] Postojeći korisnici zadržavaju sve svoje podatke posle migracije
- [ ] Org OWNER može da vidi/menja sve agente u organizaciji
- [ ] VIEWER može samo da čita, ne da menja
- [ ] `pnpm precheck` prolazi
- [ ] E2E testovi ažurirani za org context

---

## Faza 2.5 — GDPR Compliance (Nedelje 9–10)

> **Cilj:** Pravo na brisanje, pravo na izvoz, retention policy.

### 2.5.1 Account deletion
- **API:** `DELETE /api/user/account`
- **Proces:**
  1. Soft delete — markira nalog za brisanje (30-day grace period)
  2. Email potvrda — "Vaš nalog će biti obrisan za 30 dana"
  3. Hard delete — BullMQ scheduled job briše sve podatke posle 30 dana
  4. Cascade: agents, flows, conversations, KB, evals, executions, audit logs
- **UI:** Settings → Account → "Delete my account" sa potvrdom

### 2.5.2 Data export
- **API:** `POST /api/user/export` → BullMQ job → email sa download linkom
- **Format:** ZIP sa JSON fajlovima (agents, flows, conversations, KB sources, evals)
- **Limit:** Jednom na 24h (rate limit)
- **Storage:** Temporary S3/R2 link, istekne za 48h

### 2.5.3 Retention policy
- **Conversations:** Auto-delete posle 90 dana neaktivnosti
- **Audit logs:** Čuvaju se 1 godinu, zatim arhiviraju
- **Execution logs:** 30 dana
- **BullMQ cron:** Weekly cleanup job

### Acceptance Criteria — Faza 2.5
- [ ] Korisnik može da obriše nalog iz UI-a
- [ ] 30-day grace period sa email potvrdom
- [ ] Hard delete briše SVE korisnikove podatke
- [ ] Data export generiše ZIP sa svim podacima u <5 minuta
- [ ] Retention policy automatski čisti stare podatke
- [ ] `pnpm precheck` prolazi

---

## Faza 3 — Security Hardening (Nedelje 11–12)

> **Cilj:** CSP, session management, file security.

### 3.1 Content Security Policy
- **Fajl:** `src/lib/api/security-headers.ts`
- **Dodati:**
  - `Content-Security-Policy` sa script-src, style-src, img-src, connect-src
  - Nonce generation za inline scripts (`next/script`)
  - `report-uri` za CSP violation logging
- **Test:** Verify da embed widget radi sa CSP (iframe-src)

### 3.2 Session management
- **Fajl:** `src/lib/auth.ts`
- **Promene:**
  - Refresh token rotation (short-lived access token 15min + long-lived refresh 7d)
  - Concurrent session limit (max 5 active sessions per user)
  - Session revocation endpoint: `POST /api/auth/revoke-all`
  - Forced re-auth za sensitive ops (org deletion, account deletion)
- **Novi model:** `ActiveSession` u Prisma za tracking

### 3.3 File upload hardening
- **Fajl:** `src/app/api/agents/[agentId]/knowledge/sources/upload/route.ts`
- **Dodati:**
  - Magic number validacija (file-type library)
  - ClamAV scan via API (ClamScan Cloud ili lokalni daemon)
  - Quarantine pattern — fajl ide u staging pre nego što postane dostupan

### 3.4 Rate limiting poboljšanje
- **Fajl:** `src/lib/rate-limit.ts`
- **Dodati:**
  - Per-IP rate limiting (brute force protection)
  - Per-endpoint limits (login: 5/min, chat: 30/min, upload: 10/min)
  - Progressive penalties (5min → 15min → 1h ban)

### Acceptance Criteria — Faza 3
- [ ] CSP header prisutan na svim response-ima
- [ ] XSS payload blocked by CSP (manual test)
- [ ] Session expires after 15min inactivity, refresh works
- [ ] Max 5 concurrent sessions per user
- [ ] Uploaded file sa lažnom ekstenzijom odbijen
- [ ] Brute force login attempt blokiran posle 5 pokušaja
- [ ] `pnpm precheck` prolazi

---

## Faza 3.5 — Webhook Reliability (Nedelje 12–13)

> **Cilj:** Retry logika + dead letter za webhook deliveries.

### 3.5.1 Webhook retry engine
- **Fajl:** `src/lib/webhooks/retry.ts` (novi)
- **Logika:**
  - 3 retry-a sa exponential backoff (1min → 5min → 30min)
  - BullMQ delayed jobs za retry scheduling
  - Circuit breaker per webhook endpoint (5 consecutive failures → disable)
- **UI:** Webhook detail page prikazuje retry history

### 3.5.2 Dead letter queue
- **Model:** `WebhookDeadLetter` u Prisma
- **UI:** Admin page za dead letter management (replay, delete)

### Acceptance Criteria — Faza 3.5
- [ ] Failed webhook se retry-uje 3 puta
- [ ] Posle 3 failure-a, webhook ide u dead letter
- [ ] Circuit breaker disabluje endpoint posle 5 consecutive failures
- [ ] Admin može da replay-uje dead letter webhook
- [ ] `pnpm precheck` prolazi

---

## Faza 4 — Beta Launch Prep (Nedelje 14–18)

> **Cilj:** Sve što treba pre nego što pustiš prve korisnike.

### 4.1 Onboarding flow
- Guided wizard: "Kreiraj prvog agenta za 5 minuta"
- Template picker sa preview-om
- Tooltips na flow editor-u za nove korisnike

### 4.2 Admin dashboard
- **Fajl:** `src/app/admin/page.tsx` (novi)
- **Metrike:** Active users, total agents, pipeline executions, error rate, queue depth
- **Pristup:** Samo org OWNER/ADMIN

### 4.3 Landing page
- Public marketing page na `/` (pre login-a)
- Pricing page (Free / Pro / Team — bez payment-a, samo "Coming soon")
- Docs page — getting started, API reference

### 4.4 Load testing
- k6 scenario: 100 concurrent users, 30min sustained
- Target: P95 < 5s flow execution, P99 < 2s KB search
- Fix sve bottleneck-ove pre beta

### 4.5 Security audit
- OWASP Top 10 checklist
- Dependency audit (`npm audit`, Snyk)
- Penetration test na auth flow

### Acceptance Criteria — Faza 4
- [ ] Novi korisnik može da napravi i testira agenta za <5 min
- [ ] Admin dashboard prikazuje real-time metrike
- [ ] Landing page učitava se za <2s (Lighthouse score >90)
- [ ] k6 load test prolazi sa 100 concurrent users
- [ ] OWASP Top 10 — nema critical/high findings
- [ ] Zero known CVEs u dependency-jima

---

## Faza 4.5 — Feature Flags + API Versioning (Nedelje 17–18)

### 4.5.1 Feature flag sistem
- **Opcije:** PostHog (free tier), Flagsmith (open source), ili custom
- **Implementacija:**
  - Server-side flag evaluation (ne client-side)
  - Percentage-based rollout
  - Per-org overrides

### 4.5.2 API versioning
- **Pattern:** URL prefix (`/api/v1/agents`)
- **Backward compat:** `/api/agents` → redirect na `/api/v1/agents`
- **Deprecation policy:** 6 meseci warning pre uklanjanja

### Acceptance Criteria — Faza 4.5
- [ ] Feature flag sistem funkcionalan sa >=2 flags
- [ ] Gradual rollout testiran (10% → 50% → 100%)
- [ ] API v1 prefix radi na svim routes
- [ ] Legacy routes redirect-uju na v1

---

## Faza 5 — Billing + Public Launch (Nedelje 20–24)

> **Cilj:** Monetizacija. Zahteva registrovanu firmu.

### 5.1 Pravni entitet
- Registracija firme (preduzetnik ili DOO u Srbiji, ili Stripe Atlas US LLC)
- Alternativa: Lemon Squeezy / Paddle kao merchant of record (bez firme)

### 5.2 Stripe / Lemon Squeezy integracija
- Usage-based billing (token metering)
- Planovi: Free (1000 tok/dan) → Pro ($29/mo, 100k tok) → Team ($99/mo, 500k tok)
- Token usage flush na billing provider svakih 60min (Redis accumulator)
- Subscription webhooks → automatic plan enforcement

### 5.3 Token metering infrastruktura
- **Već postoji:** `cost_monitor` node, `token-pricing.ts`, `budget-tracker.ts`
- **Potrebno:** Per-org usage aggregacija, monthly reset, overage alerts

### 5.4 Public launch
- Product Hunt launch
- Beta lista → invite wave
- Support sistem (Crisp / Intercom)

### Acceptance Criteria — Faza 5
- [ ] Korisnik može da se pretplati na Pro/Team plan
- [ ] Token usage tačno se beleži i naplaćuje
- [ ] Free tier automatski ograničava posle 1000 tokens/dan
- [ ] Upgrade/downgrade radi bez gubitka podataka
- [ ] Minimum 10 plaćajućih korisnika u prvom mesecu

---

## Tehnički standardi — 2026 referenca

### Job Queue
- **Standard:** BullMQ 5.71 (mart 2026) — OpenTelemetry built-in
- **Pattern:** Odvojiti worker od API procesa. Dead letter queue. Idempotentni jobovi.
- **Ref:** https://bullmq.io/

### Multi-tenancy
- **Standard:** Shared schema + PostgreSQL RLS (Row Level Security)
- **Pattern:** `tenantId` na svim tabelama, RLS policy, application-level check kao drugi sloj
- **Ref:** https://www.pedroalonso.net/blog/postgres-multi-tenant-search/

### AI SaaS Billing
- **Standard:** Usage-based pricing (60%+ AI startupa, Stripe mart 2026)
- **Pattern:** Accumulate u Redis, flush svakih 60min na billing provider
- **Ref:** https://www.pymnts.com/news/artificial-intelligence/2026/stripe-introduces-billing-tools-to-meter-and-charge-ai-usage/

### Enterprise AI Agent Builder Requirements (2026)
- RBAC/ABAC + SSO + audit trail
- Long-running workflow support
- Observability + evals u produkciji
- Governance: PII zaštita, prompt injection defense, content safety
- **Ref:** https://vellum.ai/blog/top-13-ai-agent-builder-platforms-for-enterprises

---

## Kako koristiti ovaj dokument sa Claude Code

Kada kreneš novu sesiju u terminalu, reci Claude Code-u:

```
Pročitaj SAAS-MIGRATION-PLAN.md i nastavi sa Fazom [X].
Sve promene moraju da prođu pnpm precheck pre commitovanja.
```

Za svaku fazu, Claude Code treba da:
1. Pročita acceptance criteria
2. Implementira svaki task redom
3. Napiše unit testove za svaki novi fajl
4. Pokrene `pnpm precheck`
5. Commituje sa jasnom porukom: `feat(saas): Phase X.Y — opis`

---

## Changelog

| Datum | Promena |
|-------|---------|
| 2026-04-02 | Inicijalni plan kreiran posle full codebase audita |
| 2026-04-02 | Dodate faze 1.5, 2.5, 3, 3.5, 4.5 (email, GDPR, security, webhooks, flags) |
| 2026-04-02 | Billing pomeren na Fazu 5 (firma potrebna) |
