# Agent Studio — Complete Feature Catalog

> **Purpose:** Reference document for Claude Code sessions. Everything the project has — in one place.
> **Updated:** April 2026 (in-depth code analysis)
> **Statistics:** 66 node types · 170+ API routes · 123+ UI components · 63 Prisma models · 333 test files (4000+ tests)

---

## 1. FLOW BUILDER — Visual Editor

**Location:** `src/app/builder/[agentId]/page.tsx`, `src/components/builder/`

**What it does:**
- ReactFlow (@xyflow/react v12) visual editor for creating AI workflows
- Drag-and-drop node addition from the node picker
- Real-time property panel for configuring each node
- Version history sidebar with diff view and rollback option
- Deploy dialog with sandbox test before production
- Debug mode with breakpoints, step-through, variable watch
- Timeline visualization of the execution trace

**Key components:**
- `flow-builder.tsx` — main editor
- `node-picker.tsx` — palette with 66 node types
- `property-panel.tsx` — right sidebar for configuration
- `version-panel.tsx` — version history
- `diff-view.tsx` — version comparison
- `debug-toolbar.tsx`, `debug-panel.tsx`, `debug-timeline.tsx` — debug tools
- `deploy-dialog.tsx` — deploy flow

---

## 2. ALL NODE TYPES (66)

**Location:** `src/types/index.ts` (definitions), `src/lib/runtime/handlers/` (logic), `src/components/builder/nodes/` (display)

### Flow Control
| Node | Handler | Description |
|------|---------|------|
| `message` | message-handler.ts | Displays text to the user. Supports `{{variable}}` interpolation |
| `button` | button-handler.ts | Buttons for routing — the user chooses the next step |
| `capture` | capture-handler.ts | Captures user input and stores it in a variable |
| `condition` | condition-handler.ts | If/else branching based on an expression |
| `switch` | switch-handler.ts | Multi-branch routing (like a JS switch) |
| `set_variable` | set-variable-handler.ts | Sets/updates a variable in the context |
| `end` | end-handler.ts | Ends the flow |
| `goto` | goto-handler.ts | Unconditional jump to another node |
| `wait` | wait-handler.ts | Pause (fixed time or cron) |
| `loop` | loop-handler.ts | Iteration (array, count, condition). Limit: 50 iterations |
| `parallel` | parallel-handler.ts + parallel-streaming-handler.ts | Parallel branch execution + merge |
| `retry` | retry-handler.ts | Exponential backoff retry wrapper |

### AI & LLM
| Node | Handler | Description |
|------|---------|------|
| `ai_response` | ai-response-handler.ts + streaming | LLM response with RAG, MCP tools, agent tools. 20-step tool limit |
| `ai_classify` | ai-classify-handler.ts | Text classification into categories with a confidence score |
| `ai_extract` | ai-extract-handler.ts | Structured data extraction with Zod validation |
| `ai_summarize` | ai-summarize-handler.ts | Summarization of text or a conversation |
| `structured_output` | structured-output-handler.ts | Typed JSON output with Zod schema validation |
| `plan_and_execute` | plan-and-execute-handler.ts | ReAct-style planning — a powerful model plans, cheap ones execute |
| `reflexive_loop` | reflexive-loop-handler.ts | Self-correcting loop. Max 5 iterations, configurable quality threshold |
| `semantic_router` | semantic-router-handler.ts | Routing based on semantic similarity of messages to intents |

### Knowledge & Search
| Node | Handler | Description |
|------|---------|------|
| `kb_search` | kb-search-handler.ts | Hybrid search (semantic + BM25). Dynamic top-k. Analytics tracking |
| `web_search` | web-search-handler.ts | Web search via Tavily or Brave Search API |
| `web_fetch` | web-fetch-handler.ts | HTTP fetch + HTML/JSON parsing (cheerio). SSRF protection |
| `browser_action` | browser-action-handler.ts | Playwright headless browser automation |
| `embeddings` | embeddings-handler.ts | Embedding generation (OpenAI, custom models) |

### Memory
| Node | Handler | Description |
|------|---------|------|
| `memory_write` | memory-write-handler.ts | Stores data in agent persistent memory (with embedding) |
| `memory_read` | memory-read-handler.ts | Reads from agent memory (key/category/semantic search) |

