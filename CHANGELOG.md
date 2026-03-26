# Changelog

All notable changes to Agent Studio are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.7.0] - 2026-03-26 — Eval Enhancements: CSV Export, Scheduled Runs & A/B Comparison

> 12 files · ~900 lines · 9 new unit tests · 0 breaking changes

### Added
- **CSV export** — per-run export (`GET /api/agents/[agentId]/evals/[suiteId]/run/[runId]/export`) and suite-level bulk export (`GET /api/agents/[agentId]/evals/[suiteId]/export?limit=50`); one row per assertion (N assertions × M test cases), proper RFC-4180 quoting, semicolon-joined tags
- **Scheduled eval runs** — `scheduleEnabled` + `scheduleCron` fields on `EvalSuite`; pure-JS 5-field cron matcher (`cronMatchesDate`) with no external deps; 4-minute double-run prevention; `POST /api/evals/scheduled` endpoint (CRON_SECRET protected) called by Railway Cron Service
- **Head-to-head A/B comparison** — `POST /api/agents/[agentId]/evals/[suiteId]/compare` runs two flow versions or two models back-to-back, computes `ComparisonDelta` (scoreDiff, latencyDiffMs, aWins, bWins, ties, winner), stores mutual `comparisonRunId` links
- **`EvalCompareView` component** — side-by-side summary bar (winner badge, score ring, delta ▲/▼) + per-case table with output A | score A | winner indicator | score B | output B
- **`TriggeredByBadge` component** in `EvalResultsView` — color-coded pill: zinc=manual, violet=deploy, amber=schedule, blue=compare
- **Export buttons** in `EvalResultsView` — "Export Run" and "Export All Runs" buttons trigger CSV downloads via `window.open()`
- **Schedule dialog** in Evals page — cron preset grid (daily 3am, every 6h, weekdays 9am, every Monday 8am, custom), enable/disable toggle, PATCH to suite API
- **Compare dialog** in Evals page — version vs model toggle, dropdown selectors for A and B, inline `EvalCompareView` results
- **`comparisonRunId`, `flowVersionId`, `modelOverride`** fields added to `EvalRun` Prisma model
- **`lastScheduledAt`**, `scheduleEnabled`, `scheduleCron` fields added to `EvalSuite` Prisma model
- **`evalFlowVersionId` + `evalModelOverride`** params in `/api/agents/[agentId]/chat` — replaces flow content with version snapshot or injects model override into all `ai_response` nodes
- **9 unit tests** for the CSV export route: auth, 404 cases, Content-Type/Disposition headers, row count, comma/quote escaping, semicolon tags, empty assertions, unicode

### Changed
- `EvalResultsView` now accepts `agentId` and `suiteId` props for export URL construction
- `RunEvalOptions.triggeredBy` extended with `"compare"` and `"schedule"` values
- `CreateEvalSuiteSchema` extended with `scheduleEnabled` and `scheduleCron` (validated cron regex)
- Suite sidebar shows ⏰ clock icon for suites with schedule enabled
- Suite dropdown menu has "Schedule runs" / "Edit schedule" item

---

## [2.6.0] - 2026-03-26 — Webhooks UI Upgrade

> 3 files · ~370 lines · 13 new unit tests · 0 breaking changes

### Added
- **Paginated executions API** — `GET /api/agents/[agentId]/webhooks/[webhookId]/executions` with cursor-based pagination (`cursor`, `limit` 1–50, `status` filter); `rawPayload` excluded from list response to save bandwidth (only used by replay endpoint)
- **13 unit tests** for the new executions endpoint: cursor logic, status filtering, 404/500 error handling, and rawPayload exclusion from Prisma select
- **Status filter pills** in Executions tab — All / Completed / Failed / Running; color-coded (green/red/blue); changing filter resets cursor and reloads from page 1
- **"N of M" counter** in Executions tab header — shows `20 of 143` so users always know total history depth
- **Load more button** — cursor-based append: shows remaining count, disabled while loading, replaces hard 20-item limit
- **Auto-refresh polling** — Executions tab refreshes every 10s while active (polling preferred over SSE for this use case: append-only log, no branching events)
- **TestPanel → Executions integration** — after a successful test send, the panel automatically switches to Executions tab and refreshes 2.5s later (backend processing time)
- **Webhook list search** — instant client-side filter input with clear button above the left panel list
- **Analytics summary bar** — success rate % next to trigger count, color-coded: ≥95% green, ≥80% amber, <80% red

