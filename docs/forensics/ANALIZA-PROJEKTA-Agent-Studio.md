# Agent Studio — Kompletna hijerarhijska analiza projekta

> Metoda: ceo projekat je razložen po principu profesionalne dekompozicije —
> **Nivo 1 (Glavni segmenti)** → **Nivo 2 (Podsegmenti)** → **Nivo 3 (Elementi: fajlovi/moduli)**.
> Analiza je rađena nad stvarnim repozitorijumom (`/Desktop/agent-studio`), ne nad pretpostavkama.

---

## 0. Pregled projekta (executive summary)

**Šta je Agent Studio:** Vizuelni builder AI agenata sa multi-agent orkestracijom i kontinuiranim učenjem. Drag-and-drop flow editor + production runtime. Povezuje bilo koji LLM provider, knowledge base, MCP servere, i omogućava agentima da pozivaju jedni druge. Deploy na Railway/Render/Docker.

**Tehnološki temelj:**

| Dimenzija | Vrednost |
|---|---|
| Framework | Next.js 15.5 (App Router, Turbopack), React 19 |
| Jezik | TypeScript 5.8 |
| Baza | PostgreSQL + Prisma 6 (63 modela) |
| Queue/Cache | Redis (ioredis) + BullMQ |
| Auth | NextAuth 5 (beta) + Prisma adapter |
| AI SDK-ovi | Anthropic, OpenAI, Google, Groq, Mistral, DeepSeek (Vercel AI SDK) |
| Sandbox | E2B code-interpreter, Pyodide (Python u browseru/workeru) |
| Build/Monorepo | pnpm workspaces |
| Obim | ~982 TS/TSX fajla, ~318.000 linija u `src/` |

**Skala podsistema:** ~72 node handlera • 53 lib modula • 35 grupa API ruta • 22 frontend rute (+ `api/`) • 63 Prisma modela • 5 mikroservisa • 1 MCP server • 1 CLI paket • 1 dokumentacioni sajt (Docusaurus).

---

## NIVO 1 — Glavni segmenti

Projekat se deli na **12 glavnih segmenata**:

