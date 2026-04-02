# Agent Studio — Kompletan katalog feature-a

> **Svrha:** Referentni dokument za Claude Code sesije. Sve što projekat ima — na jednom mestu.
> **Ažurirano:** April 2026 (dubinska analiza koda)
> **Statistike:** 55 node tipova · 89+ API routes · 85+ UI komponenti · 36 Prisma modela · 2502+ unit testova

---

## 1. FLOW BUILDER — Vizuelni editor

**Lokacija:** `src/app/builder/[agentId]/page.tsx`, `src/components/builder/`

**Šta radi:**
- ReactFlow (@xyflow/react v12) vizuelni editor za kreiranje AI workflow-ova
- Drag-and-drop dodavanje nodova iz node picker-a
- Real-time property panel za konfiguraciju svakog noda
- Version history sidebar sa diff prikazom i rollback opcijom
- Deploy dialog sa sandbox testom pre produkcije
- Debug mode sa breakpoint-ima, step-through, variable watch
- Timeline vizualizacija execution trace-a

**Ključne komponente:**
- `flow-builder.tsx` — glavni editor
- `node-picker.tsx` — paleta sa 55 tipova nodova
- `property-panel.tsx` — desni sidebar za konfiguraciju
- `version-panel.tsx` — istorija verzija
- `diff-view.tsx` — poređenje verzija
- `debug-toolbar.tsx`, `debug-panel.tsx`, `debug-timeline.tsx` — debug alati
- `deploy-dialog.tsx` — deploy flow

---

## 2. SVI NODE TIPOVI (55)

**Lokacija:** `src/types/index.ts` (definicije), `src/lib/runtime/handlers/` (logika), `src/components/builder/nodes/` (prikaz)

### Kontrola toka
| Node | Handler | Opis |
|------|---------|------|
| `message` | message-handler.ts | Prikazuje tekst korisniku. Podržava `{{variable}}` interpolaciju |
| `button` | button-handler.ts | Dugmad za routing — korisnik bira sledeći korak |
| `capture` | capture-handler.ts | Hvata korisnički unos i čuva u varijablu |
| `condition` | condition-handler.ts | If/else grananje na osnovu izraza |
| `switch` | switch-handler.ts | Multi-branch routing (kao JS switch) |
| `set_variable` | set-variable-handler.ts | Postavlja/ažurira varijablu u kontekstu |
| `end` | end-handler.ts | Završava flow |
| `goto` | goto-handler.ts | Bezuslovni skok na drugi node |
| `wait` | wait-handler.ts | Pauza (fiksno vreme ili cron) |
| `loop` | loop-handler.ts | Iteracija (array, broj, uslov). Limit: 50 iteracija |
| `parallel` | parallel-handler.ts + parallel-streaming-handler.ts | Paralelno izvršavanje grana + merge |
| `retry` | retry-handler.ts | Exponential backoff retry wrapper |

### AI i LLM
| Node | Handler | Opis |
|------|---------|------|
| `ai_response` | ai-response-handler.ts + streaming | LLM odgovor sa RAG, MCP alatima, agent tools. 20-step tool limit |
| `ai_classify` | ai-classify-handler.ts | Klasifikacija teksta u kategorije sa confidence score-om |
| `ai_extract` | ai-extract-handler.ts | Strukturovana ekstrakcija podataka sa Zod validacijom |
| `ai_summarize` | ai-summarize-handler.ts | Sumarizacija teksta ili konverzacije |
| `structured_output` | structured-output-handler.ts | Tipizovan JSON output sa Zod schema validacijom |
| `plan_and_execute` | plan-and-execute-handler.ts | ReAct-style planiranje — moćan model planira, jeftini izvršavaju |
| `reflexive_loop` | reflexive-loop-handler.ts | Self-correcting loop. Max 5 iteracija, konfigurabilan prag kvaliteta |
| `semantic_router` | semantic-router-handler.ts | Routing na osnovu semantičke sličnosti poruka sa intentima |

### Znanje i pretraga
| Node | Handler | Opis |
|------|---------|------|
| `kb_search` | kb-search-handler.ts | Hybrid search (semantic + BM25). Dynamic top-k. Analytics tracking |
| `web_search` | web-search-handler.ts | Web pretraga via Tavily ili Brave Search API |
| `web_fetch` | web-fetch-handler.ts | HTTP fetch + HTML/JSON parsing (cheerio). SSRF zaštita |
| `browser_action` | browser-action-handler.ts | Playwright headless browser automation |
| `embeddings` | embeddings-handler.ts | Generisanje embeddings-a (OpenAI, custom modeli) |

