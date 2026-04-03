# Changelog

All notable changes to Agent Studio are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Multi-tenancy** — Organization, OrganizationMember, Invitation models with OWNER/ADMIN/MEMBER roles
- **GDPR compliance** — account deletion (30-day grace), data export, configurable retention policies (`src/lib/gdpr/`)
- **Safety middleware** — prompt injection detection, PII redaction, content moderation on all AI calls (`src/lib/safety/`)
- **Feature flags** — 3-layer evaluation (org override > Redis > default), percentage-based rollout (`src/lib/feature-flags/`)
- **BullMQ queue integration** (5.10) — KB ingest, eval runs, and webhook retries enqueue via BullMQ with graceful in-process fallback
- **Webhook retry engine** — exponential backoff (1min → 5min → 30min), circuit breaker, dead letter queue (`src/lib/webhooks/retry.ts`)
- **Admin dashboard** — `/admin` with tabs: overview metrics, job queue monitoring, top users; auto-refresh via SWR
- **k6 load tests** (5.12) — `load-tests/agent-studio.js` with 3 scenarios and SLO thresholds
- **OpenAPI securitySchemes** (5.13) — `BearerAuth` and `CookieAuth` added to spec
- **CHANGELOG.md** (5.14) — this file; `pnpm changelog` script for future updates
- **Vitest v8 coverage** (5.5) — `pnpm test:coverage` with 30% baseline thresholds
- **Embed widget error boundary** (5.8) — `src/app/embed/[agentId]/error.tsx` without Dashboard link (iframe-safe)
- **Redis null-path tests** (5.6) — 7 additional unit tests verifying graceful degradation when Redis is unavailable
- **18 new flow node types** (Sprints 1–6) — structured_output, cache, embeddings, retry, ab_test, semantic_router, cost_monitor, aggregate, web_search, multimodal_input, image_generation, speech_audio, database_query, file_operations, mcp_task_runner, guardrails, code_interpreter, trajectory_evaluator
- **DevSecOps pipeline fixes** (P-01 through P-16) — parallel node validation, template engine JSON fallback, engine double-execution prevention, call-agent retry with exponential backoff

### Changed
- Eval `POST /api/agents/:id/evals/:suiteId/run` returns `202 { queued: true, jobId }` when Redis is available
- 3 KB source API routes use queue-first pattern for ingest
- Auth guards support API key + session cookie dual authentication
- `requireAgentOwner()` now checks organization membership for multi-tenancy
- CSP nonce uses Web Crypto API (`crypto.getRandomValues`) for Edge runtime compatibility

### Fixed
- `schema-drift` test missing `DEFAULT_MODEL` export in AI mock
- `embed/page.tsx` agent fetch error handling with user-friendly inline error state
- Railway deploy CSP failure — replaced `node:crypto` import with Web Crypto API

---

## [0.5.0] — 2026-04-03

### Added
- **Embedding retry with exponential backoff** (5.3) — up to 3 retries, jitter, `embeddingRetries` metric
- **Stuck-source watchdog** (5.1) — cron at `POST /api/cron/cleanup` marks PROCESSING sources stuck > 30 min as FAILED
- **Security audit logging** (5.4) — `auditKBSourceAdd()`, `auditKBSourceDelete()` fire-and-forget calls
- **Optimistic locking on flow saves** (5.7) — `version` field prevents lost-update race conditions; returns 409 on conflict
- **Handler audit** (5.2) — all 55 handlers verified to have graceful try/catch fallbacks

---

## [0.4.0] — 2026-04-02

### Added
- **OpenAPI 3.1 spec + Swagger UI** — `GET /api/openapi.json`, `GET /api/docs` (Swagger UI); 11 tags, 30+ paths
- **Admin dashboard** — `/admin` with SWR-polled stats (agents, jobs, KB sources, queue health)
- **Worker service Railway config** — `services/worker/railway.toml`, Dockerfile worker stage
- **Webhook retry with dead-letter queue** — exponential backoff, idempotency check, BullMQ integration
- **Docker Compose** — multi-service with migrate init container, worker service, ecc-mcp profile
- **CONTRIBUTING.md + GitHub issue/PR templates** — open source community setup
- **Settings UI for API Keys** — `/settings/api-keys` page with create, rename, revoke, copy
- **API Keys backend** — `POST/GET /api/api-keys`, `PATCH/DELETE /api/api-keys/:id`; 11 scopes; `as_live_` prefix (SHA-256 hashed)

### Fixed
- Railway deploy — Dockerfile `runner` stage last, `builder = DOCKERFILE`, `startCommand = node server.js`
- CSP `strict-dynamic` removed (was blocking all JS execution)
- Auth flow fixed via `prisma db push` during build

---

## [0.3.0] — 2026-04-01

### Added
- **ECC integration** (Phases 0–9) — 29 ECC agent templates, 60+ skills, meta-orchestrator, instinct engine, skills MCP service
- **Agent Discovery Marketplace** — `/discover` with faceted search, categories, tags
- **Agent Templates Gallery** — 250 templates across 21 categories (221 general + 29 ECC developer agents)
- **Inbound webhooks** — Standard Webhooks spec, HMAC-SHA256, provider presets (GitHub, Stripe, Slack)
- **Agent Evals framework** — 3-layer (deterministic + semantic + LLM-as-Judge), 12 assertion types, deploy hook
- **CLI Generator** — 6-phase AI pipeline, Python FastMCP + TypeScript Node.js MCP SDK targets
- **Flow versioning** — immutable snapshots, DRAFT → PUBLISHED → ARCHIVED lifecycle, rollback
- **MCP integration** — Streamable HTTP + SSE transports, connection pooling, per-agent tool filtering
- **A2A agent communication** — Google A2A v0.3, circuit breaker, rate limiting, distributed tracing
- **Scheduled flows** — CRON/INTERVAL/MANUAL, IANA timezone support, Railway Cron integration

---

## [0.2.0] — 2026-03-15

### Added
- **Knowledge Base (RAG)** — chunking, OpenAI embeddings, pgvector HNSW indexes, hybrid search (semantic + BM25)
- **Flow editor** — XyFlow-based visual editor, 55 node types, property panel
- **Streaming chat** — NDJSON protocol, `useStreamingChat` hook
- **Human approval workflow** — `human_approval` node, `HumanApprovalRequest` model
- **Agent export/import** — versioned JSON format

---

## [0.1.0] — 2026-02-01

### Added
- Initial release — Next.js 15 app with agent CRUD, basic flow execution, OAuth login (GitHub + Google)
- Prisma + PostgreSQL + pgvector setup
- DeepSeek (default) + OpenAI model routing via Vercel AI SDK

---

*To generate an updated changelog from git history, run:*
```bash
pnpm changelog
```