### Integrations
| Node | Handler | Description |
|------|---------|------|
| `api_call` | api-call-handler.ts | HTTP calls (GET/POST/PUT/DELETE). Auth headers, retry, JSON mapping |
| `mcp_tool` | mcp-tool-handler.ts | Deterministic MCP tool call by name |
| `mcp_task_runner` | mcp-task-runner-handler.ts | Long-running MCP task with progress tracking |
| `call_agent` | call-agent-handler.ts | Agent-to-Agent (A2A) call. Circuit breaker, rate limit, depth limit (3) |
| `email_send` | email-send-handler.ts | Sends email via configured SMTP or service |
| `notification` | notification-handler.ts | Multi-channel notifications (Slack, Discord, email, webhook) |
| `webhook` | webhook-handler.ts | Outbound webhook with retry and idempotency |
| `webhook_trigger` | webhook-trigger-handler.ts | Inbound webhook entry point. Creates a WebhookConfig in the DB |
| `schedule_trigger` | schedule-trigger-handler.ts | Cron/interval trigger entry point. Creates a FlowSchedule in the DB |
| `database_query` | database-query-handler.ts | SQL execution (MySQL/PostgreSQL) with limits |
| `file_operations` | file-operations-handler.ts | File reading/writing (S3, local storage) |
| `image_generation` | image-generation-handler.ts | Image generation (FAL.ai, Stability AI/DALL-E) |
| `speech_audio` | speech-audio-handler.ts | TTS (Eleven Labs) and STT (Deepgram) |
| `multimodal_input` | multimodal-input-handler.ts | Accepts images, audio, and files from the user |
| `desktop_app` | desktop-app-handler.ts | Desktop automation (requires an installed agent) |

> **Note:** Google Workspace (Sheets, Docs, Drive, Calendar, Gmail) is not a formal `NodeType` — it is available through the `mcp_tool` node via the MCP proxy (see section 22).

### Data Transformation
| Node | Handler | Description |
|------|---------|------|
| `format_transform` | format-transform-handler.ts | JSON↔CSV↔XML↔YAML conversion |
| `function` | function-handler.ts | Sandboxed JS/TS execution (vm2, 5s timeout) |
| `python_code` | python-code-handler.ts | Python execution in a subprocess sandbox |
| `code_interpreter` | code-interpreter-handler.ts | Arbitrary code execution with output capture |

### Quality & Evaluation
| Node | Handler | Description |
|------|---------|------|
| `evaluator` | evaluator-handler.ts | AI-powered content evaluation with criteria scoring |
| `trajectory_evaluator` | trajectory-evaluator-handler.ts | Evaluation of the agent reasoning trajectory (step-by-step) |
| `guardrails` | guardrails-handler.ts | Content moderation, PII detection, prompt injection defense |
| `human_approval` | human-approval-handler.ts | Pauses the flow and waits for a human decision |
| `cost_monitor` | cost-monitor-handler.ts | Token budget tracking + alerting. Adaptive mode for auto-downgrade |

### Advanced Architectures
| Node | Handler | Description |
|------|---------|------|
| `ab_test` | ab-test-handler.ts | A/B traffic splitting with weighted routing |
| `aggregate` | aggregate-handler.ts | Merges results from parallel branches |
| `cache` | cache-handler.ts | Redis caching with TTL and sourceHandle routing |
| `learn` | learn-handler.ts | ECC pattern extraction from AgentExecution history |
| `swarm` | swarm-handler.ts | Shared task pool with N workers that dynamically claim tasks. Merge: concat or summarize |
| `verification` | verification-handler.ts | Runs build/test/lint/custom commands (execFile whitelist) and routes to passed/failed |
| `ast_transform` | ast-transform-handler.ts | Structural AST search + refactor via @ast-grep/napi (TS/Python) |
| `lsp_query` | lsp-query-handler.ts | LSP operations on code: hover, definition, completion, diagnostics |
| `project_context` | project-context-handler.ts | Loads context files (glob) and assembles them into a single context block |
| `sandbox_verify` | sandbox-verify-handler.ts | Checks code for forbidden patterns (e.g. `: any`, `console.log`, `@prisma/client`) |
| `file_writer` | file-writer-handler.ts | Writes generated files to disk (direct mode or from a variable), template paths |
| `process_runner` | process-runner-handler.ts | Runs processes (e.g. vitest) in the /tmp/sdlc workspace |
| `git_node` | git-node-handler.ts | Sequence of git operations (checkout/add/commit/push) + optional PR creation |
| `deploy_trigger` | deploy-trigger-handler.ts | Vercel deploy to staging/production with status tracking (READY/ERROR/BUILDING) |
| `claude_agent_sdk` | claude-agent-sdk-handler.ts | Claude Agent SDK session with MCP/agent tools and session persistence |

