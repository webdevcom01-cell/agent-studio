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

### SDLC Pipeline Orchestration
- `src/lib/sdlc/` — async webhook triggers, RAG KB seed, code review node, PR creation
- Issue idempotency prevents duplicate pipeline runs; workspace: `/tmp/sdlc` (Railway `/app` fallback)
- API routes: `/api/sdlc/*`

### BullMQ Managed Agent Tasks
- `src/lib/queue/` — long-running async task execution with status polling, cancel, pause, resume
- `AgentTask` Prisma model tracks state (PENDING → RUNNING → COMPLETED/FAILED)
- Worker process: `pnpm worker` — must run alongside Next.js in production
- Per-step timeouts, transaction-safe state, idempotent cancel

### ECC SDK Learn Hook
- Triggers auto `AgentExecution` record + ECC instinct extraction when `claude_agent_sdk` session ends
- Requires `ECC_ENABLED=true`; async — never blocks the main flow
- Hook: `src/lib/ecc/learn-hook.ts` — see [ecc-integration.md](.claude/docs/ecc-integration.md)

---

## 5. LOCAL SETUP

```bash
pnpm install && cp .env.example .env.local
# Required: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY, OPENAI_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET
# Optional: REDIS_URL, CRON_SECRET, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, MOONSHOT_API_KEY
# ECC: ECC_ENABLED, ECC_MCP_URL | Observability: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME
pnpm db:push && pnpm db:generate && pnpm dev  # http://localhost:3000
```

⚠️ **Production DB = Railway PostgreSQL.** Supabase `elegzqtlqkcvqhpklykl` is PAUSED — never query it. Direct DB access: Railway → Postgres → Database → Query tab.

### Commands
```
pnpm dev / build / start         # Dev (Turbopack) / build / production
pnpm worker                      # BullMQ worker (required in production)
pnpm test / test:e2e             # Vitest unit / Playwright E2E
pnpm typecheck / lint            # TypeScript / ESLint
pnpm precheck                    # Pre-push: TS + vitest + lucide mocks + strings
pnpm db:generate/migrate/push/studio/seed
pnpm test:coverage / test:load   # Coverage report / k6 load test
pnpm mcp:playwright              # Playwright MCP server (port 3100)
pnpm knip / knip:fix             # Unused dep detection / auto-fix
```

---

## 6. CLAUDE WORKING GUIDELINES

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
- Unit: Vitest, `__tests__/` next to source; 3211+ tests across 245 files
- E2E: Playwright, `e2e/tests/`, `.spec.ts`; test behavior, not implementation

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes by modelId prefix; `getEmbeddingModel()` → OpenAI text-embedding-3-small
- `src/lib/models.ts` is client-safe; adding a provider: package → `src/lib/env.ts` → `src/lib/ai.ts` → `src/lib/models.ts`

### ECC Module Rules
- Always check `ECC_ENABLED` env var or per-agent `eccEnabled` before using ECC features
- Async ingestion ONLY — never in startup path (Railway healthcheck = 120s)
- Internal MCP URL: `process.env.ECC_MCP_URL`, path: `/mcp`; push metrics (OTLP), not pull
