# Changelog

All notable changes to Agent Studio are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **BullMQ queue integration for heavy tasks** (5.10) — KB ingest and eval runs now enqueue via BullMQ with graceful in-process fallback when Redis is unavailable
- **k6 load tests** (5.12) — `load-tests/agent-studio.js` with 3 scenarios (background, chat_load, kb_spike) and SLO thresholds (P95 < 5s chat, P99 < 2s KB search)
- **OpenAPI securitySchemes** (5.13) — `BearerAuth` and `CookieAuth` added to spec; full scopes table in `info.description`
- **CHANGELOG.md** (5.14) — this file; `pnpm changelog` script for future updates
- **Vitest v8 coverage** (5.5) — `pnpm test:coverage` with 30% baseline thresholds
- **Embed widget error boundary** (5.8) — `src/app/embed/[agentId]/error.tsx` without Dashboard link (iframe-safe)
- **Redis null-path tests** (5.6) — 7 additional unit tests verifying graceful degradation when Redis is unavailable

### Changed
- Eval `POST /api/agents/:id/evals/:suiteId/run` returns `202 { queued: true, jobId }` when Redis is available
- 3 KB source API routes use queue-first pattern for ingest

### Fixed
- `schema-drift` test missing `DEFAULT_MODEL` export in AI mock
- `embed/page.tsx` agent fetch error handling with user-friendly inline error state

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
- **API Keys backend** — `POST/GET /api/api-keys`, `PATCH/DELETE /api/api-keys/:id`; 11 scopes; `as_prod_` / `as_test_` prefixes

### Fixed
- Railway deploy — Dockerfile `runner` stage last, `builder = DOCKERFILE`, `startCommand = node server.js`
- CSP `strict-dynamic` removed (was blocking all JS execution)
- Auth flow fixed via `prisma db push` during build

---

## [0.3.0] — 2026-04-01

### Added
- **ECC integration** (Phases 0–9) — 29 ECC agent templates, 60+ skills, meta-orchestrator, instinct engine, skills MCP service
- **Agent Discovery Marketplace** — `/discover` with faceted search, categories, tags
- **Agent Templates Gallery** — 221 templates across 19 categories
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
