# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Visual AI agent builder with multi-agent orchestration and continuous learning. Build AI agents
via a flow editor (XyFlow), manage knowledge bases with RAG (chunking + embeddings + hybrid
search), enable agent-to-agent communication (A2A protocol), and chat with agents. Features:
agent marketplace (221 templates, 19 categories), agent-as-tool orchestration, web browsing via
MCP, embeddable chat widget, CLI Generator (6-phase AI pipeline, dual-target FastMCP/Node.js MCP),
Agent Evals (3-layer: deterministic + semantic + LLM-as-Judge), inbound webhooks (Standard
Webhooks, HMAC-SHA256), **claude_agent_sdk node** (subagent spawning, DB-backed session
persistence), **SDLC pipeline orchestration** (webhook triggers, RAG seed, PR creation),
**BullMQ managed tasks** (async long-running execution), **ECC SDK Learn Hook** (auto instinct
extraction on session end), and ECC integration (Skills Browser, Meta-Orchestrator, Learn node).
OAuth login (GitHub + Google).

**Paperclip systems (F0–F8):** Platform Budget (spend caps, 402 enforcement, monthly reset),
Agent Org Chart (departments, A2A permission grants, hierarchy), Heartbeat Lifecycle (scheduled
context injection, BullMQ worker), Goal Alignment (mission + goals injected into every execution),
Board Governance (approval policies, fail-open policy checks, timeout cron), Cross-Session Atomic
Tasks (Redis distributed locks, swarm coordinator), Clipmart Templates (export/import with secret
scrubbing + SHA-256 checksum), MCP Server v2 (9 new tools, USER/ADMIN auth, per-IP rate limiting),
PostgreSQL RLS (`withOrgContext` middleware).

---

## 2. TECH STACK

- **Framework:** Next.js 15.5, App Router, Turbopack | **Runtime:** React 19
- **Language:** TypeScript strict | **Package manager:** pnpm
- **Styling:** Tailwind CSS v4 — ONLY Tailwind, no inline styles, no CSS modules
- **Database ORM:** Prisma v6 + PostgreSQL (**Railway PostgreSQL**, pgvector v0.8.2)
  - ⚠️ PRODUCTION DB = Railway PostgreSQL (postgres.railway.internal) — NOT Supabase
  - Supabase project `elegzqtlqkcvqhpklykl` is PAUSED/UNUSED — do not query it
- **AI:** Vercel AI SDK v6 (`ai@6.0.116`) — never raw fetch to providers
  - **Chat (required):** DeepSeek (default), OpenAI; **optional:** Anthropic, Gemini, Groq, Mistral, Moonshot
  - **Model catalog:** `src/lib/models.ts` — client-safe, 18 models across 6 providers
  - **Embeddings:** OpenAI `text-embedding-3-small` (1536 dim) — required
- **Queue:** BullMQ + ioredis v5 — managed async tasks + cross-replica shared state
- **Auth:** NextAuth v5 + PrismaAdapter, JWT sessions, GitHub + Google OAuth
- **MCP:** @ai-sdk/mcp — Streamable HTTP + SSE transports
- **Validation:** Zod v3 | **UI:** Radix UI + lucide-react | **Flow editor:** @xyflow/react v12
- **Tests:** Vitest + @vitest/coverage-v8 (unit) | Playwright (E2E, 10 spec files)
- **Utilities:** SWR, recharts, Sonner, cva, clsx, tailwind-merge

---

## 3. REFERENCE DOCS (read on-demand)

| Doc | When to read |
|-----|-------------|
| [folder-structure.md](.claude/docs/folder-structure.md) | Finding files, project layout |
| [prisma-models.md](.claude/docs/prisma-models.md) | DB schema changes, model relations, enums |
| [api-routes.md](.claude/docs/api-routes.md) | Adding/modifying API endpoints |
| [conventions-patterns.md](.claude/docs/conventions-patterns.md) | Runtime engine, streaming, RAG, webhooks, evals, CLI gen, MCP, node type checklist |
| [ecc-integration.md](.claude/docs/ecc-integration.md) | ECC module, skills, instincts, meta-orchestrator, Learn Hook |
| [railway-deployment.md](.claude/docs/railway-deployment.md) | Deploy config, Railway constraints, env vars |
| [deal-flow-agent.md](.claude/docs/deal-flow-agent.md) | M&A due diligence subproject (Python FastAPI) |

---

## 4. KEY PATTERNS (summary)