### Memorija
| Node | Handler | Opis |
|------|---------|------|
| `memory_write` | memory-write-handler.ts | Čuva podatke u agent persistent memory (sa embedding-om) |
| `memory_read` | memory-read-handler.ts | Čita iz agent memorije (key/category/semantic search) |

### Integracije
| Node | Handler | Opis |
|------|---------|------|
| `api_call` | api-call-handler.ts | HTTP pozivi (GET/POST/PUT/DELETE). Auth headers, retry, JSON mapping |
| `mcp_tool` | mcp-tool-handler.ts | Deterministički MCP tool poziv po imenu |
| `mcp_task_runner` | mcp-task-runner-handler.ts | Long-running MCP task sa progress tracking-om |
| `call_agent` | call-agent-handler.ts | Agent-to-Agent (A2A) poziv. Circuit breaker, rate limit, depth limit (3) |
| `email_send` | email-send-handler.ts | Slanje emaila via konfigurisani SMTP ili servis |
| `notification` | notification-handler.ts | Multi-channel notifikacije (Slack, Discord, email, webhook) |
| `webhook` | webhook-handler.ts | Outbound webhook sa retry i idempotency |
| `webhook_trigger` | webhook-trigger-handler.ts | Inbound webhook entry point. Kreira WebhookConfig u DB |
| `schedule_trigger` | schedule-trigger-handler.ts | Cron/interval trigger entry point. Kreira FlowSchedule u DB |
| `database_query` | database-query-handler.ts | SQL izvršavanje (MySQL/PostgreSQL) sa limitima |
| `file_operations` | file-operations-handler.ts | Čitanje/pisanje fajlova (S3, lokalni storage) |
| `image_generation` | image-generation-handler.ts | Generisanje slika (FAL.ai, Stability AI/DALL-E) |
| `speech_audio` | speech-audio-handler.ts | TTS (Eleven Labs) i STT (Deepgram) |
| `multimodal_input` | multimodal-input-handler.ts | Prihvatanje slika, audio, fajlova od korisnika |
| `desktop_app` | desktop-app-handler.ts | Desktop automation (zahteva instaliranog agenta) |
| `google_workspace` | (via MCP proxy) | Google Sheets, Docs, Drive, Calendar, Gmail |

### Transformacija podataka
| Node | Handler | Opis |
|------|---------|------|
| `format_transform` | format-transform-handler.ts | JSON↔CSV↔XML↔YAML konverzija |
| `function` | function-handler.ts | Sandboxed JS/TS izvršavanje (vm2, 5s timeout) |
| `python_code` | python-code-handler.ts | Python izvršavanje u subprocess sandboxu |
| `code_interpreter` | code-interpreter-handler.ts | Arbitrary code execution sa output capture |

### Kvalitet i evaluacija
| Node | Handler | Opis |
|------|---------|------|
| `evaluator` | evaluator-handler.ts | AI-powered content evaluacija sa criteria scoring |
| `trajectory_evaluator` | trajectory-evaluator-handler.ts | Evaluacija agent reasoning trajectory (korak-po-korak) |
| `guardrails` | guardrails-handler.ts | Content moderation, PII detekcija, prompt injection odbrana |
| `human_approval` | human-approval-handler.ts | Pauzira flow i čeka human decision |
| `cost_monitor` | cost-monitor-handler.ts | Token budget tracking + alerting. Adaptive mode za auto-downgrade |

### Napredne arhitekture
| Node | Handler | Opis |
|------|---------|------|
| `ab_test` | ab-test-handler.ts | A/B traffic splitting sa weighted routing |
| `aggregate` | aggregate-handler.ts | Merge rezultata iz paralelnih grana |
| `cache` | cache-handler.ts | Redis caching sa TTL i sourceHandle routing-om |
| `learn` | learn-handler.ts | ECC pattern extraction iz AgentExecution istorije |

---

## 3. RUNTIME ENGINE

**Lokacija:** `src/lib/runtime/`