---

## 3. RUNTIME ENGINE

**Location:** `src/lib/runtime/`

| File | Description |
|------|------|
| `engine.ts` | Synchronous execution loop. MAX_ITERATIONS=50, MAX_HISTORY=100 |
| `engine-streaming.ts` | Streaming variant — NDJSON ReadableStream output |
| `stream-protocol.ts` | StreamChunk encode/decode/writer. Types: message, stream_start/delta/end, done, error |
| `context.ts` | Load/save conversation context from the DB |
| `template.ts` | `{{variable}}` interpolation. Supports nested paths and bracket notation |
| `debug-controller.ts` | Debug session state machine (breakpoints, step, resume, inspect) |
| `python-executor.ts` | Python execution via Pyodide WASM worker |
| `workers/pyodide-node-worker.js` | Node.js Worker thread with Pyodide |
| `types.ts` | RuntimeContext, ExecutionResult, NodeHandler, StreamChunk types |
| `handlers/index.ts` | Registry — 67 handler keys (66 NodeType + internal `code_review`) |

**Safety limits:** MAX_ITERATIONS=50 · MAX_HISTORY=100 · function timeout 5s · Python timeout 30s

---

## 4. CHAT INTERFACE

**Location:** `src/app/chat/[agentId]/page.tsx`, `src/components/chat/`

- Streaming chat with the NDJSON protocol
- `use-streaming-chat.ts` hook — line-buffered NDJSON parser, AbortController (1800s timeout)
- Pipeline progress display for multi-agent workflows
- Display of citations from the Knowledge Base
- `pipeline-progress.tsx` — real-time progress indicator
- `plot-renderer.tsx` — Recharts visualizations in chat output
- Embed widget support (`/embed/[agentId]`)
- Public embed.js script for embedding on external sites

---

## 5. KNOWLEDGE BASE (RAG Pipeline)

**Location:** `src/lib/knowledge/`, `src/app/knowledge/[agentId]/page.tsx`

### Ingestion
- **Parsers:** PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), XLSX (xlsx), PPTX (JSZip), plain text
- **Chunking:** 5 strategies — recursive, markdown, code, sentence, fixed (400 tokens, 20% overlap)
- **Embeddings:** OpenAI text-embedding-3-small (1536 dim), text-embedding-3-large (3072 dim)
- **Deduplication:** SHA-256 content hash, finds duplicate chunks before embedding
- **Progress tracking:** 6 phases (parsing→chunking→dedup→embedding→storing→complete) in the database
- **Max file:** 10MB, allowed types: PDF/DOCX/XLSX/CSV/PPTX

### Search
- **Hybrid search:** semantic (pgvector cosine) + BM25 keyword → RRF fusion (70% semantic, 30% BM25)
- **HNSW index:** m=16, ef_construction=64. Dynamic efSearch (40/60/100 for short/medium/long queries)
- **GIN index:** Full-text search for BM25
- **Threshold:** 0.25 similarity minimum
- **Dynamic top-k:** 5 for short queries, 8 for longer ones
- **Parent document retrieval:** returns broader context around matched chunks

### Advanced Features
- **Query transformation:** HyDE (hypothetical document embedding), multi-query expansion
- **Reranking:** LLM rubric (deepseek-chat) or Cohere Rerank v3.5
- **Context ordering:** relevance, lost-in-middle, chronological, diversity (MMR-like)
- **Metadata filtering:** 10 operators (eq/neq/gt/gte/lt/lte/in/nin/contains/exists)
- **Embedding cache:** Redis 600s TTL. Semaphore: max 3 concurrent embedding calls
- **Drift detection:** detects embedding model mismatch
- **RAGAS evaluation:** faithfulness, contextPrecision, contextRecall, answerRelevancy
- **Analytics:** source/chunk stats, token distribution, top retrieved chunks
- **Maintenance:** dead chunk cleanup, scheduled re-ingestion

---

## 6. WEBHOOKS (Inbound)

**Location:** `src/lib/webhooks/`, `src/app/webhooks/[agentId]/page.tsx`

