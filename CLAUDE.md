# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Personal/local AI agent builder. Build AI agents visually via a flow editor (XyFlow),
manage knowledge bases with RAG (chunking + embeddings + hybrid search), and chat with agents.
Simplified extraction from the enterprise "direct-solutions" project — no multi-tenancy,
no billing, no plugins, no collaboration. OAuth login (GitHub + Google), embeddable chat widget.

---

## 2. TECH STACK

- **Framework:** Next.js 15.5, App Router, Turbopack
- **Runtime:** React 19
- **Language:** TypeScript strict
- **Styling:** Tailwind CSS v4 — ONLY Tailwind, no inline styles, no CSS modules
- **Package manager:** pnpm
- **Database ORM:** Prisma v6 + PostgreSQL (Supabase, pgvector v0.8.0)
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
- **Data fetching:** SWR (client-side hooks, analytics dashboard)
- **Charts:** recharts (analytics dashboard)
- **Markdown:** react-markdown
- **Toasts:** Sonner
- **Unit tests:** Vitest + @vitest/coverage-v8
- **Utilities:** class-variance-authority (cva), clsx, tailwind-merge

---

## 3. FOLDER STRUCTURE

```
prisma/
  schema.prisma         ← DB schema (17 models, pgvector, versioning, A2A)
  migrations/           ← auto-generated — never edit manually

public/
  embed.js              ← Embeddable widget script (bubble + iframe)

src/
  instrumentation.ts    ← Startup env validation (critical vars check)
  middleware.ts         ← Auth middleware (cookie-based session check)

  app/
    page.tsx                          ← Dashboard (agent list, create/delete, export/import)
    layout.tsx                        ← Root layout (dark mode, Sonner, SessionProvider)
    globals.css                       ← Tailwind v4 theme + React Flow overrides
    login/page.tsx                    ← Login page (GitHub + Google OAuth)
    analytics/page.tsx                ← Analytics dashboard (charts, response times, KB stats)
    builder/[agentId]/page.tsx        ← Flow editor page
    builder/[agentId]/error.tsx       ← Error boundary (Flow Editor Error)
    chat/[agentId]/page.tsx           ← Chat interface (streaming via useStreamingChat)
    chat/[agentId]/error.tsx          ← Error boundary (Chat Error)
    embed/[agentId]/page.tsx          ← Embed chat widget page
    embed/layout.tsx                  ← Dedicated embed layout (no embed.js, no SessionProvider)
    knowledge/[agentId]/page.tsx      ← Knowledge base management
    knowledge/[agentId]/error.tsx     ← Error boundary (Knowledge Base Error)
    api/
      auth/[...nextauth]/route.ts              ← NextAuth API route (GET, POST)
      health/route.ts                          ← Health check endpoint (DB connectivity + uptime)
      analytics/route.ts                       ← Analytics dashboard data (response times, KB stats, conversations)
      agents/route.ts                          ← GET list, POST create
      agents/[agentId]/route.ts                ← GET, PATCH, DELETE agent
      agents/[agentId]/flow/route.ts           ← GET, PUT flow content (auth-guarded, Zod-validated, auto-versioned)
      agents/[agentId]/flow/versions/route.ts             ← GET list, POST create version
      agents/[agentId]/flow/versions/[versionId]/route.ts ← GET single version
      agents/[agentId]/flow/versions/[versionId]/diff/route.ts    ← GET diff with previous
      agents/[agentId]/flow/versions/[versionId]/deploy/route.ts  ← POST deploy version
      agents/[agentId]/flow/versions/[versionId]/rollback/route.ts ← POST rollback + deploy
      agents/[agentId]/flow/versions/[versionId]/test/route.ts    ← POST sandbox test
      agents/[agentId]/chat/route.ts           ← POST send message
      agents/[agentId]/knowledge/sources/route.ts         ← GET, POST sources (URL/TEXT)
      agents/[agentId]/knowledge/sources/upload/route.ts     ← POST file upload (PDF/DOCX, multipart/form-data)
      agents/[agentId]/knowledge/sources/[sourceId]/route.ts  ← DELETE source
      agents/[agentId]/knowledge/search/route.ts          ← POST hybrid search
      agents/[agentId]/export/route.ts            ← GET download agent as JSON
      agents/[agentId]/mcp/route.ts               ← GET, POST, DELETE agent-server links
      agents/import/route.ts                      ← POST import agent from JSON
      mcp-servers/route.ts                        ← GET list, POST create MCP servers
      mcp-servers/[serverId]/route.ts             ← GET, PATCH, DELETE MCP server
      mcp-servers/[serverId]/test/route.ts        ← POST test MCP connection

  components/
    ui/               ← 12 Radix UI primitives (button, card, dialog, input, etc.)
      error-display.tsx ← Shared error boundary UI component
      __tests__/        ← UI component tests
    chat/
      use-streaming-chat.ts ← Client hook for consuming NDJSON chat stream
    mcp/
      mcp-server-manager.tsx  ← Global MCP server CRUD dialog
      agent-mcp-selector.tsx  ← Per-agent MCP server picker with tool filtering
    builder/
      flow-builder.tsx    ← Main ReactFlow editor (+ MCP panel, version history, deploy status)
      node-picker.tsx     ← Node type selector dropdown
      property-panel.tsx  ← Right sidebar for editing node properties
      version-panel.tsx   ← Version history sidebar (SWR, rollback, compare, deploy)
      deploy-dialog.tsx   ← Deploy confirmation dialog with sandbox test
      diff-view.tsx       ← Version diff viewer (added/removed/modified nodes)
      nodes/              ← 18 node display components (base, message, ai-response, mcp-tool, etc.)

  lib/
    ai.ts             ← AI model routing (DeepSeek/OpenAI/Anthropic/Gemini/Groq/Mistral/Kimi)
    models.ts         ← Client-safe model catalog (18 models, 6 providers, fast/balanced/powerful tiers)
    auth.ts           ← NextAuth config (GitHub + Google providers, PrismaAdapter, JWT)
    analytics.ts      ← Fire-and-forget analytics tracking
    env.ts            ← Environment variable validation (Zod schema)
    logger.ts         ← Structured JSON logger (server-only, info/warn/error)
    prisma.ts         ← Prisma client singleton
    rate-limit.ts     ← In-memory sliding window rate limiter
    utils.ts          ← cn() utility (clsx + tailwind-merge)
    api/
      auth-guard.ts     ← requireAuth(), requireAgentOwner(), isAuthError() — used by all protected routes
    validators/
      flow-content.ts   ← Zod schema for FlowContent validation (nodes, edges, variables)
    versioning/
      diff-engine.ts    ← JSON diff engine for FlowContent (node/edge/variable comparison)
      version-service.ts ← Version CRUD, deploy, rollback, diff (supports transaction client)
    mcp/
      client.ts         ← MCP client wrapper (getMCPToolsForAgent, testMCPConnection, callMCPTool)
      pool.ts           ← Connection pool (in-memory, 5min TTL, auto-cleanup)
      __tests__/        ← MCP client and pool tests
    schemas/
      agent-export.ts  ← Zod schema + AgentExportData type for agent export/import
    runtime/
      engine.ts            ← Synchronous execution loop (MAX_ITERATIONS=50, MAX_HISTORY=100)
      engine-streaming.ts  ← Streaming execution loop (NDJSON ReadableStream output)
      stream-protocol.ts   ← StreamChunk encode/decode/writer helpers
      context.ts           ← Load/save conversation context from DB
      template.ts          ← {{variable}} interpolation
      types.ts             ← RuntimeContext, ExecutionResult, NodeHandler, StreamChunk, StreamWriter
      handlers/
        index.ts           ← Handler registry (17 handlers)
        ai-response-handler.ts          ← Non-streaming AI (generateText + MCP tools)
        ai-response-streaming-handler.ts ← Streaming AI (streamText → NDJSON + MCP tools)
        mcp-tool-handler.ts             ← Deterministic MCP tool call node
        message-handler.ts, condition-handler.ts, ...
    knowledge/
      index.ts        ← Main search entry point
      chunker.ts      ← Text chunking (400 tokens, 20% overlap)
      parsers.ts      ← PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), text parsing
      embeddings.ts   ← OpenAI embedding generation
      search.ts       ← Hybrid search (semantic + BM25 via pgvector) + parent document retrieval
      reranker.ts     ← LLM-based result re-ranking
      scraper.ts      ← URL content fetching
      ingest.ts       ← Source ingestion pipeline (scrape → parse → chunk → embed → store)

  types/
    index.ts          ← FlowNode, FlowEdge, FlowContent, FlowVariable, NodeType
    pdf-parse.d.ts    ← Type declaration for pdf-parse
    mammoth.d.ts      ← Type declaration for mammoth

  generated/prisma/   ← AUTO-GENERATED — never edit
```

