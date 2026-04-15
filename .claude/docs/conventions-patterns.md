# Key Conventions & Patterns

## Runtime Engine
- 62 node handlers registered in `src/lib/runtime/handlers/index.ts` (+ 2 streaming variants: ai-response-streaming, parallel-streaming)
- Node types (62): message, button, capture, condition, set_variable, end, goto, wait, ai_response, ai_classify, ai_extract, ai_summarize, api_call, function, kb_search, webhook, mcp_tool, call_agent, human_approval, loop, parallel, memory_write, memory_read, evaluator, schedule_trigger, webhook_trigger, email_send, notification, format_transform, switch, web_fetch, browser_action, desktop_app, learn, python_code, structured_output, cache, embeddings, retry, ab_test, semantic_router, cost_monitor, aggregate, web_search, multimodal_input, image_generation, speech_audio, database_query, file_operations, mcp_task_runner, guardrails, code_interpreter, trajectory_evaluator, plan_and_execute, reflexive_loop, swarm, verification, ast_transform, lsp_query, **claude_agent_sdk**
- Safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
- Handlers return `ExecutionResult` with messages, nextNodeId, waitForInput, updatedVariables
- Handlers never throw — always return graceful fallback

## Streaming Chat
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
- AbortController with 1800s (30 min) timeout on the client side for long multi-agent pipelines; server maxDuration=900s (Vercel hint, ignored on Railway)
- Heartbeat interval during tool calls to prevent stream disconnects
- All `writer.write()` calls in both `engine-streaming.ts` and `ai-response-streaming-handler.ts` are wrapped in try/catch to prevent cancelled stream from losing accumulated results
- `trackingStream` in chat route propagates `cancel()` to `innerStream` so engine receives abort signal on client disconnect

## Knowledge/RAG Pipeline
- Ingest: scrape URL / parse file / accept text → chunk (400 tokens, 20% overlap) → embed (OpenAI text-embedding-3-small) → store in pgvector
- File upload: PDF (pdf-parse) and DOCX (mammoth) — `parseSource()` routes by file extension
- URL parsing: HTML (cheerio, removes nav/footer/script/style), plain text passthrough
- Search: hybrid (semantic cosine similarity + BM25 keyword) → weighted RRF (semantic 70% + BM25 30%) → optional LLM re-ranking
- Similarity threshold 0.25 — chunks with lower scores are discarded
- Dynamic topK: 5 for short queries, 8 for longer queries
- Parent document retrieval — returns broader context around matched chunks
- UI: Add Source dialog has URL, Text, and File tabs with client-side 10 MB validation

## Vector Search Indexes (HNSW + GIN)
Production-optimized database indexes for sub-10ms vector and keyword search.

**HNSW Indexes** (pgvector 0.8.0, deployed 2026-03-28):
- `kbchunk_embedding_hnsw_idx` — HNSW on `KBChunk.embedding` (vector_cosine_ops, m=16, ef_construction=64)
- `agentmemory_embedding_hnsw_idx` — HNSW on `AgentMemory.embedding` (vector_cosine_ops, m=16, ef_construction=64)
- Both use cosine distance operator (`<=>`), approximate nearest neighbor (~98-99% recall)
- Dynamic `SET LOCAL hnsw.ef_search` per query: 40 (≤3 words), 60 (4-8 words), 100 (9+ words)

**Full-Text Search Index**: `kbchunk_content_fts_idx` — GIN on `to_tsvector('simple', content)` for BM25 keyword search

**Filtered B-tree Index**: `kbchunk_source_embedding_ready_idx` — B-tree on `sourceId` WHERE `embedding IS NOT NULL`

**Parameters (design rationale)**:
- `m=16`: standard for 1536-dim vectors; 8=faster build but lower recall, 32=better recall but 2x memory
- `ef_construction=64`: Google Cloud/AWS recommended range 64-100; sufficient for <1M vectors
- `ef_search` dynamic: short queries need speed (40), long analytical queries need precision (100)

## Enterprise RAG Pipeline