| Fajl | Opis |
|------|------|
| `engine.ts` | Sinhroni execution loop. MAX_ITERATIONS=50, MAX_HISTORY=100 |
| `engine-streaming.ts` | Streaming varijanta — NDJSON ReadableStream output |
| `stream-protocol.ts` | StreamChunk encode/decode/writer. Tipovi: message, stream_start/delta/end, done, error |
| `context.ts` | Load/save conversation context iz DB |
| `template.ts` | `{{variable}}` interpolacija. Podržava nested paths i bracket notation |
| `debug-controller.ts` | Debug session state machine (breakpoints, step, resume, inspect) |
| `python-executor.ts` | Python execution via Pyodide WASM worker |
| `workers/pyodide-node-worker.js` | Node.js Worker thread sa Pyodide |
| `types.ts` | RuntimeContext, ExecutionResult, NodeHandler, StreamChunk tipovi |
| `handlers/index.ts` | Registry svih 55 handlera |

**Sigurnosni limiti:** MAX_ITERATIONS=50 · MAX_HISTORY=100 · function timeout 5s · Python timeout 30s

---

## 4. CHAT INTERFEJS

**Lokacija:** `src/app/chat/[agentId]/page.tsx`, `src/components/chat/`

- Streaming chat sa NDJSON protokolom
- `use-streaming-chat.ts` hook — line-buffered NDJSON parser, AbortController (1800s timeout)
- Pipeline progress prikaz za multi-agent workflow-ove
- Prikaz citata iz Knowledge Base
- `pipeline-progress.tsx` — real-time progress indikator
- `plot-renderer.tsx` — Recharts vizualizacije u chat output-u
- Embed widget podrška (`/embed/[agentId]`)
- Public embed.js script za ugradnju na spoljne sajtove

---

## 5. KNOWLEDGE BASE (RAG Pipeline)

**Lokacija:** `src/lib/knowledge/`, `src/app/knowledge/[agentId]/page.tsx`

### Ingestion
- **Parseri:** PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), XLSX (xlsx), PPTX (JSZip), plain text
- **Chunking:** 5 strategija — recursive, markdown, code, sentence, fixed (400 tokena, 20% overlap)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dim), text-embedding-3-large (3072 dim)
- **Deduplication:** SHA-256 content hash, pronalazi duplicate chunks pre embedding-a
- **Progress tracking:** 6 faza (parsing→chunking→dedup→embedding→storing→complete) u bazi
- **Max file:** 10MB, dozvoljeni tipovi: PDF/DOCX/XLSX/CSV/PPTX

### Search
- **Hybrid search:** semantic (pgvector cosine) + BM25 keyword → RRF fusion (70% semantic, 30% BM25)
- **HNSW index:** m=16, ef_construction=64. Dynamic efSearch (40/60/100 za kratke/srednje/duge upite)
- **GIN index:** Full-text search za BM25
- **Threshold:** 0.25 similarity minimum
- **Dynamic top-k:** 5 za kratke upite, 8 za duže
- **Parent document retrieval:** vraća širi kontekst oko matched chunks

### Napredne funkcije
- **Query transformation:** HyDE (hypothetical document embedding), multi-query expansion
- **Reranking:** LLM rubric (deepseek-chat) ili Cohere Rerank v3.5
- **Context ordering:** relevance, lost-in-middle, chronological, diversity (MMR-like)
- **Metadata filtering:** 10 operatora (eq/neq/gt/gte/lt/lte/in/nin/contains/exists)
- **Embedding cache:** Redis 600s TTL. Semaphore: max 3 concurrent embedding poziva
- **Drift detection:** detektuje mismatch embedding modela
- **RAGAS evaluation:** faithfulness, contextPrecision, contextRecall, answerRelevancy
- **Analytics:** source/chunk stats, token distribucija, top retrieved chunks
- **Maintenance:** dead chunk cleanup, scheduled re-ingestion

---

## 6. WEBHOOKS (Inbound)

**Lokacija:** `src/lib/webhooks/`, `src/app/webhooks/[agentId]/page.tsx`

- **Standard Webhooks spec:** HMAC-SHA256, x-webhook-id/timestamp/signature headers, 5-min timestamp window
- **Idempotency:** @@unique na WebhookExecution.idempotencyKey — duplikat = 409
- **Event filtering:** po tipu eventa (GitHub, Slack, Stripe, generic)
- **Body/header mapping:** JSONPath, dot notation, bracket notation
- **Rotation:** `POST .../rotate` generiše novi HMAC ključ
- **Replay:** re-izvršava webhook sa originalnim payload-om
- **Execution log:** status, payload, duration, replay chain
- **Rate limit:** 60 req/min po webhookId
- **Provider presets:** GitHub, Stripe, Slack, Generic (pre-konfigurisani maperi)
- **Slack URL verification:** automatski odgovara na challenge pre signature check-a
- **UI:** Dva panela — lista + detalj sa Executions/Configuration/Test tabovima

