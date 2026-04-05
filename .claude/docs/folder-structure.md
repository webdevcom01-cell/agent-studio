# Folder Structure

```
prisma/
  schema.prisma         ← DB schema (36 models, pgvector, versioning, A2A, CLIGeneration, Evals, Schedules, Traces, ECC)
  migrations/           ← auto-generated — never edit manually

railway.toml            ← Railway deploy config (Nixpacks, healthcheck, 2 replicas)
nixpacks.toml           ← Nixpacks install phase override (--no-frozen-lockfile)
.npmrc                  ← pnpm config (frozen-lockfile=false for Railway compat)

public/
  embed.js              ← Embeddable widget script (bubble + iframe)
  test-embed.html       ← Test page for embed widget
  pyodide-worker.js     ← Browser WebWorker for Pyodide Python execution

services/
  ecc-skills-mcp/       ← Separate Railway service — Python FastMCP exposing ECC skills via MCP (port 8000)
    main.py, requirements.txt, railway.toml, Dockerfile
  notebooklm-mcp/       ← NotebookLM MCP bridge (TypeScript) — exposes NotebookLM as MCP server

e2e/
  tests/                ← Playwright E2E specs (10 spec files)
    auth.spec.ts, dashboard.spec.ts, flow-editor.spec.ts, knowledge-base.spec.ts
    chat-streaming.spec.ts, agent-import-export.spec.ts, webhooks.spec.ts, eval-generation.spec.ts
    api/agents-api.spec.ts, api/health-api.spec.ts
  pages/                ← Page Object Models (chat, dashboard, flow-builder, knowledge, login, webhooks)
  mocks/                ← Shared route mocks (handlers.ts)
  fixtures/             ← Playwright fixtures (base.ts)
  global.setup.ts       ← Global Playwright setup (auth session bootstrap)
  scripts/generate-ci-session.ts ← Generate pre-authenticated session for CI

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
    templates/page.tsx                ← Agent Templates Gallery (221 templates, 19 categories)
    templates/templates-client.tsx    ← Templates client component (search + filter)
    builder/[agentId]/page.tsx        ← Flow editor page
    builder/[agentId]/error.tsx       ← Error boundary (Flow Editor Error)
    chat/[agentId]/page.tsx           ← Chat interface (streaming via useStreamingChat)
    chat/[agentId]/error.tsx          ← Error boundary (Chat Error)
    embed/[agentId]/page.tsx          ← Embed chat widget page
    embed/layout.tsx                  ← Dedicated embed layout (no embed.js, no SessionProvider)
    knowledge/[agentId]/page.tsx      ← Knowledge base management
    knowledge/[agentId]/error.tsx     ← Error boundary (Knowledge Base Error)
    cli-generator/page.tsx            ← CLI Generator — 6-phase pipeline UI
    evals/[agentId]/page.tsx          ← Agent Evals — suite sidebar, test case editor, results view
    evals/standards/page.tsx          ← Eval Standards catalog
    webhooks/[agentId]/page.tsx       ← Webhook management (two-panel: list + detail)
    skills/page.tsx                   ← ECC Skills Browser
    devsecops/page.tsx                ← DevSecOps Pipeline Setup guide
    api/
      auth/[...nextauth]/route.ts              ← NextAuth API route (GET, POST)
      health/route.ts                          ← Health check endpoint
      analytics/route.ts                       ← Analytics dashboard data
      agents/route.ts                          ← GET list, POST create
      agents/[agentId]/route.ts                ← GET, PATCH, DELETE agent
      agents/[agentId]/flow/route.ts           ← GET, PUT flow content
      agents/[agentId]/flow/versions/route.ts             ← GET list, POST create version
      agents/[agentId]/flow/versions/[versionId]/route.ts ← GET single version
      agents/[agentId]/flow/versions/[versionId]/diff/route.ts    ← GET diff
      agents/[agentId]/flow/versions/[versionId]/deploy/route.ts  ← POST deploy
      agents/[agentId]/flow/versions/[versionId]/rollback/route.ts ← POST rollback
      agents/[agentId]/flow/versions/[versionId]/test/route.ts    ← POST sandbox test
      agents/[agentId]/chat/route.ts           ← POST send message (streaming + non-streaming)
      agents/[agentId]/execute/route.ts        ← POST execute flow directly
      agents/[agentId]/knowledge/sources/route.ts         ← GET, POST sources
      agents/[agentId]/knowledge/sources/upload/route.ts     ← POST file upload
      agents/[agentId]/knowledge/sources/[sourceId]/route.ts  ← DELETE source
      agents/[agentId]/knowledge/search/route.ts          ← POST hybrid search
      agents/[agentId]/export/route.ts            ← GET download agent as JSON
      agents/[agentId]/mcp/route.ts               ← GET, POST, DELETE agent-server links
      agents/[agentId]/a2a/route.ts               ← A2A task communication
      agents/[agentId]/a2a/card/route.ts          ← A2A card generation/retrieval
      agents/import/route.ts                      ← POST import agent from JSON
      agents/discover/route.ts                    ← GET marketplace search/filter
      a2a/agents/route.ts                         ← A2A agent discovery
      agent-calls/route.ts                        ← Agent-to-agent call logs
      agent-calls/stats/route.ts                  ← Agent call statistics
      approvals/route.ts                          ← GET pending approval requests
      approvals/[requestId]/respond/route.ts      ← POST approve/reject
      mcp-servers/route.ts                        ← GET list, POST create MCP servers
      mcp-servers/[serverId]/route.ts             ← GET, PATCH, DELETE MCP server
      mcp-servers/[serverId]/test/route.ts        ← POST test MCP connection
      cli-generator/route.ts                      ← GET list, POST create generation
      cli-generator/[generationId]/route.ts       ← GET single generation
      cli-generator/[generationId]/advance/route.ts  ← POST advance pipeline
      cli-generator/[generationId]/resume/route.ts   ← POST resume stuck
      cli-generator/[generationId]/files/route.ts    ← GET list files
      cli-generator/[generationId]/download/route.ts ← GET download .zip
      cli-generator/[generationId]/logs/route.ts     ← GET phase logs
      cli-generator/[generationId]/publish/route.ts  ← POST register as MCP server
      cli-generator/[generationId]/test-mcp/route.ts ← GET validation + config
      agents/[agentId]/evals/route.ts                          ← GET list, POST create suite
      agents/[agentId]/evals/[suiteId]/route.ts                ← GET, PATCH, DELETE suite
      agents/[agentId]/evals/[suiteId]/cases/route.ts          ← CRUD test cases
      agents/[agentId]/evals/[suiteId]/run/route.ts            ← POST trigger, GET history
      agents/[agentId]/evals/[suiteId]/run/[runId]/route.ts    ← GET run detail
      agents/[agentId]/evals/[suiteId]/run/[runId]/export/route.ts ← GET CSV export
      agents/[agentId]/evals/[suiteId]/export/route.ts         ← GET bulk CSV
      agents/[agentId]/evals/[suiteId]/compare/route.ts        ← POST A/B comparison
      agents/[agentId]/memory/route.ts                         ← GET list memories
      agents/[agentId]/memory/[memoryId]/route.ts              ← GET, PATCH, DELETE memory
      agents/[agentId]/memory/export/route.ts                  ← GET export memories
      agents/[agentId]/memory/import/route.ts                  ← POST import memories
      api-keys/route.ts                           ← GET list, POST create API keys
      api-keys/[keyId]/route.ts                   ← GET, PATCH, DELETE API key
      orgs/[orgId]/invite/route.ts                ← POST send org invite
      orgs/[orgId]/members/route.ts               ← GET list org members
      orgs/[orgId]/members/[memberId]/route.ts    ← PATCH, DELETE org member
      invites/[token]/accept/route.ts             ← POST accept org invite
      user/account/route.ts                       ← DELETE request account deletion
      user/export/route.ts                        ← GET export user data
      admin/jobs/route.ts                         ← GET list queue jobs
      admin/stats/route.ts                        ← GET system stats
      openapi.json/route.ts                       ← GET OpenAPI 3.1 spec
      docs/route.ts                               ← GET Swagger UI

  components/
    cli-generator/                ← CLI Generator UI components
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
    dashboard/
      agent-wizard.tsx        ← Multi-step agent creation wizard
    webhooks/
      json-path-tester.tsx    ← Interactive JSONPath expression tester
    evals/
      eval-suite-editor.tsx   ← Suite editor: test case list, assertion builder
      eval-results-view.tsx   ← Results view: trend chart, per-case rows
    builder/
      flow-builder.tsx    ← Main ReactFlow editor
      flow-error-boundary.tsx ← Error boundary for flow editor
      node-picker.tsx     ← Node type selector dropdown (56 node types)
      property-panel.tsx  ← Right sidebar for editing node properties
      version-panel.tsx   ← Version history sidebar
      deploy-dialog.tsx   ← Deploy confirmation dialog
      diff-view.tsx       ← Version diff viewer
      nodes/              ← 57 node display components (base + 56 node types)
    theme-provider.tsx    ← Dark mode theme provider

  data/
    agent-templates.json      ← 221 agent templates across 19 categories
    ecc-agent-templates.json  ← 29 ECC Developer Agent templates (separate from existing 221)
    starter-flows.ts          ← Pre-populated FlowContent for selected templates
    devsecops-kb/             ← Static KB content for DevSecOps agents

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
      body-limit.ts       ← parseBodyWithLimit() — 1 MB default
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
      diff-engine.ts    ← JSON diff engine for FlowContent
      version-service.ts ← Version CRUD, deploy, rollback, diff
    mcp/
      client.ts         ← MCP client wrapper (getMCPToolsForAgent, testMCPConnection, callMCPTool)
      pool.ts           ← Connection pool (in-memory, 5min TTL, auto-cleanup)
    schemas/
      agent-export.ts  ← Zod schema + AgentExportData type for agent export/import
      kb-config.ts     ← Zod schemas for KB RAG config
    types/
      flow-trace.ts    ← Local type bridge for FlowTrace Prisma model
    utils/
      url-validation.ts ← validateExternalUrlWithDNS() — SSRF protection
    image/
      providers.ts      ← Image generation providers (DALL-E, Stable Diffusion)
      preprocessor.ts   ← Image preprocessing utilities
    audio/
      tts-providers.ts  ← Text-to-speech providers
      stt-providers.ts  ← Speech-to-text providers
    safety/
      content-moderator.ts  ← Content moderation pipeline
      pii-detector.ts       ← PII detection and redaction
      injection-detector.ts ← Prompt injection defense
      audit-logger.ts       ← Safety audit event logging
    sandbox/
      js-sandbox.ts     ← JavaScript vm2 sandbox for code-interpreter node
      python-sandbox.ts ← Python subprocess sandbox for python-code node
    database/
      query-executor.ts ← Database query execution
      connection-pool.ts ← Database connection pool management
    cache/
      index.ts          ← Cache abstraction (in-memory + Redis backends)
      memory-cache.ts   ← In-memory LRU cache implementation
    cost/
      budget-tracker.ts ← Token usage + spend tracking per agent
      token-pricing.ts  ← Model pricing table
    storage/
      storage-provider.ts ← Storage abstraction interface
      s3-provider.ts    ← AWS S3 storage provider
      gdrive-provider.ts ← Google Drive storage provider
    security/
      index.ts          ← Security middleware exports
      rbac.ts           ← Role-based access control
      prompt-guard.ts   ← Prompt injection + jailbreak defense
      audit.ts          ← Security audit log integration
    webhooks/
      verify.ts    ← HMAC-SHA256 signature verification
      execute.ts   ← Inbound webhook execution
      sync.ts      ← Auto-sync webhook_trigger nodes → WebhookConfig DB records
      presets.ts   ← Provider presets (GitHub, Stripe, Slack, Generic)
      json-path.ts ← JSONPath resolver
    scheduler/
      cron-validator.ts   ← Validate/parse cron expressions
      execution-engine.ts ← Run scheduled flows via runtime engine
      failure-notify.ts   ← Multi-channel notifications on failure
      sync.ts             ← Sync schedule_trigger nodes → FlowSchedule DB records
      schemas.ts          ← Zod schemas for schedule CRUD
    observability/
      index.ts    ← OpenTelemetry SDK init + exporters (OTLP push)
      tracer.ts   ← Distributed tracing (createSpan, gen_ai.* semantic conventions)
      metrics.ts  ← Metrics collection (counters, histograms)
      types.ts    ← OpenTelemetry type helpers
    google-workspace/
      token.ts  ← GoogleOAuthToken CRUD (store/refresh access tokens)
      tools.ts  ← MCP tools for Google Workspace
    auth-adapter.ts  ← Custom NextAuth PrismaAdapter extension
    crypto.ts        ← Cryptographic utilities (AES-256-GCM, HMAC, random bytes)
    runtime/
      engine.ts            ← Synchronous execution loop (MAX_ITERATIONS=50, MAX_HISTORY=100)
      engine-streaming.ts  ← Streaming execution loop (NDJSON ReadableStream output)
      stream-protocol.ts   ← StreamChunk encode/decode/writer helpers
      context.ts           ← Load/save conversation context from DB
      template.ts          ← {{variable}} interpolation
      types.ts             ← RuntimeContext, ExecutionResult, NodeHandler, StreamChunk, StreamWriter
      debug-controller.ts  ← Debug session state machine
      python-executor.ts   ← Python code execution via Pyodide worker
      python-types.ts      ← Types for Python execution
      workers/
        pyodide-node-worker.js ← Node.js Worker thread running Pyodide WASM
      handlers/
        index.ts           ← Handler registry (59 handlers + 2 streaming variants)
        ai-response-handler.ts          ← Non-streaming AI (generateText + MCP + agent tools)
        ai-response-streaming-handler.ts ← Streaming AI (streamText → NDJSON + MCP + agent tools)
        mcp-tool-handler.ts             ← Deterministic MCP tool call node
        call-agent-handler.ts           ← Agent-to-agent call execution
        loop-handler.ts                 ← Loop execution (count/condition modes)
        parallel-handler.ts             ← Parallel branch execution with merge strategies
        parallel-streaming-handler.ts   ← Streaming-aware parallel
        memory-write-handler.ts         ← Save data to agent persistent memory
        memory-read-handler.ts          ← Read from agent memory
        evaluator-handler.ts            ← AI-powered content evaluation
        schedule-trigger-handler.ts     ← Flow entry-point (cron/interval/manual)
        email-send-handler.ts           ← Webhook-based email sending
        notification-handler.ts         ← Multi-channel notifications
        format-transform-handler.ts     ← Data format transformation
        switch-handler.ts               ← Multi-way branching
        web-fetch-handler.ts            ← HTTP fetch with URL validation
        browser-action-handler.ts       ← Browser automation via MCP
        human-approval-handler.ts       ← Human-in-the-loop approval
        desktop-app-handler.ts          ← Desktop application integration
        learn-handler.ts                ← ECC pattern extraction
        python-code-handler.ts          ← Python code execution via sandbox
        structured-output-handler.ts    ← Typed JSON output with Zod validation
        cache-handler.ts                ← In-memory + Redis caching with TTL
        embeddings-handler.ts           ← Generate and store vector embeddings
        retry-handler.ts                ← Retry sub-flow with exponential backoff
        ab-test-handler.ts              ← A/B traffic splitting
        semantic-router-handler.ts      ← Route by semantic similarity
        cost-monitor-handler.ts         ← Token budget tracking
        aggregate-handler.ts            ← Collect + merge parallel outputs
        web-search-handler.ts           ← Web search via provider APIs
        multimodal-input-handler.ts     ← Accept image/audio/file inputs
        image-generation-handler.ts     ← Generate images via providers
        speech-audio-handler.ts         ← TTS and STT
        database-query-handler.ts       ← Execute SQL/NoSQL queries
        file-operations-handler.ts      ← Read/write files in agent workspace
        mcp-task-runner-handler.ts      ← Long-running MCP task execution
        guardrails-handler.ts           ← Content moderation, PII, injection defense
        code-interpreter-handler.ts     ← Safe JS code execution via vm2
        trajectory-evaluator-handler.ts ← Evaluate agent reasoning trajectory
        message-handler.ts, condition-handler.ts, button-handler.ts, capture-handler.ts,
        set-variable-handler.ts, end-handler.ts, goto-handler.ts, wait-handler.ts,
        ai-classify-handler.ts, ai-extract-handler.ts, ai-summarize-handler.ts,
        api-call-handler.ts, function-handler.ts, kb-search-handler.ts,
        webhook-handler.ts, webhook-trigger-handler.ts,
        verification-handler.ts, ast-transform-handler.ts, lsp-query-handler.ts
    knowledge/
      index.ts        ← Main search entry point
      chunker.ts      ← Text chunking (400 tokens, 20% overlap)
      parsers.ts      ← PDF, DOCX, HTML, Excel/CSV, PPTX parsing
      embeddings.ts   ← OpenAI embedding generation
      search.ts       ← Hybrid search (semantic + BM25 via pgvector)
      reranker.ts     ← LLM-based result re-ranking
      scraper.ts      ← URL content fetching
      ingest.ts       ← Source ingestion pipeline
    cli-generator/
      types.ts        ← PipelineConfig, PhaseResult, PIPELINE_PHASES, STUCK_THRESHOLD_MS
      schemas.ts      ← Zod schemas for all 6 phases
      prompts.ts      ← System/user prompt pairs per phase
      ai-phases.ts    ← Phase runners with retry jitter
      mcp-registration.ts ← Auto-register generated bridge as MCP server
      py-validator.ts ← Python FastMCP validation
      auto-fix.ts     ← Deterministic auto-fix
      quickstart.ts   ← Generate install.sh + Dockerfile
      ts-validator.ts ← TypeScript MCP SDK validation
      __tests__/      ← Unit tests
    evals/
      schemas.ts      ← Zod schemas for 12 assertion types
      assertions.ts   ← Assertion evaluator engine (3 layers)
      semantic.ts     ← Cosine similarity + OpenAI embeddings
      llm-judge.ts    ← LLM-as-Judge evaluators
      runner.ts       ← Eval run orchestrator
      deploy-hook.ts  ← Fire-and-forget eval on deploy
      __tests__/      ← Unit tests

  types/
    index.ts          ← FlowNode, FlowEdge, FlowContent, FlowVariable, NodeType (56 types)
    pdf-parse.d.ts    ← Type declaration for pdf-parse
    mammoth.d.ts      ← Type declaration for mammoth

  generated/prisma/   ← AUTO-GENERATED — never edit
```