- **Standard Webhooks spec:** HMAC-SHA256, x-webhook-id/timestamp/signature headers, 5-min timestamp window
- **Idempotency:** @@unique on WebhookExecution.idempotencyKey — duplicate = 409
- **Event filtering:** by event type (GitHub, Slack, Stripe, generic)
- **Body/header mapping:** JSONPath, dot notation, bracket notation
- **Rotation:** `POST .../rotate` generates a new HMAC key
- **Replay:** re-executes the webhook with the original payload
- **Execution log:** status, payload, duration, replay chain
- **Rate limit:** 60 req/min per webhookId
- **Provider presets:** GitHub, Stripe, Slack, Generic (pre-configured mappers)
- **Slack URL verification:** automatically responds to the challenge before the signature check
- **UI:** Two panels — list + detail with Executions/Configuration/Test tabs

---

## 7. SCHEDULED FLOWS

**Location:** `src/lib/scheduler/`, API: `/api/agents/[agentId]/schedules`

- **Types:** CRON (5-field), INTERVAL (1-10080 min), MANUAL
- **IANA timezone support**
- **Preview:** next N execution times for a given cron expression
- **Execution history:** status, duration, tokenUsage, errorMessage per execution
- **Failure notifications:** multi-channel alerts on consecutive failures
- **Auto-sync:** schedule_trigger node → FlowSchedule DB record on deploy
- **Railway cron:** `/api/cron/trigger-scheduled-flows` — CRON_SECRET protection
- **Stats API:** total runs, success rate, avg duration

---

## 8. AGENT EVALS (Testing Framework)

**Location:** `src/lib/evals/`, `src/app/evals/[agentId]/page.tsx`

### 12 assertion types (3 layers)
| Layer | Type | Description |
|------|-----|------|
| L1 Deterministic | exact_match | Exact string match |
| L1 | contains | Contains substring |
| L1 | icontains | Case-insensitive contains |
| L1 | not_contains | Does not contain |
| L1 | regex | Regex match |
| L1 | starts_with | Starts with |
| L1 | json_valid | Valid JSON |
| L1 | latency | Response time below threshold |
| L2 Semantic | semantic_similarity | Cosine similarity via OpenAI embedding (threshold 0.8) |
| L3 LLM-Judge | llm_rubric | Custom criteria scoring (0-1) |
| L3 | kb_faithfulness | Hallucination detection vs KB |
| L3 | relevance | Whether it answers the question |

### Features
- Auto-generation of test cases from the system prompt and conversations
- A/B comparison (by flow version or model)
- CSV export of results (per run or per suite)
- runOnDeploy flag — runs automatically after every deploy
- Scheduled evals (cron)
- Eval standards catalog with pre-built assertion templates
- Trend chart (Recharts LineChart) for score over time
- Limits: 20 suites/agent, 50 test cases/suite, 1 running run/suite

---

## 9. CLI GENERATOR (MCP Bridge)

**Location:** `src/lib/cli-generator/`, `src/app/cli-generator/page.tsx`

- **6 phases:** analyze → design → implement → test → document → publish
- **Dual target:** Python (FastMCP) or TypeScript (Node.js MCP SDK)
- **Generated Python files (10):** main.py, bridge.py, server.py, __init__.py, conftest.py, test_bridge.py, test_server.py, requirements.txt, pyproject.toml, README.md
- **Generated TypeScript files (8):** index.ts, bridge.ts, server.ts, bridge.test.ts, server.test.ts, package.json, tsconfig.json, README.md
- **Auto-fix engine:** automatically fixes common errors in generated code
- **Python validator:** checks for FastMCP import, @mcp.tool, mcp.run() after generation
- **TypeScript validator:** 8 validation rules for MCP SDK output
- **Stuck detection:** STUCK_THRESHOLD_MS = 5 min → AlertTriangle in the UI
- **Auto-resume:** frontend detects a stuck state and resumes automatically
- **Live file preview:** SWR polling on /files during generation
- **Download:** ZIP archive of the generated files
- **Publish:** registers the bridge as an MCP server in the user's account

---

## 10. ECC INTEGRATION (Everything-Claude-Code)

**Location:** `src/lib/ecc/`, `services/ecc-skills-mcp/`

- **30 ECC agent templates** in `src/data/ecc-agent-templates.json`
- **60+ skills** ingested and vectorized into the KB
- **Skills Browser** at `/skills` with search + faceted filter (language, category, agent)
- **Meta-Orchestrator:** LLM-based task routing to the appropriate agent
- **Instinct system:** pattern extraction from AgentExecution history → confidence 0-1 → promoted to skills at >0.85
- **Learn node:** captures patterns from user interaction
- **ECC Skills MCP server:** separate Railway service (Python FastMCP, port 8000)
  - `get_skill(name)`, `search_skills(query, tag?)`, `list_skills(language?)`
  - asyncpg connection pool (min=2, max=10)
  - **CURRENTLY: numReplicas=1 (SPOF — see SAAS-MIGRATION-PLAN.md Phase 0)**