### Changed
- Executions tab label now shows real filtered total: `Executions (143)` instead of the inline `_count` from the detail query
- RefreshCw icon in Executions tab header now animates (spin) while loading
- Empty state in Executions tab is filter-aware: "No failed executions" vs "No executions yet"

---

## [2.5.1] - 2026-03-26 — Docker GHCR Publishing

### Added
- Docker images published to `ghcr.io/webdevcom01-cell/agent-studio` on every push to `main` — tags: `latest` + `sha-<short>`
- Multi-platform builds: `linux/amd64` + `linux/arm64` (Apple Silicon support)
- PR build validation — Dockerfile is built but not pushed on pull requests, catching regressions before merge
- Supply chain attestation via `provenance: true` in `docker/build-push-action`
- GHCR image badge in README linking to `ghcr.io` package page
- `docker pull ghcr.io/webdevcom01-cell/agent-studio:latest` Option A in Quick Start

### Changed
- `docker.yml` workflow renamed to "Docker Build & Push"; timeout increased to 30 min for multi-platform builds

### Fixed
- Docker Build badge was misleading — image is now actually published and pullable

---

## [2.5.0] - 2026-03-26 — Template Expansion & Developer Experience

> 216 templates · 19 categories · 1700+ tests · `pnpm precheck` for pre-push CI

### Added
- **83 new agent templates** (133 → 216 total) across 8 new industry categories: `coding`, `data`, `finance`, `hr`, `paid-media`, `research`, `sales`, `writing`
- All existing categories expanded to a minimum of 8 templates (Dobro standard) — `marketing`, `product`, `project-management`, `spatial-computing`, `support` all brought up from 1–4 templates
- **`scripts/pre-push-check.sh`** — 4-phase local CI simulation: TypeScript check → targeted Vitest → Lucide icon mock check → placeholder string consistency
- **`pnpm precheck`** and **`pnpm precheck:file <path>`** scripts added to `package.json`

### Changed
- **README** — complete 2026-standards rewrite: CI + Docker Build + MCP Ready + A2A v0.3 badges; "What is Agent Studio?" problem/solution section; Supported AI Providers table (7 providers, 18 models); comparison table vs Flowise, n8n, LangFlow, Dify; updated Mermaid diagram (37 handlers, 87 routes); added Inbound Webhooks to feature list and comparison table
- **CLAUDE.md** — synced project context with all changes since v2.0.0: template counts (133 → 216), category counts (12 → 19), pre-push workflow section, `pnpm precheck` commands, `scripts/pre-push-check.sh` in folder structure

---

## [2.4.0] - 2026-03-25 — Visual Flow Debugger

> Real-time breakpoints · step-by-step execution · variable watch · trace history

### Added
- **Debug Panel** — collapsible sidebar in flow builder with node inspector, active variable state, and edge traversal view (Phase 1+2)
- **Execution Timeline** — chronological trace of all node executions per run with duration, input/output snapshot per step (Phase 4)
- **Trace Persistence** — `FlowTrace` Prisma model; `GET/POST /api/agents/[agentId]/traces`, `GET /api/agents/[agentId]/traces/[traceId]` routes; replay any historical execution (Phase 5)
- **Breakpoints & Step-by-Step** — set breakpoints on any node; pause, inspect, and resume execution mid-flow; `debug-controller.ts` runtime integration (Phase 6)
- **Variable Watch Panel** — live variable state during execution; in-flight edit support for variables before next node runs (Phase 7)
- **`/api/agents/[agentId]/debug`** — debug session management API
- **8 new builder components**: `debug-panel`, `debug-timeline`, `trace-history`, `debug-variable-watch`, `debug-toolbar`, `debug-node-overlay`, `use-debug-session` hook
- **`src/lib/runtime/debug-controller.ts`** — intercepts engine execution loop for breakpoint/step control
- **`src/lib/observability/tracer.ts`** — OpenTelemetry tracer wired into all AI response handlers