---

## 7. SCHEDULED FLOWS

**Lokacija:** `src/lib/scheduler/`, API: `/api/agents/[agentId]/schedules`

- **Tipovi:** CRON (5-field), INTERVAL (1-10080 min), MANUAL
- **IANA timezone podrška**
- **Preview:** sledeći N vremena izvršavanja za dati cron izraz
- **Execution history:** status, duration, tokenUsage, errorMessage po execuciji
- **Failure notifications:** multi-channel upozorenja pri consecutive failure-ima
- **Auto-sync:** schedule_trigger node → FlowSchedule DB zapis pri deploy-u
- **Railway cron:** `/api/cron/trigger-scheduled-flows` — CRON_SECRET zaštita
- **Stats API:** total runs, success rate, avg duration

---

## 8. AGENT EVALS (Testing Framework)

**Lokacija:** `src/lib/evals/`, `src/app/evals/[agentId]/page.tsx`

### 12 tipova asercija (3 sloja)
| Sloj | Tip | Opis |
|------|-----|------|
| L1 Deterministic | exact_match | Tačno poklapanje stringa |
| L1 | contains | Sadrži substring |
| L1 | icontains | Case-insensitive contains |
| L1 | not_contains | Ne sadrži |
| L1 | regex | Regex poklapanje |
| L1 | starts_with | Počinje sa |
| L1 | json_valid | Validan JSON |
| L1 | latency | Vreme odgovora ispod praga |
| L2 Semantic | semantic_similarity | Cosine sličnost via OpenAI embedding (prag 0.8) |
| L3 LLM-Judge | llm_rubric | Custom criteria scoring (0-1) |
| L3 | kb_faithfulness | Hallucination detekcija vs KB |
| L3 | relevance | Odgovara li na pitanje |

### Features
- Auto-generisanje test case-ova iz system prompt-a i konverzacija
- A/B poređenje (po flow verziji ili modelu)
- CSV export rezultata (po run-u ili suite-u)
- runOnDeploy flag — automatski pokreće posle svakog deploy-a
- Scheduled evals (cron)
- Eval standards katalog sa pre-built assertion template-ima
- Trend chart (Recharts LineChart) za score kroz vreme
- Limiti: 20 suites/agent, 50 test cases/suite, 1 running run/suite

---

## 9. CLI GENERATOR (MCP Bridge)

**Lokacija:** `src/lib/cli-generator/`, `src/app/cli-generator/page.tsx`

- **6 faza:** analyze → design → implement → test → document → publish
- **Dual target:** Python (FastMCP) ili TypeScript (Node.js MCP SDK)
- **Generisani fajlovi Python (10):** main.py, bridge.py, server.py, __init__.py, conftest.py, test_bridge.py, test_server.py, requirements.txt, pyproject.toml, README.md
- **Generisani fajlovi TypeScript (8):** index.ts, bridge.ts, server.ts, bridge.test.ts, server.test.ts, package.json, tsconfig.json, README.md
- **Auto-fix engine:** automatski popravlja česte greške generisanog koda
- **Python validator:** proverava FastMCP import, @mcp.tool, mcp.run() posle generate-a
- **TypeScript validator:** 8 validacionih pravila za MCP SDK output
- **Stuck detection:** STUCK_THRESHOLD_MS = 5 min → AlertTriangle u UI
- **Auto-resume:** frontend detektuje stuck i automatski resume-uje
- **Live file preview:** SWR polling na /files tokom generisanja
- **Download:** ZIP arhiva generisanih fajlova
- **Publish:** registruje bridge kao MCP server u korisnikov nalog

---

## 10. ECC INTEGRACIJA (Everything-Claude-Code)

**Lokacija:** `src/lib/ecc/`, `services/ecc-skills-mcp/`