### Runtime Engine
- 67 node handlers in `src/lib/runtime/handlers/index.ts` (+ 2 streaming variants)
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult`, never throw — always graceful fallback

### Streaming Chat
- `executeFlow` (sync JSON) and `executeFlowStreaming` (NDJSON ReadableStream)
- NDJSON chunks: `message`, `stream_start`, `stream_delta`, `stream_end`, `done`, `error`
- Client hook: `useStreamingChat` in `src/components/chat/use-streaming-chat.ts`

### Knowledge/RAG
- Ingest → chunk (400 tokens) → embed (OpenAI) → pgvector
- Search: hybrid (semantic 70% + BM25 30%) → optional LLM re-ranking, HNSW sub-10ms

### Auth
- NextAuth v5, JWT sessions, 24h maxAge; `requireAuth()` / `requireAgentOwner()` from `@/lib/api/auth-guard`
- Public paths: `/login`, `/embed/*`, `/api/auth/*`, `/api/health`, `/api/agents/[agentId]/chat`, `/api/a2a/*`

### Response Format
All API routes: `{ success: true, data: T }` or `{ success: false, error: string }`

### Claude Agent SDK Node (`claude_agent_sdk`)
- Spawns Claude Code subagents with DB-backed session persistence via `AgentSession` model
- Supports session resume, MCP tool injection, streaming output
- Handler: `src/lib/runtime/handlers/claude-agent-sdk-handler.ts`

### MCP `trigger_agent` Tool — HITL Session Continuation
- `trigger_agent` accepts optional `sessionId` to resume a paused `human_approval` conversation
- Workflow: `trigger_agent` → poll `get_task_status` → when `status=PAUSED`, `output.sessionId` is returned → call `trigger_agent` again with `sessionId` + approval message to continue
- Worker uses `loadContext(agentId, sessionId)` to restore conversation state; conversation stays `ACTIVE` (not `COMPLETED`) while `waitForInput=true`
- Invalid or already-completed sessionIds return a 4xx-style MCP error before enqueueing

### SDLC Pipeline Orchestration
- `src/lib/sdlc/` — async webhook triggers, RAG KB seed, code review node, PR creation
- Issue idempotency prevents duplicate pipeline runs; workspace: `/tmp/sdlc` (Railway `/app` fallback)
- API routes: `/api/agents/[agentId]/pipelines/*`
- **Requires `GITHUB_TOKEN` (or `GITHUB_PAT`)** for git commit + PR creation steps; without it the pipeline returns `INCOMPLETE`
- Rate limited: 5 pipeline triggers per minute per agent (returns 429 with `Retry-After` header)

### BullMQ Managed Agent Tasks
- `src/lib/queue/` — long-running async task execution with status polling, cancel, pause, resume
- `ManagedAgentTask` Prisma model tracks state (PENDING → RUNNING → PAUSED → COMPLETED/FAILED/CANCELLED/ABANDONED)
- Worker process: `pnpm worker` — must run alongside Next.js in production (locally: load `.env.local` first)
- Job types: `flow.execute`, `eval.run`, `webhook.retry`, `webhook.execute`, `kb.ingest`, `managed.task.run`, `mcp.flow.run`, `pipeline.run`
- Priority levels: chat=1, webhook=2, webhook-retry=3, pipeline=5, managed=8, sdlc=8, eval=10
- Per-step timeouts, transaction-safe state, idempotent cancel

### ECC SDK Learn Hook
- Triggers auto `AgentExecution` record + ECC instinct extraction when `claude_agent_sdk` session ends
- Requires `ECC_ENABLED=true`; async — never blocks the main flow
- Hook: `src/lib/ecc/learn-hook.ts` — see [ecc-integration.md](.claude/docs/ecc-integration.md)

---

## 5. PAPERCLIP SYSTEMS (F0–F8)

### Platform Budget System (F1)
- `src/lib/budget/cost-tracker.ts` — `checkBudget` (fail-open: budget miss → allow), `recordCost` (fire-and-forget)
- Prisma models: `AgentBudget`, `CostEvent`, `BudgetAlert`
- `recordCost()` called in both `ai-response-handler.ts` and `ai-response-streaming-handler.ts` after every AI call
- Chat route (`/api/agents/[agentId]/chat`) returns **402** when `checkBudget` returns `exceeded: true`
- Monthly reset cron: `POST /api/cron/budget-reset` (BullMQ job, requires `CRON_SECRET`)
- Budget REST: `/api/agents/[agentId]/budget` (GET current, POST set limit)

### Agent Org Chart (F2)
- `src/lib/org-chart/hierarchy.ts` — `getAgentAncestors`, `getAgentDescendants`, `checkA2APermission`, `grantPermission`
- Prisma models: `Department`, `AgentPermissionGrant`
- A2A `call_agent` checks permission via `checkA2APermission` before forwarding; configurable timeout via `node.data.timeout` (ms, default 90 000)
- REST: `/api/departments`, `/api/departments/[departmentId]`, `/api/agents/[agentId]/permissions`, `/api/agents/[agentId]/children`, `/api/agents/[agentId]/department`

### Heartbeat Lifecycle (F3)
- `src/lib/heartbeat/` — `context-manager.ts` (TTL/expiry, pruning, `buildContextPrompt`), `heartbeat-scheduler.ts`, `heartbeat-worker.ts`
- Prisma models: `HeartbeatConfig`, `HeartbeatContext`, `HeartbeatRun`
- BullMQ worker calls `registerSession` on start and `removeSession` in `finally` (session-tracker integration)
- `buildContextPrompt` output prepended to agent system prompt at execution time
- REST: `/api/agents/[agentId]/heartbeat`, `/api/agents/[agentId]/heartbeat/context`, `/api/agents/[agentId]/heartbeat/runs`

### Goal Alignment (F4)
- `src/lib/goals/goal-context.ts` — builds goal context string from `CompanyMission` + active `Goal` rows linked to the agent
- Injected into both `engine.ts` and `engine-streaming.ts` before flow execution
- Prisma models: `CompanyMission`, `Goal`, `AgentGoalLink`
- REST: `/api/mission`, `/api/goals`, `/api/goals/[goalId]`, `/api/agents/[agentId]/goals`

### Board Governance (F5)
- `src/lib/governance/approval-engine.ts` — `checkPolicies` (fail-open: policy error → allow), `requestApproval` (idempotent dedup), `resolveDecision`
- `processTimeouts` auto-resolves expired decisions using `ApprovalPolicy.timeoutApprove` flag (not a hardcoded TIMEOUT status)
- Prisma models: `ApprovalPolicy`, `PolicyDecision`
- Hourly governance timeout cron: `POST /api/cron/governance-timeout` (requires `CRON_SECRET`)
- REST: `/api/policies`, `/api/policies/[policyId]`, `/api/policies/[policyId]/decisions`, `/api/decisions/[decisionId]`, `/api/agents/[agentId]/pending-approvals`

### Cross-Session Atomic Tasks (F6)
- `src/lib/tasks/atomic-checkout.ts` — Redis distributed lock: `SET NX EX` acquire + Lua script for atomic release/renew
- Uses `SCAN` cursor loop (never `KEYS`) for `getAgentCheckouts` to avoid blocking Redis
- `src/lib/tasks/swarm-coordinator.ts` — `distributeTask` (round-robin across online agents), `releaseAllAgentTasks`
- REST: `/api/tasks/[taskId]/checkout` (200/409 conflict/403 forbidden), `/api/tasks/[taskId]/checkout/renew`, `/api/tasks/[taskId]/checkout/force-release`, `/api/agents/[agentId]/checkouts`

### Clipmart Templates (F7)
- `src/lib/templates/template-engine.ts` — `exportTemplate`: scrubs secrets (API keys, tokens), replaces MCP URLs with `{{MCP_URL}}` placeholders, appends SHA-256 checksum
- `importTemplate`: verifies checksum, generates new IDs, returns `warnings[]` for any remaining placeholders
- Prisma model: `Template` with marketplace fields (`isPublic`, `category`, `importCount`)
- REST: `/api/templates`, `/api/templates/[templateId]`, `/api/templates/[templateId]/import`, `/api/templates/import`, `/api/agents/[agentId]/export`

### MCP Server v2 (F8)
- `mcp-server/src/auth.ts` — `validateApiKey()` calls `/api/keys/validate`; supports USER mode (API key) and ADMIN mode (shared secret)
- `mcp-server/src/tools/f1-f7.ts` — 9 new MCP tools covering budget check/record, org-chart queries, goal listing, heartbeat context, template export
- `/api/keys/validate` returns `{ valid, userId, organizationId, scopes }`
- Per-IP rate limiting on chat route: 30 req/min sliding window, `Retry-After` header on 429
- Magic number file validation: `src/lib/security/magic-numbers.ts` — validates PDF, DOCX, XLSX, XLS, PPTX, CSV uploads by byte signature before processing

### PostgreSQL RLS
- `src/lib/db/rls-middleware.ts` — `withOrgContext(orgId, fn)` sets `app.current_org_id` session parameter then executes `fn` inside a transaction
- Applied via `prisma.$extends` in `src/lib/prisma.ts`; migration: `prisma/migrations/20240108000000_enable_rls/`

### async-execution Feature Flag
- ⚠️ Flag is wired at 100% rollout in `src/lib/feature-flags/index.ts` and checked in the chat route
- **Currently disabled in production** — the worker service is not yet deployed on Railway; do not enable via env until the worker is live

---

## 6. LOCAL SETUP

```bash
pnpm install && cp .env.example .env.local
# Required: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY, OPENAI_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET
# Optional: REDIS_URL, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, MOONSHOT_API_KEY
# Required in production: CRON_SECRET (budget-reset + governance-timeout crons), ADMIN_USER_IDS
# ECC: ECC_ENABLED, ECC_MCP_URL | Observability: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME | Errors: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN
pnpm db:push && pnpm db:generate && pnpm dev  # http://localhost:3000
```

⚠️ **Production DB = Railway PostgreSQL.** Supabase `elegzqtlqkcvqhpklykl` is PAUSED — never query it. Direct DB access: Railway → Postgres → Database → Query tab.

### Commands
```
pnpm dev / build / start         # Dev (Turbopack) / build / production
pnpm worker                      # BullMQ worker (required in production)
pnpm test / test:e2e             # Vitest unit / Playwright E2E
pnpm typecheck / lint            # TypeScript / ESLint
pnpm precheck                    # Pre-push: TS → vitest → lucide mocks → placeholder strings
pnpm db:generate/migrate/push/studio/seed
pnpm test:coverage / test:load   # Coverage report / k6 load test
pnpm mcp:playwright              # Playwright MCP server (port 3100)
pnpm knip / knip:fix             # Unused dep detection / auto-fix

# Run a single test file
pnpm test src/lib/queue/__tests__/worker.test.ts

# Run worker locally (requires full env)
set -a && source .env.local && set +a && pnpm worker
```

---

## 7. CLAUDE WORKING GUIDELINES

### Pre-Push Workflow
Run `pnpm precheck` before every commit+push. All 4 checks must PASS: TypeScript → vitest → lucide mocks → placeholder strings.

### Hard Rules
- Never edit `src/generated/` — Prisma auto-generates this
- Never edit `prisma/migrations/` — use `pnpm db:migrate`
- Never import from `@prisma/client` — always from `@/generated/prisma`
- Never call AI providers directly — use Vercel AI SDK via `src/lib/ai.ts`
- Never use `npm` or `yarn` — always `pnpm`
- No `any` type — ever | No `console.log` in committed code
- Never export non-handler constants from route files — use `src/lib/constants/`
- Only valid route exports: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, dynamic, revalidate, runtime, fetchCache, preferredRegion

### Adding a New Node Type
Full 11-step checklist → [conventions-patterns.md](.claude/docs/conventions-patterns.md#adding-a-new-node-type).
Short: `NodeType` union → `NODE_TYPES` array → handler → register → node component → flow-builder → node-picker → property-panel → test → node-picker count.

### Adding a New API Route
- Protected: `requireAgentOwner(agentId)` from `@/lib/api/auth-guard` (never raw `auth()`)
- Public: add path to `src/middleware.ts` matcher; validate input with Zod; never expose internals in catch

### Testing
- Unit: Vitest, `__tests__/` next to source; 3960+ tests across 300 files
- E2E: Playwright, `e2e/tests/`, `.spec.ts`; test behavior, not implementation

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes by modelId prefix; `getEmbeddingModel()` → OpenAI text-embedding-3-small
- `src/lib/models.ts` is client-safe; adding a provider: package → `src/lib/env.ts` → `src/lib/ai.ts` → `src/lib/models.ts`

### ECC Module Rules
- Always check `ECC_ENABLED` env var or per-agent `eccEnabled` before using ECC features
- Async ingestion ONLY — never in startup path (Railway healthcheck = 120s)
- Internal MCP URL: `process.env.ECC_MCP_URL`, path: `/mcp`; push metrics (OTLP), not pull
