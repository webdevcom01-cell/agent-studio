# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Visual AI agent builder with multi-agent orchestration and continuous learning. Build AI agents
via a flow editor (XyFlow), manage knowledge bases with RAG (chunking + embeddings + hybrid
search), enable agent-to-agent communication (A2A protocol), and chat with agents. Features
include: agent marketplace/discovery with faceted search, 216 agent templates across 19
categories (including 25 ECC Developer Agents), agent-as-tool orchestration (AI dynamically
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
- **E2E tests:** Playwright (7 spec files — auth, dashboard, flow editor, KB, chat, import/export, API)
- **Redis:** ioredis v5 — cross-replica shared state (rate limiting, cache, session, MCP pool coordination). Dynamic import, graceful fallback to in-memory when unavailable
- **Utilities:** class-variance-authority (cva), clsx, tailwind-merge

---

## 3. FOLDER STRUCTURE

```
prisma/
  schema.prisma         ← DB schema (26 models, pgvector, versioning, A2A, CLIGeneration, Evals)
  migrations/           ← auto-generated — never edit manually

railway.toml            ← Railway deploy config (Nixpacks, healthcheck, 2 replicas)
nixpacks.toml           ← Nixpacks install phase override (--no-frozen-lockfile)
.npmrc                  ← pnpm config (frozen-lockfile=false for Railway compat)

public/
  embed.js              ← Embeddable widget script (bubble + iframe)
  test-embed.html       ← Test page for embed widget

e2e/
  tests/                ← Playwright E2E specs (auth, dashboard, flow, KB, chat, API)

src/
  instrumentation.ts    ← Startup env validation (critical vars check)
  middleware.ts         ← Auth middleware (cookie-based session check + CSRF Origin)

  app/
    page.tsx                          ← Dashboard (agent list, create/delete, export/import)
    layout.tsx                        ← Root layout (dark mode, Sonner, SessionProvider)
    globals.css                       ← Tailwind v4 theme + React Flow overrides
    login/page.tsx                    ← Login page (GitHub + Google OAuth)
    analytics/page.tsx                ← Analytics dashboard (charts, response times, KB stats)
    discover/page.tsx                 ← Agent Discovery Marketplace (faceted search, categories, tags)
    templates/page.tsx                ← Agent Templates Gallery (216 templates, 19 categories)
    templates/templates-client.tsx    ← Templates client component (search + filter)
    builder/[agentId]/page.tsx        ← Flow editor page
    builder/[agentId]/error.tsx       ← Error boundary (Flow Editor Error)
    chat/[agentId]/page.tsx           ← Chat interface (streaming via useStreamingChat)
    chat/[agentId]/error.tsx          ← Error boundary (Chat Error)
    embed/[agentId]/page.tsx          ← Embed chat widget page
    embed/layout.tsx                  ← Dedicated embed layout (no embed.js, no SessionProvider)
    knowledge/[agentId]/page.tsx      ← Knowledge base management
    knowledge/[agentId]/error.tsx     ← Error boundary (Knowledge Base Error)
    cli-generator/page.tsx            ← CLI Generator — 6-phase pipeline UI (stuck detection, resume, progress)
    evals/[agentId]/page.tsx          ← Agent Evals — suite sidebar, test case editor, results view, trend chart
    api/
      auth/[...nextauth]/route.ts              ← NextAuth API route (GET, POST)
      health/route.ts                          ← Health check endpoint (DB connectivity + uptime)
      analytics/route.ts                       ← Analytics dashboard data (response times, KB stats, conversations)
      agents/route.ts                          ← GET list, POST create
      agents/[agentId]/route.ts                ← GET, PATCH, DELETE agent (incl. category/tags/isPublic)
      agents/[agentId]/flow/route.ts           ← GET, PUT flow content (auth-guarded, Zod-validated, auto-versioned)
      agents/[agentId]/flow/versions/route.ts             ← GET list, POST create version
      agents/[agentId]/flow/versions/[versionId]/route.ts ← GET single version
      agents/[agentId]/flow/versions/[versionId]/diff/route.ts    ← GET diff with previous
      agents/[agentId]/flow/versions/[versionId]/deploy/route.ts  ← POST deploy version
      agents/[agentId]/flow/versions/[versionId]/rollback/route.ts ← POST rollback + deploy
      agents/[agentId]/flow/versions/[versionId]/test/route.ts    ← POST sandbox test
      agents/[agentId]/chat/route.ts           ← POST send message (streaming + non-streaming)
      agents/[agentId]/execute/route.ts        ← POST execute flow directly
      agents/[agentId]/knowledge/sources/route.ts         ← GET, POST sources (URL/TEXT)
      agents/[agentId]/knowledge/sources/upload/route.ts     ← POST file upload (PDF/DOCX, multipart/form-data)
      agents/[agentId]/knowledge/sources/[sourceId]/route.ts  ← DELETE source
      agents/[agentId]/knowledge/search/route.ts          ← POST hybrid search
      agents/[agentId]/export/route.ts            ← GET download agent as JSON
      agents/[agentId]/mcp/route.ts               ← GET, POST, DELETE agent-server links
      agents/[agentId]/a2a/route.ts               ← A2A task communication endpoint
      agents/[agentId]/a2a/card/route.ts          ← A2A card generation/retrieval
      agents/import/route.ts                      ← POST import agent from JSON
      agents/discover/route.ts                    ← GET marketplace search/filter/sort/paginate
      a2a/agents/route.ts                         ← A2A agent discovery endpoint
      agent-calls/route.ts                        ← Agent-to-agent call logs (with trace IDs)
      agent-calls/stats/route.ts                  ← Agent call statistics
      approvals/route.ts                          ← GET pending human approval requests
      approvals/[requestId]/respond/route.ts      ← POST approve/reject
      mcp-servers/route.ts                        ← GET list, POST create MCP servers
      mcp-servers/[serverId]/route.ts             ← GET, PATCH, DELETE MCP server
      mcp-servers/[serverId]/test/route.ts        ← POST test MCP connection
      cli-generator/route.ts                      ← GET list, POST create generation
      cli-generator/[generationId]/route.ts       ← GET single generation (with files + phases)
      cli-generator/[generationId]/advance/route.ts  ← POST advance pipeline one phase (frontend-driven loop)
      cli-generator/[generationId]/resume/route.ts   ← POST resume stuck generation (reset + re-advance)
      cli-generator/[generationId]/files/route.ts    ← GET list of generated files by name
      cli-generator/[generationId]/download/route.ts ← GET download all files as .zip
      cli-generator/[generationId]/logs/route.ts     ← GET per-phase logs and token usage
      cli-generator/[generationId]/publish/route.ts  ← POST register generated bridge as MCP server
      agents/[agentId]/evals/route.ts                          ← GET list suites, POST create suite
      agents/[agentId]/evals/[suiteId]/route.ts                ← GET detail, PATCH update, DELETE
      agents/[agentId]/evals/[suiteId]/cases/route.ts          ← GET, POST, PUT bulk, DELETE test cases
      agents/[agentId]/evals/[suiteId]/run/route.ts            ← POST trigger run, GET run history
      agents/[agentId]/evals/[suiteId]/run/[runId]/route.ts    ← GET full run detail + per-case results
      agents/[agentId]/evals/[suiteId]/run/[runId]/export/route.ts ← GET per-run CSV export (one row per assertion)
      agents/[agentId]/evals/[suiteId]/export/route.ts         ← GET suite-level bulk CSV export (?limit=1-100)
      agents/[agentId]/evals/[suiteId]/compare/route.ts        ← POST A/B comparison (version or model)

  components/
    cli-generator/                ← CLI Generator UI components (pipeline progress, file preview, stuck alert)
    ui/               ← 13 UI primitives (badge, button, card, dialog, dropdown-menu, input, label, select, skeleton, tabs, textarea, tooltip, error-display)
      error-display.tsx ← Shared error boundary UI component
      __tests__/        ← UI component tests
    chat/
      use-streaming-chat.ts ← Client hook for consuming NDJSON chat stream
    mcp/
      mcp-server-manager.tsx  ← Global MCP server CRUD dialog
      agent-mcp-selector.tsx  ← Per-agent MCP server picker with tool filtering
    a2a/
      agent-call-monitor.tsx  ← Agent-to-agent call monitoring UI
    templates/
      template-gallery.tsx    ← Agent template gallery (search + category filter)
    cli-generator/            ← CLI Generator UI components (pipeline progress, file preview, stuck alert)
    evals/
      eval-suite-editor.tsx   ← Suite editor: test case list, assertion builder (12 types, 3 layers)
      eval-results-view.tsx   ← Results view: trend chart (recharts), per-case rows, run history table
    builder/
      flow-builder.tsx    ← Main ReactFlow editor (+ MCP panel, version history, deploy status)
      flow-error-boundary.tsx ← Error boundary for flow editor
      node-picker.tsx     ← Node type selector dropdown (32 node types)
      property-panel.tsx  ← Right sidebar for editing node properties (searchable agent selector)
      version-panel.tsx   ← Version history sidebar (SWR, rollback, compare, deploy)
      deploy-dialog.tsx   ← Deploy confirmation dialog with sandbox test
      diff-view.tsx       ← Version diff viewer (added/removed/modified nodes)
      nodes/              ← 33 node display components (base + 32 node types)
    theme-provider.tsx    ← Dark mode theme provider

  data/
    agent-templates.json  ← 216 agent templates across 19 categories

  lib/
    ai.ts             ← AI model routing (DeepSeek/OpenAI/Anthropic/Gemini/Groq/Mistral/Kimi)
    models.ts         ← Client-safe model catalog (18 models, 6 providers, fast/balanced/powerful tiers)
    auth.ts           ← NextAuth config (GitHub + Google providers, PrismaAdapter, JWT)
    analytics.ts      ← Fire-and-forget analytics tracking
    env.ts            ← Environment variable validation (Zod schema)
    logger.ts         ← Structured JSON logger (server-only, info/warn/error)
    prisma.ts         ← Prisma client singleton
    redis.ts          ← Redis client singleton (ioredis, dynamic import, graceful fallback)
    rate-limit.ts     ← Sliding window rate limiter (Redis when available, in-memory fallback)
    utils.ts          ← cn() utility (clsx + tailwind-merge)
    api/
      auth-guard.ts       ← requireAuth(), requireAgentOwner(), isAuthError()
      body-limit.ts       ← parseBodyWithLimit() — 1 MB default request body limit
      sanitize-error.ts   ← sanitizeErrorMessage() — generic errors in production
      security-headers.ts ← X-Content-Type-Options, X-Frame-Options, etc.
    a2a/
      card-generator.ts   ← AgentCard generation + upsert for A2A discovery
      circuit-breaker.ts  ← Circuit breaker pattern for agent-to-agent calls
      rate-limiter.ts     ← Rate limiting for A2A calls
    agents/
      agent-tools.ts      ← Convert sibling agents into AI SDK tool definitions (agent-as-tool)
    constants/
      agent-categories.ts ← Canonical AGENT_CATEGORIES list + AgentCategory type
    validators/
      flow-content.ts   ← Zod schema for FlowContent validation (nodes, edges, variables)
    versioning/
      diff-engine.ts    ← JSON diff engine for FlowContent (node/edge/variable comparison)
      version-service.ts ← Version CRUD, deploy, rollback, diff (supports transaction client)
    mcp/
      client.ts         ← MCP client wrapper (getMCPToolsForAgent, testMCPConnection, callMCPTool)
      pool.ts           ← Connection pool (in-memory, 5min TTL, auto-cleanup, dead connection detection)
    schemas/
      agent-export.ts  ← Zod schema + AgentExportData type for agent export/import
    utils/
      url-validation.ts ← validateExternalUrlWithDNS() — SSRF protection, private IP blocklist
    runtime/
      engine.ts            ← Synchronous execution loop (MAX_ITERATIONS=50, MAX_HISTORY=100)
      engine-streaming.ts  ← Streaming execution loop (NDJSON ReadableStream output)
      stream-protocol.ts   ← StreamChunk encode/decode/writer helpers
      context.ts           ← Load/save conversation context from DB
      template.ts          ← {{variable}} interpolation
      types.ts             ← RuntimeContext, ExecutionResult, NodeHandler, StreamChunk, StreamWriter
      handlers/
        index.ts           ← Handler registry (31 handlers)
        ai-response-handler.ts          ← Non-streaming AI (generateText + MCP + agent tools)
        ai-response-streaming-handler.ts ← Streaming AI (streamText → NDJSON + MCP + agent tools)
        mcp-tool-handler.ts             ← Deterministic MCP tool call node
        call-agent-handler.ts           ← Agent-to-agent call execution
        loop-handler.ts                 ← Loop execution (count/condition modes)
        parallel-handler.ts             ← Parallel branch execution with merge strategies
        parallel-streaming-handler.ts   ← Streaming-aware parallel (real-time branch output)
        memory-write-handler.ts         ← Save data to agent persistent memory (AgentMemory)
        memory-read-handler.ts          ← Read from agent memory (key/category/search modes)
        evaluator-handler.ts            ← AI-powered content evaluation with criteria scoring
        schedule-trigger-handler.ts     ← Flow entry-point (cron/interval/manual)
        email-send-handler.ts           ← Webhook-based email sending with dry-run mode
        notification-handler.ts         ← Multi-channel notifications (log/in_app/webhook)
        format-transform-handler.ts     ← Data format transformation (JSON/CSV/text/template)
        switch-handler.ts               ← Multi-way branching (switch/case with operators)
        web-fetch-handler.ts            ← HTTP fetch operations with URL validation
        browser-action-handler.ts       ← Browser automation actions (via MCP)
        human-approval-handler.ts       ← Human-in-the-loop approval requests
        message-handler.ts, condition-handler.ts, button-handler.ts, ...
    knowledge/
      index.ts        ← Main search entry point
      chunker.ts      ← Text chunking (400 tokens, 20% overlap)
      parsers.ts      ← PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), text parsing
      embeddings.ts   ← OpenAI embedding generation
      search.ts       ← Hybrid search (semantic + BM25 via pgvector) + parent document retrieval
      reranker.ts     ← LLM-based result re-ranking
      scraper.ts      ← URL content fetching (safe redirect following, DNS validation)
      ingest.ts       ← Source ingestion pipeline (scrape → parse → chunk → embed → store)
    cli-generator/
      types.ts        ← PipelineConfig (incl. target?: "python"|"typescript"), PhaseResult, PIPELINE_PHASES, STATUS_FOR_PHASE, STUCK_THRESHOLD_MS
      schemas.ts      ← Zod schemas for all 6 phases; TSPublishOutputSchema for TypeScript publish phase
      prompts.ts      ← System/user prompt pairs per phase; Python + TypeScript variants; extractPythonSignatures, extractTypeScriptSignatures
      ai-phases.ts    ← Phase runners: aiAnalyze, aiDesign, aiImplement, aiTest, aiDocs, aiPublish — branches by config.target for phases 2–5
      mcp-registration.ts ← Auto-register generated bridge as MCP server; extractToolsFromFiles routes by target
      __tests__/      ← Unit tests for prompts, pipeline, schemas, MCP registration (Python + TypeScript paths)
    evals/
      schemas.ts      ← Zod schemas for all 12 assertion types, test case input, suite create/update
      assertions.ts   ← Assertion evaluator engine (all 3 layers: deterministic, semantic, LLM-judge)
      semantic.ts     ← cosine similarity + OpenAI embedding-based semantic_similarity evaluator
      llm-judge.ts    ← LLM-as-Judge: llm_rubric, kb_faithfulness, relevance (generateObject)
      runner.ts       ← Eval run orchestrator (load suite → call chat API → apply assertions → persist)
      deploy-hook.ts  ← Fire-and-forget hook: runs suites with runOnDeploy:true after deploy
      __tests__/      ← Unit tests: assertions (40), runner (15), semantic (15), llm-judge (20), deploy-hook (10)

  types/
    index.ts          ← FlowNode, FlowEdge, FlowContent, FlowVariable, NodeType (33 types)
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
  ├── CLIGeneration[] (1:N, cascade delete — CLI generator pipeline runs)
  └── Agent[] (1:N, userId is optional)
        ├── Flow (1:1, cascade delete)
        │     ├── FlowVersion[] (1:N, cascade delete — immutable content snapshots)
        │     └── activeVersionId? → FlowVersion
        ├── FlowDeployment[] (1:N, cascade delete — deploy audit log)
        ├── KnowledgeBase (1:1, cascade delete)
        │     └── KBSource[] (1:N, cascade delete, retryCount for ingest retries)
        │           └── KBChunk[] (1:N, cascade delete, has vector(1536) embedding)
        ├── AgentCard (1:1, cascade delete — A2A discovery card)
        ├── AgentMCPServer[] (1:N, cascade delete — enabledTools filter)
        ├── AgentCallLog[] (1:N, cascade delete — agent-to-agent call tracing)
        ├── HumanApprovalRequest[] (1:N — human-in-the-loop workflow)
        ├── AnalyticsEvent[] (1:N, cascade delete — response times, KB_SEARCH events)
        └── Conversation[] (1:N, cascade delete, optional flowVersionId for audit)
              └── Message[] (1:N, cascade delete)

VerificationToken — NextAuth email verification (standalone, no relations)

AgentMemory — Persistent cross-conversation memory for agents
  ├── agentId (required, indexed)
  ├── key (unique per agent via @@unique([agentId, key]))
  ├── value (String), category (default "general"), importance (0-1)
  ├── embedding (vector(1536), optional — for semantic search)
  └── accessCount, accessedAt — access tracking

AgentCard — A2A public agent card for discovery
  ├── agentId (1:1, unique)
  ├── name, description, version, skills[]
  └── inputModes[], outputModes[], capabilities (Json)

AgentCallLog — Agent-to-agent call tracing
  ├── callerAgentId, calleeAgentId (required, indexed)
  ├── traceId, spanId, parentSpanId — distributed tracing
  └── status, durationMs, inputTokens, outputTokens

HumanApprovalRequest — Human-in-the-loop workflow
  ├── agentId, conversationId (required)
  ├── title, description, options (Json)
  └── status (PENDING|APPROVED|REJECTED|EXPIRED), respondedAt

CLIGeneration — CLI Generator pipeline run
  ├── userId (required, cascade delete)
  ├── applicationName (String) — the CLI app being wrapped
  ├── target String @default("python") — "python" (FastMCP) or "typescript" (Node.js MCP SDK)
  ├── status (CLIGenerationStatus enum)
  ├── currentPhase (Int, 0–5)
  ├── phases (Json) — PhaseResult[] array with per-phase output, tokens, errors
  ├── cliConfig (Json?) — final MCPConfig produced by publish phase
  ├── generatedFiles (Json?) — Record<filename, content> for all generated files
  ├── errorMessage (String?) — last failure reason
  ├── mcpServerId (String?) — MCP server created after publish (SetNull on delete)
  └── Indexes: [userId], [userId, status], [createdAt]

EvalSuite — Eval suite for an agent (collection of test cases)
  ├── agentId (required, cascade delete)
  ├── name, description?
  ├── isDefault Boolean — default suite selected in UI
  ├── runOnDeploy Boolean — auto-run after flow deploy (fire-and-forget)
  ├── scheduleEnabled Boolean — auto-run on cron schedule
  ├── scheduleCron String? — cron expression e.g. "0 3 * * *" (5-field)
  ├── lastScheduledAt DateTime? — used for double-run prevention (4-min window)
  ├── testCases EvalTestCase[], runs EvalRun[]
  └── Indexes: [agentId], [agentId, runOnDeploy], [scheduleEnabled]

EvalTestCase — Single test case in a suite
  ├── suiteId (required, cascade delete)
  ├── label, input @db.Text, order Int
  ├── assertions Json — EvalAssertion[] (12 types, 3 layers)
  ├── tags String[]
  └── results EvalResult[]

EvalRun — One execution of an entire suite
  ├── suiteId (required, cascade delete)
  ├── status EvalRunStatus, triggeredBy ("manual"|"deploy"|"schedule"|"compare")
  ├── totalCases, passedCases, failedCases, score Float?, durationMs
  ├── errorMessage?, completedAt?
  ├── comparisonRunId String? — paired run ID for A/B comparison (mutual reference)
  ├── flowVersionId String? — which flow version was tested in this run
  ├── modelOverride String? — model used if comparing different models
  ├── results EvalResult[]
  └── Indexes: [suiteId], [suiteId, createdAt]

EvalResult — One test case result within a run
  ├── runId, testCaseId (required, cascade delete)
  ├── status EvalResultStatus
  ├── agentOutput @db.Text?, assertions Json (AssertionResult[])
  ├── score Float?, latencyMs?, tokensUsed Json?
  └── Indexes: [runId], [testCaseId]
```

**Enums:** KBSourceType (FILE|URL|SITEMAP|TEXT), KBSourceStatus (PENDING|PROCESSING|READY|FAILED), ConversationStatus (ACTIVE|COMPLETED|ABANDONED), MessageRole (USER|ASSISTANT|SYSTEM), AnalyticsEventType (CHAT_RESPONSE|KB_SEARCH), MCPTransport (STREAMABLE_HTTP|SSE), FlowVersionStatus (DRAFT|PUBLISHED|ARCHIVED), A2ATaskStatus (SUBMITTED|WORKING|INPUT_REQUIRED|COMPLETED|FAILED), CLIGenerationStatus (PENDING|ANALYZING|DESIGNING|IMPLEMENTING|TESTING|DOCUMENTING|PUBLISHING|COMPLETED|FAILED), **EvalRunStatus (PENDING|RUNNING|COMPLETED|FAILED|CANCELLED)**, **EvalResultStatus (PENDING|PASSED|FAILED|ERROR|SKIPPED)**

**Key details:**
- Agent model has: `category String?`, `tags String[]`, `isPublic Boolean` — marketplace fields
- Agent.userId is `String?` — optional, linked when user is authenticated
- MCPServer.userId is `String` — required, ownership enforced in API routes
- AgentMCPServer has @@unique([agentId, mcpServerId]) to prevent duplicate links
- Account model enables OAuth account linking (GitHub + Google on same email)
- KBChunk.embedding uses `Unsupported("vector(1536)")` for pgvector
- Flow.content is `Json` storing `FlowContent` (nodes, edges, variables)
- Conversation.variables is `Json` storing runtime variable state
- AnalyticsEvent.metadata is `Json` storing response timing and conversation data
- AgentCallLog uses traceId/spanId for distributed tracing across agent chains
- Database indexes: `@@index([category])`, `@@index([isPublic, updatedAt])` on Agent
- All child models cascade delete from their parent

---

## 5. API ROUTES

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents` | GET, POST | List all agents (with conversation/source counts), create agent + flow + KB |
| `/api/agents/[agentId]` | GET, PATCH, DELETE | Full agent detail, update fields (incl. category/tags/isPublic), delete |
| `/api/agents/[agentId]/flow` | GET, PUT | Get/upsert flow content (auth-guarded, Zod-validated, auto-versioned in transaction) |
| `/api/agents/[agentId]/flow/versions` | GET, POST | List all versions, manually create version with label |
| `/api/agents/[agentId]/flow/versions/[versionId]` | GET | Get single version |
| `/api/agents/[agentId]/flow/versions/[versionId]/diff` | GET | Diff with previous or `?compareWith=` version |
| `/api/agents/[agentId]/flow/versions/[versionId]/deploy` | POST | Deploy version (archives old PUBLISHED, creates FlowDeployment) |
| `/api/agents/[agentId]/flow/versions/[versionId]/rollback` | POST | Rollback to version (creates new version + deploys) |
| `/api/agents/[agentId]/flow/versions/[versionId]/test` | POST | Sandbox test execution against version content |
| `/api/agents/[agentId]/chat` | POST | Send user message; `{ stream: true }` for NDJSON streaming, otherwise JSON response |
| `/api/agents/[agentId]/execute` | POST | Execute flow directly (non-chat context) |
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | List sources with chunk counts, create URL/TEXT + trigger background ingest |
| `/api/agents/[agentId]/knowledge/sources/upload` | POST | File upload (multipart/form-data, PDF/DOCX, max 10 MB) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | Delete source and all its chunks |
| `/api/agents/[agentId]/knowledge/search` | POST | Test hybrid search (semantic + BM25 + optional reranking) |
| `/api/agents/[agentId]/knowledge/config` | GET, PATCH | Per-KB RAG pipeline configuration (chunking, embedding, retrieval, reranking) |
| `/api/agents/[agentId]/knowledge/drift` | GET | Embedding model drift detection with recommendation |
| `/api/agents/[agentId]/knowledge/analytics` | GET | KB stats: sources, chunks, token distribution, search metrics |
| `/api/agents/[agentId]/knowledge/evaluate` | POST | RAGAS evaluation: search → generate → evaluate quality metrics |
| `/api/agents/[agentId]/knowledge/maintenance` | GET, POST | Dead chunk detection, cleanup, scheduled re-ingestion |
| `/api/agents/[agentId]/export` | GET | Download agent as versioned JSON (config + flow, no conversations/KB) |
| `/api/agents/import` | POST | Import agent from exported JSON, Zod-validated with `z.literal(1)` version |
| `/api/agents/discover` | GET | Marketplace search/filter/sort/paginate with category stats and tag aggregation |
| `/api/agents/[agentId]/mcp` | GET, POST, DELETE | List/link/unlink MCP servers for agent |
| `/api/agents/[agentId]/a2a` | POST | A2A task communication (send/receive tasks between agents) |
| `/api/agents/[agentId]/a2a/card` | GET, POST | Generate/retrieve A2A agent card for discovery |
| `/api/a2a/agents` | GET | A2A agent discovery endpoint (public catalog) |
| `/api/agent-calls` | GET | Agent-to-agent call logs with trace IDs |
| `/api/agent-calls/stats` | GET | Agent call statistics (counts, durations, success rates) |
| `/api/approvals` | GET | List pending human approval requests |
| `/api/approvals/[requestId]/respond` | POST | Approve or reject a human approval request |
| `/api/mcp-servers` | GET, POST | List all user's MCP servers, create new server |
| `/api/mcp-servers/[serverId]` | GET, PATCH, DELETE | Get/update/delete MCP server (ownership enforced) |
| `/api/mcp-servers/[serverId]/test` | POST | Test MCP connection, auto-refresh toolsCache |
| `/api/cli-generator` | GET, POST | List user's generations, create new generation (starts PENDING) |
| `/api/cli-generator/[generationId]` | GET | Full generation detail incl. generatedFiles + phases |
| `/api/cli-generator/[generationId]/advance` | POST | Advance pipeline one phase; frontend polls this in a loop until COMPLETED/FAILED |
| `/api/cli-generator/[generationId]/resume` | POST | Resume stuck generation — resets status and re-runs current phase |
| `/api/cli-generator/[generationId]/files` | GET | List filenames of all generated files |
| `/api/cli-generator/[generationId]/download` | GET | Download all generated files as a .zip archive |
| `/api/cli-generator/[generationId]/logs` | GET | Per-phase execution logs and token usage |
| `/api/cli-generator/[generationId]/publish` | POST | Register generated bridge as an MCP server in user's account |
| `/api/agents/[agentId]/evals` | GET, POST | List eval suites (with last run + counts), create suite |
| `/api/agents/[agentId]/evals/[suiteId]` | GET, PATCH, DELETE | Suite detail (test cases + last 5 runs), update (name/desc/isDefault/runOnDeploy), delete |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | GET, POST, PUT, DELETE | List/create/bulk-update/delete test cases (max 50 per suite) |
| `/api/agents/[agentId]/evals/[suiteId]/run` | GET, POST | Run history (paginated), trigger new eval run (409 if already running) |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]` | GET | Full run detail with per-case results and assertion breakdowns |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]/export` | GET | Download per-run results as CSV (one row per assertion, RFC-4180 quoting) |
| `/api/agents/[agentId]/evals/[suiteId]/export` | GET | Download all completed runs as bulk CSV (`?limit=` 1–100, default 50) |
| `/api/agents/[agentId]/evals/[suiteId]/compare` | POST | Run head-to-head A/B comparison between two flow versions or two models; returns `CompareResult` with `ComparisonDelta` |
| `/api/evals/scheduled` | POST | CRON_SECRET-protected trigger for Railway Cron — finds due suites and fires `triggerScheduledEvals()` |
| `/api/auth/*` | GET, POST | NextAuth authentication endpoints |
| `/api/health` | GET | Health check (DB connectivity + uptime + version) |
| `/api/analytics` | GET | Analytics dashboard data (response times, KB stats, conversations) |

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 6. KEY CONVENTIONS & PATTERNS

### Runtime Engine
- 32 node handlers registered in `src/lib/runtime/handlers/index.ts`
- Node types (32): message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook, mcp_tool, call_agent, human_approval, loop, parallel, memory_write, memory_read, evaluator, schedule_trigger, webhook_trigger, email_send, notification, format_transform, switch, web_fetch, browser_action
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult` with messages, nextNodeId, waitForInput, updatedVariables
- Handlers never throw — always return graceful fallback

### Streaming Chat
- Two engine variants: `executeFlow` (synchronous JSON) and `executeFlowStreaming` (NDJSON ReadableStream)
- Chat API: `{ stream: true }` in request body switches to streaming mode (backwards compatible)
- NDJSON wire protocol chunks: `message`, `stream_start`, `stream_delta`, `stream_end`, `done`, `error`
- `StreamChunk` discriminated union type in `src/lib/runtime/types.ts`
- `ai_response` nodes stream tokens; `parallel` nodes use streaming-aware handler for real-time branch output; all other nodes emit instant `message` chunks
- `stream-protocol.ts` has `encodeChunk()`, `parseChunk()`, `createStreamWriter()` — shared between server and client
- Client hook `useStreamingChat` in `src/components/chat/use-streaming-chat.ts` handles line-buffered parsing
- Context and messages are always saved in `finally` block, even on client disconnect
- Each save operation (saveMessages, saveContext, writer.close) is in its own try/catch to prevent cascading failures
- User messages are persisted to DB via `prisma.message.create` in both engine.ts and engine-streaming.ts
- AbortController with 180s timeout on the client side (matches server maxDuration)
- Heartbeat interval during tool calls to prevent stream disconnects

### Knowledge/RAG Pipeline
- Ingest: scrape URL / parse file / accept text → chunk (400 tokens, 20% overlap) → embed (OpenAI text-embedding-3-small) → store in pgvector
- File upload: PDF (pdf-parse) and DOCX (mammoth) — `parseSource()` routes by file extension
- URL parsing: HTML (cheerio, removes nav/footer/script/style), plain text passthrough
- Search: hybrid (semantic cosine similarity + BM25 keyword) → weighted RRF (semantic 70% + BM25 30%) → optional LLM re-ranking
- Similarity threshold 0.25 — chunks with lower scores are discarded
- Dynamic topK: 5 for short queries, 8 for longer queries
- Parent document retrieval — returns broader context around matched chunks
- UI: Add Source dialog has URL, Text, and File tabs with client-side 10 MB validation

### Enterprise RAG Pipeline
Per-KB configurable RAG pipeline with advanced retrieval, evaluation, and maintenance.

**Per-KB Configuration** (`KnowledgeBase` model fields):
- `chunkingStrategy` (Json), `embeddingModel`, `embeddingDimension`, `retrievalMode`, `rerankingModel`, `queryTransform`, `searchTopK`, `searchThreshold`, `hybridAlpha`, `maxChunks`, `contextOrdering`
- Zod validation: `src/lib/schemas/kb-config.ts` — `ChunkingStrategySchema` (discriminated union, 5 variants), `kbConfigUpdateSchema`, `kbConfigResponseSchema`
- Settings UI tab on Knowledge Base page (`/knowledge/[agentId]`)
- API: `GET/PATCH /api/agents/[agentId]/knowledge/config`

**Chunking** (5 strategies in `src/lib/knowledge/chunker.ts`):
- `recursive` — hierarchical split by separators (`\n\n` → `\n` → `. ` → ` ` → char), recursive fallback, hard token split
- `markdown` — line-by-line, preserves headings with `preserveHeaders` option
- `code` — splits by class/function boundaries, auto-detect Python/TS/JS
- `sentence` — split by sentence boundaries, token-accurate overlap
- `fixed` — legacy mode via `chunkText()`
- Token counting: tiktoken `cl100k_base` via `countTokens()` (replaces `estimateTokens()`)
- Header injection: `buildChunkHeader()` + `injectHeaders()` — prepend source/type/page/section context to each chunk

**Embedding**:
- Multi-model: `getEmbeddingModelById()` — `text-embedding-3-small` (1536 dim), `text-embedding-3-large` (3072 dim)
- Redis cache: `embedding-cache.ts` — `getCachedQueryEmbedding()` / `setCachedQueryEmbedding()` (600s TTL)
- Semaphore: `acquireEmbeddingSemaphore()` — max 3 concurrent embedding calls (Lua EVAL atomic)
- Drift detection: `embedding-drift.ts` — `detectEmbeddingDrift()` detects model mismatch, `markChunkEmbeddingModel()` tags chunks
- API: `GET /api/agents/[agentId]/knowledge/drift`

**Query Transformation** (`src/lib/knowledge/query-transform.ts`):
- `hydeTransform()` — generates hypothetical document for better semantic match (LLM, 200 tokens)
- `multiQueryExpand()` — 3 alternative phrasings for broader recall (LLM)
- `transformQuery(query, mode)` — dispatcher for `"none"` / `"hyde"` / `"multi_query"`

**Search Pipeline** (`src/lib/knowledge/search.ts`):
- 3 retrieval modes: `semantic` (pgvector cosine), `keyword` (PostgreSQL FTS/BM25), `hybrid` (both + RRF fusion)
- RRF normalization: scores normalized to 0.0–1.0 range via `normalizeRRFScores()`
- Metadata filtering: `metadata-filter.ts` — 10 operators (eq, neq, gt, gte, lt, lte, in, nin, contains, exists), AND/OR groups, dot-notation paths, in-memory eval + SQL generation
- KB config fallback: all search params read from `KnowledgeBase` model, options override
- Query embedding cache: check Redis before embedding, cache after

**Reranking** (`src/lib/knowledge/reranker.ts`):
- `llm-rubric` — LLM scores each passage 0.0–1.0 (default, uses deepseek-chat)
- `cohere` — Cohere Rerank v3.5 API (`POST api.cohere.com/v2/rerank`), 5s timeout, graceful fallback
- `none` — skip reranking
- Auto-rerank: enabled for queries < 5 words via `shouldRerank()`

**Context Processing** (`src/lib/knowledge/context-ordering.ts`):
- `relevance` — sort by score DESC (default)
- `lost_in_middle` — U-shaped: best chunks at positions 1 and last (Liu et al. 2023)
- `chronological` — sort by sourceDocument + chunkIndex
- `diversity` — MMR-like iterative selection, Jaccard similarity penalty
- `compressContext()` — fits results within token budget (4000 default), truncates last chunk

**Document Parsers** (`src/lib/knowledge/parsers.ts`):
- PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), Excel/CSV (xlsx), PPTX (JSZip XML extraction)
- `parseSource()` dispatcher routes by file extension

**Content Deduplication** (`src/lib/knowledge/deduplication.ts`):
- `computeContentHash()` — SHA-256 of normalized text
- `findDuplicateChunks()` — query existing hashes in KB via `contentHash = ANY(...)`
- `deduplicateChunks()` — filter duplicates before embedding (saves API cost)

**Citations** (`src/lib/knowledge/citations.ts`):
- `extractCitations()` — deduplicate by sourceId, max 5, truncate snippets to 200 chars
- `formatCitationsForAI()` — numbered format for system prompt injection
- `formatCitationsForUI()` — simplified format for frontend display

**Ingest Progress** (`src/lib/knowledge/ingest.ts`):
- 6 stages: parsing (0%) → chunking (20%) → deduplication (40%) → embedding (50%) → storing (90%) → complete (100%)
- `updateProgress()` writes to `KBSource.processingProgress` JSON field (fire-and-forget)
- Content hash stored on source (`KBSource.contentHash`) and chunks (`KBChunk.contentHash`)

**RAGAS Evaluation** (`src/lib/knowledge/ragas.ts`):
- 4 metrics: `faithfulness`, `contextPrecision`, `contextRecall` (with groundTruth), `answerRelevancy`
- LLM-as-Judge via `generateObject()` + Zod schema, parallel evaluation
- API: `POST /api/agents/[agentId]/knowledge/evaluate` — search → generate → evaluate

**KB Analytics** (`src/lib/knowledge/analytics.ts`):
- Source/chunk stats, token distribution (5 buckets), top retrieved chunks, search metrics
- Embedding drift status, stale chunk percentage
- API: `GET /api/agents/[agentId]/knowledge/analytics`

**Maintenance** (`src/lib/knowledge/maintenance.ts`):
- Dead chunk detection: retrievalCount=0 + older than 30 days
- `cleanupDeadChunks()` — delete dead chunks
- `updateChunkRetrievalStats()` — fire-and-forget increment on every search
- Scheduled re-ingestion: `getSourcesDueForReingestion()` + `triggerReingestion()`
- API: `GET/POST /api/agents/[agentId]/knowledge/maintenance`

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

### Agent-to-Agent (A2A) Communication
- AgentCard model stores public agent cards for discovery (name, description, skills, capabilities)
- `card-generator.ts` generates cards from agent config + flow analysis (skill counting)
- Circuit breaker pattern (`circuit-breaker.ts`) — CLOSED/OPEN/HALF_OPEN states, configurable thresholds
- Rate limiter (`rate-limiter.ts`) — per-agent call rate limiting
- AgentCallLog model with distributed tracing: traceId, spanId, parentSpanId
- API routes: `/api/a2a/agents` (discovery), `/api/agents/[agentId]/a2a` (task communication), `/api/agents/[agentId]/a2a/card` (card generation)
- Call monitoring UI: `src/components/a2a/agent-call-monitor.tsx`

### Agent-as-Tool Orchestration
- `src/lib/agents/agent-tools.ts` converts sibling agents into Vercel AI SDK tool definitions
- AI response handlers (both streaming and non-streaming) merge agent tools alongside MCP tools when `enableAgentTools` is true
- Protection stack: circuit breaker, rate limiter, circular call detection, depth limiting (max 3), audit logging
- Property panel: "Agent Orchestration" toggle on ai_response nodes
- `stopWhen: stepCountIs(20)` for multi-step tool calling (increased from 5 for web agent use cases)

### Web Browsing Capabilities
- `web_fetch` node — HTTP fetch with URL validation and SSRF protection
- `browser_action` node — browser automation actions via MCP (Playwright)
- AI response handlers support MAX_TOOL_STEPS=20 for multi-page web navigation
- Server maxDuration=180s, client stream timeout=180s for long-running MCP tool chains
- Heartbeat interval during tool calls to prevent stream disconnects

### Agent Discovery Marketplace
- `/discover` page with faceted search: categories, tags, model, sort, scope (public/mine/all)
- `/api/agents/discover` endpoint: 4 parallel Prisma queries (agents, count, category stats, tag aggregation)
- Agent model fields: `category String?`, `tags String[]`, `isPublic Boolean`
- Shared categories in `src/lib/constants/agent-categories.ts` (23 categories incl. marketplace-only)
- Debounced search (300ms), loading skeletons, active filter pills, category badges with colors
- Searchable agent selector in flow builder property panel (replaces basic HTML select)

### Agent Templates
- 216 templates in `src/data/agent-templates.json` across 19 categories (all at minimum 🟢 Dobro coverage)
- `/templates` page with server component + client-side search and category filter tabs
- Dashboard "New Agent" dialog includes "Browse Templates" tab — selecting pre-fills name, description, systemPrompt
- Template gallery component: `src/components/templates/template-gallery.tsx`
- **19 template categories** — all at minimum 8 templates (🟢 Dobro); 5 categories at 15+ (🔵 Odlično)
- New 2026 categories added: `finance` (10), `hr` (10), `sales` (10), `research` (8), `writing` (8), `data` (8), `coding` (8)
- `CATEGORY_LABELS` in template-gallery.tsx covers all 23 categories (including marketplace-only)
- When adding templates: update `src/data/agent-templates.json` array + header `total` + `categories` list

### Human Approval Workflow
- `human_approval` node type in flow — pauses execution for human review
- HumanApprovalRequest model: PENDING → APPROVED/REJECTED/EXPIRED
- API: `/api/approvals` (list pending), `/api/approvals/[requestId]/respond` (approve/reject)
- `human-approval-handler.ts` creates request and returns `waitForInput: true`

### Security Hardening
- `body-limit.ts` — parseBodyWithLimit() with 1 MB default
- `sanitize-error.ts` — generic errors in production, detailed in dev
- `security-headers.ts` — X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy
- `url-validation.ts` — validateExternalUrlWithDNS() with private IP blocklist (SSRF protection)
- CSRF Origin header check in middleware for mutations
- MIME type + extension validation on file uploads
- JWT session maxAge reduced to 24 hours
- MAX_CHUNKS=500 limit in ingest pipeline, MAX_AGENTS_PER_USER=100 cap
- `function-handler.ts` uses vm.Script + vm.createContext sandbox (no process/require/global, 5s timeout)

### Auth
- NextAuth v5 with GitHub + Google OAuth providers
- PrismaAdapter for storage, JWT session strategy, maxAge 24 hours
- CSRF Origin header check in middleware for state-changing methods (POST/PUT/PATCH/DELETE)
- Middleware in `src/middleware.ts` — cookie check for `authjs.session-token` / `__Secure-authjs.session-token`
- Public paths: `/login`, `/embed/*`, `/api/auth/*`, `/api/health`, `/api/agents/[agentId]/chat`, `/api/a2a/*`, `/_next/*`, `/embed.js`
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
- **AI Response + MCP + Agent Tools**: tools auto-injected into `streamText`/`generateText` when agent has linked MCP servers or enableAgentTools is true, `stopWhen: stepCountIs(20)` for multi-step tool calling
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

### CLI Generator Pipeline
- 6-phase AI pipeline that wraps any CLI application as an MCP server — **dual-target: Python (FastMCP) or TypeScript (Node.js MCP SDK)**
- Phases: `analyze` (0) → `design` (1) → `implement` (2) → `write-tests` (3) → `document` (4) → `publish` (5)
- **Target selection:** `PipelineConfig.target` (`"python"` | `"typescript"`, default `"python"`) — stored on `CLIGeneration.target` in DB; shown as `Py` / `TS` badge in UI
- Phases 0–1 (analyze, design) are **language-agnostic**; phases 2–5 branch by `config.target` inside `ai-phases.ts`
- Frontend-driven loop: UI calls `/advance` repeatedly; each call runs one phase and persists results
- Each phase uses `generateObject()` with Zod schemas (`src/lib/cli-generator/schemas.ts`) — no fragile JSON parsing
- System/user prompt separation for prompt caching efficiency (`src/lib/cli-generator/prompts.ts`)
- Per-file generation: implement and test phases call a single-file prompt builder once per file to avoid context overflow
- **Python FastMCP pattern** (critical): `server.py` must use `from mcp.server.fastmcp import FastMCP` — `mcp.Server` does NOT exist
  - Python generated files (10): `main.py`, `bridge.py`, `server.py`, `__init__.py`, `conftest.py`, `test_bridge.py`, `test_server.py`, `requirements.txt`, `pyproject.toml`, `README.md`
  - Python bridge uses `subprocess.run`; tests use **pytest** (`conftest.py` fixtures)
  - Python MCP config: `{ command: "python", args: ["server.py"] }`
- **TypeScript Node.js MCP SDK pattern** (critical): `server.ts` must use `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` with `server.registerTool()` — NEVER `server.tool()` (deprecated)
  - `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`; Zod v3 `inputSchema`; ESM imports with `.js` extension
  - TypeScript bridge uses `child_process.spawnSync` (synchronous, typed `BridgeResult` interface)
  - TypeScript tests use **Vitest** (`"test": "vitest run"` in `package.json`); `"type": "module"`, `"build": "tsc"`
  - TypeScript generated files (8): `index.ts`, `bridge.ts`, `server.ts`, `bridge.test.ts`, `server.test.ts`, `package.json`, `tsconfig.json`, `README.md`
  - TypeScript MCP config: `{ command: "node", args: ["dist/server.js"] }`
  - `TSPublishOutputSchema` in `schemas.ts` outputs `package.json` + `tsconfig.json` + `mcp_config`
- Stuck detection: `STUCK_THRESHOLD_MS = 5 min` — UI shows AlertTriangle on generations where `updatedAt` exceeds threshold without COMPLETED/FAILED
- Resume endpoint resets the stuck phase and re-invokes the phase runner
- Publish phase registers the generated bridge as an MCP server (`MCPServer` model) linked to the user
- `extractToolsFromFiles()` in `mcp-registration.ts` auto-detects target: Python (parses `@server.tool()` decorators) vs TypeScript (parses `server.registerTool()` calls, ignores `.test.ts` files)
- `STUCK_THRESHOLD_MS` lives in `src/lib/cli-generator/types.ts` — never export constants from `route.ts`

### Agent Evals / Testing Framework
- **3-layer strategy:** Layer 1 (deterministic, free), Layer 2 (semantic similarity, ~$0.001/eval), Layer 3 (LLM-as-Judge, ~$0.01/eval)
- **12 assertion types:**
  - L1 deterministic: `exact_match`, `contains`, `icontains`, `not_contains`, `regex`, `starts_with`, `json_valid`, `latency`
  - L2 semantic: `semantic_similarity` — cosine distance via OpenAI text-embedding-3-small, configurable threshold (default 0.8)
  - L3 LLM-as-Judge: `llm_rubric` (custom criteria), `kb_faithfulness` (hallucination detection), `relevance` (addresses question)
- **Runner architecture:** `runEvalSuite(suiteId, agentId, options)` — sequential test cases (avoids rate limits), calls `/api/agents/[agentId]/chat` with `stream: false, isEval: true`, persists EvalResult per case, updates EvalRun with score
- **Score:** average of all assertion scores per case; overall score = average across cases (0.0–1.0)
- **Deploy hook:** `triggerDeployEvals(agentId, { baseUrl, authHeader })` — fire-and-forget, called after `VersionService.deployVersion()`; runs all suites with `runOnDeploy: true` sequentially; per-suite errors never block remaining suites
- **Limits:** max 20 suites per agent, max 50 test cases per suite, only one RUNNING run per suite at a time (409 on conflict)
- **Auth:** all routes use `requireAgentOwner()` — users can only eval their own agents
- **UI:** two-panel layout (`/evals/[agentId]`) — suite sidebar (Star = default, Rocket = runs on deploy) + tabbed main area (Test Cases / Results); recharts LineChart for score trend over time
- **Schemas:** `src/lib/evals/schemas.ts` — `EvalAssertionSchema` discriminated union, `CreateEvalSuiteSchema` (includes `runOnDeploy`), `TriggerEvalRunSchema`
- **LLM-as-Judge model:** uses `DEFAULT_MODEL` (deepseek-chat) for cost efficiency, `generateObject()` with `JudgeOutputSchema { score, reasoning }`, maxTokens: 256
- **CSV export:** one row per assertion (N assertions × M cases = N×M data rows); RFC-4180 quoting (`"${str.replace(/"/g, '""')}"`); per-run route (`run/[runId]/export`) and suite bulk route (`[suiteId]/export?limit=50`)
- **Scheduled evals:** `triggerScheduledEvals()` in `src/lib/evals/schedule-hook.ts`; pure-JS `cronMatchesDate()` (no dep); 4-min double-run prevention via `lastScheduledAt`; `POST /api/evals/scheduled` protected by `CRON_SECRET` Bearer header
- **A/B comparison:** `POST /api/agents/[agentId]/evals/[suiteId]/compare`; type `"version"` loads `FlowVersion.content` snapshot; type `"model"` injects `modelOverride` into all `ai_response` node `data.model` fields; runs A then B sequentially; mutual `comparisonRunId` linking via `prisma.$executeRaw`; `ComparisonDelta` = `{ scoreDiff, latencyDiffMs, aWins, bWins, ties, winner }`
- **Chat API eval params:** `evalFlowVersionId` replaces `context.flowContent` with version snapshot; `evalModelOverride` overrides `data.model` on every `ai_response` node in-memory before execution

### Inbound Webhooks
- **Standard Webhooks spec** (standardwebhooks.com): HMAC-SHA256, `x-webhook-id` / `x-webhook-timestamp` / `x-webhook-signature` headers, 5-min timestamp window
- **Public trigger endpoint**: `POST /api/agents/[agentId]/trigger/[webhookId]` — no session auth, authenticated via HMAC-SHA256 signature
- **Models**: `WebhookConfig` (config per flow node), `WebhookExecution` (idempotency + execution log)
- **`webhook_trigger` node**: flow entry-point (like `schedule_trigger`) — no input handle; injects `__webhook_payload`, `__webhook_event_type`, `__webhook_id` into context
- **Auto-sync on deploy**: `syncWebhooksFromFlow()` in `src/lib/webhooks/sync.ts` — upsert WebhookConfig for each `webhook_trigger` node, disable configs for removed nodes; fired after transaction commits (never blocks deploy)
- **Secret generation**: `generateWebhookSecret()` — `randomBytes(32).toString("base64url")` (43 chars, 256-bit entropy, URL-safe)
- **Idempotency**: `WebhookExecution.idempotencyKey` has `@@unique` — duplicate `x-webhook-id` values return 409
- **Signature verification**: `src/lib/webhooks/verify.ts` — `timingSafeEqual`, supports multi-signature rotation (`v1,sig1 v1,sig2`)
- **Body mapping**: JSONPath (`$.action.type`), dot notation (`event.type`), bracket notation (`items[0]`) — resolved in `execute.ts`
- **Slack URL verification**: handled in the route before signature check — `{ type: "url_verification", challenge }` → respond immediately with `{ challenge }`
- **Rate limit**: 60 req/min per webhookId
- **Event filtering**: `eventFilters String[]` on `WebhookConfig` — empty = accept all; non-empty = only trigger if resolved event type matches one value. Resolved event type: header-first (`x-github-event`, `x-slack-event`, `x-event-type`, `x-webhook-event`, etc.) falling back to body (`$.event.type` for Slack, `$.type` for Stripe/generic). Filtered events return `{ success: true, status: 200, skipped: true }` and do NOT create a `WebhookExecution` record.
- **Provider presets**: `src/lib/webhooks/presets.ts` — GitHub, Stripe, Slack, Generic presets with pre-configured body/header mappings, event filters, and `commonEvents` suggestion lists for the filter editor
- **Webhooks management UI**: `/webhooks/[agentId]` — two-panel (list + detail), three tabs per webhook (Executions / Configuration / Test). Configuration tab: preset picker grid, event filter tag editor with autocomplete, body/header mapping editors with row-level CRUD. Create dialog includes inline preset picker.
- **API routes**: `GET/POST /api/agents/[agentId]/webhooks`, `GET/PATCH/DELETE /api/agents/[agentId]/webhooks/[webhookId]`, `POST /api/agents/[agentId]/webhooks/[webhookId]/rotate`

### Redis — Cross-Replica Shared State
- `src/lib/redis.ts` — singleton client using `ioredis` via dynamic `await import("ioredis")`
- Graceful fallback: if `REDIS_URL` not set or connection fails, returns `null` — all callers fall back to in-memory
- `connectionFailed` flag — once Redis fails, all subsequent calls return `null` immediately (no retry storm)
- Retry strategy: 3 retries max, exponential backoff (200ms, 400ms, 600ms), then permanent fail
- Features: generic cache (get/set/del with TTL), session cache (5min TTL), MCP pool coordination (10min TTL), rate limiting (Lua EVAL)
- `resetRedis()` for testing — quits client, clears singleton + `connectionFailed` flag

### Analytics & Monitoring
- `trackChatResponse()` — fire-and-forget analytics for every chat response
- Rate limiting: 20 req/min per agentId:IP on `/api/agents/[agentId]/chat` (Redis-backed when available, in-memory fallback)
- Health check: `/api/health` returns DB status, Redis status, uptime, version
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
# Optional (add keys to enable additional features):
#   REDIS_URL                      — Redis connection URL (enables cross-replica rate limiting, caching, session sharing)
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
pnpm test:e2e         # Playwright E2E tests
pnpm test:e2e:ui      # Playwright UI mode
pnpm test:e2e:debug   # Playwright debug mode
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations (dev)
pnpm db:push          # Sync schema directly
pnpm db:studio        # Prisma Studio UI
pnpm db:seed          # Seed dev data
pnpm precheck         # Pre-push validation (TS + vitest + lucide mocks + strings)
pnpm precheck:file    # Same, for a specific file (e.g. pnpm precheck:file src/foo.tsx)
```

---

## 8. CLAUDE WORKING GUIDELINES

### Pre-Push Workflow
Before every commit+push, run `pnpm precheck` (or `pnpm precheck:file <path>` for a specific file).
The script simulates CI locally: TypeScript check → targeted vitest → lucide icon mock check → placeholder string consistency.
All 4 checks must show PASS before pushing. Workflow: **code → precheck → commit → push**.

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
- E2E tests: Playwright, `e2e/tests/` folder, `.spec.ts` extension (8 spec files)
- Run: `pnpm test` (unit), `pnpm test:e2e` (E2E)
- 1394 unit tests across 114 test files
- E2E coverage: auth flows, dashboard CRUD, flow editor, chat streaming, knowledge base, agent import/export, API routes, health check
- Unit test coverage: template resolution, text chunking, HTML parsing, flow engine, message handler, stream protocol, streaming engine, streaming AI handler, streaming AI+MCP handler, PDF/DOCX parsing, file type routing, agent export schema validation, error display component, env validation, logger, rate limiting, analytics, health check, search/expand-chunks, MCP client, MCP pool, MCP tool handler, diff engine, version service, auth guards, flow content validation, auth security integration (401/403 checks), circuit breaker, parallel agents, loop handler, parallel handler, memory write/read handlers, evaluator handler, schedule trigger handler, email send handler, notification handler, format transform handler, switch handler, parallel streaming handler, web fetch handler, webhook handler, set variable handler, wait handler, URL validation, engine integration tests (multi-node flows), CLI generator (prompts, pipeline phases, Zod schemas, MCP registration, stuck detection, resume endpoint), **eval assertions (all 12 types, 3 layers)**, **eval semantic similarity (cosine math + embed mocks)**, **eval LLM-as-Judge (rubric/faithfulness/relevance)**, **eval runner (suite orchestration, progress updates, error handling)**, **eval deploy hook (fire-and-forget, suite filtering, error isolation)**, **eval API routes (CRUD, 409 conflict, 422 limits)**, **inbound webhooks: verify (21 tests), execute (23 tests — incl. event filter + body event type extraction), webhook-trigger handler (11 tests), sync (22 tests)**
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider by modelId prefix
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- `getAvailableModels()` returns models filtered by configured env keys (client calls use `ALL_MODELS` directly)
- `src/lib/models.ts` is client-safe — no server imports, no env access; import `ALL_MODELS` in client components
- DeepSeek has no embedding support — OPENAI_API_KEY is required for KB features
- Adding a new provider: (1) add `@ai-sdk/[provider]` package, (2) add env key to `src/lib/env.ts`, (3) add factory + routing to `src/lib/ai.ts`, (4) add models to `src/lib/models.ts`

---

## 9. ECC INTEGRATION — everything-claude-code

### 9.1 What is ECC?

`everything-claude-code` (GitHub: affaan-m/everything-claude-code) is an advanced orchestration
framework for Claude Code: 25 specialized agents, 108+ skill modules, 57 slash commands,
15+ hook event types, language-specific rules, and an instinct-based continuous learning system.

**Architecture decision:** ECC integrates as a MODULE inside agent-studio (`src/lib/ecc/`),
NOT as a separate project or fork. Agent-studio already has 80%+ of the needed infrastructure.

### 9.2 ECC → Agent Studio Component Mapping

| ECC Component          | Studio Equivalent                    | Integration Action                    |
|------------------------|--------------------------------------|---------------------------------------|
| 25 Agent definitions   | Agent Templates (216 existing)       | Import as new "Developer Agents" category |
| 108+ SKILL.md files    | Knowledge Base (RAG pipeline)        | Ingest into shared KB + new Skill model |
| 57 slash commands      | CLI Generator / Flow Templates       | Map to flow triggers + API routes     |
| Hook system (15+ types)| Webhook system (existing)            | Extend webhook events + new hook middleware |
| Rules (language-specific)| Agent system prompts               | Embed in agent template configs       |
| Instinct system        | NEW — continuous learning            | New Instinct model + Learn node + /evolve API |
| .clauderc config       | Agent settings JSON                  | Map to agent metadata fields          |

### 9.3 ECC Agent Roster (25 agents)

Model routing per ECC spec:
- **Opus** (complex reasoning): planner, architect, chief-of-staff, meta-orchestrator
- **Sonnet** (balanced): code-reviewer, tdd-guide, security-reviewer, debugger, refactor-planner, api-designer, performance-optimizer
- **Haiku** (fast): doc-updater, refactor-cleaner, test-writer, commit-message-writer, changelog-generator

All 25 agents get imported as Studio templates in `src/data/ecc-agent-templates.json` with:
- YAML frontmatter → JSON config (name, description, model, tools, skills)
- Agent Card endpoint: `GET /api/agents/[agentId]/card.json` (Google A2A v0.3 spec)
- Linked to shared ECC Skills KB automatically

### 9.4 ECC Skill Structure

Each skill is a `SKILL.md` with YAML frontmatter:
```yaml
---
name: skill-name
version: "1.0.0"
description: "What this skill does"
inputs:
  - name: param1
    type: string
    required: true
outputs:
  - name: result
    type: string
tags: [typescript, testing, security]
category: development
language: typescript
---
# Skill content (Markdown)
Instructions, examples, patterns...
```

Skills are stored in the new `Skill` Prisma model AND vectorized into the Knowledge Base
for RAG retrieval. The ECC Skills MCP server exposes them via MCP protocol.

### 9.5 New File Structure (ECC additions)

```
src/lib/ecc/                          # ← ECC module root
  ├── index.ts                        # Barrel exports, feature flag check
  ├── skill-parser.ts                 # Parse SKILL.md YAML frontmatter
  ├── agent-importer.ts               # Convert ECC agent .md → Studio template
  ├── meta-orchestrator.ts            # Autonomous agent routing
  ├── instinct-engine.ts              # Pattern extraction + confidence scoring
  ├── obsidian-adapter.ts             # Stub for future Obsidian integration
  └── types.ts                        # ECC-specific TypeScript interfaces

src/data/
  └── ecc-agent-templates.json        # 25 ECC agent templates (separate from existing 216)

src/app/skills/
  └── page.tsx                        # Skill Browser UI (search, filter, cards)

src/app/api/ecc/
  ├── ingest-skills/route.ts          # POST — async bulk skill ingestion
  └── card/[agentId]/route.ts         # GET — Agent Card (A2A v0.3)

src/app/api/skills/
  └── evolve/route.ts                 # POST — instinct → skill promotion

services/ecc-skills-mcp/              # ← Separate Railway service
  ├── main.py                         # Python FastMCP server
  ├── requirements.txt                # FastMCP, psycopg2, etc.
  ├── railway.toml                    # Railway config for this service
  └── Dockerfile                      # Optional, Nixpacks auto-detects Python

scripts/
  ├── pre-push-check.sh               # Pre-push CI simulation (TS + vitest + lucide mocks + strings)
  ├── import-ecc-agents.mjs           # One-time agent import script
  └── import-ecc-skills.mjs           # One-time skill import script
```

---

## 10. ECC IMPLEMENTATION — Completed Phases

All 10 phases have been implemented and deployed to production.

### Phase 0: Prisma Schema Foundation (COMPLETED)

Models added to `prisma/schema.prisma`:

```prisma
model AgentExecution {
  id                String   @id @default(cuid())
  agentId           String
  agent             Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  status            ExecutionStatus @default(PENDING)
  startedAt         DateTime @default(now())
  completedAt       DateTime?
  durationMs        Int?
  inputParams       Json?
  outputResult      Json?
  traceId           String?
  parentExecutionId String?
  parentExecution   AgentExecution? @relation("ExecutionTree", fields: [parentExecutionId], references: [id])
  childExecutions   AgentExecution[] @relation("ExecutionTree")
  error             String?
  tokenUsage        Json?    // { input: number, output: number, model: string }
  createdAt         DateTime @default(now())

  @@index([agentId, status])
  @@index([traceId])
}

enum ExecutionStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
  TIMEOUT
}

model Skill {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  version      String   @default("1.0.0")
  description  String
  content      String   @db.Text  // Full SKILL.md content
  inputSchema  Json?
  outputSchema Json?
  tags         String[]
  category     String?
  language     String?
  eccOrigin    Boolean  @default(true)
  permissions  AgentSkillPermission[]
  instincts    Instinct[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([slug])
  @@index([language])
}

model AgentSkillPermission {
  id          String      @id @default(cuid())
  agentId     String
  agent       Agent       @relation(fields: [agentId], references: [id], onDelete: Cascade)
  skillId     String
  skill       Skill       @relation(fields: [skillId], references: [id], onDelete: Cascade)
  accessLevel AccessLevel @default(READ)

  @@unique([agentId, skillId])
}

enum AccessLevel {
  READ
  EXECUTE
  ADMIN
}

model Instinct {
  id               String   @id @default(cuid())
  name             String
  description      String
  confidence       Float    @default(0.0) // 0.0 - 1.0
  frequency        Int      @default(1)
  origin           String?
  examples         Json?
  agentId          String
  agent            Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  promotedToSkillId String?
  promotedToSkill  Skill?   @relation(fields: [promotedToSkillId], references: [id])
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([agentId, confidence])
}

model AuditLog {
  id           String   @id @default(cuid())
  userId       String?
  action       String   // CREATE, UPDATE, DELETE, EXECUTE, ACCESS
  resourceType String   // Agent, Skill, Flow, KB, etc.
  resourceId   String
  before       Json?
  after        Json?
  ipAddress    String?
  userAgent    String?
  timestamp    DateTime @default(now())

  @@index([resourceType, resourceId])
  @@index([userId, timestamp])
}
```

**Also add to existing Agent model:**
```prisma
// Add these relations to the Agent model:
executions         AgentExecution[]
skillPermissions   AgentSkillPermission[]
instincts          Instinct[]
eccEnabled         Boolean  @default(false)
```

Applied via: `pnpm db:push`

### Phase 1: Import 25 ECC Agents as Templates (COMPLETED)
- New category "Developer Agents" in `src/lib/constants/agent-categories.ts`
- `src/data/ecc-agent-templates.json` — 25 templates, separate from existing 216
- Import script: `scripts/import-ecc-agents.mjs` — parses YAML frontmatter from ECC .md files
- Agent Card endpoint: `GET /api/agents/[agentId]/card.json` (A2A v0.3 JSON-LD)
- Tests: schema validation for all 25, snapshot tests

### Phase 2: 60+ Skills → Knowledge Base + Skill Browser (COMPLETED)
- `scripts/import-ecc-skills.mjs` — parse SKILL.md → Skill model + KB vectorization
- `POST /api/ecc/ingest-skills` — **ASYNC** (not in startup path! Railway healthcheck = 120s)
- Protected by `CRON_SECRET` header
- New page: `src/app/skills/page.tsx` — search bar, faceted filters (language, category, agent)
- **RAILWAY**: incremental re-ingest via Cron Service (daily)

### Phase 3: Meta-Orchestrator + Flow Templates (COMPLETED)
- Meta-Orchestrator agent based on ECC chief-of-staff
- 4 pre-built flow templates:
  1. **TDD Pipeline**: Planner → TDD Guide → parallel[Code Reviewer + Security] → end
  2. **Full Dev Workflow**: Planner → Architect → parallel[Backend+Security+Docs] → Reviewer → end
  3. **Security Audit**: Security Reviewer → parallel[OWASP + Secret scan + Deps] → Doc Updater → end
  4. **Code Review Pipeline**: Planner → parallel[Reviewer + language-specific] → summary → end
- Add to `src/data/starter-flows.ts`
- **RAILWAY**: no serverless timeout — multi-agent pipelines run unlimited

### Phase 4: ECC Skills MCP Server — Separate Railway Service (COMPLETED)
Deployed as a separate service. MCP endpoint: `/mcp`.

- `services/ecc-skills-mcp/main.py` — Python FastMCP with 3 tools:
  - `get_skill(name)` → returns skill content
  - `search_skills(query, tag?)` → vector search
  - `list_skills(language?)` → filtered listing
- Deploy as Railway service: Nixpacks Python, Port 8000, Private Networking ONLY
- Internal URL: configured via `ECC_MCP_URL` env var
- Env-aware in `featured-servers.ts`: prod → env var, dev → localhost:8000
- MCP Roots: agent workspaces as roots. MCP Resources: `kb://agent-id/skill-name`
- MCP pool: min=5, max=20, HTTP/2, timeout tiers (2s/10s/30s)

### Phase 5: Continuous Learning + Instinct System (COMPLETED)
- "Learn" node in Flow Builder — extracts patterns from AgentExecution history
- Instinct storage: confidence 0.0-1.0, frequency counter, >0.85 → promote to KB skill
- `POST /api/skills/evolve` — AI clusters instincts, generates new SKILL.md
- **RAILWAY**: evolve in Cron Service at 3AM daily
- Execution Dashboard: timeline, decision trace, replay mode
- `src/lib/ecc/obsidian-adapter.ts` — interface stub for future Obsidian phase

### Phase 6: Observability — OpenTelemetry + Metrics (COMPLETED)
- `@opentelemetry/api` + `@opentelemetry/sdk-node`
- gen_ai.* semantic conventions (AAIF 2026): system, model, input_tokens, tool use spans
- Pino structured logging → Railway log drain → Grafana Loki
- **RAILWAY**: OTLP push exporter (NOT Prometheus pull — Railway doesn't support scrape)
- `OTEL_EXPORTER_OTLP_ENDPOINT` env var → Grafana Cloud

### Phase 7: Security Hardening (COMPLETED)
- Prompt injection defense: JSON Schema validation on all skill inputs, output PII filtering
- RBAC enforcement: middleware checks AgentSkillPermission before skill calls
- Webhook HMAC-SHA256: X-Webhook-ID, X-Webhook-Signature, X-Webhook-Timestamp
- Audit log: all agent CRUD, executions, skill calls → AuditLog model
- **RAILWAY**: PostgreSQL → Disable Public Networking. ECC MCP → Disable Public Networking
- Security test suite: injection, RBAC bypass, replay, secret leakage

### Phase 8: Performance Testing & Optimization (COMPLETED)
- k6 load test: 100 concurrent users, 25 agents, 30 min
- DB indexes: AgentExecution(agentId, status), Skill(slug, language), Instinct(agentId, confidence)
- Caching: skill metadata (10min), KB search (2min), agent card (5min) — target >80% hit rate
- RAG quality benchmark: 20 queries, MRR target >0.7
- **RAILWAY**: 2 replicas with Redis for cross-replica state. Further scaling → increase replicas + Redis cluster
- SLA targets: P95 <5s flow exec, P99 <2s KB search, P95 <100ms skill metadata

### Phase 9: Production Deploy + Obsidian Onboarding (COMPLETED)
- Deploy ECC Skills MCP as Railway service (Private Networking only)
- Cron Service: add /api/skills/evolve (3AM daily) alongside existing scheduled flows (5min)
- Feature flag: `ECC_ENABLED` env var for killswitch
- Rollback procedure: Railway rollback, DB snapshot, MCP rollback (RTO: <5 min)
- `docs/obsidian-integration.md` — onboarding guide for future Obsidian phase
- Smoke test: health, login, agent create, KB ingest, chat, MCP call, webhook, cron

### Implementation Summary
All 10 phases completed and deployed to production.
60 skills ingested and vectorized (255 KB chunks). ECC_ENABLED defaults to `false` (opt-in).

---

## 11. RAILWAY DEPLOYMENT — ECC Multi-Service Architecture

### 11.1 Service Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                   Railway Project: agent-studio                  │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────────┐    │
│  │  agent-studio        │    │  PostgreSQL + pgvector        │    │
│  │  Next.js 15.5        │←──→│  pgvector/pgvector:pg16      │    │
│  │  Nixpacks · Port $PORT│   │  Port 5432 · Persistent Vol  │    │
│  │  numReplicas: 2      │    │  HNSW index for embeddings   │    │
│  └────────┬────────────┘    └──────────────────────────────┘    │
│           │                                                      │
│           │ internal networking                                  │
│           │                                                      │
│  ┌────────▼────────────┐    ┌──────────────────────────────┐    │
│  │  Redis               │    │  Cron Service                │    │
│  │  Port 6379            │    │  */5 * * * * (flows)         │    │
│  │  Cross-replica state  │    │  0 3 * * * (evolve)          │    │
│  └──────────────────────┘    │  → /api/cron/*               │    │
│                               │  Internal networking only    │    │
│  ┌──────────────────────┐    └──────────────────────────────┘    │
│  │  ECC Skills MCP       │                                        │
│  │  Python FastMCP       │                                        │
│  │  Port 8000 · /mcp     │                                        │
│  └──────────────────────┘                                        │
│                                                                  │
│  All services communicate via internal networking                │
│  Public: agent-studio → https://your-app.railway.app             │
└──────────────────────────────────────────────────────────────────┘
```

### 11.2 Railway-Specific Constraints

- **No serverless timeout** — multi-agent pipelines can run unlimited (better than Vercel 300s)
- **Ephemeral /tmp** — agent workspace cleared on redeploy. All persistent data → PostgreSQL
- **Vercel cron NOT available** — use Railway Cron Service for scheduled flows + /evolve
- **Nixpacks build** — Python MCP server needs `requirements.txt` for auto-detection
- **Internal networking** — MCP server communicates via private internal networking (faster, no egress cost)
- **Two replicas** — `numReplicas: 2` with Redis for cross-replica rate limiting, session cache, and MCP pool coordination. Falls back to in-memory if Redis unavailable
- **Redis** — configured via `REDIS_URL` env var. Railway auto-routes to internal networking
- **ioredis workaround** — `pnpm add ioredis` in `buildCommand` because lockfile was out of sync. `.npmrc` has `frozen-lockfile=false`, `nixpacks.toml` overrides install phase
- **Healthcheck timeout** — 120s. Skill ingestion MUST be async POST, not in startup path

### 11.3 New Environment Variables

| Service          | Variable                      | Value                                           | Phase |
|------------------|-------------------------------|-------------------------------------------------|-------|
| agent-studio     | `ECC_MCP_URL`                 | Internal URL of ECC Skills MCP service          | F4    |
| agent-studio     | `ECC_ENABLED`                 | `true`                                          | F9    |
| agent-studio     | `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP gateway URL (e.g. Grafana Cloud)           | F6    |
| agent-studio     | `OTEL_SERVICE_NAME`           | `agent-studio`                                  | F6    |
| agent-studio     | `REDIS_URL`                   | Redis connection URL (auto-routes to internal)  | —     |
| ecc-skills-mcp   | `DATABASE_URL`                | Reference → PostgreSQL (read-only recommended)  | F4    |
| ecc-skills-mcp   | `PORT`                        | `8000`                                          | F4    |
| ecc-skills-mcp   | `MCP_TRANSPORT`               | `streamable-http`                               | F4    |
| cron-service     | `STUDIO_URL`                  | Internal URL of agent-studio service            | F9    |

---

## 12. 2026 STANDARDS COMPLIANCE

### MCP 2025-11-25 Spec
- Streamable HTTP transport (replacing SSE-only)
- MCP Roots: agent workspaces as root URIs
- MCP Resources: KB documents exposed as `kb://` URIs
- Tasks primitive: long-running skill executions with progress

### Google A2A v0.3
- Agent Card: `GET /api/agents/[agentId]/card.json` — JSON-LD with capabilities, inputs, outputs
- Discovery: agents register cards, Meta-Orchestrator reads cards for routing

### OpenTelemetry gen_ai.* Semantic Conventions
- `gen_ai.system`: provider name
- `gen_ai.request.model`: model ID
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- Span events for tool use calls
- AAIF (AI Agent Interoperability Framework, 150+ orgs) 2026 standard

### OAuth 2.1 + PKCE
- All new OAuth flows use PKCE (already in NextAuth v5 config)
- MCP server auth: OAuth 2.1 for external MCP connections

---

## 13. FUTURE: OBSIDIAN INTEGRATION (deferred to after ECC)

**Purpose:** Persistent memory layer that survives Railway's ephemeral /tmp filesystem.

### Architecture
- Obsidian vault on GitHub (Git-synced via Obsidian Git plugin, free)
- GitMCP as bridge: exposes vault as MCP server
- Local REST API plugin (free community plugin) for direct Obsidian read/write
- Write-back pattern: agent learns → instinct → skill → Obsidian vault document

### Why After ECC
- ECC skills become the initial vault content
- Instinct system (Phase 5) generates new knowledge → Obsidian stores it persistently
- Adapter stub in `src/lib/ecc/obsidian-adapter.ts` ready from Phase 5

### Obsidian Plans
- **Free version** + community plugins is sufficient
- Paid plans (Sync, Publish) don't help technically — Git sync is better for this use case

---

## 14. CLAUDE WORKING GUIDELINES — ECC Module

### When working with ECC code:
1. **Always check feature flag**: wrap ECC code with `if (process.env.ECC_ENABLED !== 'false')` or the per-agent `eccEnabled` field
2. **Schema changes**: run `pnpm db:push` after any Prisma schema modifications
3. **Async ingestion ONLY**: Never put skill ingestion in startup path (Railway healthcheck = 120s)
4. **Internal networking**: MCP server URL via `process.env.ECC_MCP_URL`, never hardcode. MCP path: `/mcp`
5. **Existing patterns**: follow the same patterns as existing code (Zod validation, SWR hooks, API route handlers, Prisma queries)
6. **No new CSS frameworks**: Tailwind CSS v4 ONLY. No inline styles.
7. **MCP pool awareness**: timeout tiers matter — metadata=2s, search=10s, compute=30s
8. **Push metrics, not pull**: Railway doesn't support Prometheus scrape. Use OTLP push exporter
9. **Separate MCP service**: ECC Skills MCP is a separate Railway service (Python), not embedded in Next.js
10. **Production URL**: configured per deployment (see Railway dashboard or env vars)