### Per-KB Configuration
- `chunkingStrategy` (Json), `embeddingModel`, `embeddingDimension`, `retrievalMode`, `rerankingModel`, `queryTransform`, `searchTopK`, `searchThreshold`, `hybridAlpha`, `maxChunks`, `contextOrdering`
- Zod validation: `src/lib/schemas/kb-config.ts`
- API: `GET/PATCH /api/agents/[agentId]/knowledge/config`

### Chunking (5 strategies in `src/lib/knowledge/chunker.ts`)
- `recursive` — hierarchical split by separators, recursive fallback, hard token split
- `markdown` — line-by-line, preserves headings
- `code` — splits by class/function boundaries, auto-detect Python/TS/JS
- `sentence` — split by sentence boundaries, token-accurate overlap
- `fixed` — legacy mode via `chunkText()`
- Token counting: tiktoken `cl100k_base` via `countTokens()`
- Header injection: `buildChunkHeader()` + `injectHeaders()`

### Embedding
- Multi-model: `text-embedding-3-small` (1536 dim), `text-embedding-3-large` (3072 dim)
- Redis cache: 600s TTL
- Semaphore: max 3 concurrent embedding calls (Lua EVAL atomic)
- Drift detection: `detectEmbeddingDrift()` detects model mismatch

### Query Transformation
- `hydeTransform()` — generates hypothetical document for better semantic match
- `multiQueryExpand()` — 3 alternative phrasings for broader recall
- `transformQuery(query, mode)` — dispatcher for `"none"` / `"hyde"` / `"multi_query"`

### Search Pipeline
- 3 retrieval modes: `semantic`, `keyword`, `hybrid` (both + RRF fusion)
- Metadata filtering: 10 operators, AND/OR groups, dot-notation paths
- Query embedding cache: check Redis before embedding, cache after

### Reranking
- `llm-rubric` — LLM scores each passage 0.0–1.0 (default, uses deepseek-chat)
- `cohere` — Cohere Rerank v3.5 API, 5s timeout, graceful fallback
- `none` — skip reranking
- Auto-rerank: enabled for queries < 5 words

### Context Processing
- `relevance` — sort by score DESC (default)
- `lost_in_middle` — U-shaped: best chunks at positions 1 and last
- `chronological` — sort by sourceDocument + chunkIndex
- `diversity` — MMR-like iterative selection, Jaccard similarity penalty
- `compressContext()` — fits results within token budget (4000 default)

### Document Parsers
PDF (pdf-parse), DOCX (mammoth), HTML (cheerio), Excel/CSV (xlsx), PPTX (JSZip XML extraction)

### Content Deduplication
- SHA-256 content hash, deduplicate before embedding to save API cost

### Citations
- `extractCitations()` — deduplicate by sourceId, max 5, truncate snippets to 200 chars
- `formatCitationsForAI()` / `formatCitationsForUI()` — numbered and simplified formats

### Ingest Progress
- 6 stages: parsing (0%) → chunking (20%) → deduplication (40%) → embedding (50%) → storing (90%) → complete (100%)

### RAGAS Evaluation
- 4 metrics: `faithfulness`, `contextPrecision`, `contextRecall`, `answerRelevancy`
- API: `POST /api/agents/[agentId]/knowledge/evaluate`

### KB Analytics & Maintenance
- Dead chunk detection: retrievalCount=0 + older than 30 days
- Scheduled re-ingestion, retrieval stats tracking

## Agent Export/Import
- Export format: `{ version: 1, exportedAt, agent: { name, description, systemPrompt, model }, flow: { nodes, edges, variables } }`
- Zod schema in `src/lib/schemas/agent-export.ts` — version validated with `z.literal(1)`, not `z.number()`
- Export excludes: conversations, messages, knowledge base sources/chunks
- Import creates new agent with `(imported)` suffix + empty knowledge base
- Max import size: 5 MB

## Template Variables
- `{{variable}}` syntax in node messages, resolved at runtime via `resolveTemplate()`
- Supports nested paths (`{{user.address.city}}`) and bracket notation (`{{items[0]}}`)

## Error Boundaries
- Next.js `error.tsx` in builder, chat, and knowledge routes
- Shared `ErrorDisplay` component in `src/components/ui/error-display.tsx`
- Shows error details only in development mode