- **Feature flag:** `ECC_ENABLED` env var (default: false)
- **Evolve API:** `/api/skills/evolve` — AI clusters instincts and generates a new SKILL.md

---

## 11. MCP (Model Context Protocol)

**Location:** `src/lib/mcp/`

- **Transports:** Streamable HTTP (primary) + SSE (backward compat)
- **Connection pool:** MAX_POOL_SIZE=50, IDLE_TTL=5min, auto-cleanup 60s
- **Graceful degradation:** if an MCP server does not respond — the AI continues without tools
- **Tool filtering:** per-agent enabledTools array — only the selected tools are passed to the AI
- **Featured servers:** pre-configured MCP servers (GitHub, Playwright, etc.)
- **ECC Skills MCP:** skills as MCP resources (`kb://agent-id/skill-name`)
- **Google Workspace proxy:** `/api/mcp/proxy/google-workspace/[tokenId]` — OAuth token aware

---

## 12. AGENT-AS-TOOL ORCHESTRATION

**Location:** `src/lib/agents/agent-tools.ts`

- Converts sibling agents into Vercel AI SDK tool definitions
- The AI dynamically decides which sub-agent to call based on context
- **Timeout profiles (AGENT_TIMEOUT_PROFILES):**
  - fast (45s): reality checker, validator, linter
  - standard (120s): research, discovery, product, analysis
  - slow (150s): architect, design, plan, spec
  - very-slow (180s): code, generate, implement, engineer
  - default (120s): everything else
- **Per-agent override:** `expectedDurationSeconds` in the Agent model
- **Protection:** circuit breaker + rate limiter + circular call detection + depth limit (3) + audit log
- **stopWhen:** stepCountIs(20) for multi-step tool calling

---

## 13. A2A (Agent-to-Agent) PROTOCOL

**Location:** `src/lib/a2a/`

- **Google A2A v0.3 spec** — AgentCard with JSON-LD
- **AgentCard:** name, description, skills, inputModes, outputModes, capabilities
- **Circuit breaker:** CLOSED/OPEN/HALF_OPEN. Configurable failure threshold
- **Rate limiter:** per-agent call rate limiting
- **Distributed tracing:** traceId, spanId, parentSpanId in AgentCallLog
- **Discovery:** `/api/a2a/agents` — public catalog of available agents
- **Agent Call Monitor UI:** `src/components/a2a/agent-call-monitor.tsx`
- **Stats API:** `/api/agent-calls/stats`

---

## 14. FLOW VERSIONING & DEPLOY

- Immutable snapshots on every save (30s throttle, skipped if nothing changed)
- Lifecycle: DRAFT → PUBLISHED → ARCHIVED (only one PUBLISHED at any given time)
- Deploy: archives the old PUBLISHED, publishes the new one, updates Flow.activeVersionId, creates a FlowDeployment — all in a single transaction
- Rollback: creates a NEW version with the old content (non-destructive), then deploys it
- Diff engine: compares nodes by ID, edges by ID, variables by name; ignores node movement <10px
- Sandbox test before deploy: `/api/agents/[agentId]/flow/versions/[versionId]/test`
- Deploy hook: automatically runs eval suites with runOnDeploy=true

---

## 15. HUMAN APPROVAL WORKFLOW

- `human_approval` node pauses the flow and waits for a human decision
- HumanApprovalRequest model: PENDING → APPROVED/REJECTED/EXPIRED
- `/api/approvals` — list of pending requests
- `/api/approvals/[requestId]/respond` — approve/reject

---

## 16. AGENT MARKETPLACE / DISCOVERY

**Location:** `src/app/discover/page.tsx`, `/api/agents/discover`

- Faceted search: category, tag, model, sorting, scope (public/mine/all)
- 4 parallel Prisma queries (agents, count, category stats, tag aggregation)
- 24 categories (including marketplace-only)
- Debounced search 300ms
- Agent model fields: `category String?`, `tags String[]`, `isPublic Boolean`

---

## 17. TEMPLATES (221 templates)

**Location:** `src/data/agent-templates.json`, `src/app/templates/page.tsx`

- 221 templates across 20 categories
- Categories covered: customer-support, coding, data, finance, hr, sales, research, writing, etc.
- Starter flows for selected templates (pre-populated 3-5 nodes)
- Browse Templates tab in the "New Agent" dialog