- **29 ECC agent template-a** u `src/data/ecc-agent-templates.json`
- **60+ skills** ingested i vektorizovani u KB
- **Skills Browser** na `/skills` sa search + faceted filter (jezik, kategorija, agent)
- **Meta-Orchestrator:** LLM-based task routing ka odgovarajućem agentu
- **Instinct sistem:** pattern extraction iz AgentExecution istorije → confidence 0-1 → promovišu se u skills pri >0.85
- **Learn node:** hvata patterne iz korisnikove interakcije
- **ECC Skills MCP server:** poseban Railway servis (Python FastMCP, port 8000)
  - `get_skill(name)`, `search_skills(query, tag?)`, `list_skills(language?)`
  - asyncpg connection pool (min=2, max=10)
  - **TRENUTNO: numReplicas=1 (SPOF — videti SAAS-MIGRATION-PLAN.md Faza 0)**
- **Feature flag:** `ECC_ENABLED` env var (default: false)
- **Evolve API:** `/api/skills/evolve` — AI klasteruje instinkte i generiše novi SKILL.md

---

## 11. MCP (Model Context Protocol)

**Lokacija:** `src/lib/mcp/`

- **Transporti:** Streamable HTTP (primarni) + SSE (backward compat)
- **Connection pool:** MAX_POOL_SIZE=50, IDLE_TTL=5min, auto-cleanup 60s
- **Graceful degradation:** ako MCP server ne odgovori — AI nastavlja bez alata
- **Tool filtering:** per-agent enabledTools array — samo odabrani alati se prosleđuju AI-u
- **Featured servers:** pre-konfigurisani MCP serveri (GitHub, Playwright, itd.)
- **ECC Skills MCP:** skills kao MCP resursi (`kb://agent-id/skill-name`)
- **Google Workspace proxy:** `/api/mcp/proxy/google-workspace/[tokenId]` — OAuth token aware

---

## 12. AGENT-AS-TOOL ORCHESTRACIJA

**Lokacija:** `src/lib/agents/agent-tools.ts`

- Konvertuje sibling agente u Vercel AI SDK tool definicije
- AI dinamički odlučuje koji sub-agent pozvati na osnovu konteksta
- **Timeout profili (AGENT_TIMEOUT_PROFILES):**
  - fast (45s): reality checker, validator, linter
  - standard (120s): research, discovery, product, analysis
  - slow (150s): architect, design, plan, spec
  - very-slow (180s): code, generate, implement, engineer
  - default (120s): ostalo
- **Per-agent override:** `expectedDurationSeconds` u Agent modelu
- **Zaštita:** circuit breaker + rate limiter + circular call detekcija + depth limit (3) + audit log
- **stopWhen:** stepCountIs(20) za multi-step tool calling

---

## 13. A2A (Agent-to-Agent) PROTOKOL

**Lokacija:** `src/lib/a2a/`

- **Google A2A v0.3 spec** — AgentCard sa JSON-LD
- **AgentCard:** name, description, skills, inputModes, outputModes, capabilities
- **Circuit breaker:** CLOSED/OPEN/HALF_OPEN. Konfigurabilan prag failures
- **Rate limiter:** per-agent call rate limiting
- **Distributed tracing:** traceId, spanId, parentSpanId u AgentCallLog
- **Discovery:** `/api/a2a/agents` — javni katalog dostupnih agenata
- **Agent Call Monitor UI:** `src/components/a2a/agent-call-monitor.tsx`
- **Stats API:** `/api/agent-calls/stats`

---

## 14. FLOW VERSIONING & DEPLOY

- Immutable snapshots pri svakom save-u (30s throttle, skip ako se ništa nije promenilo)
- Lifecycle: DRAFT → PUBLISHED → ARCHIVED (samo jedan PUBLISHED u jednom trenutku)
- Deploy: archivira stari PUBLISHED, publishuje novi, update Flow.activeVersionId, kreira FlowDeployment — sve u jednoj transakciji
- Rollback: kreira NOVU verziju sa starim sadržajem (non-destructive), zatim deploye
- Diff engine: poredi nodove po ID-u, edges po ID-u, varijable po imenu; ignoriše pomeranje nodova <10px
- Sandbox test pre deploy-a: `/api/agents/[agentId]/flow/versions/[versionId]/test`
- Deploy hook: automatski pokreće eval suites sa runOnDeploy=true

---

## 15. HUMAN APPROVAL WORKFLOW

- `human_approval` node pauzira flow i čeka human decision
- HumanApprovalRequest model: PENDING → APPROVED/REJECTED/EXPIRED
- `/api/approvals` — lista pending zahteva
- `/api/approvals/[requestId]/respond` — approve/reject

---

## 16. AGENT MARKETPLACE / DISCOVERY