## Agent-to-Agent (A2A) Communication
- AgentCard model stores public agent cards for discovery
- Circuit breaker pattern — CLOSED/OPEN/HALF_OPEN states
- Rate limiter — per-agent call rate limiting
- AgentCallLog model with distributed tracing: traceId, spanId, parentSpanId

## Agent-as-Tool Orchestration
- `src/lib/agents/agent-tools.ts` converts sibling agents into Vercel AI SDK tool definitions
- Protection stack: circuit breaker, rate limiter, circular call detection, depth limiting (max 3), audit logging
- Property panel: "Agent Orchestration" toggle on ai_response nodes
- `stopWhen: stepCountIs(20)` for multi-step tool calling

## Heterogeneous Model Routing (Plan-and-Execute)
- `plan_and_execute` node: powerful model decomposes task → cheap models execute sub-tasks by complexity tier
- `getModelByTier(tier, preferredProvider?)` in `src/lib/ai.ts`
- `getModelFallbackChain(modelId)` — builds fallback chain: same-tier → cheaper tier
- Adaptive cost monitor: `mode: "adaptive"` auto-downgrades tier at 60%/80%/95% budget
- `__model_tier_override` context variable for cost monitor tier decisions
- Starter flow template: "orchestration-plan-and-execute-pipeline"

## Reflexive Self-Correcting Loop
- `reflexive_loop` node: generate → evaluate → retry with feedback until quality passes
- Max 5 iterations (hard cap), configurable passing score (0-10)
- Separate executor and evaluator models to avoid self-bias
- Routes to "passed" or "failed" sourceHandle

## Swarm Task Pool
- `swarm` node: shared task pool with N workers pulling tasks dynamically
- Config: `tasks`, `tasksVariable`, `workerCount` (1-10, default 3), `workerModel`, `mergeStrategy`
- Safety: MAX_WORKERS=10, MAX_TASKS=50, TASK_TIMEOUT_MS=60s, OVERALL_TIMEOUT_MS=300s
- Respects `__model_tier_override` and `__ecomode_enabled`

## LLM-Based Meta-Orchestrator
- `src/lib/ecc/meta-orchestrator.ts` — LLM classification for task routing
- Uses fast model (~$0.001/call), falls back to keyword matching

## Web Browsing Capabilities
- `web_fetch` node — HTTP fetch with URL validation and SSRF protection
- `browser_action` node — browser automation via MCP (Playwright)
- MAX_TOOL_STEPS=20 for multi-page web navigation
- Heartbeat interval during tool calls

## Agent Discovery Marketplace
- `/discover` page with faceted search: categories, tags, model, sort, scope
- Shared categories in `src/lib/constants/agent-categories.ts` (23 categories)
- Debounced search (300ms), loading skeletons, active filter pills

## Agent Templates
- 221 templates in `src/data/agent-templates.json` across 19 categories
- Dashboard "New Agent" dialog includes "Browse Templates" tab
- When adding templates: update `src/data/agent-templates.json` array + header `total` + `categories` list

## Human Approval Workflow
- `human_approval` node pauses execution for human review
- HumanApprovalRequest model: PENDING → APPROVED/REJECTED/EXPIRED

## Security Hardening
- `body-limit.ts` — parseBodyWithLimit() with 1 MB default
- `sanitize-error.ts` — generic errors in production, detailed in dev
- `security-headers.ts` — X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy
- `url-validation.ts` — SSRF protection, private IP blocklist
- CSRF Origin header check in middleware
- JWT session maxAge reduced to 24 hours
- MAX_CHUNKS=500, MAX_AGENTS_PER_USER=100
- `function-handler.ts` uses vm.Script sandbox (no process/require/global, 5s timeout)

## Auth
- NextAuth v5 with GitHub + Google OAuth providers
- PrismaAdapter for storage, JWT session strategy, maxAge 24 hours
- Middleware: cookie check for `authjs.session-token` / `__Secure-authjs.session-token`
- Public paths: `/login`, `/embed/*`, `/api/auth/*`, `/api/health`, `/api/agents/[agentId]/chat`, `/api/a2a/*`
- Agent.userId is optional — agents can exist without auth

