# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Visual AI agent builder with multi-agent orchestration and continuous learning. Build AI agents
via a flow editor (XyFlow), manage knowledge bases with RAG (chunking + embeddings + hybrid
search), enable agent-to-agent communication (A2A protocol), and chat with agents. Features
include: agent marketplace/discovery with faceted search, 221 agent templates across 19
categories (including 29 ECC Developer Agents), agent-as-tool orchestration (AI dynamically
calls sibling agents), web browsing capabilities (fetch + browser actions via MCP), an
embeddable chat widget, a CLI Generator that automatically produces a full MCP server bridge
from any CLI application (6-phase AI pipeline: analyze → design → implement → test → document →
publish, dual-target: Python FastMCP or TypeScript Node.js MCP SDK), an Agent Evals / Testing
Framework (3-layer: deterministic + semantic similarity + LLM-as-Judge, deploy-triggered runs),
inbound webhooks (Standard Webhooks spec, HMAC-SHA256, provider presets), and ECC integration
(everything-claude-code) — a Skills Browser (`/skills`), Meta-Orchestrator for autonomous agent
routing, Learn node for pattern extraction, and a continuous learning system with instinct-based
knowledge evolution. OAuth login (GitHub + Google). Simplified extraction from the enterprise
"direct-solutions" project — no multi-tenancy, no billing, no plugins, no collaboration.

---

## 2. TECH STACK

- **Framework:** Next.js 15.5, App Router, Turbopack
- **Runtime:** React 19
- **Language:** TypeScript strict
- **Styling:** Tailwind CSS v4 — ONLY Tailwind, no inline styles, no CSS modules
- **Package manager:** pnpm
- **Database ORM:** Prisma v6 + PostgreSQL (**Railway PostgreSQL**, pgvector v0.8.2)
  - ⚠️ PRODUCTION DB = Railway PostgreSQL (postgres.railway.internal) — NOT Supabase
  - Supabase project `elegzqtlqkcvqhpklykl` is PAUSED/UNUSED — do not query it
- **AI:** Vercel AI SDK v6 (`ai@6.0.116`) — never raw fetch to providers
  - **Chat (required):** DeepSeek (`@ai-sdk/deepseek`, default), OpenAI (`@ai-sdk/openai`)
  - **Chat (optional):** Anthropic (`@ai-sdk/anthropic`), Google Gemini (`@ai-sdk/google`), Groq (`@ai-sdk/groq`), Mistral (`@ai-sdk/mistral`), Moonshot/Kimi (OpenAI-compatible)
  - **Model catalog:** `src/lib/models.ts` — client-safe, 18 models across 6 providers, tiered (fast/balanced/powerful)
  - **Embeddings:** OpenAI `text-embedding-3-small` (1536 dim) — required, DeepSeek has no embeddings
- **Validation:** Zod v3
- **UI primitives:** Radix UI (individual packages) + lucide-react icons
- **Flow editor:** @xyflow/react v12
- **Auth:** NextAuth v5 (next-auth@5) + PrismaAdapter, JWT sessions, GitHub + Google OAuth
- **MCP:** @ai-sdk/mcp — Streamable HTTP + SSE transports for external tool servers
- **Data fetching:** SWR (client-side hooks)
- **Charts:** recharts (analytics dashboard)
- **Toasts:** Sonner
- **Unit tests:** Vitest + @vitest/coverage-v8
- **E2E tests:** Playwright (10 spec files)
- **Redis:** ioredis v5 — cross-replica shared state (rate limiting, cache, session, MCP pool coordination)
- **Utilities:** class-variance-authority (cva), clsx, tailwind-merge

---

## 3. REFERENCE DOCS (read on-demand)

Detailed reference documentation lives in `.claude/docs/`. Read these when working on specific features:

| Doc | When to read |
|-----|-------------|
| [folder-structure.md](.claude/docs/folder-structure.md) | Finding files, understanding project layout |
| [prisma-models.md](.claude/docs/prisma-models.md) | DB schema changes, model relations, enums |
| [api-routes.md](.claude/docs/api-routes.md) | Adding/modifying API endpoints |
| [conventions-patterns.md](.claude/docs/conventions-patterns.md) | Runtime engine, streaming, RAG, webhooks, evals, CLI generator, MCP, versioning |
| [ecc-integration.md](.claude/docs/ecc-integration.md) | ECC module, skills, instincts, meta-orchestrator |
| [railway-deployment.md](.claude/docs/railway-deployment.md) | Deploy config, Railway constraints, env vars, 2026 standards |
| [deal-flow-agent.md](.claude/docs/deal-flow-agent.md) | M&A due diligence subproject (Python FastAPI) |

---

## 4. KEY PATTERNS (summary)