**Lokacija:** `src/app/discover/page.tsx`, `/api/agents/discover`

- Faceted search: kategorija, tag, model, sortiranje, scope (public/mine/all)
- 4 paralelne Prisma query-je (agenti, count, category stats, tag agregacija)
- 23 kategorije (uključujući marketplace-only)
- Debounced search 300ms
- Agent model fields: `category String?`, `tags String[]`, `isPublic Boolean`

---

## 17. TEMPLATES (221 template-a)

**Lokacija:** `src/data/agent-templates.json`, `src/app/templates/page.tsx`

- 221 template-a u 19 kategorija
- Kategorije pokrivene: customer-support, coding, data, finance, hr, sales, research, writing, itd.
- Starter flows za odabrane template-e (pre-populated 3-5 nodova)
- Browse Templates tab u "New Agent" dialogu

---

## 18. ANALYTICS DASHBOARD

**Lokacija:** `src/app/analytics/page.tsx`, `/api/analytics`

- Response time metrike po agentu i modelu
- KB search statistike
- Conversation counts i token usage
- Cost breakdown (USD)
- TTFB (Time To First Byte) tracking
- SWR-based real-time refresh
- Recharts vizualizacije

---

## 19. DEVSECOPS PIPELINE

**Lokacija:** `src/app/devsecops/page.tsx`

- Interaktivna checklist za DevSecOps setup
- Arhitekturni dijagram
- Integrisano sa OWASP standardima

---

## 20. AUTENTIKACIJA I BEZBEDNOST

**Lokacija:** `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/security/`, `src/lib/safety/`

### Auth
- NextAuth v5 (beta.30), JWT strategija, 24h max age
- Provajderi: GitHub OAuth + Google OAuth (oba kondicionalna na env vars)
- CSRF Origin header check u middleware-u za POST/PUT/PATCH/DELETE
- HTTPOnly, SameSite=lax, Secure (prod) kolačići

### Token encryption
- `src/lib/auth-adapter.ts` — AES-256-GCM enkripcija OAuth tokena pre čuvanja u DB
- `src/lib/crypto.ts` — kriptografski utilities

### API zaštita
- `requireAuth()` i `requireAgentOwner()` u svakom API route-u
- Body limit: 1MB default (`src/lib/api/body-limit.ts`)
- SSRF zaštita: validateExternalUrlWithDNS() sa private IP blocklist-om
- File upload: whitelist ekstenzija + MIME type validacija

### Security headers (`src/lib/api/security-headers.ts`)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy
- **NEDOSTAJE: Content-Security-Policy (CSP) — videti SAAS-MIGRATION-PLAN.md Faza 3**

### RBAC (`src/lib/security/rbac.ts`)
- READ(1), EXECUTE(2), ADMIN(3) hijerarhija
- `checkSkillAccess(agentId, skillId, level)` — postoji ali se NE POZIVA u handler-ima
- **Problem: RBAC je implementiran ali nije enforced — videti SAAS-MIGRATION-PLAN.md Faza 0**

### Safety middleware (`src/lib/safety/`)
- Pre-AI: prompt injection detekcija (pattern matching)
- Post-AI: PII redakcija (email, telefon, SSN, kreditna kartica, IP)
- Content moderation via Azure Content Safety (opcionalno)
- AuditLog za safety evente

---

## 21. OBSERVABILITY

**Lokacija:** `src/lib/observability/`, `src/instrumentation.ts`

- **OpenTelemetry:** custom implementacija (ne @opentelemetry/sdk-node)
- `tracer.ts` — startSpan(), OTLP push. gen_ai.* semantic conventions (AAIF 2026)
- `metrics.ts` — counters/histograms. 30s flush interval ka OTLP endpoint-u
- **Opcionalno:** radi samo ako je OTEL_EXPORTER_OTLP_ENDPOINT setovan
- **PROBLEM: treba biti obavezan za SaaS — videti SAAS-MIGRATION-PLAN.md Faza 0**
- `src/lib/logger.ts` — strukturirani JSON logger sa redakcijom sensitive podataka
- `AuditLog` model u Prisma — postoji ali je nedovoljno korišćen

---

## 22. GOOGLE WORKSPACE INTEGRACIJA

**Lokacija:** `src/lib/google-workspace/`