## Embed Widget
- `public/embed.js` creates bubble + iframe pointing to `/embed/[agentId]`
- iframe guard: `if (window !== window.top) return;`
- Customizable via data attributes: `data-color`, `data-title`, `data-welcome-message`, `data-proactive-message`
- Proactive message after 30s, unread badge, mobile full-screen

## MCP Integration
- Hybrid registry: global MCP servers (per-user) + per-agent selection via AgentMCPServer join table
- Transports: Streamable HTTP (primary) + SSE (backward compat)
- Connection pooling: in-memory pool with 5min idle TTL, auto-cleanup every 60s
- **MCP Tool Node** (`mcp_tool`): deterministic tool call with template resolution
- **AI Response + MCP + Agent Tools**: tools auto-injected, `stopWhen: stepCountIs(20)`
- Graceful degradation: if MCP tools fail to load, AI continues without tools
- Tool filtering: per-agent `enabledTools` array

## Flow Versioning & Deploy Pipeline
- Immutable version snapshots on every flow save (30s throttle, skips if unchanged)
- Version lifecycle: DRAFT → PUBLISHED → ARCHIVED (only one PUBLISHED at a time)
- Deploy uses interactive `prisma.$transaction`
- Rollback creates a NEW version (non-destructive), then deploys it
- Flow save + version creation in single transaction
- Diff engine compares nodes by ID, edges by ID, variables by name; ignores position changes under 10px

## Auth Guards
- `requireAuth()` — returns `{ userId }` or 401
- `requireAgentOwner(agentId)` — returns `{ userId, agentId }`, or 401/403/404
- `isAuthError(result)` — type guard
- Unowned agents (`userId: null`) accessible to any authenticated user

## Input Validation
- `validateFlowContent()` — max 500 nodes, 2000 edges, 100 variables
- Validates node types against `NodeType` union, position values must be finite

## CLI Generator Pipeline
- 6-phase AI pipeline: analyze → design → implement → write-tests → document → publish
- **Dual-target:** Python (FastMCP) or TypeScript (Node.js MCP SDK)
- Phases 0–1 are language-agnostic; phases 2–5 branch by target
- Frontend-driven loop: UI calls `/advance` repeatedly
- Each phase uses `generateObject()` with Zod schemas
- **Python FastMCP pattern** (critical): `from mcp.server.fastmcp import FastMCP` — `mcp.Server` does NOT exist
- **TypeScript MCP SDK pattern** (critical): `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` with `server.registerTool()` — NEVER `server.tool()`
- Stuck detection: `STUCK_THRESHOLD_MS = 5 min`
- Auto-heal: crashed phases auto-reset to `"pending"`
- Retry jitter: ±25% random on exponential backoff
- `modelUsed` + `retryCount` persisted per PhaseResult
- Auto-fix engine: deterministic corrections (FastMCP import, registerTool, .js extensions)
- Python validator + TypeScript validator for post-generation checks
- Quick-start files: install.sh + Dockerfile for both targets
- `STUCK_THRESHOLD_MS` lives in `src/lib/cli-generator/types.ts`

## Agent Evals / Testing Framework
- **3-layer strategy:** L1 (deterministic, free), L2 (semantic similarity, ~$0.001), L3 (LLM-as-Judge, ~$0.01)
- **12 assertion types:**
  - L1: `exact_match`, `contains`, `icontains`, `not_contains`, `regex`, `starts_with`, `json_valid`, `latency`
  - L2: `semantic_similarity` — cosine distance, threshold 0.8
  - L3: `llm_rubric`, `kb_faithfulness`, `relevance`
- Runner: sequential test cases, calls chat API with `stream: false, isEval: true`
- Score: average of assertion scores per case; overall = average across cases (0.0–1.0)
- Deploy hook: fire-and-forget after `VersionService.deployVersion()`
- Limits: max 20 suites per agent, max 50 test cases, one RUNNING run per suite (409)
- CSV export: one row per assertion, RFC-4180 quoting
- Scheduled evals: pure-JS `cronMatchesDate()`, 4-min double-run prevention
- A/B comparison: type `"version"` or `"model"`, mutual `comparisonRunId` linking