### Fixed
- ESLint errors in debug components blocking CI
- Missing component and API files from virtiofs-constrained commit

---

## [2.3.0] - 2026-03-24 — Open Source Launch & CLI

> Self-hostable via Docker · one-click Railway/Render deploy · `npx agent-studio-cli`

### Added
- **Docker support** — `Dockerfile` (Next.js standalone build), `docker-compose.yml` (app + PostgreSQL/pgvector + Redis), `docker-compose.override.yml` for local dev overrides
- **GitHub Actions CI/CD** — `ci.yml` (lint + typecheck + vitest + Playwright E2E), `docker.yml` (Docker build on every push to main), `docs.yml` (Docusaurus deploy to GitHub Pages)
- **`@agent-studio/cli` npm package** (`packages/cli/`) — v0.1.0, published to npm; commands: `agent-studio init` (scaffold new agent project), `agent-studio dev` (local dev server), `agent-studio build` (production build)
- **Docusaurus docs site** (`website/`) — deployed to GitHub Pages via `docs.yml`; includes platform overview, node reference, knowledge base guide, CLI generator, and agent evals documentation
- **One-click deploy buttons** in README — Railway template + Render deploy
- **Community files** — `CONTRIBUTING.md` (dev setup, PR guidelines, code style), `CODE_OF_CONDUCT.md`

---

## [2.2.0] - 2026-03-23 — Enterprise RAG Upgrade & Webhooks Replay

> 5 chunking strategies · per-KB config · RAGAS evaluation · webhook replay

### Added
- **Enterprise RAG pipeline** — 24 new features across 4 sprints:
  - 5 chunking strategies: `recursive`, `markdown`, `code` (auto-detect Python/TS/JS), `sentence`, `fixed`; tiktoken `cl100k_base` token counting; header injection per chunk
  - Per-KB configuration UI + API (`GET/PATCH /api/agents/[agentId]/knowledge/config`) — chunking strategy, embedding model, retrieval mode, reranking model, search thresholds
  - Multi-model embeddings: `text-embedding-3-small` (1536 dim) + `text-embedding-3-large` (3072 dim); Redis embedding cache (600s TTL); semaphore (max 3 concurrent calls)
  - Query transformation: HyDE (hypothetical document embedding), multi-query expansion (3 phrasings)
  - Metadata filtering: 10 operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `exists`), AND/OR groups, dot-notation paths
  - Context ordering: `relevance`, `lost-in-middle` (U-shaped, Liu et al. 2023), `chronological`, `diversity` (MMR-like)
  - Cohere Rerank v3.5 support alongside existing LLM-rubric reranker
  - Content deduplication via SHA-256 hash (saves embedding API cost)
  - Ingest progress tracking: 6 stages (parsing → chunking → dedup → embedding → storing → complete)
  - Document parsers: Excel/CSV (`xlsx`), PPTX (JSZip XML extraction) added alongside existing PDF/DOCX/HTML
  - RAGAS evaluation: 4 metrics (`faithfulness`, `contextPrecision`, `contextRecall`, `answerRelevancy`) via `POST /api/agents/[agentId]/knowledge/evaluate`
  - KB analytics: source/chunk stats, token distribution, top retrieved chunks — `GET /api/agents/[agentId]/knowledge/analytics`
  - Maintenance: dead chunk detection, cleanup, scheduled re-ingestion — `GET/POST /api/agents/[agentId]/knowledge/maintenance`
  - Embedding drift detection with model mismatch recommendation
- **Webhook execution replay** — re-trigger any past webhook execution with its stored payload via `POST /api/agents/[agentId]/webhooks/[webhookId]/replay`

---

## [2.1.0] - 2026-03-21 — Security & Infrastructure Hardening

> AES-256-GCM encryption · Redis rate limiting · multi-replica · circuit breakers

