# agent-studio — Project Context for Claude

## 1. PROJECT OVERVIEW

Visual AI agent builder with multi-agent orchestration. Build AI agents via a flow editor
(XyFlow), manage knowledge bases with RAG (chunking + embeddings + hybrid search), enable
agent-to-agent communication (A2A protocol), and chat with agents. Features include: agent
marketplace/discovery with faceted search, 112 agent templates across 11 categories,
agent-as-tool orchestration (AI dynamically calls sibling agents), web browsing capabilities
(fetch + browser actions via MCP), an embeddable chat widget, a CLI Generator that
automatically produces a full MCP server bridge from any CLI application (6-phase AI pipeline:
analyze → design → implement → test → document → publish, dual-target: Python FastMCP or
TypeScript Node.js MCP SDK), and an Agent Evals / Testing
Framework (3-layer: deterministic + semantic similarity + LLM-as-Judge, deploy-triggered runs).
OAuth login (GitHub + Google). Simplified extraction from the enterprise "direct-solutions"
project — no multi-tenancy, no billing, no plugins, no collaboration.

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
- **Utilities:** class-variance-authority (cva), clsx, tailwind-merge

---

## 3. FOLDER STRUCTURE

```
prisma/
  schema.prisma         ← DB schema (26 models, pgvector, versioning, A2A, CLIGeneration, Evals)
  migrations/           ← auto-generated — never edit manually

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
    templates/page.tsx                ← Agent Templates Gallery (112 templates, 11 categories)
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
      node-picker.tsx     ← Node type selector dropdown (31 node types)
      property-panel.tsx  ← Right sidebar for editing node properties (searchable agent selector)
      version-panel.tsx   ← Version history sidebar (SWR, rollback, compare, deploy)
      deploy-dialog.tsx   ← Deploy confirmation dialog with sandbox test
      diff-view.tsx       ← Version diff viewer (added/removed/modified nodes)
      nodes/              ← 32 node display components (base + 31 node types)
    theme-provider.tsx    ← Dark mode theme provider

  data/
    agent-templates.json  ← 112 agent templates across 11 categories

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
    index.ts          ← FlowNode, FlowEdge, FlowContent, FlowVariable, NodeType (32 types)
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
  ├── testCases EvalTestCase[], runs EvalRun[]
  └── Indexes: [agentId], [agentId, runOnDeploy]

EvalTestCase — Single test case in a suite
  ├── suiteId (required, cascade delete)
  ├── label, input @db.Text, order Int
  ├── assertions Json — EvalAssertion[] (12 types, 3 layers)
  ├── tags String[]
  └── results EvalResult[]

EvalRun — One execution of an entire suite
  ├── suiteId (required, cascade delete)
  ├── status EvalRunStatus, triggeredBy ("manual"|"deploy"|"schedule")
  ├── totalCases, passedCases, failedCases, score Float?, durationMs
  ├── errorMessage?, completedAt?
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
| `/api/auth/*` | GET, POST | NextAuth authentication endpoints |
| `/api/health` | GET | Health check (DB connectivity + uptime + version) |
| `/api/analytics` | GET | Analytics dashboard data (response times, KB stats, conversations) |

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

---

## 6. KEY CONVENTIONS & PATTERNS

### Runtime Engine
- 31 node handlers registered in `src/lib/runtime/handlers/index.ts`
- Node types (31): message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook, mcp_tool, call_agent, human_approval, loop, parallel, memory_write, memory_read, evaluator, schedule_trigger, email_send, notification, format_transform, switch, web_fetch, browser_action
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
- Shared categories in `src/lib/constants/agent-categories.ts` (11 categories)
- Debounced search (300ms), loading skeletons, active filter pills, category badges with colors
- Searchable agent selector in flow builder property panel (replaces basic HTML select)

### Agent Templates
- 112 templates in `src/data/agent-templates.json` across 11 categories
- `/templates` page with server component + client-side search and category filter tabs
- Dashboard "New Agent" dialog includes "Browse Templates" tab — selecting pre-fills name, description, systemPrompt
- Template gallery component: `src/components/templates/template-gallery.tsx`

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
pnpm test:e2e         # Playwright E2E tests
pnpm test:e2e:ui      # Playwright UI mode
pnpm test:e2e:debug   # Playwright debug mode
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
- 1144 unit tests across 104 test files
- E2E coverage: auth flows, dashboard CRUD, flow editor, chat streaming, knowledge base, agent import/export, API routes, health check
- Unit test coverage: template resolution, text chunking, HTML parsing, flow engine, message handler, stream protocol, streaming engine, streaming AI handler, streaming AI+MCP handler, PDF/DOCX parsing, file type routing, agent export schema validation, error display component, env validation, logger, rate limiting, analytics, health check, search/expand-chunks, MCP client, MCP pool, MCP tool handler, diff engine, version service, auth guards, flow content validation, auth security integration (401/403 checks), circuit breaker, parallel agents, loop handler, parallel handler, memory write/read handlers, evaluator handler, schedule trigger handler, email send handler, notification handler, format transform handler, switch handler, parallel streaming handler, web fetch handler, webhook handler, set variable handler, wait handler, URL validation, engine integration tests (multi-node flows), CLI generator (prompts, pipeline phases, Zod schemas, MCP registration, stuck detection, resume endpoint), **eval assertions (all 12 types, 3 layers)**, **eval semantic similarity (cosine math + embed mocks)**, **eval LLM-as-Judge (rubric/faithfulness/relevance)**, **eval runner (suite orchestration, progress updates, error handling)**, **eval deploy hook (fire-and-forget, suite filtering, error isolation)**, **eval API routes (CRUD, 409 conflict, 422 limits)**
- Test behavior, not implementation details

### AI Model Config
- `getModel(modelId)` in `src/lib/ai.ts` routes to correct provider by modelId prefix
- `getEmbeddingModel()` always returns OpenAI text-embedding-3-small
- `getAvailableModels()` returns models filtered by configured env keys (client calls use `ALL_MODELS` directly)
- `src/lib/models.ts` is client-safe — no server imports, no env access; import `ALL_MODELS` in client components
- DeepSeek has no embedding support — OPENAI_API_KEY is required for KB features
- Adding a new provider: (1) add `@ai-sdk/[provider]` package, (2) add env key to `src/lib/env.ts`, (3) add factory + routing to `src/lib/ai.ts`, (4) add models to `src/lib/models.ts`