## Inbound Webhooks
- Standard Webhooks spec: HMAC-SHA256, `x-webhook-id/timestamp/signature` headers, 5-min window
- Public trigger: `POST /api/agents/[agentId]/trigger/[webhookId]` — HMAC-verified, no session auth
- `webhook_trigger` node injects `__webhook_payload`, `__webhook_event_type`, `__webhook_id`
- Auto-sync on deploy: `syncWebhooksFromFlow()`
- Idempotency: `WebhookExecution.idempotencyKey` @@unique — duplicate returns 409
- Body mapping: JSONPath, dot notation, bracket notation
- Event filtering: header-first, body fallback
- Provider presets: GitHub, Stripe, Slack, Generic
- Rate limit: 60 req/min per webhookId
- Execution Replay UI: silent re-fetch to preserve local state

## Scheduled Flow Execution
- FlowSchedule: CRON, INTERVAL, or MANUAL with IANA timezone
- Scheduler lib: cron-validator, execution-engine, sync, failure-notify
- Railway Cron: `POST /api/cron/trigger-scheduled-flows` every 5 min

## Flow Execution Debugger
- `debug-controller.ts` — breakpoints, step-through, variable inspection
- `FlowTrace` model stores full execution snapshot
- Debug session API: step/resume/pause/breakpoint, variable inspect/set

## Google Workspace OAuth Integration
- OAuth 2.1 + PKCE flow → stores `GoogleOAuthToken` per user+email
- MCP proxy: `GET /api/mcp/proxy/google-workspace/[tokenId]`

## Observability (OpenTelemetry)
- OTLP push exporter (not Prometheus pull)
- gen_ai.* semantic conventions for AI calls
- Configured via `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`

## Redis — Cross-Replica Shared State
- Singleton client via dynamic `await import("ioredis")`
- Graceful fallback to in-memory if unavailable
- `connectionFailed` flag prevents retry storm
- Retry: 3 max, exponential backoff (200ms, 400ms, 600ms)
- Features: cache, session (5min TTL), MCP pool (10min TTL), rate limiting (Lua EVAL)

## Knowledge Module — Additional Utilities
- `agentic-retrieval.ts`: dynamic context expansion
- `contextual-enrichment.ts`: enriches chunks before embedding
- `grounding-check.ts`: post-generation hallucination detection
- `query-reformulation.ts`: alternative query phrasing
- `query-router.ts`: auto-routes to semantic/keyword/hybrid
- `rag-inject.ts`: formats context for ai_response system prompt

## Evals Module — Additional Utilities
- `compare-utils.ts`: A/B comparison result diffing
- `rag-assertions.ts`: RAG-specific assertion types
- `trajectory-scorer.ts`: multi-step reasoning trajectory scoring

## Claude Agent SDK Node (`claude_agent_sdk`)

Handler: `src/lib/runtime/handlers/claude-agent-sdk-handler.ts`

**Execution model**
- Calls Vercel AI SDK `generateText` with `stopWhen: stepCountIs(maxSteps)`
- Default model: `claude-sonnet-4-6`; default `maxSteps`: 20; upper bound: 50
- Per-call timeout: 5 min (AbortController). Compose with flow's `abortSignal` via `composeAbortSignals()`
- Tools loaded with `Promise.allSettled` — one source failing never blocks the other
- When ≥2 subagent tools are loaded, a parallel-execution hint is prepended to the system prompt

**Session persistence** (`src/lib/sdk-sessions/persistence.ts`)
- `enableSessionResume: true` activates persistence
- DB-backed (priority): set `sdkSessionId` node property → loads `AgentSdkSession` row, validates `agentId` match
- Auto-create: if `enableSessionResume=true` and no `sdkSessionId` given, a new session is created and `__sdk_session_id` is written to flow variables
- Legacy fallback: `sessionVarName` (default `__sdk_session`) stores message array in flow variables
- Session update is transactional: `inputTokensDelta`/`outputTokensDelta` accumulate across resumes