---

## 18. ANALYTICS DASHBOARD

**Location:** `src/app/analytics/page.tsx`, `/api/analytics`

- Response time metrics per agent and model
- KB search statistics
- Conversation counts and token usage
- Cost breakdown (USD)
- TTFB (Time To First Byte) tracking
- SWR-based real-time refresh
- Recharts visualizations

---

## 19. DEVSECOPS PIPELINE

**Location:** `src/app/devsecops/page.tsx`

- Interactive checklist for DevSecOps setup
- Architecture diagram
- Integrated with OWASP standards

---

## 20. AUTHENTICATION & SECURITY

**Location:** `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/security/`, `src/lib/safety/`

### Auth
- NextAuth v5 (beta.30), JWT strategy, 24h max age
- Providers: GitHub OAuth + Google OAuth (both conditional on env vars)
- CSRF Origin header check in the middleware for POST/PUT/PATCH/DELETE
- HTTPOnly, SameSite=lax, Secure (prod) cookies

### Token encryption
- `src/lib/auth-adapter.ts` — AES-256-GCM encryption of OAuth tokens before storing in the DB
- `src/lib/crypto.ts` — cryptographic utilities

### API protection
- `requireAuth()` and `requireAgentOwner()` in every API route
- Body limit: 1MB default (`src/lib/api/body-limit.ts`)
- SSRF protection: validateExternalUrlWithDNS() with a private IP blocklist
- File upload: extension whitelist + MIME type validation

### Security headers (`src/lib/api/security-headers.ts`)
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy
- **MISSING: Content-Security-Policy (CSP) — see SAAS-MIGRATION-PLAN.md Phase 3**

### RBAC (`src/lib/security/rbac.ts`)
- READ(1), EXECUTE(2), ADMIN(3) hierarchy
- `checkSkillAccess(agentId, skillId, level)` — exists but is NOT CALLED in the handlers
- **Problem: RBAC is implemented but not enforced — see SAAS-MIGRATION-PLAN.md Phase 0**

### Safety middleware (`src/lib/safety/`)
- Pre-AI: prompt injection detection (pattern matching)
- Post-AI: PII redaction (email, phone, SSN, credit card, IP)
- Content moderation via Azure Content Safety (optional)
- AuditLog for safety events

---

## 21. OBSERVABILITY

**Location:** `src/lib/observability/`, `src/instrumentation.ts`

- **OpenTelemetry:** custom implementation (not @opentelemetry/sdk-node)
- `tracer.ts` — startSpan(), OTLP push. gen_ai.* semantic conventions (AAIF 2026)
- `metrics.ts` — counters/histograms. 30s flush interval to the OTLP endpoint
- **Optional:** works only if OTEL_EXPORTER_OTLP_ENDPOINT is set
- **PROBLEM: should be mandatory for SaaS — see SAAS-MIGRATION-PLAN.md Phase 0**
- `src/lib/logger.ts` — structured JSON logger with redaction of sensitive data
- `AuditLog` model in Prisma — exists but is underused

---

## 22. GOOGLE WORKSPACE INTEGRATION

**Location:** `src/lib/google-workspace/`

- OAuth 2.1 + PKCE flow
- Supported services: Sheets, Docs, Drive, Calendar, Gmail
- `GoogleOAuthToken` model for storing tokens per user+email
- Auto-refresh before token expiry
- MCP proxy: `/api/mcp/proxy/google-workspace/[tokenId]`

---

## 23. NOTION INTEGRATION

**Location:** `src/app/api/auth/oauth/notion/`

- OAuth flow for Notion
- Notion pages/databases as KB sources or agent output targets

---

## 24. OBSIDIAN INTEGRATION

**Location:** `src/lib/ecc/obsidian-adapter.ts`, `/api/integrations/obsidian`

- **STATUS: Stub** — interface defined, implementation deferred
- Plan: Obsidian vault on GitHub (Git-sync) as a persistent memory layer

---

## 25. REDIS INTEGRATION

**Location:** `src/lib/redis.ts`

**What is stored in Redis:**
- Rate limiting (sliding window ZSET, 60s window)
- Session cache (5min TTL, JWT-decoded user)
- MCP pool coordination between replicas (10min TTL)
- Embedding cache (600s TTL)
- Embedding semaphore (max 3 concurrent calls, Lua EVAL)
- BullMQ queues (planned in Phase 1)