---

## 4. PRISMA MODELS & RELATIONS

```
User
  ├── Account[] (1:N, OAuth account linking, @@unique([provider, providerAccountId]))
  ├── Session[] (1:N, database sessions)
  ├── MCPServer[] (1:N, userId required)
  │     └── AgentMCPServer[] (1:N, cascade delete — join table)
  └── Agent[] (1:N, userId is optional)
        ├── Flow (1:1, cascade delete)
        │     ├── FlowVersion[] (1:N, cascade delete — immutable content snapshots)
        │     └── activeVersionId? → FlowVersion
        ├── FlowDeployment[] (1:N, cascade delete — deploy audit log)
        ├── KnowledgeBase (1:1, cascade delete)
        │     └── KBSource[] (1:N, cascade delete)
        │           └── KBChunk[] (1:N, cascade delete, has vector(1536) embedding)
        ├── AgentMCPServer[] (1:N, cascade delete — enabledTools filter)
        ├── AnalyticsEvent[] (1:N, cascade delete — timeToFirstTokenMs, totalResponseTimeMs, isNewConversation)
        └── Conversation[] (1:N, cascade delete, optional flowVersionId for audit)
              └── Message[] (1:N, cascade delete)

VerificationToken — NextAuth email verification (standalone, no relations)
```