**Observability**
- OTel span `gen_ai.agent_sdk.generate` with `gen_ai.*` semantic conventions
- `recordChatLatency` + `recordTokenUsage` metrics after every call
- `fireSdkLearnHook` fires fire-and-forget (ECC instinct extraction) — never throws

**Node properties**: `task`, `systemPrompt`, `model`, `maxSteps`, `enableMCP`, `enableSubAgents`, `enableSessionResume`, `sdkSessionId`, `sessionVarName`, `outputVariable`

---

## SDLC Pipeline Orchestration

Source: `src/lib/sdlc/` | API: `/api/sdlc/*` | Worker: BullMQ `pipeline.run` jobs

**Architecture**
- `pipeline-manager.ts` — CRUD + lifecycle for `PipelineRun` Prisma model
- `orchestrator.ts` — step-by-step execution; called exclusively by the BullMQ worker, never directly from API routes
- `schemas.ts` — Zod schemas for task classification and pipeline config
- `agent-prompts.ts` — per-step system prompts keyed by ECC agent template names

**Status transitions**: `PENDING → RUNNING → COMPLETED | FAILED | CANCELLED`
- Worker calls: `markPipelineRunning()` → `advancePipelineStep()` (in transaction) → `markPipelineCompleted/Failed()`
- Cancel: user API → `cancelPipelineRun()` sets DB status; worker checks `isPipelineCancelled()` between every step and aborts
- Idempotent cancel: re-cancelling an already-cancelled run is a no-op

**Execution details**
- `STEP_TIMEOUT_MS = 5min` — per-step `generateText` timeout via AbortController
- `MAX_CONTEXT_CHARS = 24 000` — accumulated step outputs fed into subsequent steps; trimmed at ceiling
- `CONTEXT_SLICE_PER_STEP = 3 000` chars max per step when building context document
- `INFRASTRUCTURE_NODES = { project_context, sandbox_verify }` — executed inline, no AI call
- Learn Hook (`fireSdkLearnHook`) fired fire-and-forget after each AI step
- `job.updateProgress()` emitted between steps so UI can display live progress
- Workspace: `/tmp/sdlc` (Railway read-only `/app` filesystem fallback for vitest + git ops)

**Issue idempotency**: unique constraint on issue key prevents duplicate pipeline runs for the same event

---

## BullMQ Managed Agent Tasks

Source: `src/lib/queue/index.ts` + `worker.ts` | Manager: `src/lib/managed-tasks/manager.ts`

**Queue setup**
- Single queue: `agent-studio` | Worker concurrency: 5
- Default retry: 3 attempts, exponential backoff 5 s | `removeOnComplete`: 24 h / 1000 jobs | `removeOnFail`: 7 days
- Managed tasks and SDLC pipelines: `attempts: 1` — failures are explicit, not auto-retried

**Job types and priorities** (lower = higher priority)
| Job type | Priority | Use |
|---|---|---|
| `flow.execute` | 1 | Live chat — user waiting |
| `webhook.execute` | 2 | Async webhook trigger |
| `webhook.retry` | 3 | Webhook retry backoff |
| `kb.ingest` | 5 | Background KB ingestion |
| `managed.task.run` | 8 | Long-running agent task |
| `pipeline.run` | 8 | SDLC pipeline run |
| `eval.run` | 10 | Batch eval suite |

**ManagedAgentTask lifecycle** (`src/lib/managed-tasks/manager.ts`)
- Status: `PENDING → RUNNING → COMPLETED | FAILED | CANCELLED`; also `PAUSED → RUNNING` (resume)
- `TaskInput`: `{ task, model?, maxSteps?, enableMCP?, enableSubAgents?, sdkSessionId?, outputVariable? }`
- `TaskOutput`: `{ result, inputTokens, outputTokens, durationMs, sessionId? }`
- Optional `callbackUrl` — POSTed on completion/failure (webhook-style notification)
- `progress` (0–100) updated by worker via `job.updateProgress()`; polled by client via `GET /api/agents/[agentId]/tasks/[taskId]`

**Worker startup**: `pnpm worker` runs `src/lib/queue/worker.ts` as a separate process. Must run alongside Next.js in production (Railway: separate worker service or `Procfile`).

---

## Adding a New Node Type
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