### Added
- **AES-256-GCM encryption at rest** — webhook secrets and OAuth tokens encrypted in DB; transparent decrypt on read
- **Redis-based sliding window rate limiter** — replaces in-memory fallback for cross-replica accuracy; Lua EVAL atomic increment
- **A2A circuit breaker hardening** — depth limit (max 3), visited-agent cycle detection, 33 new tests
- **Schedule failure notifications** — webhook callback on cron job failure with retry count and error detail
- **Instinct evolution** — AI clustering of instincts via `generateObject`, auto-promotion to Skill at ≥0.85 confidence
- **Obsidian vault integration** — GitHub API-backed read/write for persistent knowledge storage
- **Multi-replica deployment** — `numReplicas: 2` in `railway.toml`; rolling update strategy
- **Redis cluster** — cross-replica cache, session sharing, MCP pool coordination; `REDIS_URL` env var
- **CDN Cache-Control headers** — static assets get `public, max-age=31536000, immutable`
- **Database read replica** — analytics and `/discover` queries routed to read-only replica
- **FlowVersion cleanup job** — removes DRAFT versions older than 30 days to prevent DB bloat
- **OpenTelemetry tracing** — wired into all AI response handlers with `gen_ai.*` semantic conventions

### Fixed
- MCP Host header rewrite middleware for Railway TLS (replaced monkey-patch approach)
- NextAuth cookie pinning and fallback detection for cross-replica session stability
- ECC production activation with `ECC_ENABLED` health monitoring guard

---

## [2.0.0] - 2026-03-19 — ECC Integration

### Added
- **Phase 0 — Prisma Schema Foundation**: AgentExecution, Skill, AgentSkillPermission, Instinct, AuditLog models with enums (ExecutionStatus, AccessLevel)
- **Phase 1 — Developer Agents**: 25 ECC agent templates imported as new "Developer Agents" category. Model routing: Opus (planner, architect), Sonnet (code-reviewer, tdd-guide), Haiku (doc-updater, test-writer)
- **Phase 2 — Skills Ingestion**: 60 skill modules parsed from SKILL.md, stored in Skill model, vectorized into KB (255 chunks). Skills Browser UI at `/skills` with faceted search
- **Phase 3 — Meta-Orchestrator**: Autonomous agent routing with 4 flow templates (TDD Pipeline, Full Dev Workflow, Security Audit, Code Review Pipeline)
- **Phase 4 — ECC Skills MCP Server**: Python FastMCP server as separate service. Tools: get_skill, search_skills, list_skills. Streamable HTTP on `/mcp` path
- **Phase 5 — Continuous Learning**: Instinct engine with confidence scoring (0.0-1.0), Learn node for pattern extraction, `/api/skills/evolve` endpoint, auto-promotion at 0.85 confidence
- **Phase 6 — Observability**: OpenTelemetry-compatible tracing and metrics with gen_ai.* semantic conventions
- **Phase 7 — Security Hardening**: Audit logging (AuditLog model), RBAC enforcement (AgentSkillPermission), prompt injection defense
- **Phase 8 — Performance Optimization**: k6 load tests, caching strategy (skill metadata 10min, KB search 2min), SLA targets (P95 <5s flow, P99 <2s KB search)
- **Phase 9 — Production Deploy**: Feature flags (ECC_ENABLED opt-in), rollback procedures, Obsidian onboarding documentation
- Virtual Agent/KB/Source chain for skill vectorization (FK constraint resolution)

### Fixed
- ECC_ENABLED defaults to `false` (opt-in) for safe Railway deploy
- FastMCP kwargs compatibility (removed unsupported description, stateless_http, json_response)
- Starlette lifespan and lightweight `/health` endpoint for MCP server
- Virtual source FK constraint for KBChunk during skill vectorization

---

## [1.5.0] - 2026-03-10 — Inbound Webhooks