**Enums:** KBSourceType (FILE|URL|SITEMAP|TEXT), KBSourceStatus (PENDING|PROCESSING|READY|FAILED), ConversationStatus (ACTIVE|COMPLETED|ABANDONED), MessageRole (USER|ASSISTANT|SYSTEM), AnalyticsEventType (CHAT_RESPONSE), MCPTransport (STREAMABLE_HTTP|SSE), FlowVersionStatus (DRAFT|PUBLISHED|ARCHIVED)

**Key details:**
- Agent.userId is `String?` — optional, linked when user is authenticated
- MCPServer.userId is `String` — required, ownership enforced in API routes
- AgentMCPServer has @@unique([agentId, mcpServerId]) to prevent duplicate links
- Account model enables OAuth account linking (GitHub + Google on same email)
- KBChunk.embedding uses `Unsupported("vector(1536)")` for pgvector
- Flow.content is `Json` storing `FlowContent` (nodes, edges, variables)
- Conversation.variables is `Json` storing runtime variable state
- AnalyticsEvent.metadata is `Json` storing response timing and conversation data
- All child models cascade delete from their parent

---

## 5. API ROUTES

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents` | GET, POST | List all agents (with conversation/source counts), create agent + flow + KB |
| `/api/agents/[agentId]` | GET, PATCH, DELETE | Full agent detail, update fields, delete |
| `/api/agents/[agentId]/flow` | GET, PUT | Get/upsert flow content (auth-guarded, Zod-validated, auto-versioned in transaction) |
| `/api/agents/[agentId]/flow/versions` | GET, POST | List all versions, manually create version with label |
| `/api/agents/[agentId]/flow/versions/[versionId]` | GET | Get single version |
| `/api/agents/[agentId]/flow/versions/[versionId]/diff` | GET | Diff with previous or `?compareWith=` version |
| `/api/agents/[agentId]/flow/versions/[versionId]/deploy` | POST | Deploy version (archives old PUBLISHED, creates FlowDeployment) |
| `/api/agents/[agentId]/flow/versions/[versionId]/rollback` | POST | Rollback to version (creates new version + deploys) |
| `/api/agents/[agentId]/flow/versions/[versionId]/test` | POST | Sandbox test execution against version content |
| `/api/agents/[agentId]/chat` | POST | Send user message; `{ stream: true }` for NDJSON streaming, otherwise JSON response |
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | List sources with chunk counts, create URL/TEXT + trigger background ingest |
| `/api/agents/[agentId]/knowledge/sources/upload` | POST | File upload (multipart/form-data, PDF/DOCX, max 10 MB) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | Delete source and all its chunks |
| `/api/agents/[agentId]/knowledge/search` | POST | Test hybrid search (semantic + BM25 + optional reranking) |
| `/api/agents/[agentId]/export` | GET | Download agent as versioned JSON (config + flow, no conversations/KB) |
| `/api/agents/import` | POST | Import agent from exported JSON, Zod-validated with `z.literal(1)` version |
| `/api/agents/[agentId]/mcp` | GET, POST, DELETE | List/link/unlink MCP servers for agent |
| `/api/mcp-servers` | GET, POST | List all user's MCP servers, create new server |
| `/api/mcp-servers/[serverId]` | GET, PATCH, DELETE | Get/update/delete MCP server (ownership enforced) |
| `/api/mcp-servers/[serverId]/test` | POST | Test MCP connection, auto-refresh toolsCache |
| `/api/auth/*` | GET, POST | NextAuth authentication endpoints |
| `/api/health` | GET | Health check (DB connectivity + uptime + version) |
| `/api/analytics` | GET | Analytics dashboard data (response times, KB stats, conversations) |

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 6. KEY CONVENTIONS & PATTERNS

### Runtime Engine
- 17 node handlers registered in `src/lib/runtime/handlers/index.ts`
- Node types: message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook, mcp_tool
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult` with messages, nextNodeId, waitForInput, updatedVariables
- Handlers never throw — always return graceful fallback

### Streaming Chat
- Two engine variants: `executeFlow` (synchronous JSON) and `executeFlowStreaming` (NDJSON ReadableStream)
- Chat API: `{ stream: true }` in request body switches to streaming mode (backwards compatible)
- NDJSON wire protocol chunks: `message`, `stream_start`, `stream_delta`, `stream_end`, `done`, `error`
- `StreamChunk` discriminated union type in `src/lib/runtime/types.ts`
- Only `ai_response` nodes stream tokens; all other nodes emit instant `message` chunks
- `stream-protocol.ts` has `encodeChunk()`, `parseChunk()`, `createStreamWriter()` — shared between server and client
- Client hook `useStreamingChat` in `src/components/chat/use-streaming-chat.ts` handles line-buffered parsing
- Context and messages are always saved in `finally` block, even on client disconnect
- Each save operation (saveMessages, saveContext, writer.close) is in its own try/catch to prevent cascading failures
- User messages are persisted to DB via `prisma.message.create` in both engine.ts and engine-streaming.ts
- AbortController with 60s timeout on the client side

### Knowledge/RAG Pipeline
- Ingest: scrape URL / parse file / accept text → chunk (400 tokens, 20% overlap) → embed (OpenAI text-embedding-3-small) → store in pgvector
- File upload: PDF (pdf-parse) and DOCX (mammoth) — `parseSource()` routes by file extension
- URL parsing: HTML (cheerio, removes nav/footer/script/style), plain text passthrough
- Search: hybrid (semantic cosine similarity + BM25 keyword) → weighted RRF (semantic 70% + BM25 30%) → optional LLM re-ranking
- Similarity threshold 0.25 — chunks with lower scores are discarded
- Dynamic topK: 5 for short queries, 8 for longer queries
- Parent document retrieval — returns broader context around matched chunks
- UI: Add Source dialog has URL, Text, and File tabs with client-side 10 MB validation

### Agent Export/Import
- Export format: `{ version: 1, exportedAt, agent: { name, description, systemPrompt, model }, flow: { nodes, edges, variables } }`
- Zod schema in `src/lib/schemas/agent-export.ts` — version validated with `z.literal(1)`, not `z.number()`
- Export excludes: conversations, messages, knowledge base sources/chunks
- Import creates new agent with `(imported)` suffix + empty knowledge base
- Dashboard UI: Export option in agent card dropdown menu, Import button with file picker
- Max import size: 5 MB

### Template Variables
- `{{variable}}` syntax in node messages, resolved at runtime via `resolveTemplate()`
- Supports nested paths (`{{user.address.city}}`) and bracket notation (`{{items[0]}}`)

### Error Boundaries
- Next.js `error.tsx` in builder, chat, and knowledge routes
- Shared `ErrorDisplay` component in `src/components/ui/error-display.tsx`
- Shows error details (message + digest) only in development mode
- "Try Again" button calls Next.js `reset()`, "Back to Dashboard" links to `/`
- Each route provides a context-specific title (e.g. "Flow Editor Error")

### UI Components
- cva (class-variance-authority) for component variants
- `cn()` utility combining clsx + tailwind-merge
- Dark mode by default (`<html className="dark">`)

### Auth
- NextAuth v5 with GitHub + Google OAuth providers
- PrismaAdapter for storage, JWT session strategy
- `allowDangerousEmailAccountLinking` enabled for both providers (same email, different providers)
- Middleware in `src/middleware.ts` — cookie check for `authjs.session-token` / `__Secure-authjs.session-token`
- Public paths: `/login`, `/embed/*`, `/api/auth/*`, `/api/health`, `/api/agents/[agentId]/chat`, `/_next/*`, `/embed.js`
- Agent.userId is optional — agents can exist without auth

### Embed Widget
- `public/embed.js` creates bubble + iframe pointing to `/embed/[agentId]`
- iframe guard: `if (window !== window.top) return;` — prevents recursive loading
- `src/app/embed/layout.tsx` — dedicated layout without embed.js, without SessionProvider
- Customizable via data attributes: `data-color`, `data-title`, `data-welcome-message`, `data-proactive-message`
- Proactive message after 30s, unread badge, mobile full-screen

### MCP Integration
- Hybrid registry pattern: global MCP servers (per-user) + per-agent selection via AgentMCPServer join table
- Transports: Streamable HTTP (primary) + SSE (backward compat) via `@ai-sdk/mcp createMCPClient()`
- Connection pooling: in-memory pool with 5min idle TTL, auto-cleanup every 60s (`src/lib/mcp/pool.ts`)
- **MCP Tool Node** (`mcp_tool`): deterministic tool call — `mcpServerId`, `toolName`, `inputMapping` with template resolution, `outputVariable`
- **AI Response + MCP**: tools auto-injected into `streamText`/`generateText` when agent has linked MCP servers, `stopWhen: stepCountIs(5)` for multi-step tool calling
- Graceful degradation: if MCP tools fail to load, AI continues without tools (logged as warning)
- Tool filtering: per-agent `enabledTools` array — if set, only listed tools are passed to AI
- UI: Dashboard "MCP Servers" button for global management, flow builder "MCP" button for per-agent server selection

### Flow Versioning & Deploy Pipeline
- Immutable version snapshots created on every flow save (30s throttle, skips if unchanged)
- Version lifecycle: DRAFT → PUBLISHED → ARCHIVED (only one PUBLISHED at a time)
- Deploy uses interactive `prisma.$transaction` — archives old, publishes new, updates Flow.activeVersionId, creates FlowDeployment
- Rollback creates a NEW version with old content (non-destructive), then deploys it
- Flow save + version creation wrapped in single transaction to prevent race conditions
- `VersionService.createVersion` accepts optional `tx` (transaction client) parameter
- Diff engine compares nodes by ID, edges by ID, variables by name; ignores position changes under 10px
- Version panel UI: SWR data fetching, compare/deploy/rollback actions per version
- Deploy dialog: optional note + sandbox test before confirming

### Auth Guards
- `requireAuth()` — returns `{ userId }` or 401 NextResponse
- `requireAgentOwner(agentId)` — returns `{ userId, agentId }`, or 401/403/404
- `isAuthError(result)` — type guard to check if result is a NextResponse error
- All agent routes use `requireAgentOwner()` except: `/api/agents/[agentId]/chat` (public for embed widget)
- Unowned agents (`userId: null`) are accessible to any authenticated user

### Input Validation
- `validateFlowContent()` — Zod schema for FlowContent (nodes, edges, variables)
- Max limits: 500 nodes, 2000 edges, 100 variables
- Validates node types against `NodeType` union, position values must be finite
- Applied on flow PUT route; returns `{ success, error }` with human-readable path

### Analytics & Monitoring
- `trackChatResponse()` — fire-and-forget analytics for every chat response
- Rate limiting: 20 req/min per agentId:IP on `/api/agents/[agentId]/chat`
- Health check: `/api/health` returns DB status, uptime, version
- Structured JSON logger (`src/lib/logger.ts`) — server-only, levels: info/warn/error
- `instrumentation.ts` — validates critical env variables at startup

---

## 7. LOCAL SETUP

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Required:
#   DATABASE_URL                   — Supabase PostgreSQL (port 6543 for pooling)
#   DIRECT_URL                     — Supabase PostgreSQL (port 5432 for migrations)
#   DEEPSEEK_API_KEY               — platform.deepseek.com — default chat model
#   OPENAI_API_KEY                 — platform.openai.com — required for embeddings + GPT models
#   AUTH_SECRET                    — NextAuth JWT secret (openssl rand -base64 32)
#   AUTH_GITHUB_ID / AUTH_GITHUB_SECRET  — GitHub OAuth App
#   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET  — Google OAuth client
# Optional (add keys to enable additional models):
#   ANTHROPIC_API_KEY              — console.anthropic.com — Claude Haiku/Sonnet/Opus
#   GOOGLE_GENERATIVE_AI_API_KEY   — aistudio.google.com — Gemini 2.5 Flash/Pro (free tier)
#   GROQ_API_KEY                   — console.groq.com — Llama 3.3, Compound Beta (free tier)
#   MISTRAL_API_KEY                — console.mistral.ai — Mistral Small/Medium/Large
#   MOONSHOT_API_KEY               — platform.moonshot.cn — Kimi K2

# 3. Setup database
pnpm db:push           # Sync schema to DB (no migration files)
# OR
pnpm db:migrate        # Create migration files

# 4. Generate Prisma client
pnpm db:generate

# 5. Enable pgvector extension (run in Supabase SQL editor)
# CREATE EXTENSION IF NOT EXISTS vector;

# 6. Start dev server
pnpm dev               # http://localhost:3000
```

### Available Commands
```
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check (no emit)
pnpm test             # Vitest unit tests
pnpm test:watch       # Vitest watch mode
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations (dev)
pnpm db:push          # Sync schema directly
pnpm db:studio        # Prisma Studio UI
pnpm db:seed          # Seed dev data
```

---

## 8. CLAUDE WORKING GUIDELINES

### Hard Rules
- Never edit `src/generated/` — Prisma auto-generates this
- Never edit `prisma/migrations/` — use `pnpm db:migrate`
- Never import from `@prisma/client` — always from `@/generated/prisma`
- Never call AI providers directly — use Vercel AI SDK via `src/lib/ai.ts`
- Never use `npm` or `yarn` — always `pnpm`
- No `any` type — ever
- No `console.log` left in committed code

### Adding a New Node Type
1. Add type to `NodeType` union in `src/types/index.ts`
2. Create handler in `src/lib/runtime/handlers/[name]-handler.ts`
3. Register in `src/lib/runtime/handlers/index.ts`
4. Create display component in `src/components/builder/nodes/[name]-node.tsx`
5. Add to node picker in `src/components/builder/node-picker.tsx`
6. Add property editor in `src/components/builder/property-panel.tsx`
7. Write unit test in `src/lib/runtime/handlers/__tests__/[name]-handler.test.ts`

### Adding a New API Route
- Follow existing pattern: parse params, try/catch with `logger.error`, return `{ success, data/error }`
- Protected routes: use `requireAgentOwner(agentId)` from `@/lib/api/auth-guard` (NOT raw `auth()`)
- Public routes (embed chat, health, auth): add path to middleware matcher in `src/middleware.ts`
- Validate input with Zod where applicable
- Never expose internal error details — return generic messages in catch blocks
- Keep Prisma queries in `src/lib/` when reusable

### Testing
- Unit tests: Vitest, `__tests__/` folders next to source, `.test.ts` extension
- Run: `pnpm test`
- 299 tests across 38 test files
- Existing tests cover: template resolution, text chunking, HTML parsing, flow engine, message handler, stream protocol, streaming engine, streaming AI handler, streaming AI+MCP handler, PDF/DOCX parsing, file type routing, agent export schema validation, error display component, env validation, logger, rate limiting, analytics, health check, search/expand-chunks, MCP client, MCP pool, MCP tool handler, diff engine, version service, auth guards, flow content validation, auth security integration (401/403 checks), circuit breaker, parallel agents
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider by modelId prefix
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- `getAvailableModels()` returns models filtered by configured env keys (client calls use `ALL_MODELS` directly)
- `src/lib/models.ts` is client-safe — no server imports, no env access; import `ALL_MODELS` in client components
- DeepSeek has no embedding support — OPENAI_API_KEY is required for KB features
- Adding a new provider: (1) add `@ai-sdk/[provider]` package, (2) add env key to `src/lib/env.ts`, (3) add factory + routing to `src/lib/ai.ts`, (4) add models to `src/lib/models.ts`