1. [Web aplikacija (Frontend / UI)](#segment-1)
2. [API sloj (Backend rute)](#segment-2)
3. [Runtime Engine (izvršni motor toka)](#segment-3)
4. [Node biblioteka (node handlers)](#segment-4)
5. [Knowledge / RAG podsistem](#segment-5)
6. [Data sloj (Prisma / baza)](#segment-6)
7. [Agent orkestracija (A2A, agent-as-tool, SOMA, ECC)](#segment-7)
8. [Evals & kvalitet](#segment-8)
9. [SDLC / DevSecOps podsistem](#segment-9)
10. [MCP integracija & spoljni servisi](#segment-10)
11. [Governance / Security / Safety / Cost](#segment-11)
12. [Infrastruktura, alati i dokumentacija](#segment-12)

---

<a id="segment-1"></a>
## SEGMENT 1 — Web aplikacija (Frontend / UI)

Lokacija: `src/app/*` (rute) + `src/components/*` (UI komponente).

### 1.1 Podsegment: Rute / stranice (`src/app`)
22 frontend rutne grupe (+ `api/`, vidi Segment 2). Elementi:

- **`(marketing)/`** — javni marketing landing (grupa bez URL prefiksa).
- **`builder/`** — vizuelni flow editor (srce proizvoda).
- **`chat/`** — chat interfejs za razgovor sa agentima.
- **`pipelines/`** — pregled i pokretanje pipeline-ova.
- **`knowledge/`** — upravljanje knowledge base-ovima (RAG).
- **`evals/`** — testing framework UI (eval suite-ovi, run-ovi).
- **`analytics/`** — dashboard sa metrikama i grafikonima.
- **`templates/`** — galerija template-a (~221 gotovih).
- **`discover/`** — agent marketplace / discovery.
- **`soma/`** — SOMA podsistem UI (self-organizing microagents).
- **`ecc/`** — Everything-Claude-Code integracija UI.
- **`devsecops/`** — DevSecOps pipeline UI.
- **`cli-generator/`** — generator MCP/CLI bridža.
- **`memory/`** — pregled agent memorije.
- **`skills/`** — upravljanje skill-ovima.
- **`settings/`** — podešavanja (provideri, ključevi, org).
- **`admin/`** — administracija.
- **`webhooks/`** — konfiguracija inbound webhook-ova.
- **`embed/`** — embeddable widget verzija agenta.
- **`onboarding/`** — onboarding tok.
- **`login/`, `register/`** — autentikacija.
- **`layout.tsx`, `page.tsx`, `loading.tsx`, `globals.css`** — root shell, početna, loading state, globalni stilovi.

### 1.2 Podsegment: UI komponente (`src/components`)
11 grupa. Elementi:

- **`builder/`** (85 .tsx) — flow editor: `flow-builder.tsx`, debug alatke (`debug-panel`, `debug-timeline`, `debug-toolbar`, `debug-node-overlay`, `debug-variable-watch`), `deploy-dialog`, `diff-view`, `flow-error-boundary` + node-specifične komponente.
- **`chat/`** — chat prozor, poruke, streaming UI.
- **`dashboard/`** — kartice i grafikoni za analytics.
- **`evals/`** — UI eval suite-ova i rezultata.
- **`cli-generator/`** — wizard za CLI bridž.
- **`mcp/`** — UI za povezivanje MCP servera.
- **`templates/`** — galerija/preview template-a.
- **`a2a/`** — UI agent-to-agent veza.
- **`webhooks/`** — UI webhook konfiguracije.
- **`layout/`** — navigacija, sidebar, header.
- **`ui/`** — dizajn-sistem primitivi (Radix UI + Tailwind: dialog, dropdown, select, tabs, tooltip…).
- **`theme-provider.tsx`, `toaster-provider.tsx`** — tema i notifikacije (sonner).

### 1.3 Podsegment: Frontend infrastruktura
- **`src/middleware.ts`** — Next.js middleware (auth/redirect/headers).
- **`src/instrumentation.ts`** — Sentry/observability bootstrap.
- **`next.config.ts`, `postcss.config.mjs`, `tailwindcss`** — build i stilizacija.
- **State/fetch:** SWR (`swr`), Framer Motion (`motion`), `@xyflow/react` (flow canvas), `recharts` (grafikoni).

---

<a id="segment-2"></a>
## SEGMENT 2 — API sloj (Backend rute)

Lokacija: `src/app/api/*` — 35 grupa ruta (Next.js Route Handlers).

### 2.1 Podsegment: Jezgro agenata i izvršavanja
- **`agents/`** — CRUD agenata, pokretanje.
- **`agent-calls/`** — log poziva agent→agent.
- **`mcp/`, `mcp-servers/`** — MCP endpoint i registar servera.
- **`a2a/`** — Agent-to-Agent protokol (v0.3).
- **`jobs/`** — async poslovi (BullMQ).
- **`cron/`, `schedules/`** — zakazani flow-ovi.
- **`webhooks/`** — inbound okidači.

### 2.2 Podsegment: Znanje, evaluacija, šabloni
- **`skills/`** — skill registracija/izvršavanje.
- **`evals/`** — eval suite-ovi i run-ovi.
- **`templates/`, `pipeline-templates/`** — galerija i instanciranje.
- **`integrations/`** — spoljne integracije.

### 2.3 Podsegment: Governance i organizacija
- **`approvals/`, `policies/`, `decisions/`** — human-in-the-loop, approval policy, policy decisions.
- **`goals/`, `mission/`** — ciljevi i misija kompanije (org-chart vezivanje).
- **`departments/`, `orgs/`, `invites/`** — multi-tenant organizacije, članstvo, pozivnice.
- **`admin/`** — administrativni endpointi.

### 2.4 Podsegment: Platforma i pomoćni endpointi
- **`auth/`** — NextAuth handleri.
- **`api-keys/`, `keys/`** — API ključevi.
- **`user/`** — profil korisnika.
- **`analytics/`** — eventi/metrika.
- **`health/`** — health-check.
- **`docs/`, `openapi.json/`** — OpenAPI specifikacija (`@asteasolutions/zod-to-openapi`).
- **`sdlc/`, `ecc/`, `soma/`, `cli-generator/`, `tasks/`** — endpointi specijalizovanih podsistema.

---

<a id="segment-3"></a>
## SEGMENT 3 — Runtime Engine (izvršni motor toka)

Lokacija: `src/lib/runtime/` — najveći modul (**193 TS fajla**). Ovo je jezgro koje izvršava flow grafove.

### 3.1 Podsegment: Jezgro motora
- **`engine.ts`** — glavni izvršni motor (orkestracija node grafa).
- **`engine-streaming.ts`** — streaming verzija (token-by-token).
- **`execution-prelude.ts`** — priprema konteksta pre izvršavanja.
- **`context.ts` / `context-compaction.ts`** — runtime kontekst + kompakcija (kontrola token budžeta).
- **`hooks.ts`** — lifecycle hooks oko izvršavanja.
- **`template.ts`** — interpolacija promenljivih u node poljima.
- **`types.ts`** — tipovi izvršnog grafa.

### 3.2 Podsegment: Debug i protokol
- **`debug-controller.ts`** — step/breakpoint kontrola izvršavanja.
- **`session-events.ts`** — događaji izvršne sesije.
- **`stream-protocol.ts`** — protokol za streaming na klijent.
- **`verification-commands.ts`** — komande za verifikaciju rezultata node-a.

### 3.3 Podsegment: Python izvršavanje
- **`python-executor.ts` / `python-types.ts`** — izvršavanje Python koda.
- **`workers/pyodide-node-worker.js`** — Pyodide worker (Python u izolaciji).

### 3.4 Podsegment: Testovi
- **`__tests__/`** — unit/integration testovi motora.

---

<a id="segment-4"></a>
## SEGMENT 4 — Node biblioteka (node handlers)

Lokacija: `src/lib/runtime/handlers/` — **72 handler fajla** (proizvod reklamira 55 javnih node tipova). Svaki handler = jedan tip čvora u editoru. Grupisani po funkciji:

### 4.1 AI / LLM čvorovi
`ai-response-handler`, `ai-response-streaming-handler`, `ai-classify-handler`, `ai-extract-handler`, `ai-summarize-handler`, `structured-output-handler`, `embeddings-handler`, `image-generation-handler`, `speech-audio-handler`, `multimodal-input-handler`, `claude-agent-sdk-handler`, `claude-agent-sdk-streaming-handler`.

### 4.2 Kontrola toka (control flow)
`condition-handler`, `switch-handler`, `loop-handler`, `goto-handler`, `parallel-handler`, `parallel-streaming-handler`, `wait-handler`, `retry-handler`, `end-handler`, `set-variable-handler`, `function-handler`.

### 4.3 Orkestracija agenata
`call-agent-handler` (+ `call-agent-handler 2.ts` — duplikat/varijanta), `swarm-handler`, `plan-and-execute-handler`, `reflexive-loop-handler`, `semantic-router-handler`, `learn-handler`.

### 4.4 Podaci / IO
`api-call-handler`, `web-fetch-handler`, `web-search-handler`, `database-query-handler`, `file-operations-handler`, `file-writer-handler`, `format-transform-handler`, `aggregate-handler`, `cache-handler`, `email-send-handler`, `notification-handler`.

### 4.5 Knowledge / memorija
`kb-search-handler`, `memory-read-handler`, `memory-write-handler`, `project-context-handler`.

### 4.6 Kod / razvoj (SDLC)
`code-interpreter-handler`, `python-code-handler`, `code-review-handler`, `ast-transform-handler`, `lsp-query-handler`, `git-node-handler`, `process-runner-handler`, `sandbox-verify-handler`, `deploy-trigger-handler`, `verification-handler`.

### 4.7 MCP / spoljni alati
`mcp-tool-handler`, `mcp-task-runner-handler`, `browser-action-handler`, `desktop-app-handler`.

### 4.8 Kvalitet / evaluacija / sigurnost
`evaluator-handler`, `trajectory-evaluator-handler`, `ab-test-handler`, `guardrails-handler`, `human-approval-handler`, `cost-monitor-handler`.

### 4.9 Okidači (triggers) i UI čvorovi
`webhook-trigger-handler`, `webhook-handler`, `schedule-trigger-handler`, `message-handler`, `button-handler`, `capture-handler`.

### 4.10 Registar
- **`index.ts`** — registracija svih handlera (mapiranje tip → handler).
- **`__tests__/`** — testovi handlera.

---

<a id="segment-5"></a>
## SEGMENT 5 — Knowledge / RAG podsistem

Lokacija: `src/lib/knowledge/` (**44 TS fajla**) — kompletan RAG pipeline.

### 5.1 Podsegment: Ingest i parsiranje
- **`ingest.ts`** — ulazni tok dokumenata.
- **`parsers.ts`** — parsiranje formata (PDF preko `pdf-parse`, DOCX preko `mammoth`, itd.).
- **`scraper.ts`** — web scraping (cheerio).
- **`chunker.ts`** — chunking strategije.
- **`contextual-enrichment.ts`** — kontekstualno obogaćivanje chunkova.
- **`deduplication.ts`** — uklanjanje duplikata.

### 5.2 Podsegment: Embeddings i indeks
- **`embeddings.ts`** — generisanje embedding-a.
- **`embedding-cache.ts`** — keš embedding-a.
- **`embedding-drift.ts`** — detekcija drifta modela.

### 5.3 Podsegment: Retrieval
- **`search.ts`** — osnovna pretraga.
- **`agentic-retrieval.ts`** — agentic retrieval.
- **`reranker.ts`** — re-rangiranje rezultata.
- **`query-router.ts`, `query-transform.ts`, `query-reformulation.ts`** — rutiranje/transformacija upita.
- **`metadata-filter.ts`** — filtriranje po metapodacima.
- **`context-ordering.ts`** — redosled konteksta.

### 5.4 Podsegment: Generisanje i kvalitet
- **`rag-inject.ts`** — injekcija konteksta u prompt.
- **`citations.ts`** — citati/izvori.
- **`grounding-check.ts`** — provera utemeljenosti (anti-halucinacija).
- **`ragas.ts`** — RAGAS metrike kvaliteta.
- **`analytics.ts`** — analitika korišćenja KB.
- **`maintenance.ts`** — održavanje indeksa.
- **`index.ts`** — javni API modula • **`__tests__/`** — testovi.

---

<a id="segment-6"></a>
## SEGMENT 6 — Data sloj (Prisma / baza)

Lokacija: `prisma/` + `src/lib/prisma.ts`, `src/lib/db/`, `src/lib/database/`.

### 6.1 Podsegment: Šema (`prisma/schema.prisma`, 1808 linija, 63 modela)
Modeli grupisani po domenu:

- **Identitet i org:** `User`, `Account`, `Session`, `VerificationToken`, `ApiKey`, `Organization`, `OrganizationMember`, `Invitation`.
- **Agenti i tokovi:** `Agent`, `Flow`, `FlowVersion`, `FlowDeployment`, `FlowTrace`, `FlowSchedule`, `ScheduledExecution`, `AgentExecution`, `PipelineRun`, `PipelineMemory`, `PipelineTemplate`, `Template`.
- **Agent runtime/SDK:** `AgentSdkSession`, `ManagedAgentTask`, `AgentCard`, `AgentCallLog`.
- **Knowledge:** `KnowledgeBase`, `KBSource`, `KBChunk`.
- **Memorija i učenje:** `AgentMemory`, `Instinct`, `ModelPerformanceStat`.
- **MCP / integracije:** `MCPServer`, `AgentMCPServer`, `GoogleOAuthToken`.
- **Evals:** `EvalSuite`, `EvalTestCase`, `EvalRun`, `EvalResult`.
- **Konverzacije:** `Conversation`, `Message`.
- **Governance:** `HumanApprovalRequest`, `ApprovalPolicy`, `PolicyDecision`, `AuditLog`, `AgentPermissionGrant`, `AgentSkillPermission`.
- **Ciljevi/misija:** `CompanyMission`, `Goal`, `AgentGoalLink`, `Department`.
- **Heartbeat (autonomija):** `HeartbeatConfig`, `HeartbeatContext`, `HeartbeatRun`.
- **Budžet/troškovi:** `AgentBudget`, `CostEvent`, `BudgetAlert`.
- **Webhooks:** `WebhookConfig`, `WebhookExecution`, `WebhookDeadLetter`.
- **CLI/skills:** `CLIGeneration`, `Skill`.
- **SOMA:** `SomaReviewBatch`, `SomaReviewPost`.
- **Analitika:** `AnalyticsEvent`.

### 6.2 Podsegment: Migracije i seed
- **`prisma/migrations/`** — migracije šeme.
- **`prisma/sql/`** — sirovi SQL (npr. RLS, indeksi).
- **`prisma/seed.ts`** — osnovni seed.
- **`prisma/seed-pipeline-templates.ts`** — seed template-a.
- **`prisma/MIGRATION_GUIDE.md`** — vodič za migracije.

### 6.3 Podsegment: Pristup bazi (kod)
- **`src/lib/prisma.ts`** — singleton Prisma klijent.
- **`src/lib/db/`, `src/lib/database/`** — pomoćni sloj (query helperi, adapteri `@prisma/adapter-pg`).
- **`src/generated/`** — generisani Prisma klijent.

---

<a id="segment-7"></a>
## SEGMENT 7 — Agent orkestracija (A2A, agent-as-tool, SOMA, ECC)

### 7.1 Podsegment: A2A protokol (`src/lib/a2a/`, 6 fajlova)
- **`card-generator.ts`** — generiše Agent Card (capability descriptor).
- **`circuit-breaker.ts`** — prekidač kod kvarova drugog agenta.
- **`rate-limiter.ts`** — ograničavanje poziva.
- **`__tests__/`** — testovi.

### 7.2 Podsegment: Agent kao alat (`src/lib/agents/`)
- **`agent-tools.ts`** — izlaganje agenata kao pozivnih alata.
- **`agent-workspace.ts`** — radni prostor agenta.

### 7.3 Podsegment: ECC — Everything-Claude-Code (`src/lib/ecc/`, 25 fajlova)
- **`meta-orchestrator.ts`** — orkestracija više agenata/skill-ova.
- **`instinct-engine.ts`** — motor instinkata (situacija→greška→ispravka).
- **`skill-composer.ts`, `skill-router.ts`, `skill-parser.ts`, `skill-ingest.ts`** — kompozicija/rutiranje/parsiranje/ingest skill-ova.
- **`sdk-learn-hook.ts`** — hook za učenje iz SDK sesija.
- **`obsidian-adapter.ts`** — integracija sa Obsidian vault-om.
- **`mcp-circuit-breaker.ts`** — prekidač za MCP pozive.
- **`feature-flag.ts`, `types.ts`, `index.ts`** — flagovi, tipovi, API.

### 7.4 Podsegment: SOMA — Self-Organizing Microagent Architecture
- Koncept (iz `SOMA.md`): agent = 3 čvora, jedna odgovornost; evolucija 3→5 čvora; split 5→2×3; instinkti; A2A dubina ≤3; Obsidian vault za deljeno znanje.
- **Kod:** `src/lib/soma/`, `src/app/soma/`, `src/app/api/soma/`; modeli `SomaReviewBatch`/`SomaReviewPost`.
- **Promptovi agenata:** `prompts/trend-intelligence-agent.md`, `prompts/hook-writer-agent.md`, `prompts/content-repurposer-agent.md`.
- **Vault:** `soma-vault/` (Obsidian).
- **Skills:** `skills/soma-run`, `skills/soma-memory-fix`, plus debug skill `soma-agent-debugger/`.

### 7.5 Podsegment: Memorija, ciljevi, heartbeat
- **`src/lib/memory/`** (4) — čitanje/pisanje agent memorije.
- **`src/lib/goals/`, `src/lib/org-chart/`, `src/lib/governance/`** — ciljevi, organizaciona šema, approval engine.
- **`src/lib/heartbeat/`** (4) — autonomni heartbeat (periodična samostalna aktivnost agenta).
- **`src/lib/managed-tasks/`, `src/lib/tasks/`** — upravljani zadaci.

---

<a id="segment-8"></a>
## SEGMENT 8 — Evals & kvalitet

Lokacija: `src/lib/evals/` (**26 fajlova**) + `src/app/evals/` + `src/app/api/evals/`.

### 8.1 Podsegment: Izvršavanje evala
- **`runner.ts`** — pokretanje eval suite-ova.
- **`assertions.ts`, `rag-assertions.ts`** — asercije (opšte + RAG-specifične).
- **`llm-judge.ts`** — LLM kao sudija.
- **`semantic.ts`** — semantičko poređenje.
- **`compare-utils.ts`** — utili za poređenje.

### 8.2 Podsegment: Generisanje i šeme
- **`generator.ts`, `generator-prompts.ts`, `generator-schemas.ts`** — auto-generisanje test slučajeva.
- **`schemas.ts`, `standards.ts`** — šeme i standardi.

### 8.3 Podsegment: Integracije i sigurnost
- **`deploy-hook.ts`, `schedule-hook.ts`** — eval pri deploy-u / po rasporedu.
- **`ssrf-guard.ts`** — zaštita od SSRF u eval pozivima.
- **`__tests__/`** — testovi.

---

<a id="segment-9"></a>
## SEGMENT 9 — SDLC / DevSecOps podsistem

Lokacija: `src/lib/sdlc/` (**43 fajla**) + `src/app/devsecops/` + `src/app/api/sdlc/`. Ovo je „agent koji piše/ispravlja kod".

### 9.1 Podsegment: Orkestracija razvoja
- **`orchestrator.ts`** — glavni SDLC orkestrator.
- **`pipeline-manager.ts`** (+ `.tmp`) — upravljanje pipeline-om.
- **`model-router.ts`** — biranje modela po zadatku.
- **`feedback-loop.ts`** — petlja povratnih informacija.

### 9.2 Podsegment: Razumevanje koda
- **`ast-analyzer.ts`** — AST analiza (`@ast-grep/napi`, `ts-morph`).
- **`code-extractor.ts`, `scope-analyzer.ts`, `module-map.ts`** — ekstrakcija/scope/mapa modula.
- **`codebase-rag.ts`** — RAG nad kodom.
- **`error-parser.ts`** — parsiranje grešaka.

### 9.3 Podsegment: Izmene i kontekst
- **`patch-applier.ts`** — primena patch-eva.
- **`git-integration.ts`** — Git operacije.
- **`pipeline-memory.ts`, `vault-context.ts`** — memorija pipeline-a, vault kontekst.
- **`agent-prompts.ts`, `schemas.ts`, `metrics-collector.ts`** — promptovi, šeme, metrike.

### 9.4 Podsegment: Pomoćni alati za kod
- **`src/lib/ast/`** (2) — AST helperi.
- **`src/lib/lsp/`** (5) — LSP upiti.
- **`src/lib/sandbox/`** (4) — izolovano izvršavanje (E2B).

---

<a id="segment-10"></a>
## SEGMENT 10 — MCP integracija & spoljni servisi

### 10.1 Podsegment: MCP server (`mcp-server/`)
Zaseban paket (TS). Izlaže Agent Studio kao MCP server za spoljne agente.
- **`src/index.ts`** — entry.
- **`src/auth.ts`, `src/oauth.ts`** — autentikacija/OAuth.
- **`src/db.ts`** — pristup bazi.
- **`src/tools/`** (8 fajlova): `agents.ts`, `knowledge.ts`, `evals.ts`, `execution.ts`, `diagnostics.ts`, `mutations.ts`, `a2a.ts`, `f1-f7.ts`.
- **`dist/`, `railway.toml`, `vitest.config.ts`** — build i deploy.

### 10.2 Podsegment: MCP klijentski sloj u aplikaciji (`src/lib/mcp/`, 21 fajl)
- Konekcija na spoljne MCP servere, registar alata, circuit-breaker, izvršavanje alata iz flow-a.

### 10.3 Podsegment: CLI generator (`src/lib/cli-generator/`, 14 + `packages/cli/`)
- Generiše CLI/MCP bridž iz agenta.
- **`packages/cli/`** — samostalni CLI npm paket (`src/`, `dist/`).

### 10.4 Podsegment: Mikroservisi (`services/`)
- **`ecc-skills-mcp/`** (Python) — MCP za ECC skill-ove.
- **`gh-bridge-mcp/`** (Python) — GitHub bridž.
- **`notebooklm-mcp/`** (Node) — NotebookLM integracija.
- **`security-scanner-mcp/`** (Python) — bezbednosno skeniranje.
- **`worker/`** — pozadinski worker (Railway).

### 10.5 Podsegment: Integracioni libovi
- **`src/lib/google-workspace/`** (2), **`src/lib/api/`** (16), **`src/lib/openapi/`** (5), **`src/lib/storage/`** (3, S3), **`src/lib/email/`** (2, Resend), **`src/lib/notifications/`** (6), **`src/lib/upload/`** (2), **`src/lib/image/`** (2), **`src/lib/audio/`** (2).

---

<a id="segment-11"></a>
## SEGMENT 11 — Governance / Security / Safety / Cost

### 11.1 Podsegment: Bezbednost (`src/lib/security/`, 8)
- **`rbac.ts`** — role-based pristup.
- **`prompt-guard.ts`** — zaštita prompta.
- **`audit.ts`** — bezbednosni audit.
- **`magic-numbers.ts`** — konstante/limiti.

### 11.2 Podsegment: Safety (`src/lib/safety/`, 6)
- **`injection-detector.ts`** — detekcija prompt injection-a.
- **`pii-detector.ts`** — detekcija PII.
- **`content-moderator.ts`** — moderacija sadržaja.
- **`audit-logger.ts`** — logovanje.
- **`engine-safety-middleware.ts`** — safety middleware u motoru.

### 11.3 Podsegment: Auth & kriptografija
- **`src/lib/auth.ts`, `src/lib/auth-adapter.ts`** — NextAuth 5 + Prisma adapter.
- **`src/lib/crypto.ts`** — kriptografija (bcryptjs).
- **`src/lib/session/`, `src/lib/sdk-sessions/`** — sesije.
- **`src/lib/rate-limit.ts`, `rate-limit-config.ts`** — rate limiting (Redis).

### 11.4 Podsegment: Governance
- **`src/lib/governance/approval-engine.ts`** — engine za human approval.
- **`src/app/api/approvals/`, `policies/`, `decisions/`** — endpointi.
- Modeli: `ApprovalPolicy`, `PolicyDecision`, `HumanApprovalRequest`, `AuditLog`.

### 11.5 Podsegment: Cost & budget
- **`src/lib/cost/`** (5) — praćenje troškova po pozivu (`tiktoken` za tokene).
- **`src/lib/budget/`** (3) — budžeti i alarmi.
- Modeli: `AgentBudget`, `CostEvent`, `BudgetAlert`.

### 11.6 Podsegment: Compliance i observability
- **`src/lib/gdpr/`** (4) — GDPR (brisanje/eksport podataka).
- **`src/lib/observability/`** (6) — Sentry, tracing, logovi (`sentry.*.config.ts`).
- **`src/lib/logger.ts`** — centralni logger.
- **`src/lib/feature-flags/`** (2) — feature flagovi.

---

<a id="segment-12"></a>
## SEGMENT 12 — Infrastruktura, alati i dokumentacija

### 12.1 Podsegment: Queue & scheduler
- **`src/lib/queue/`** (5) — BullMQ redovi, `worker.ts` (script `pnpm worker`).
- **`src/lib/scheduler/`** (9) — zakazivanje (cron-parser, cronstrue).
- **`src/lib/cache/`** (3), **`src/lib/redis.ts`** — keš/Redis.

### 12.2 Podsegment: Build & runtime konfiguracija
- **`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `knip.json`** — build/lint.
- **`vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`** — testing config.
- **`.env*`** (`.env`, `.env.example`, `.env.local`, `.env.test`) — okruženje.
- **`.mcp.json`** — MCP konfiguracija za agente nad repoom.

### 12.3 Podsegment: Kontejnerizacija i deploy
- **`Dockerfile`, `Dockerfile.worker`, `.dockerignore`** — Docker slike (app + worker).
- **`docker-compose.yml`, `docker-compose.override.yml`** — lokalni stack.
- **`k8s/`** — Kubernetes (base: `deployment`, `service`, `ingress`, `mcp-deployment`, `mcp-service`, `cronjob-evolve`, `cronjob-scheduled`; overlays: `staging`, `production`).
- **`railway.toml`, `railway.worker.toml`, `worker.railway.toml`, `render.yaml`, `nixpacks.toml`, `vercel.json`** — PaaS deploy konfiguracije.

### 12.4 Podsegment: CI/CD i kvalitet
- **`.github/workflows/`** — `ci.yml`, `codeql.yml`, `docker.yml`, `docs.yml`, `release.yml`.
- **`scripts/`** (49 skripti) — automatizacija (pre-push check, migracije, rotacija lozinki, smoke testovi…).
- **`patches/`** — pnpm patch-evi zavisnosti.
- **`benchmarks/`, `k6/`, `load-tests/`, `e2e/`, `test-results/`, `playwright-report/`** — performanse i e2e.

### 12.5 Podsegment: Testiranje (kod)
- **`src/__tests__/`, `src/lib/**/__tests__/`** — unit/integration (Vitest, ~2800+ testova po README badge-u).
- **`e2e/`** — Playwright end-to-end.

### 12.6 Podsegment: Skills (agent capabilities)
- **`skills/`** — `agent-health-check`, `agent-scaffolder`, `instincts-updater`, `kb-sync`, `pipeline-debug`, `rls-rollout`, `safe-agent-builder`, `soma-memory-fix`, `soma-run`, `audit-verify` (+ `.skill` arhive).
- **`.claude/`, `.agents/`, `.codex/`** — konfiguracija agentskih alata nad repoom.

### 12.7 Podsegment: Dokumentacija
- **Koren (.md):** `README.md`, `AGENTS.md`, `CLAUDE.md`, `FEATURES.md`, `CHANGELOG.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `TASKS.md`, `TECH_DEBT.md`, `SPRINT-BOARD.md`, `FIX-LOG.md`.
- **SOMA dokumenti:** `SOMA.md`, `SOMA-CONTEXT.md`, `SOMA-CHANGELOG.md`, `SOMA-MARKETING.md`.
- **Auditi:** `AUDIT-security.md`, `AUDIT-type-safety.md`, `AUDIT-agentshield-*.md`, razne forenzičke `.docx` analize.
- **`docs/`** (38 stavki) — interna dokumentacija.
- **`website/`** — Docusaurus dokumentacioni sajt (`docs/`, `src/`, `build/`).
- **`memory/`** — perzistentni kontekst (`context/`, `projects/`).

---

## Mapa zavisnosti između segmenata (kako se uklapaju)

```
                    ┌─────────────────────────────┐
   Korisnik  ──────▶│  SEGMENT 1: Web/UI (builder) │
                    └──────────────┬──────────────┘
                                   │ HTTP
                    ┌──────────────▼──────────────┐
                    │  SEGMENT 2: API rute          │
                    └──────────────┬──────────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        ▼              ▼           ▼           ▼              ▼
 ┌────────────┐ ┌────────────┐ ┌────────┐ ┌────────────┐ ┌──────────┐
 │ S3 Runtime │ │ S5 Knowledge│ │ S7 A2A │ │ S8 Evals   │ │ S9 SDLC  │
 │  Engine    │◀┤   / RAG     │ │ /SOMA  │ │            │ │ DevSecOps│
 │ (S4 nodes) │ └────────────┘ │ /ECC   │ └────────────┘ └──────────┘
 └─────┬──────┘                └───┬────┘
       │                          │
       ▼                          ▼
 ┌────────────────────────────────────────────────────────────────┐
 │ S6 Data (Prisma/PG) · S10 MCP/servisi · S11 Governance/Security │
 │              S12 Infra (Redis, Queue, Docker, k8s, CI)          │
 └────────────────────────────────────────────────────────────────┘
```

- **Builder (S1)** crta graf → snima preko **API (S2)** u **Prisma (S6)**.
- **Runtime Engine (S3)** učitava graf, izvršava **node handlere (S4)**, koji pozivaju **Knowledge (S5)**, **MCP (S10)**, **druge agente (S7)**.
- **Governance/Security/Cost (S11)** presreće izvršavanje (middleware, approval, budžet).
- **Evals (S8)** i **SDLC (S9)** su specijalizovani potrošači istog motora.
- **Infra (S12)** (Redis, BullMQ, Docker, k8s) nosi async izvršavanje i deploy.

---

## Sažeta tabela: segment → veličina → ključni fajlovi

| # | Segment | Lokacija | Obim | Jezgro |
|---|---------|----------|------|--------|
| 1 | Web/UI | `src/app`, `src/components` | 23 rute, 11 grupa komponenti (85 builder .tsx) | `flow-builder.tsx` |
| 2 | API | `src/app/api` | 35 grupa ruta | `agents/`, `mcp/`, `a2a/` |
| 3 | Runtime Engine | `src/lib/runtime` | 193 TS | `engine.ts` |
| 4 | Node biblioteka | `src/lib/runtime/handlers` | 72 handlera | `index.ts` |
| 5 | Knowledge/RAG | `src/lib/knowledge` | 44 TS | `search.ts`, `ingest.ts` |
| 6 | Data | `prisma`, `src/lib/db` | 63 modela, 1808 lin. | `schema.prisma` |
| 7 | Orkestracija | `a2a`,`agents`,`ecc`,`soma`,`memory`,`heartbeat` | ECC 25, A2A 6 | `meta-orchestrator.ts` |
| 8 | Evals | `src/lib/evals` | 26 TS | `runner.ts`, `llm-judge.ts` |
| 9 | SDLC/DevSecOps | `src/lib/sdlc` | 43 TS | `orchestrator.ts` |
| 10 | MCP/servisi | `mcp-server`, `services`, `packages/cli`, `src/lib/mcp` | MCP 21, 5 servisa | `mcp-server/src/tools` |
| 11 | Governance/Sec | `security`,`safety`,`governance`,`cost`,`budget`,`gdpr` | ~30 TS | `approval-engine.ts` |
| 12 | Infra/Docs | `k8s`,`scripts`,`.github`,`docs`,`website` | 49 skripti, 5 CI | `Dockerfile`, `ci.yml` |

---

*Analiza generisana na osnovu stvarnog stanja repozitorijuma. Brojevi (fajlovi, modeli, node tipovi) izmereni su direktno iz koda.*

---
---

# DRUGI PROLAZ — Dubinska verifikacija i iskren savet

> Cilj ovog prolaza: uhvatiti šta je prvi propustio, i **svaku tvrdnju potvrditi merenjem iz koda** (nula halucinacija).
> Svaki nalaz ispod ima naznačen način provere. Što nije moglo da se potvrdi — nije ni navedeno.

## A. Šta je prvi prolaz PROPUSTIO (novootkriveno, sve verifikovano)

### A.1 `deal-flow-agent/` — zaseban Python (FastAPI) multi-agent podprojekat ⚠️ veliko
Ovo je **kompletna druga aplikacija** unutar repo-a, koju prva analiza uopšte nije pomenula.
- Provereno: `find deal-flow-agent -name '*.py' | wc -l` → **21 Python fajlova**.
- Sadržaj: `backend/main.py`, `backend/config.py`, `backend/database/` (`models.py`, `connection.py`), `backend/routers/` (`deals.py`, `agents.py`, `memos.py`).
- **5 domenskih agenata:** `agents/screening_agent.py`, `financial_agent.py`, `legal_agent.py`, `competitive_agent.py`, `risk_agent.py` (+ `base_agent.py`).
- **Integracije:** `integrations/crunchbase.py`, `integrations/linkedin.py`.
- **Memo generator:** `memo/generator.py`.
- Vlastiti `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `.env.example`.
- **Zaključak:** funkcionalno odvojen proizvod (VC/deal-flow analiza) koji deli repo sa glavnim TS proizvodom.

### A.2 `n8n-workflows/` — eksterna automatizacija
- Provereno: 3 JSON workflow-a + README → `01-slack-bot.json`, `02-github-pr-security-review.json`, `03-weekly-report.json`.

### A.3 `data/security-audits/` — runtime bezbednosni artefakti i backup tokova
- Provereno: sadrži žive izveštaje (`scan-2026-06-13.json`, `scan-2026-06-14.json`, `latest.md`, `STATUS.txt`), runbook (`RUNBOOK-status-refresh.md`), dizajn (`SECURITY-SUPERVISOR-design.md`) i **backup-e produkcionih flow-ova** (`*-flow.BACKUP-*.json`: trend-intelligence, content-creator, xtrend, lead-scorer, saa).
- Napomena: ovo je operativni izlaz, ne izvorni kod — ali se **commit-uje u repo** (vidljivo u `git status`).

### A.4 Skill paketi na korenu repo-a
- Provereno: `agent-architect/` (SKILL.md + `reference/`: patterns, soma-truth, context-engineering, audit-checklist, anthropic-citations) i `soma-agent-debugger/` (SKILL.md + reference). Plus `skills/` folder (10 skill-ova) i `.skill` arhive na korenu.

### A.5 `reports/` — 30 fazno-analitičkih izveštaja
- Provereno: `ls reports | wc -l` → **30** (npr. `phase1-…`, `phase10-…`, `phase11-…`, `Audit-V2-Verification-…`, `agent-dashboard.html`).

### A.6 `src/data/` — sadržaj template-a i starter flow-ova (jezgro „250 template-a")
- Provereno mereći polja `total` u JSON-u:
  - `agent-templates.json` → **`"total": 221`** (1.5 MB).
  - `ecc-agent-templates.json` → **`"total": 30`**.
  - `starter-flows.ts` → 271 `id:` referenci (92 KB).
  - `devsecops-kb/` → knowledge base za DevSecOps.

### A.7 Ostalo propušteno
- `memory/` → `context/debugging-patterns.md`, `projects/tdd-workflow.md` (perzistentni kontekst agenta).
- `sdlc-prompts/` (268 KB) i `prompts/` (3 SOMA agenta) — biblioteka promptova.
- `src/lib/db/rls-middleware.ts` — RLS (multi-tenant izolacija), parcijalno (vidi C.1).

## B. Verifikacija brojeva iz prvog prolaza (sve POTVRĐENO ✅)

| Tvrdnja (1. prolaz) | Komanda provere | Rezultat |
|---|---|---|
| 63 Prisma modela | `grep -c '^model ' schema.prisma` | **63 ✅** |
| schema 1808 linija | `wc -l schema.prisma` | **1808 ✅** |
| 72 node handlera | `ls handlers/*.ts \| wc -l` | **72 ✅** |
| 193 fajla u runtime | `find runtime -name '*.ts'` | **193 ✅** |
| 44 knowledge / 26 evals / 43 sdlc / 25 ecc / 21 mcp | `find … \| wc -l` | **44/26/43/25/21 ✅** |
| 35 API grupa / 85 builder .tsx / 49 skripti | `ls … \| wc -l` | **35/85/49 ✅** |
| 8 mcp-server tool fajlova | `find mcp-server/src/tools` | **8 ✅** |

**Ispravka:** README badge tvrdi **„Templates-250"**, ali stvarni zbir je **221 (agent) + 30 (ecc) = 251**, dok `FEATURES.md` navodi 221. Brojka „250" je zaokruženje/nekonzistentnost u dokumentaciji — ne i greška u kodu.

## C. Rizici i higijena — potvrđeni nalazi (iz koda i vlastitih audita projekta)

### C.1 🔴 VISOK: Multi-tenant izolacija (RLS) je samo delimična
Izvor: `TECH_DEBT.md` (vlastiti dokument projekta), potvrđeno protiv šeme.
- RLS pokriva **samo `Agent`** tabelu (jedina sa pravom `organizationId` kolonom).
- API rute **nisu** obavijene `withOrgContext()` → `❌ TODO` u TECH_DEBT.
- Tabele bez izolacije: `Flow, KnowledgeBase, WebhookConfig, EvalSuite, EvalRun, EvalResult, AuditLog, ApiKey, MCPServer, AgentSkillPermission`.
- Prisma v6 uklonio `$use()` → middleware radi samo u testovima.
- **Posledica ako je proizvod SaaS:** rizik curenja podataka između organizacija. Ovo je najozbiljnija stavka.

### C.2 🟠 SREDNJI: Nevalidirani javni JSON-RPC ulazi
Izvor: `AUDIT-type-safety.md` (vlastiti audit, 2026-06-02), KRITIČNO K-001/K-003.
- `api/agents/[agentId]/a2a/route.ts` i `api/mcp/agent-studio/route.ts` rade `await req.json() as T` bez Zod validacije na **javnim** endpointima.
- Šire: **206** pojava `any`/`as any` u `src/` (mereno), uz 13 `@ts-ignore/@ts-expect-error`.

### C.3 🟠 SREDNJI: Higijena repozitorijuma (clutter)
Sve provereno listanjem:
- **189 stavki na korenu**, od toga **70 `.md`/`.docx`** fajlova → koren je preopterećen.
- Backup/temp/dump kruft na korenu: `*-backup-*.txt/json/js`, `agents_dump.json`, `_tmp_18_*`, `Untitled.base/canvas`, `.env.vercel.DEPRECATED`.
- **`.tmp` fajlovi unutar `src/`** (nisu u Git-u, ali zbunjuju): npr. `src/lib/sdlc/pipeline-manager.ts.tmp`, više `api/.../route.ts.tmp`.
- **Pravi duplikat handlera:** `src/lib/runtime/handlers/call-agent-handler 2.ts` pored `call-agent-handler.ts`.
- „` 2.`" duplikati u `src/generated/prisma/` → tipičan artefakt cloud-sync konflikta (iCloud/Dropbox); **nisu u Git-u** (`src/generated/` je u `.gitignore`).
- Radni direktorijum ~**922 MB** bez `node_modules/.git/.next` (od toga 77 MB je generisani Prisma klijent, ostalo slike slajdova, `.docx`, dumpovi, `data/` backupi).

### C.4 ✅ POZITIVNO (takođe verifikovano — da bude pošteno u oba smera)
- **Tajne nisu u Git-u:** `.env*` su uredno u `.gitignore`; `git ls-files .env` → nije praćen. Dobra praksa.
- **Disciplina testiranja je jaka:** 316 test fajlova; `FIX-LOG.md` pokazuje „handlers suite: 1077/1077 PASS", eval suite-ovi 10/10 post-deploy. Pipeline/agent deo je rigorozno pokriven.
- **Aktivan, uredan razvoj:** `main` grana, commit istorija sa PR-ovima (#197–#201), CI (5 workflow-a), CodeQL, Dependabot.
- 29 necommit-ovanih izmena u radnom stablu (uglavnom novi `.md` i `data/` artefakti) — normalno za work-in-progress.

## D. Iskren savet (prioritizovano)

**Najpre ono što bih ti rekao da smo kolege:** ovo je impresivno ambiciozan i tehnički ozbiljan projekat — vizuelni agent builder sa pravim runtime-om, RAG-om, evalima i SDLC petljom je nešto što obično radi tim, a ne pojedinac. Kvalitet jezgra (testovi, FIX-LOG, eval disciplina) je iznad proseka. Problemi nisu u sposobnosti — nego u **obimu i fokusu**.

1. **Reši multi-tenant izolaciju pre bilo kakvog SaaS launch-a (C.1).** Ako više organizacija deli bazu, dovrši `organizationId` + `withOrgContext()` na prioritetnim rutama (`/api/agents`, `/api/flows`, `/api/knowledge-bases`). Ovo je jedino što bih nazvao „blokator za produkciju sa pravim korisnicima".

2. **Zatvori javne ulaze Zod-om (C.2).** A2A i MCP `route.ts` su pozivani spolja — validacija ulaza je i sigurnost i stabilnost. Brz, visok-uticaj fix.

3. **Odluči o obimu — ovo je možda najvažniji savet.** U repo-u žive: glavni TS proizvod + `deal-flow-agent` (zaseban Python proizvod) + 4 Python mikroservisa + n8n + SOMA + ECC + SDLC. Za jednog/malog vlasnika to je puno frontova. Iskreno: **izdvoji `deal-flow-agent/` u zaseban repozitorijum** (svoj je proizvod, svoj Docker) — smanjuje kognitivno opterećenje i veličinu repo-a. Zadrži u glavnom repo-u samo ono što čini Agent Studio.

4. **Očisti koren (C.3) — pola dana posla, velika korist.** Predlog strukture:
   - `docs/audits/` ← sve `AUDIT-*`, `Forenzicka-*`, `*-Analysis-*.docx`.
   - `docs/plans/` ← `*-Plan-*`, `sprint*-*.md`, `tok-*`, `opcija-*`.
   - `archive/backups/` ← `*-backup-*`, `*_dump.json`, `Untitled.*`, `_tmp_*`.
   - Obriši `*.ts.tmp` iz `src/` i duplikat `call-agent-handler 2.ts` (proveri koji je aktivan u `handlers/index.ts` pre brisanja).
   - Dodaj u `.gitignore`: `*.tmp`, `* 2.*` (sync-konflikt obrazac), `*_dump.json`.

5. **Uskladi dokumentaciju sa kodom (C.2 sitnica).** README badge „250 templates" → stvarno 221+30. Male nekonzistentnosti potkopavaju poverenje u ostatak README-a; postavi badge na stvarnu brojku ili je generiši skriptom.

6. **Razmisli o `as any` dugu (206 pojava).** Ne mora odjednom — ali uvedi pravilo „nema novih `as any`" i postepeno tipiziraj najrizičnije (granice podataka: API ulaz, MCP, parseri).

**Šta NE bih dirao:** runtime engine, node handlere i eval framework — tu je disciplina očigledno dobra, ne popravljaj što nije pokvareno.

## E. Konačan verdikt verifikacije

Prvi prolaz je bio **tačan u svemu što je tvrdio** (svi brojevi potvrđeni), ali **nepotpun** — propustio je celu `deal-flow-agent` Python aplikaciju, `n8n-workflows`, `data/security-audits`, `reports/`, korenske skill pakete i sadržaj `src/data` template-a. Uz ovu dopunu, pokrivenost analize je kompletna do nivoa fajlova/modula. Nijedna tvrdnja u ovom dokumentu nije pretpostavljena — sve je izmereno iz repo-a 2026-06-14.