### Runtime Engine
- 61 node handlers in `src/lib/runtime/handlers/index.ts` (+ 2 streaming variants)
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult`, never throw — always graceful fallback

### Streaming Chat
- `executeFlow` (sync JSON) and `executeFlowStreaming` (NDJSON ReadableStream)
- NDJSON chunks: `message`, `stream_start`, `stream_delta`, `stream_end`, `done`, `error`
- Client hook: `useStreamingChat` in `src/components/chat/use-streaming-chat.ts`

### Knowledge/RAG
- Ingest → chunk (400 tokens) → embed (OpenAI) → pgvector
- Search: hybrid (semantic 70% + BM25 30%) → optional LLM re-ranking
- HNSW indexes for sub-10ms vector search

### Auth
- NextAuth v5, JWT sessions, 24h maxAge
- `requireAuth()` / `requireAgentOwner()` from `@/lib/api/auth-guard`
- Public paths: `/login`, `/embed/*`, `/api/auth/*`, `/api/health`, `/api/agents/[agentId]/chat`, `/api/a2a/*`

### Response Format
All API routes: `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 5. LOCAL SETUP

```bash
pnpm install
cp .env.example .env.local
# Required: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY, OPENAI_API_KEY, AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET
# Optional: REDIS_URL, CRON_SECRET, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, MOONSHOT_API_KEY
# ECC: ECC_ENABLED, ECC_MCP_URL
# Observability: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME
pnpm db:push && pnpm db:generate
pnpm dev  # http://localhost:3000
```

### ⚠️ DATABASE — VAŽNO

**PRODUCTION baza = Railway PostgreSQL** (postgres.railway.internal)
- DATABASE_URL i DIRECT_URL u Railway Variables → Postgres servis → Variables tab
- pgvector v0.8.2 je instaliran direktno na Railway PostgreSQL

**Supabase projekat `elegzqtlqkcvqhpklykl` je PAUZIRAN i ne koristi se.**
- NE queryuj Supabase za produkcijske podatke
- NE koristi Supabase SQL Editor za agent-studio podatke
- Ako ikad treba da quertuješ bazu direktno: Railway → Postgres servis → Database → Query tab

### Commands
```
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check (no emit)
pnpm test             # Vitest unit tests
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with coverage report
pnpm test:load        # k6 load testing
pnpm test:e2e         # Playwright E2E tests
pnpm test:e2e:ui      # Playwright UI mode
pnpm test:e2e:debug   # Playwright debug mode
pnpm test:e2e:report  # Show Playwright HTML report
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations (dev)
pnpm db:migrate:deploy # Deploy migrations (production)
pnpm db:push          # Sync schema directly
pnpm db:studio        # Prisma Studio UI
pnpm db:seed          # Seed dev data
pnpm precheck         # Pre-push validation (TS + vitest + lucide mocks + strings)
pnpm precheck:file    # Same, for a specific file
pnpm worker           # Run BullMQ queue worker
pnpm mcp:playwright   # Start Playwright MCP server (port 3100)
pnpm knip             # Check for unused dependencies/exports
pnpm knip:fix         # Auto-fix unused imports
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
- No `any` type — ever
- No `console.log` left in committed code
- Never export non-handler constants from Next.js route files (`route.ts`) — use `src/lib/constants/`
- Only valid route file exports: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, dynamic, revalidate, runtime, fetchCache, preferredRegion

### Adding a New Node Type
1. Add type to `NodeType` union in `src/types/index.ts`
2. Add type string to `NODE_TYPES` array in `src/lib/validators/flow-content.ts`
3. Create handler in `src/lib/runtime/handlers/[name]-handler.ts`
4. Register in `src/lib/runtime/handlers/index.ts`
5. Create display component in `src/components/builder/nodes/[name]-node.tsx`
6. Register component in `NODE_TYPES` map in `src/components/builder/flow-builder.tsx`
7. Add to node picker in `src/components/builder/node-picker.tsx`
8. Add property editor in `src/components/builder/property-panel.tsx`
9. If node sets output variable, add to `OUTPUT_VAR_TYPES` set in `property-panel.tsx`
10. Write unit test in `src/lib/runtime/handlers/__tests__/[name]-handler.test.ts`
11. Update node count in `src/components/builder/__tests__/node-picker.test.tsx`

### Adding a New API Route
- Follow existing pattern: parse params, try/catch with `logger.error`, return `{ success, data/error }`
- Protected routes: use `requireAgentOwner(agentId)` from `@/lib/api/auth-guard` (NOT raw `auth()`)
- Public routes: add path to middleware matcher in `src/middleware.ts`
- Validate input with Zod where applicable
- Never expose internal error details — return generic messages in catch blocks

### Testing
- Unit tests: Vitest, `__tests__/` folders next to source, `.test.ts` extension
- E2E tests: Playwright, `e2e/tests/` folder, `.spec.ts` extension
- Run: `pnpm test` (unit), `pnpm test:e2e` (E2E)
- 3211+ unit tests across 245 test files
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider by modelId prefix
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- `src/lib/models.ts` is client-safe — no server imports, no env access
- Adding a new provider: (1) add `@ai-sdk/[provider]` package, (2) add env key to `src/lib/env.ts`, (3) add factory + routing to `src/lib/ai.ts`, (4) add models to `src/lib/models.ts`

### ECC Module Rules
- Always check feature flag: `ECC_ENABLED` env var or per-agent `eccEnabled` field
- Async ingestion ONLY — never put skill ingestion in startup path (Railway healthcheck = 120s)
- Internal networking: MCP server URL via `process.env.ECC_MCP_URL`, MCP path: `/mcp`
- Push metrics (OTLP), not pull — Railway doesn't support Prometheus scrape
