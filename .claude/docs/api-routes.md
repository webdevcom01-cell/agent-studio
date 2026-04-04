# API Routes

**Response format:** `{ success: true, data: T }` or `{ success: false, error: string }`

## Core Agent Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents` | GET, POST | List all agents (with conversation/source counts), create agent + flow + KB |
| `/api/agents/[agentId]` | GET, PATCH, DELETE | Full agent detail, update fields (incl. category/tags/isPublic), delete |
| `/api/agents/[agentId]/flow` | GET, PUT | Get/upsert flow content (auth-guarded, Zod-validated, auto-versioned in transaction) |
| `/api/agents/[agentId]/chat` | POST | Send user message; `{ stream: true }` for NDJSON streaming, otherwise JSON response |
| `/api/agents/[agentId]/execute` | POST | Execute flow directly (non-chat context) |
| `/api/agents/[agentId]/export` | GET | Download agent as versioned JSON (config + flow, no conversations/KB) |
| `/api/agents/import` | POST | Import agent from exported JSON, Zod-validated with `z.literal(1)` version |
| `/api/agents/discover` | GET | Marketplace search/filter/sort/paginate with category stats and tag aggregation |

## Flow Versioning

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/flow/versions` | GET, POST | List all versions, manually create version with label |
| `/api/agents/[agentId]/flow/versions/[versionId]` | GET | Get single version |
| `/api/agents/[agentId]/flow/versions/[versionId]/diff` | GET | Diff with previous or `?compareWith=` version |
| `/api/agents/[agentId]/flow/versions/[versionId]/deploy` | POST | Deploy version (archives old PUBLISHED, creates FlowDeployment) |
| `/api/agents/[agentId]/flow/versions/[versionId]/rollback` | POST | Rollback to version (creates new version + deploys) |
| `/api/agents/[agentId]/flow/versions/[versionId]/test` | POST | Sandbox test execution against version content |

## Knowledge Base

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | List sources with chunk counts, create URL/TEXT + trigger background ingest |
| `/api/agents/[agentId]/knowledge/sources/upload` | POST | File upload (multipart/form-data, PDF/DOCX, max 10 MB) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | Delete source and all its chunks |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]/retry` | POST | Retry failed KB source ingestion |
| `/api/agents/[agentId]/knowledge/search` | POST | Test hybrid search (semantic + BM25 + optional reranking) |
| `/api/agents/[agentId]/knowledge/config` | GET, PATCH | Per-KB RAG pipeline configuration |
| `/api/agents/[agentId]/knowledge/drift` | GET | Embedding model drift detection with recommendation |
| `/api/agents/[agentId]/knowledge/analytics` | GET | KB stats: sources, chunks, token distribution, search metrics |
| `/api/agents/[agentId]/knowledge/evaluate` | POST | RAGAS evaluation: search → generate → evaluate quality metrics |
| `/api/agents/[agentId]/knowledge/maintenance` | GET, POST | Dead chunk detection, cleanup, scheduled re-ingestion |

## MCP Servers

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/mcp-servers` | GET, POST | List all user's MCP servers, create new server |
| `/api/mcp-servers/[serverId]` | GET, PATCH, DELETE | Get/update/delete MCP server (ownership enforced) |
| `/api/mcp-servers/[serverId]/test` | POST | Test MCP connection, auto-refresh toolsCache |
| `/api/agents/[agentId]/mcp` | GET, POST, DELETE | List/link/unlink MCP servers for agent |

## A2A Communication

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/a2a` | POST | A2A task communication (send/receive tasks between agents) |
| `/api/agents/[agentId]/a2a/card` | GET, POST | Generate/retrieve A2A agent card for discovery |
| `/api/agents/[agentId]/card.json` | GET | Serve agent A2A card as JSON-LD (public endpoint) |
| `/api/a2a/agents` | GET | A2A agent discovery endpoint (public catalog) |
| `/api/agent-calls` | GET | Agent-to-agent call logs with trace IDs |
| `/api/agent-calls/stats` | GET | Agent call statistics (counts, durations, success rates) |
| `/api/agent-calls/circuits` | GET | Circuit breaker state for all agent-to-agent connections |

## Human Approval

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/approvals` | GET | List pending human approval requests |
| `/api/approvals/[requestId]/respond` | POST | Approve or reject a human approval request |

## CLI Generator

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/cli-generator` | GET, POST | List user's generations, create new generation (starts PENDING) |
| `/api/cli-generator/[generationId]` | GET | Full generation detail incl. generatedFiles + phases |
| `/api/cli-generator/[generationId]/advance` | POST | Advance pipeline one phase; frontend polls until COMPLETED/FAILED |
| `/api/cli-generator/[generationId]/resume` | POST | Resume stuck generation — resets status and re-runs current phase |
| `/api/cli-generator/[generationId]/files` | GET | List filenames of all generated files |
| `/api/cli-generator/[generationId]/download` | GET | Download all generated files as a .zip archive |
| `/api/cli-generator/[generationId]/logs` | GET | Per-phase execution logs and token usage |
| `/api/cli-generator/[generationId]/publish` | POST | Register generated bridge as an MCP server in user's account |
| `/api/cli-generator/[generationId]/test-mcp` | GET | Static validation + Claude Desktop config JSON |