- OAuth 2.1 + PKCE flow
- Podržane usluge: Sheets, Docs, Drive, Calendar, Gmail
- `GoogleOAuthToken` model za čuvanje token-a po korisniku+emailu
- Auto-refresh pre isteka token-a
- MCP proxy: `/api/mcp/proxy/google-workspace/[tokenId]`

---

## 23. NOTION INTEGRACIJA

**Lokacija:** `src/app/api/auth/oauth/notion/`

- OAuth flow za Notion
- Notion stranice/baze podataka kao KB sources ili agent output targeti

---

## 24. OBSIDIAN INTEGRACIJA

**Lokacija:** `src/lib/ecc/obsidian-adapter.ts`, `/api/integrations/obsidian`

- **STATUS: Stub** — interface definisan, implementacija odložena
- Plan: Obsidian vault na GitHub (Git-sync) kao persistent memory layer

---

## 25. REDIS INTEGRACIJA

**Lokacija:** `src/lib/redis.ts`

**Šta se čuva u Redis-u:**
- Rate limiting (sliding window ZSET, 60s window)
- Session cache (5min TTL, JWT dekodiran korisnik)
- MCP pool koordinacija između replika (10min TTL)
- Embedding cache (600s TTL)
- Embedding semaphore (max 3 concurrent poziva, Lua EVAL)
- BullMQ queues (planiran u Fazi 1)

**Graceful fallback:** ako Redis nije dostupan — sve funkcioniše sa in-memory fallback-om

---

## 26. INFRASTRUKTURA (Railway)

**Lokacija:** `railway.toml`, `nixpacks.toml`, `services/*/railway.toml`

### Main app
- Next.js 15.5, Turbopack dev, standalone output
- `numReplicas = 2` (zahteva Redis za cross-replica state)
- Health check: `/api/health`, timeout 120s
- Restart: ON_FAILURE, max 5 pokušaja

### ECC Skills MCP
- Python FastMCP, port 8000
- `numReplicas = 1` **← SPOF, treba → 2 (videti Faza 0)**
- Health check: `/health`, timeout 60s

### Deal Flow Agent (poseban subprojekt)
- `deal-flow-agent/` — FastAPI + Uvicorn, port 8000
- 5 M&A due diligence agenata
- Scoring model: Screening 15% + Financial 30% + Risk 25% + Competitive 20% + Legal 10%

---

## 27. PODACI — SVIH 36 PRISMA MODELA

**Lokacija:** `prisma/schema.prisma`

| Model | Svrha |
|-------|-------|
| User | Korisnički nalog |
| Account | OAuth account linking (GitHub/Google) |
| Session | NextAuth sesije |
| VerificationToken | Email verifikacija |
| Agent | Centralni entitet agenta |
| Flow | Vizuelni workflow (JSON content) |
| FlowVersion | Immutable snapshot verzije |
| FlowDeployment | Audit log deploy-a |
| FlowTrace | Debug execution snapshot |
| KnowledgeBase | KB konfiguracija po agentu |
| KBSource | Izvor dokumenta (FILE/URL/SITEMAP/TEXT) |
| KBChunk | Tekst chunk sa pgvector embedding-om |
| Conversation | Chat sesija |
| Message | Chat poruka |
| AnalyticsEvent | Usage tracking (token, cost, latency) |
| MCPServer | MCP server konfiguracija |
| AgentMCPServer | Agent↔MCP server mapping |
| GoogleOAuthToken | Google Workspace OAuth token |
| AgentCard | A2A agent metadata |
| HumanApprovalRequest | Human-in-the-loop zahtev |
| AgentCallLog | A2A poziv sa distributed tracing |
| FlowSchedule | Cron schedule konfiguracija |
| ScheduledExecution | Execution log rasporeda |
| WebhookConfig | Inbound webhook endpoint |
| WebhookExecution | Webhook trigger log |
| EvalSuite | Test suite za agenta |
| EvalTestCase | Jedan test case |
| EvalRun | Jedno izvršavanje suite-a |
| EvalResult | Rezultat jednog test case-a |
| AgentMemory | Persistent memorija agenta sa embedding-om |
| AgentExecution | Execution trace (ECC) |
| Skill | Skill modul (ECC) |
| AgentSkillPermission | Agent↔Skill RBAC permisija |
| Instinct | Naučeni pattern (ECC, confidence 0-1) |
| CLIGeneration | CLI generator pipeline run |
| AuditLog | Compliance log |

---

## 28. SPOLJNI SERVISI I INTEGRACIJE