**Graceful fallback:** if Redis is unavailable — everything works with an in-memory fallback

---

## 26. INFRASTRUCTURE (Railway)

**Location:** `railway.toml`, `nixpacks.toml`, `services/*/railway.toml`

### Main app
- Next.js 15.5, Turbopack dev, standalone output
- `numReplicas = 2` (requires Redis for cross-replica state)
- Health check: `/api/health`, timeout 120s
- Restart: ON_FAILURE, max 5 attempts

### ECC Skills MCP
- Python FastMCP, port 8000
- `numReplicas = 1` **← SPOF, should be → 2 (see Phase 0)**
- Health check: `/health`, timeout 60s

### Deal Flow Agent (separate subproject)
- `deal-flow-agent/` — FastAPI + Uvicorn, port 8000
- 5 M&A due diligence agents
- Scoring model: Screening 15% + Financial 30% + Risk 25% + Competitive 20% + Legal 10%

---

## 27. DATA — ALL 63 PRISMA MODELS

**Location:** `prisma/schema.prisma`

| Model | Purpose |
|-------|-------|
| User | User account |
| Account | OAuth account linking (GitHub/Google) |
| Session | NextAuth sessions |
| VerificationToken | Email verification |
| Agent | Central agent entity |
| Flow | Visual workflow (JSON content) |
| FlowVersion | Immutable version snapshot |
| FlowDeployment | Deployment audit log |
| FlowTrace | Debug execution snapshot |
| KnowledgeBase | Per-agent KB configuration |
| KBSource | Document source (FILE/URL/SITEMAP/TEXT) |
| KBChunk | Text chunk with pgvector embedding |
| Conversation | Chat session |
| Message | Chat message |
| AnalyticsEvent | Usage tracking (tokens, cost, latency) |
| MCPServer | MCP server configuration |
| AgentMCPServer | Agent↔MCP server mapping |
| GoogleOAuthToken | Google Workspace OAuth token |
| AgentCard | A2A agent metadata |
| HumanApprovalRequest | Human-in-the-loop request |
| AgentCallLog | A2A call with distributed tracing |
| FlowSchedule | Cron schedule configuration |
| ScheduledExecution | Schedule execution log |
| WebhookConfig | Inbound webhook endpoint |
| WebhookExecution | Webhook trigger log |
| EvalSuite | Test suite for an agent |
| EvalTestCase | A single test case |
| EvalRun | A single suite execution |
| EvalResult | Result of a single test case |
| AgentMemory | Persistent agent memory with embedding |
| AgentExecution | Execution trace (ECC) |
| Skill | Skill module (ECC) |
| AgentSkillPermission | Agent↔Skill RBAC permission |
| Instinct | Learned pattern (ECC, confidence 0-1) |
| CLIGeneration | CLI generator pipeline run |
| AuditLog | Compliance log |
| ApiKey | Hashed API key with scopes and expiry |
| ManagedAgentTask | Async managed task (job, input/output, progress, callback) |
| PipelineRun | SDLC pipeline run (steps, metrics, smart routing) |
| PipelineMemory | Per-pipeline-run memory (category, content) |
| AgentSdkSession | Claude Agent SDK session (messages, token usage, resume count) |
| WebhookDeadLetter | Dead-letter record of failed webhook deliveries |
| CompanyMission | Organization mission (vision, values, goals) |
| Goal | Hierarchical goal tied to the mission |
| AgentGoalLink | Agent↔goal link with a role |
| HeartbeatConfig | Agent heartbeat configuration (cron, system prompt) |
| HeartbeatContext | Key/value context for heartbeat with TTL |
| HeartbeatRun | Log of a single heartbeat execution |
| Department | Organizational unit (hierarchy, agents) |
| AgentPermissionGrant | Permission grant between agents (scope, expiry) |
| AgentBudget | Agent budget (hard/soft limit, current spend) |
| CostEvent | Individual cost entry (model, tokens, USD) |
| BudgetAlert | Alert on budget overrun |
| Organization | Organization (plan, members, agents) |
| OrganizationMember | User membership in an organization with a role |
| Invitation | Invitation to an organization (token, expiry) |
| ModelPerformanceStat | Model performance statistics per phase (success, retries, tokens) |
| Template | Shareable agent template (payload, checksum, import count) |
| ApprovalPolicy | Action approval policy (pattern, approvers, timeout) |
| PolicyDecision | Decision under an approval policy (status, resolver) |
| PipelineTemplate | Pre-built pipeline recipe (agent slugs, steps, setup guide) |
| SomaReviewBatch | SOMA review batch (trend, angle, status) |
| SomaReviewPost | SOMA review post (platform, hook, hashtags, quality flags) |