## Agent Evals

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/evals` | GET, POST | List eval suites (with last run + counts), create suite |
| `/api/agents/[agentId]/evals/[suiteId]` | GET, PATCH, DELETE | Suite detail, update, delete |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | GET, POST, PUT, DELETE | List/create/bulk-update/delete test cases (max 50 per suite) |
| `/api/agents/[agentId]/evals/[suiteId]/run` | GET, POST | Run history (paginated), trigger new eval run (409 if already running) |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]` | GET | Full run detail with per-case results and assertion breakdowns |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]/export` | GET | Per-run CSV export (one row per assertion) |
| `/api/agents/[agentId]/evals/[suiteId]/export` | GET | Suite-level bulk CSV export (?limit=1-100) |
| `/api/agents/[agentId]/evals/[suiteId]/compare` | POST | A/B comparison between flow versions or models |
| `/api/agents/[agentId]/evals/generate` | POST | Auto-generate test cases from agent config (LLM) |
| `/api/evals/scheduled` | POST | CRON_SECRET-protected trigger for scheduled evals |
| `/api/evals/backfill` | POST | Backfill historical eval run scores (admin utility) |
| `/api/evals/standards` | GET, POST | List/create eval standards catalog |
| `/api/evals/standards/[category]` | GET | Get standards by category |

## Webhooks

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/webhooks` | GET, POST | List/create webhook configs for agent |
| `/api/agents/[agentId]/webhooks/[webhookId]` | GET, PATCH, DELETE | Get/update/delete webhook config |
| `/api/agents/[agentId]/webhooks/[webhookId]/rotate` | POST | Rotate webhook secret (generates new HMAC key) |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions` | GET | List webhook execution history (paginated, status filter) |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions/[executionId]/replay` | POST | Replay a webhook execution with original payload |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions/export` | GET | Export execution history as CSV |
| `/api/agents/[agentId]/trigger/[webhookId]` | POST | **Public** inbound webhook trigger (HMAC-verified, no session auth) |

## Schedules

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/schedules` | GET, POST | List/create flow schedules (CRON/INTERVAL/MANUAL) |
| `/api/agents/[agentId]/schedules/[scheduleId]` | GET, PATCH, DELETE | Get/update/delete a single schedule |
| `/api/agents/[agentId]/schedules/[scheduleId]/executions` | GET | Execution history for a schedule (paginated) |
| `/api/agents/[agentId]/schedules/stats` | GET | Schedule statistics |
| `/api/schedules/preview` | GET | Preview next N cron/interval run times |

## Debug & Traces

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/traces` | GET | List flow execution traces for debugging |
| `/api/agents/[agentId]/traces/[traceId]` | GET | Get full trace detail |
| `/api/agents/[agentId]/debug/[sessionId]/control` | POST | Control debug session (step, resume, set breakpoint, pause) |
| `/api/agents/[agentId]/debug/[sessionId]/variables` | GET, POST | Inspect/set variable values during debug |

## Conversations

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agents/[agentId]/conversations` | GET, POST | List/create conversations for an agent |
| `/api/agents/[agentId]/conversations/[conversationId]` | GET | Get single conversation with messages |

## ECC & Skills

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/skills` | GET, POST | List/create ECC skills |
| `/api/skills/evolve` | POST | Evolve high-confidence instincts into reusable skills (CRON_SECRET) |

## Integrations

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/integrations/obsidian` | GET, POST | Obsidian vault integration |
| `/api/mcp/proxy/google-workspace/[tokenId]` | ALL | MCP proxy for Google Workspace tools |
| `/api/auth/oauth/google-workspace` | GET | Initiate Google Workspace OAuth 2.1 + PKCE flow |
| `/api/auth/oauth/google-workspace/callback` | GET | Handle Google Workspace OAuth callback |
| `/api/auth/oauth/notion` | GET | Initiate Notion OAuth flow |
| `/api/auth/oauth/notion/callback` | GET | Handle Notion OAuth callback |

## Cron Jobs (CRON_SECRET protected)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/cron/trigger-scheduled-flows` | POST | Find due FlowSchedules and trigger executions |
| `/api/cron/evolve` | POST | Daily instinct → skill evolution at 3AM |
| `/api/cron/cleanup` | POST | Dead chunk cleanup, stale session purge |
| `/api/cron/migrate-oauth-tokens` | POST | One-time migration for OAuth token schema |
| `/api/cron/migrate-webhook-secrets` | POST | One-time migration for webhook secret format |

## System

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/*` | GET, POST | NextAuth authentication endpoints |
| `/api/health` | GET | Health check (DB connectivity + uptime + version) |
| `/api/analytics` | GET | Analytics dashboard data (response times, KB stats, conversations) |
