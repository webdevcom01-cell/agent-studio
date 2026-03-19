# Changelog

All notable changes to Agent Studio are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.0.0] - 2026-03-19 — ECC Integration

### Added
- **Phase 0 — Prisma Schema Foundation**: AgentExecution, Skill, AgentSkillPermission, Instinct, AuditLog models with enums (ExecutionStatus, AccessLevel)
- **Phase 1 — Developer Agents**: 25 ECC agent templates imported as new "Developer Agents" category. Model routing: Opus (planner, architect), Sonnet (code-reviewer, tdd-guide), Haiku (doc-updater, test-writer)
- **Phase 2 — Skills Ingestion**: 60 skill modules parsed from SKILL.md, stored in Skill model, vectorized into KB (255 chunks). Skills Browser UI at `/skills` with faceted search
- **Phase 3 — Meta-Orchestrator**: Autonomous agent routing with 4 flow templates (TDD Pipeline, Full Dev Workflow, Security Audit, Code Review Pipeline)
- **Phase 4 — ECC Skills MCP Server**: Python FastMCP server as separate Railway service (`positive-inspiration`). Tools: get_skill, search_skills, list_skills. Streamable HTTP on `/mcp` path
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
