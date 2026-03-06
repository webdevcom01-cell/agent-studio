# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Personal/local AI agent builder. Build AI agents visually via a flow editor (XyFlow),
manage knowledge bases with RAG (chunking + embeddings + hybrid search), and chat with agents.
Simplified extraction from the enterprise "direct-solutions" project — no multi-tenancy,
no billing, no SSO, no plugins, no collaboration. Single-user, local-first.

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
- **Data fetching:** SWR (client-side hooks)
- **Markdown:** react-markdown
- **Toasts:** Sonner
- **Unit tests:** Vitest + @vitest/coverage-v8
- **Utilities:** class-variance-authority (cva), clsx, tailwind-merge

---

## 3. FOLDER STRUCTURE

```
prisma/
  schema.prisma         ← DB schema (8 models, pgvector)
  migrations/           ← auto-generated — never edit manually

src/
  app/
    page.tsx                          ← Dashboard (agent list, create/delete)
    layout.tsx                        ← Root layout (dark mode, Sonner)
    globals.css                       ← Tailwind v4 theme + React Flow overrides
    builder/[agentId]/page.tsx        ← Flow editor page
    chat/[agentId]/page.tsx           ← Chat interface
    knowledge/[agentId]/page.tsx      ← Knowledge base management
    api/
      agents/route.ts                           ← GET list, POST create
      agents/[agentId]/route.ts                 ← GET, PATCH, DELETE agent
      agents/[agentId]/flow/route.ts            ← GET, PUT flow content
      agents/[agentId]/chat/route.ts            ← POST send message
      agents/[agentId]/knowledge/sources/route.ts         ← GET, POST sources
      agents/[agentId]/knowledge/sources/[sourceId]/route.ts  ← DELETE source
      agents/[agentId]/knowledge/search/route.ts          ← POST hybrid search

  components/
    ui/               ← 12 Radix UI primitives (button, card, dialog, input, etc.)
    builder/
      flow-builder.tsx    ← Main ReactFlow editor
      node-picker.tsx     ← Node type selector dropdown
      property-panel.tsx  ← Right sidebar for editing node properties
      nodes/              ← 7 node display components (base, message, ai-response, etc.)

  lib/
    ai.ts             ← AI model routing (DeepSeek/OpenAI/Anthropic)
    prisma.ts         ← Prisma client singleton
    utils.ts          ← cn() utility (clsx + tailwind-merge)
    runtime/
      engine.ts       ← Main execution loop (MAX_ITERATIONS=50, MAX_HISTORY=100)
      context.ts      ← Load/save conversation context from DB
      template.ts     ← {{variable}} interpolation
      types.ts        ← RuntimeContext, ExecutionResult, NodeHandler, OutputMessage
      handlers/
        index.ts      ← Handler registry (16 handlers)
        message-handler.ts, ai-response-handler.ts, condition-handler.ts, ...
    knowledge/
      index.ts        ← Main search entry point
      chunker.ts      ← Text chunking (400 tokens, 20% overlap)
      parsers.ts      ← HTML/text parsing (cheerio)
      embeddings.ts   ← OpenAI embedding generation
      search.ts       ← Hybrid search (semantic + BM25 via pgvector)
      reranker.ts     ← LLM-based result re-ranking
      scraper.ts      ← URL content fetching
      ingest.ts       ← Source ingestion pipeline (scrape → parse → chunk → embed → store)

  types/
    index.ts          ← FlowNode, FlowEdge, FlowContent, FlowVariable, NodeType
    pdf-parse.d.ts    ← Type declaration for pdf-parse

  generated/prisma/   ← AUTO-GENERATED — never edit
```

---

## 4. PRISMA MODELS & RELATIONS

```
User (optional)
  └── Agent[] (1:N, userId is optional)
        ├── Flow (1:1, cascade delete)
        ├── KnowledgeBase (1:1, cascade delete)
        │     └── KBSource[] (1:N, cascade delete)
        │           └── KBChunk[] (1:N, cascade delete, has vector(1536) embedding)
        └── Conversation[] (1:N, cascade delete)
              └── Message[] (1:N, cascade delete)
```

**Enums:** KBSourceType (FILE|URL|SITEMAP|TEXT), KBSourceStatus (PENDING|PROCESSING|READY|FAILED), ConversationStatus (ACTIVE|COMPLETED|ABANDONED), MessageRole (USER|ASSISTANT|SYSTEM)

**Key details:**
- Agent.userId is `String?` — no auth required, personal use
- KBChunk.embedding uses `Unsupported("vector(1536)")` for pgvector
- Flow.content is `Json` storing `FlowContent` (nodes, edges, variables)
- Conversation.variables is `Json` storing runtime variable state
- All child models cascade delete from their parent

---

## 5. API ROUTES

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents` | GET, POST | List all agents (with conversation/source counts), create agent + flow + KB |
| `/api/agents/[agentId]` | GET, PATCH, DELETE | Full agent detail, update fields, delete |
| `/api/agents/[agentId]/flow` | GET, PUT | Get/upsert flow content (nodes, edges, variables) |
| `/api/agents/[agentId]/chat` | POST | Send user message, execute flow engine, return response |
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | List sources with chunk counts, create + trigger background ingest |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | Delete source and all its chunks |
| `/api/agents/[agentId]/knowledge/search` | POST | Test hybrid search (semantic + BM25 + optional reranking) |

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 6. KEY CONVENTIONS & PATTERNS

### Runtime Engine
- 16 node handlers registered in `src/lib/runtime/handlers/index.ts`
- Node types: message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult` with messages, nextNodeId, waitForInput, updatedVariables
- Handlers never throw — always return graceful fallback

### Knowledge/RAG Pipeline
- Ingest: scrape URL → parse HTML (cheerio, removes nav/footer/script/style) → chunk (400 tokens, 20% overlap) → embed (OpenAI text-embedding-3-small) → store in pgvector
- Search: hybrid (semantic cosine similarity + BM25 keyword) → Reciprocal Rank Fusion → optional LLM re-ranking

### Template Variables
- `{{variable}}` syntax in node messages, resolved at runtime via `resolveTemplate()`
- Supports nested paths (`{{user.address.city}}`) and bracket notation (`{{items[0]}}`)

### UI Components
- cva (class-variance-authority) for component variants
- `cn()` utility combining clsx + tailwind-merge
- Dark mode by default (`<html className="dark">`)

### No Auth
- No authentication layer — personal/local app
- Agent.userId is optional, not enforced
- API routes have no auth checks

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
- No auth checks needed (personal app)
- Validate input with Zod where applicable
- Keep Prisma queries in `src/lib/` when reusable

### Testing
- Unit tests: Vitest, `__tests__/` folders next to source, `.test.ts` extension
- Run: `pnpm test`
- Existing tests cover: template resolution, text chunking, HTML parsing, flow engine, message handler
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- DeepSeek has no embedding support — OPENAI_API_KEY is required for KB features