### AI Provajderi (Vercel AI SDK — nikad direktni fetch)
| Servis | Env var | Modeli |
|--------|---------|--------|
| DeepSeek | DEEPSEEK_API_KEY | deepseek-chat (default), deepseek-reasoner |
| OpenAI | OPENAI_API_KEY | gpt-4.1, gpt-4.1-mini, o3, o4-mini |
| Anthropic | ANTHROPIC_API_KEY | claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-6 |
| Google | GOOGLE_GENERATIVE_AI_API_KEY | gemini-2.5-flash, gemini-2.5-pro |
| Groq | GROQ_API_KEY | llama-3.3-70b, compound-beta |
| Mistral | MISTRAL_API_KEY | mistral-small/medium/large |
| Moonshot (Kimi) | MOONSHOT_API_KEY | kimi-k2, kimi-k2-thinking |

### Embeddings (obavezno — DeepSeek nema)
- OpenAI `text-embedding-3-small` (1536 dim) + `text-embedding-3-large` (3072 dim)

### Web search
- Tavily (TAVILY_API_KEY), Brave Search (BRAVE_SEARCH_API_KEY)

### Multimedija
- FAL.ai (FAL_API_KEY) — slike
- Stability AI (STABILITY_API_KEY) — slike
- Eleven Labs (ELEVENLABS_API_KEY) — TTS
- Deepgram (DEEPGRAM_API_KEY) — STT

### Sigurnost
- Azure Content Safety (AZURE_CONTENT_SAFETY_KEY + ENDPOINT)

### OAuth
- GitHub, Google, Google Workspace, Notion

### Infrastruktura
- PostgreSQL/Supabase (DATABASE_URL, DIRECT_URL)
- Redis (REDIS_URL)
- AWS S3 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET)

### Observability (opcionalno)
- OTEL_EXPORTER_OTLP_ENDPOINT → Grafana Cloud/Jaeger
- OTEL_SERVICE_NAME (default: agent-studio)

---

## 29. TESTIRANJE

### Unit testovi
- **Framework:** Vitest + @testing-library/react
- **Broj:** 2502+ testova u 179 test fajlova
- **Lokacija:** `src/**/__tests__/*.test.ts`
- **Coverage:** handlers, evals, webhooks, CLI generator, auth, security, safety, cache, cost

### E2E testovi
- **Framework:** Playwright (10 spec fajlova)
- **Lokacija:** `e2e/tests/`
- **Coverage:** auth, dashboard, flow editor, chat streaming, KB, webhooks, import/export, eval gen, API routes

### Load testovi
- **Framework:** k6
- **Lokacija:** `k6/load-test.js`
- **Scenariji:** smoke, skills_load, chat_load
- **Thresholds:** P95 <500ms (health), P95 <100ms (skills), P95 <5000ms (chat)

### Pre-push check
- **Script:** `scripts/pre-push-check.sh`
- **4 provere:** TypeScript, Vitest, Lucide icon mocks, string konzistentnost
- **Komanda:** `pnpm precheck`

---

## 30. POZNATI PROBLEMI (koji su u SAAS-MIGRATION-PLAN.md)

| Problem | Gde | Prioritet |
|---------|-----|-----------|
| ECC MCP numReplicas=1 (SPOF) | services/ecc-skills-mcp/railway.toml L10 | Faza 0 |
| RBAC postoji ali nije enforced | src/lib/security/rbac.ts | Faza 0 |
| AuditLog se gotovo nigde ne poziva | src/lib/security/audit.ts | Faza 0 |
| OTEL je opcionalan | src/instrumentation.ts L33-43 | Faza 0 |
| Sinhrono izvršavanje blokira HTTP | src/lib/runtime/engine.ts | Faza 1 |
| Nema transactional email | package.json — nema email library | Faza 1.5 |
| Nema Sentry/error monitoring | package.json — nema @sentry/nextjs | Faza 1.5 |
| Nema Organization modela | prisma/schema.prisma | Faza 2 |
| Nema GDPR account deletion | API routes — ne postoji DELETE /user | Faza 2.5 |
| Nema CSP header | src/lib/api/security-headers.ts | Faza 3 |
| Session management basic | src/lib/auth.ts — nema refresh rotation | Faza 3 |
| Nema webhook retry logike | src/lib/webhooks/execute.ts | Faza 3.5 |

---

*Dokument generisan automatskom analizom koda — april 2026. Ažuriraj kad se doda novi feature.*