---

## 28. EXTERNAL SERVICES & INTEGRATIONS

### AI Providers (Vercel AI SDK — never direct fetch)
| Service | Env var | Models |
|--------|---------|--------|
| DeepSeek | DEEPSEEK_API_KEY | deepseek-chat (default), deepseek-reasoner |
| OpenAI | OPENAI_API_KEY | gpt-4.1, gpt-4.1-mini, o3, o4-mini |
| Anthropic | ANTHROPIC_API_KEY | claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-6 |
| Google | GOOGLE_GENERATIVE_AI_API_KEY | gemini-2.5-flash, gemini-2.5-pro |
| Groq | GROQ_API_KEY | llama-3.3-70b, compound-beta |
| Mistral | MISTRAL_API_KEY | mistral-small/medium/large |
| Moonshot (Kimi) | MOONSHOT_API_KEY | kimi-k2, kimi-k2-thinking |

### Embeddings (mandatory — DeepSeek has none)
- OpenAI `text-embedding-3-small` (1536 dim) + `text-embedding-3-large` (3072 dim)

### Web search
- Tavily (TAVILY_API_KEY), Brave Search (BRAVE_SEARCH_API_KEY)

### Multimedia
- FAL.ai (FAL_API_KEY) — images
- Stability AI (STABILITY_API_KEY) — images
- Eleven Labs (ELEVENLABS_API_KEY) — TTS
- Deepgram (DEEPGRAM_API_KEY) — STT

### Security
- Azure Content Safety (AZURE_CONTENT_SAFETY_KEY + ENDPOINT)

### OAuth
- GitHub, Google, Google Workspace, Notion

### Infrastructure
- PostgreSQL/Supabase (DATABASE_URL, DIRECT_URL)
- Redis (REDIS_URL)
- AWS S3 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET)

### Observability (optional)
- OTEL_EXPORTER_OTLP_ENDPOINT → Grafana Cloud/Jaeger
- OTEL_SERVICE_NAME (default: agent-studio)

---

## 29. TESTING

### Unit tests
- **Framework:** Vitest + @testing-library/react
- **Count:** 4000+ tests in 333 test files
- **Location:** `src/**/__tests__/*.test.ts`
- **Coverage:** handlers, evals, webhooks, CLI generator, auth, security, safety, cache, cost

### E2E tests
- **Framework:** Playwright (10 spec files)
- **Location:** `e2e/tests/`
- **Coverage:** auth, dashboard, flow editor, chat streaming, KB, webhooks, import/export, eval gen, API routes

### Load tests
- **Framework:** k6
- **Location:** `k6/load-test.js`
- **Scenarios:** smoke, skills_load, chat_load
- **Thresholds:** P95 <500ms (health), P95 <100ms (skills), P95 <5000ms (chat)

### Pre-push check
- **Script:** `scripts/pre-push-check.sh`
- **4 checks:** TypeScript, Vitest, Lucide icon mocks, string consistency
- **Command:** `pnpm precheck`

---

## 30. KNOWN ISSUES (tracked in SAAS-MIGRATION-PLAN.md)

| Problem | Where | Priority |
|---------|-----|-----------|
| ECC MCP numReplicas=1 (SPOF) | services/ecc-skills-mcp/railway.toml L10 | Phase 0 |
| RBAC exists but is not enforced | src/lib/security/rbac.ts | Phase 0 |
| AuditLog is almost never invoked | src/lib/security/audit.ts | Phase 0 |
| OTEL is optional | src/instrumentation.ts L33-43 | Phase 0 |
| Synchronous execution blocks HTTP | src/lib/runtime/engine.ts | Phase 1 |
| No transactional email | package.json — no email library | Phase 1.5 |
| No Sentry/error monitoring | package.json — no @sentry/nextjs | Phase 1.5 |
| No Organization model | prisma/schema.prisma | Phase 2 |
| No GDPR account deletion | API routes — DELETE /user does not exist | Phase 2.5 |
| No CSP header | src/lib/api/security-headers.ts | Phase 3 |
| Session management basic | src/lib/auth.ts — no refresh rotation | Phase 3 |
| No webhook retry logic | src/lib/webhooks/execute.ts | Phase 3.5 |

---

*Document generated by automated code analysis — April 2026. Update when a new feature is added.*
