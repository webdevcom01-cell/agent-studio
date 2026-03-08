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
  - **Chat:** DeepSeek (default), OpenAI, Anthropic (optional)
  - **Embeddings:** OpenAI `text-embedding-3-small` (1536 dim) — required, DeepSeek has no embeddings
- **Validation:** Zod v3
- **UI primitives:** Radix UI (individual packages) + lucide-react icons
- **Flow editor:** @xyflow/react v12
- **Auth:** NextAuth v5 (next-auth@5) + PrismaAdapter, JWT sessions, GitHub + Google OAuth
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
  schema.prisma         ← DB schema (12 models, pgvector)
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
      agents/[agentId]/flow/route.ts           ← GET, PUT flow content
      agents/[agentId]/chat/route.ts           ← POST send message
      agents/[agentId]/knowledge/sources/route.ts         ← GET, POST sources (URL/TEXT)
      agents/[agentId]/knowledge/sources/upload/route.ts     ← POST file upload (PDF/DOCX, multipart/form-data)
      agents/[agentId]/knowledge/sources/[sourceId]/route.ts  ← DELETE source
      agents/[agentId]/knowledge/search/route.ts          ← POST hybrid search
      agents/[agentId]/export/route.ts            ← GET download agent as JSON
      agents/import/route.ts                      ← POST import agent from JSON

  components/
    ui/               ← 12 Radix UI primitives (button, card, dialog, input, etc.)
      error-display.tsx ← Shared error boundary UI component
      __tests__/        ← UI component tests
    chat/
      use-streaming-chat.ts ← Client hook for consuming NDJSON chat stream
    builder/
      flow-builder.tsx    ← Main ReactFlow editor
      node-picker.tsx     ← Node type selector dropdown
      property-panel.tsx  ← Right sidebar for editing node properties
      nodes/              ← 7 node display components (base, message, ai-response, etc.)

  lib/
    ai.ts             ← AI model routing (DeepSeek/OpenAI/Anthropic)
    auth.ts           ← NextAuth config (GitHub + Google providers, PrismaAdapter, JWT)
    analytics.ts      ← Fire-and-forget analytics tracking
    env.ts            ← Environment variable validation (Zod schema)
    logger.ts         ← Structured JSON logger (server-only, info/warn/error)
    prisma.ts         ← Prisma client singleton
    rate-limit.ts     ← In-memory sliding window rate limiter
    utils.ts          ← cn() utility (clsx + tailwind-merge)
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
        index.ts           ← Handler registry (16 handlers)
        ai-response-handler.ts          ← Non-streaming AI (generateText)
        ai-response-streaming-handler.ts ← Streaming AI (streamText → NDJSON)
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
  └── Agent[] (1:N, userId is optional)
        ├── Flow (1:1, cascade delete)
        ├── KnowledgeBase (1:1, cascade delete)
        │     └── KBSource[] (1:N, cascade delete)
        │           └── KBChunk[] (1:N, cascade delete, has vector(1536) embedding)
        ├── AnalyticsEvent[] (1:N, cascade delete — timeToFirstTokenMs, totalResponseTimeMs, isNewConversation)
        └── Conversation[] (1:N, cascade delete)
              └── Message[] (1:N, cascade delete)

VerificationToken — NextAuth email verification (standalone, no relations)
```

**Enums:** KBSourceType (FILE|URL|SITEMAP|TEXT), KBSourceStatus (PENDING|PROCESSING|READY|FAILED), ConversationStatus (ACTIVE|COMPLETED|ABANDONED), MessageRole (USER|ASSISTANT|SYSTEM), AnalyticsEventType (CHAT_RESPONSE)

**Key details:**
- Agent.userId is `String?` — optional, linked when user is authenticated
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
| `/api/agents/[agentId]/flow` | GET, PUT | Get/upsert flow content (nodes, edges, variables) |
| `/api/agents/[agentId]/chat` | POST | Send user message; `{ stream: true }` for NDJSON streaming, otherwise JSON response |
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | List sources with chunk counts, create URL/TEXT + trigger background ingest |
| `/api/agents/[agentId]/knowledge/sources/upload` | POST | File upload (multipart/form-data, PDF/DOCX, max 10 MB) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | Delete source and all its chunks |
| `/api/agents/[agentId]/knowledge/search` | POST | Test hybrid search (semantic + BM25 + optional reranking) |
| `/api/agents/[agentId]/export` | GET | Download agent as versioned JSON (config + flow, no conversations/KB) |
| `/api/agents/import` | POST | Import agent from exported JSON, Zod-validated with `z.literal(1)` version |
| `/api/auth/*` | GET, POST | NextAuth authentication endpoints |
| `/api/health` | GET | Health check (DB connectivity + uptime + version) |
| `/api/analytics` | GET | Analytics dashboard data (response times, KB stats, conversations) |

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 6. KEY CONVENTIONS & PATTERNS

### Runtime Engine
- 16 node handlers registered in `src/lib/runtime/handlers/index.ts`
- Node types: message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook
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
#   DATABASE_URL       — Supabase PostgreSQL (port 6543 for pooling)
#   DIRECT_URL         — Supabase PostgreSQL (port 5432 for migrations)
#   DEEPSEEK_API_KEY   — default chat model
#   OPENAI_API_KEY     — required for embeddings
#   AUTH_SECRET         — NextAuth JWT secret (openssl rand -base64 32)
#   AUTH_GITHUB_ID      — GitHub OAuth App client ID
#   AUTH_GITHUB_SECRET  — GitHub OAuth App client secret
#   AUTH_GOOGLE_ID      — Google OAuth client ID
#   AUTH_GOOGLE_SECRET  — Google OAuth client secret
# Optional:
#   ANTHROPIC_API_KEY  — alternative chat model

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
- Follow existing pattern: parse params, try/catch, return `{ success, data/error }`
- Protected routes: use `auth()` from `@/lib/auth` to get session, return 401 if unauthenticated
- Public routes (embed chat, health, auth): add path to middleware matcher in `src/middleware.ts`
- Validate input with Zod where applicable
- Keep Prisma queries in `src/lib/` when reusable

### Testing
- Unit tests: Vitest, `__tests__/` folders next to source, `.test.ts` extension
- Run: `pnpm test`
- Existing tests cover: template resolution, text chunking, HTML parsing, flow engine, message handler, stream protocol, streaming engine, streaming AI handler, PDF/DOCX parsing, file type routing, agent export schema validation, error display component, env validation, logger, rate limiting, analytics, health check, search/expand-chunks
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- DeepSeek has no embedding support — OPENAI_API_KEY is required for KB features