### Added
- Standard Webhooks spec implementation (HMAC-SHA256 signatures, timestamp verification)
- Public trigger endpoint: `POST /api/agents/[agentId]/trigger/[webhookId]`
- `webhook_trigger` node type as flow entry-point
- Auto-sync webhooks on flow deploy (`syncWebhooksFromFlow`)
- Provider presets: GitHub, Stripe, Slack, Generic with pre-configured mappings
- Event filtering with header-first resolution (x-github-event, x-slack-event, etc.)
- Idempotency via WebhookExecution model (unique x-webhook-id)
- Webhook management UI at `/webhooks/[agentId]` with two-panel layout and 3 tabs
- Secret rotation endpoint
- Body mapping: JSONPath, dot notation, bracket notation
- Slack URL verification handler
- Rate limiting: 60 req/min per webhookId
- Playwright E2E test suite for webhooks
- 77 unit tests (verify, execute, handler, sync)

---

## [1.4.0] - 2026-03-05 — CLI Generator TypeScript Support

### Added
- TypeScript/Node.js MCP SDK target for CLI Generator (dual-target with Python FastMCP)
- TypeScript bridge using `child_process.spawnSync` with typed `BridgeResult` interface
- Vitest test generation for TypeScript target
- 8 generated files: index.ts, bridge.ts, server.ts, bridge.test.ts, server.test.ts, package.json, tsconfig.json, README.md
- `TSPublishOutputSchema` for TypeScript publish phase
- `extractTypeScriptSignatures` for server.registerTool() detection
- Target selection UI with Py/TS badge display

---

## [1.3.0] - 2026-02-25 — Schedule Triggers

### Added
- `schedule_trigger` node type (cron/interval/manual modes)
- Prisma models for cron scheduling
- API routes with cron validator and live preview UI
- Cron execution engine
- Observability and security for schedule management
- Schedule UI with node badges, enable/disable toggle, execution history
- Auto-sync schedules on deploy with starter flow templates

---

## [1.2.0] - 2026-02-15 — Agent Evals Framework

### Added
- 3-layer evaluation: deterministic, semantic similarity, LLM-as-Judge
- 12 assertion types: exact_match, contains, icontains, not_contains, regex, starts_with, json_valid, latency, semantic_similarity, llm_rubric, kb_faithfulness, relevance
- Eval runner with sequential execution and progress tracking
- Deploy hook (fire-and-forget, runs suites with `runOnDeploy` flag)
- Eval suite editor UI with trend charts (recharts)
- AI eval suite generator and standards browser
- 100+ unit tests across assertions, semantic, LLM-judge, runner, deploy-hook

### Fixed
- KB context population in eval runner for kb_faithfulness assertions
- PostgreSQL cast in expandChunksWithContext

---

## [1.1.0] - 2026-02-01 — Platform Enhancements

### Added
- Agent marketplace and discovery at `/discover` with faceted search
- 112 agent templates across 11 categories
- Agent-as-tool orchestration (AI dynamically calls sibling agents)
- A2A protocol (Google A2A v0.3) with agent cards and task communication
- MCP integration with Streamable HTTP + SSE, connection pooling, tool filtering
- Web browsing capabilities (web_fetch + browser_action nodes)
- Embeddable chat widget (`public/embed.js`)
- Flow versioning and deploy pipeline (DRAFT/PUBLISHED/ARCHIVED)
- Human approval workflow (human_approval node)
- Analytics dashboard with response time charts
- Agent memory (read/write nodes with semantic search)
- Parallel execution and loop nodes

---

## [1.0.0] - 2026-01-15 — Initial Release

### Added
- Visual flow builder with 32 node types (@xyflow/react v12)
- Knowledge Base with RAG pipeline (chunk, embed, pgvector hybrid search)
- Streaming chat interface (NDJSON protocol with heartbeat)
- CLI Generator (6-phase AI pipeline, Python FastMCP target)
- Multi-provider AI: DeepSeek, OpenAI, Anthropic, Google Gemini, Groq, Mistral, Moonshot/Kimi
- 18 models across 7 providers, tiered (fast/balanced/powerful)
- OAuth authentication (GitHub + Google via NextAuth v5)
- Security: CSRF protection, rate limiting, SSRF protection, input validation, body size limits
- Agent export/import (versioned JSON format)
- 1000+ unit tests, 7 E2E spec files
- Railway deployment configuration
