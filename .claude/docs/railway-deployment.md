# Railway Deployment — Multi-Service Architecture

## Service Topology

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
│                               └──────────────────────────────┘    │
│  ┌──────────────────────┐                                        │
│  │  ECC Skills MCP       │                                        │
│  │  Python FastMCP       │                                        │
│  │  Port 8000 · /mcp     │                                        │
│  └──────────────────────┘                                        │
│                                                                  │
│  All services communicate via internal networking                │
│  Public: agent-studio → https://your-app.railway.app             │
└──────────────────────────────────────────────────────────────────┘
```

## Railway-Specific Constraints

- **No serverless timeout** — multi-agent pipelines can run unlimited (better than Vercel 300s)
- **Ephemeral /tmp** — agent workspace cleared on redeploy. All persistent data → PostgreSQL
- **Vercel cron NOT available** — use Railway Cron Service for scheduled flows + /evolve
- **Nixpacks build** — Python MCP server needs `requirements.txt` for auto-detection
- **Internal networking** — MCP server communicates via private internal networking (faster, no egress cost)
- **Two replicas** — `numReplicas: 2` with Redis for cross-replica rate limiting, session cache, and MCP pool coordination
- **Redis** — configured via `REDIS_URL` env var. Railway auto-routes to internal networking
- **ioredis workaround** — `pnpm add ioredis` in `buildCommand` because lockfile was out of sync. `.npmrc` has `frozen-lockfile=false`, `nixpacks.toml` overrides install phase
- **Healthcheck timeout** — 120s. Skill ingestion MUST be async POST, not in startup path

## Environment Variables

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

## 2026 Standards Compliance

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

## Future: Obsidian Integration (deferred to after ECC)

**Purpose:** Persistent memory layer that survives Railway's ephemeral /tmp filesystem.

### Architecture
- Obsidian vault on GitHub (Git-synced via Obsidian Git plugin, free)
- GitMCP as bridge: exposes vault as MCP server
- Local REST API plugin for direct Obsidian read/write
- Write-back pattern: agent learns → instinct → skill → Obsidian vault document

### Why After ECC
- ECC skills become the initial vault content
- Instinct system generates new knowledge → Obsidian stores it persistently
- Adapter stub in `src/lib/ecc/obsidian-adapter.ts` ready from Phase 5

### Obsidian Plans
- Free version + community plugins is sufficient
- Git sync is better than paid Sync for this use case
