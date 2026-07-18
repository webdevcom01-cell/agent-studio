# Changelog

All notable changes to Agent Studio are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Documentation (2026-07-18)
- **DOC-REORG** — `docs/` reorganized to the Diátaxis structure: `01-getting-started/`, `02-guides/`, `03-reference/` (incl. `nodes/`), `04-explanation/`, `_archive/`. Serbian filenames renamed (`02-nodes-osnovno` → `nodes/basic`, `05-nodes-integracije` → `nodes/integrations`); root `RLS-TESTING.md` → `docs/02-guides/rls-testing.md`; 29 working docs + `docs/design/` + old `docs/archive/` consolidated under `docs/_archive/`. New navigation index at `docs/README.md`. All internal links repaired; live references updated (`CLAUDE.md`, `TECH_DEBT.md`, CI workflows, `skills/rls-rollout`).
- **DOC-NEW** — Generated reference docs from code: `docs/03-reference/api.md` (170 routes from `src/app/api/**/route.ts`), `data-model.md` (63 models from `prisma/schema.prisma`), `config-env.md` (env vars from `.env.example` + `process.env` usage), `glossary.md`.
- **DOC-FIX** — Stale counts synced to code repo-wide: 20 models / 8 providers (`src/lib/models.ts`), 30 ECC templates, 221 templates in 20 categories, 24 discover categories, 333 unit-test files, chunk default 512 tokens, hybridAlpha 0.7/0.8, 67 handler registry keys (66 `NodeType` + internal `code_review`). Affected: `README.md`, `AGENTS.md`, `CLAUDE.md`, `FEATURES.md`, `SPRINT-BOARD.md`, `.claude/docs/*` (text-only), `sdlc-prompts/*`, `website/docs/intro.md`.
- **DOC-FIX** — `FEATURES.md`: `google_workspace` removed from the node-type table (not a formal `NodeType` — reachable via `mcp_tool` MCP proxy); table now has exactly 66 rows.
- **PRIVACY** — Untracked 93 files already covered by `.gitignore`: 77 eval-workspace fixtures, `docs/deployment/` (3), `docs/forensics/` (8), 5 root `.skill` bundles.

### Documentation (2026-06-27)
- **DOC-FIX** — Corrected stale counts repo-wide: node types 55 → **66**, Prisma models 36 → **63**, API routes → **170**, UI components → **123** (`README.md`, `FEATURES.md`). Source of truth: `src/types/index.ts` `NodeType` union and `prisma/schema.prisma`.
- **DOC-FIX** — `docs/10-node-reference.md`: documented the 5 previously-missing nodes (`claude_agent_sdk`, `deploy_trigger`, `file_writer`, `git_node`, `process_runner`); now covers all 66.
- **DOC-FIX** — `FEATURES.md`: added the 11 missing node rows and 27 missing model rows so tables match the headline counts.
- **DOC-FIX** — `AGENTS.md`: repaired 9 broken links (`.Codex/docs/*` → `.claude/docs/*`).
- **DOC-FIX** — `.gitignore`: fixed `docs/forensic/` → `docs/forensics/` typo; ignored eval-workspace fixtures and root `.skill` bundles.

### Added (2026-04-28)
- **SEC-05** — AuditLog wired for admin actions: `org.member.remove`, `org.member.add`, `org.invite.send`, `org.approval.respond` across 4 API routes. Fire-and-forget typed wrappers.
- **AGENT-01** — 16 "Need Improvement" agents upgraded in 4 batches: JSON output schemas, escalation protocols, SLA thresholds, scope boundaries, before/after formats.
- **AGENT-02** — 11 "Critical Gaps" resolved: 5 deleted (PR Gate Pipeline, Security Audit Pipeline, Eval Test FAQ, Visual Storyteller, Web Browser Test), 3 already rewritten (Bug Detection 17K, Test Engineering 17K, TDD Workflow 15K), 3 confirmed with `<role>` tags.
- **AGENT-04** — Swarm Security Analyst 67→70/70: added `<failure_modes>` (4 edge cases), `<llm_security>` (OWASP LLM Top 10 2025), `<github_integration>` (priority files + per-file risk scoring).
- **AGENT-05** — SDLC pipeline all 7 agents confirmed complete in DB.
- **AGENT-03** — `project_context` and `sandbox_verify` node types: 21/21 tests green.

### Fixed (2026-04-28)
- **DEBT-06** — Knip: removed 10 unused exports across 8 files (-17 lines). Commit 1d245a2.
- **SEC-06** — OAuth token encryption OAUTH_ENCRYPTION_KEY active, plaintext_count=0.
- **DEBT-05** — 2x `console.error` replaced with `logger.error`, ESLint suppressions removed.


### Added
- **SDLC Phase 1-6 pipeline improvements** — `project_context` node (load CLAUDE.md + rules files), `sandbox_verify` node (TypeScript + ESLint + forbidden-pattern checks), escalating retry (`enableEscalation` injects PR Gate fixes + sandbox errors + code examples on each attempt), typed output schemas (`CodeGenOutput`, `PRGateOutput`, `ArchitectureOutput` via Zod registry in `src/lib/sdlc/schemas.ts`), MCP enforcement layer (native JSON Schema + named Zod validation on `mcp_tool` and `call_agent` nodes)
- **`sdlc-full-pipeline` starter flow** — reference implementation: Discovery → parallel(Architecture + Security + TDD) → Code Gen → sandbox_verify → parallel PR Gate → CI/CD Generator → Deploy Decision
- **A2A Agent Cards v0.3** — `GET /api/a2a/[agentId]/agent-card` (JSON-LD), `GET /.well-known/agent-cards` discovery index; both public endpoints added to middleware matcher
- **Optimistic locking on flow saves** (restored) — GET returns `lockVersion` via `$queryRaw`, PUT checks `clientLockVersion` inside transaction, increments via `$executeRaw`, returns 409 with `serverLockVersion` on conflict
- **Session events + renderer/sink notification system** (Phase E) — `session-events.ts` pub/sub for flow execution lifecycle hooks
- **`ecc-tdd-pipeline` and `ecc-code-review-pipeline` updated** — both now start with `project_context`, use typed schemas, and route through `sandbox_verify` + escalating retry

### Changed
- Node count: 55 → 61 (added `project_context`, `sandbox_verify`, `ast_transform`, `lsp_query`, plus earlier additions)
- Test suite: 2880 → 3211 tests across 244 test files

---

## [0.6.0-unreleased-prev]

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
- **IMPROVEMENT-PLAN-2026 completed** (10/11 tasks, plan retired) — live pipeline progress UI (`pipeline-progress.tsx`), `Conversation.status=ABANDONED` on client disconnect, structured sub-agent error messages, parallel sub-agent execution (swarm + ECC orchestrator templates), incremental partial-results persistence via atomic `jsonb_set` into `Conversation.variables.__partial_results`, AbortSignal propagation through `agent-tools.ts` for Stop button cancel, `conversationId` on `AgentCallLog` with composite indexes, per-agent timeout profiles (`AGENT_TIMEOUT_PROFILES`), OTel multi-hop tracing with `gen_ai.agent.id`/`gen_ai.agent.name` attributes, MCP Tasks primitive with `pollTaskProgress` and `onProgress` callback. Task 3.1 (Pipeline Resume endpoint + UI) intentionally deferred — no production demand and partial results remain queryable from `Conversation.variables`.

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
