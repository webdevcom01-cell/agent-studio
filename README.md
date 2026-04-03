<p align="center">
  <h1 align="center">Agent Studio</h1>
  <p align="center">Visual AI agent builder with multi-agent orchestration and continuous learning.</p>
</p>

<p align="center">
  <a href="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/ci.yml">
    <img src="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/docker.yml">
    <img src="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/docker.yml/badge.svg" alt="Docker Build">
  </a>
  <a href="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/codeql.yml">
    <img src="https://github.com/webdevcom01-cell/agent-studio/actions/workflows/codeql.yml/badge.svg" alt="CodeQL">
  </a>
  <a href="https://github.com/webdevcom01-cell/agent-studio/pkgs/container/agent-studio">
    <img src="https://img.shields.io/badge/docker-ghcr.io-2496ED?logo=docker&logoColor=white" alt="Docker Image">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0">
  </a>
  <img src="https://img.shields.io/badge/status-actively_maintained-brightgreen" alt="Actively Maintained">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Next.js-15.5-000?logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/Tests-2800%2B-brightgreen" alt="Tests">
  <img src="https://img.shields.io/badge/Node_Types-55-orange" alt="55 Node Types">
  <img src="https://img.shields.io/badge/Templates-250-purple" alt="250 Templates">
  <img src="https://img.shields.io/badge/MCP-Ready-8B5CF6?logo=anthropic&logoColor=white" alt="MCP Ready">
  <img src="https://img.shields.io/badge/A2A-v0.3-4285F4?logo=google&logoColor=white" alt="A2A v0.3">
</p>

<p align="center">
  <a href="https://railway.app/new/template?template=https://github.com/webdevcom01-cell/agent-studio">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="32">
  </a>
  <a href="https://render.com/deploy?repo=https://github.com/webdevcom01-cell/agent-studio">
    <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="32">
  </a>
  <a href="https://agent-studio-production-c43e.up.railway.app">
    <img src="https://img.shields.io/badge/▶_Live_Demo-Try_it_now-8B5CF6?style=for-the-badge&logo=railway&logoColor=white" alt="Live Demo" height="32">
  </a>
</p>

---

## What is Agent Studio?

Most AI agent frameworks force you to write code to wire together models, tools, and logic. Agent Studio lets you **build, deploy, and orchestrate production-grade AI agents visually** — through a drag-and-drop flow editor — without sacrificing the depth that technical teams need.

Connect any LLM provider, ingest your knowledge base, link MCP servers, and let agents call each other. When you're ready, deploy to Railway in one click or self-host with Docker.

---

## Quick Start

**Option A — Pull published image** *(fastest)*

```bash
docker pull ghcr.io/webdevcom01-cell/agent-studio:latest
```

Then copy `.env.example` to `.env`, add your API keys, and run with `docker compose up`.

**Option B — Build from source**

```bash
git clone https://github.com/webdevcom01-cell/agent-studio.git
cd agent-studio
cp .env.example .env
# Add DEEPSEEK_API_KEY and OPENAI_API_KEY to .env, then:
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) and create your first agent.

> **No Docker?** See [Manual Setup](#manual-setup) below.

---

## Features

- **Visual Flow Editor** — Drag-and-drop builder with 55 node types (AI, logic, integrations, webhooks) powered by XyFlow; full version history, deploy pipeline, and one-click rollback
- **Enterprise RAG Pipeline** — Ingest URLs, PDFs, DOCX, Excel, PPTX; chunk with 5 strategies; hybrid search (semantic + BM25) with pgvector; LLM re-ranking and RAGAS evaluation
- **MCP + A2A Protocols** — Connect any MCP server (Streamable HTTP + SSE); agent-to-agent communication following Google A2A v0.3 with circuit breaker and distributed tracing
- **Inbound Webhooks** — Standard Webhooks spec (HMAC-SHA256); receive events from GitHub, Stripe, Slack, and any provider; trigger flows with idempotency and event filtering
- **Agent Marketplace** — 250 production-ready templates across 21 categories with faceted search, discovery, and one-click import
- **Agent Evals** — 3-layer testing: deterministic assertions, semantic similarity, LLM-as-Judge with 12 assertion types and deploy-triggered automatic runs
- **CLI Generator** — 6-phase AI pipeline wraps any CLI tool as a fully-typed MCP server (Python FastMCP or TypeScript MCP SDK)
- **ECC Developer Skills** — 60+ skill modules and 25 developer agent templates with autonomous meta-orchestration and instinct-based continuous learning
- **Embeddable Chat Widget** — Drop-in `<script>` tag for any website with streaming NDJSON responses, mobile support, and proactive messaging
- **Multi-Tenancy** — Organization model with OWNER/ADMIN/MEMBER roles, invitation system, and org-scoped agent ownership
- **API Keys** — Scoped `as_live_` keys with SHA-256 hashing, 11 permission scopes, and per-key expiry/revocation
- **Admin Dashboard** — Platform metrics, job queue monitoring, top users, and webhook health with auto-refresh
- **Safety Middleware** — Prompt injection detection, PII redaction, and content moderation on all AI calls
- **BullMQ Job Queue** — Background processing for KB ingest, eval runs, and webhook retries with priority levels
- **GDPR Compliance** — Account deletion (30-day grace), data export, and configurable retention policies
- **Feature Flags** — 3-layer evaluation (org override > Redis > default) with percentage-based rollout

---

## Supported AI Providers

Agent Studio works with **18 models across 7 providers** out of the box. Add the corresponding API key to unlock each tier.

| Provider | Models | Tier |
|---|---|---|
| **DeepSeek** *(default)* | `deepseek-chat`, `deepseek-reasoner` | Fast · Powerful |
| **OpenAI** | `gpt-4.1-mini`, `gpt-4.1`, `o4-mini`, `o3` | Fast · Balanced · Powerful |
| **Anthropic** | `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6` | Fast · Balanced · Powerful |
| **Google Gemini** | `gemini-2.5-flash`, `gemini-2.5-pro` | Fast · Powerful |
| **Groq** | `llama-3.3-70b-versatile`, `compound-beta` | Fast |
| **Mistral** | `mistral-small-3.1`, `mistral-medium-3`, `mistral-large-2512` | Fast · Balanced · Powerful |
| **Moonshot / Kimi** | `kimi-k2`, `kimi-k2-thinking` | Balanced · Powerful |

> **Required:** `OPENAI_API_KEY` is always needed for embeddings (`text-embedding-3-small`). All other providers are optional.

---

## How It Compares

| Feature | Agent Studio | Flowise | n8n | LangFlow | Dify |
|---|:---:|:---:|:---:|:---:|:---:|
| Visual flow editor | ✅ | ✅ | ✅ | ✅ | ✅ |
| MCP server support | ✅ | ⚠️ | ❌ | ⚠️ | ❌ |
| Google A2A protocol | ✅ | ❌ | ❌ | ❌ | ❌ |
| Enterprise RAG pipeline | ✅ | ⚠️ | ❌ | ⚠️ | ✅ |
| 3-layer agent evals | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| CLI → MCP generator | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inbound webhooks | ✅ | ⚠️ | ✅ | ❌ | ⚠️ |
| Flow version control | ✅ | ❌ | ⚠️ | ❌ | ❌ |
| Embeddable widget | ✅ | ✅ | ❌ | ❌ | ✅ |
| 7 AI providers built-in | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Open source | ✅ | ✅ | ✅ | ✅ | ✅ |

*✅ Full support · ⚠️ Partial · ❌ Not supported*

---

## API Authentication

Agent Studio exposes a full REST API secured with scoped API keys.

### Creating a key

Go to **Settings → API Keys** (`/settings/api-keys`) or call the API directly:

```bash
curl -X POST https://your-app.railway.app/api/api-keys \
  -H "Content-Type: application/json" \
  -H "x-api-key: as_live_<existing-key>" \
  -d '{ "name": "CI pipeline", "scopes": ["agents:read", "flows:execute"] }'
# → { "success": true, "data": { ..., "key": "as_live_..." } }
# The raw key is returned ONCE and never stored.
```

### Using a key

Pass the key as an `x-api-key` header on every request:

```bash
# List agents
curl https://your-app.railway.app/api/agents \
  -H "x-api-key: as_live_…"

# Execute a flow
curl -X POST https://your-app.railway.app/api/agents/<agentId>/execute \
  -H "x-api-key: as_live_…" \
  -H "Content-Type: application/json" \
  -d '{ "input": "Summarise the weekly report" }'
```

### Available scopes

| Scope | Grants |
|---|---|
| `agents:read` | List and view agents |
| `agents:write` | Create and update agents |
| `agents:delete` | Delete agents |
| `flows:read` | Read flow definitions |
| `flows:execute` | Run agent flows |
| `kb:read` | Search knowledge bases |
| `kb:write` | Add knowledge base sources |
| `evals:read` | View eval results |
| `evals:run` | Trigger eval runs |
| `webhooks:read` | View webhook configs |
| `admin` | Wildcard — grants all of the above |

Keys are SHA-256 hashed before storage. Maximum 20 active keys per account. Revoked keys stop working immediately.

---

## Architecture

```mermaid
graph TB
    subgraph Client
        UI[Next.js App Router]
        FE[Flow Editor - XyFlow]
        Chat[Chat Interface]
    end

    subgraph API["API Layer (107 routes)"]
        Agents[Agent CRUD]
        FlowAPI[Flow Versioning & Deploy]
        ChatAPI[Chat - Streaming NDJSON]
        KBAPI[Knowledge Base]
        Evals[Eval Runner]
        Webhooks[Inbound Webhooks]
        CLI[CLI Generator]
    end

    subgraph Runtime["Flow Runtime Engine"]
        Engine[Execution Loop]
        Handlers[55 Node Handlers]
        Stream[Streaming Engine]
    end

    subgraph AI["AI Layer"]
        SDK[Vercel AI SDK v6]
        Providers[7 Providers / 18 Models]
        MCP[MCP Client + Pool]
        AgentTools[Agent-as-Tool]
    end

    subgraph Data
        PG[(PostgreSQL + pgvector)]
        Redis[(Redis)]
        KB[RAG Pipeline]
    end

    subgraph ECC["ECC Module"]
        Skills[60+ Skills]
        Meta[Meta-Orchestrator]
        Learn[Instinct Engine]
        ECCMCP[Skills MCP Server]
    end

    UI --> API
    FE --> FlowAPI
    Chat --> ChatAPI
    API --> Runtime
    Runtime --> AI
    AI --> Providers
    AI --> MCP
    Runtime --> Data
    KB --> PG
    ECC --> ECCMCP
    Meta --> AgentTools
```

---

## Manual Setup

<details>
<summary>Setup without Docker</summary>

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL with pgvector extension

### Steps

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Required: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY, OPENAI_API_KEY,
#           AUTH_SECRET, AUTH_GITHUB_ID/SECRET or AUTH_GOOGLE_ID/SECRET

# 3. Enable pgvector (run in your PostgreSQL client)
# CREATE EXTENSION IF NOT EXISTS vector;

# 4. Setup database and generate Prisma client
pnpm db:push && pnpm db:generate

# 5. Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

</details>

---

## Available Commands

```
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check (no emit)
pnpm test             # Vitest unit tests (2800+)
pnpm test:e2e         # Playwright E2E tests
pnpm db:push          # Sync Prisma schema to DB
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Prisma Studio UI
pnpm precheck         # Pre-push CI simulation (TS + vitest + icon mocks + strings)
pnpm precheck:file    # Same, for a specific file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5, App Router, Turbopack |
| Runtime | React 19 |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL + pgvector, Prisma v6 |
| AI | Vercel AI SDK v6 (7 providers, 18 models) |
| Auth | NextAuth v5 (GitHub + Google OAuth) |
| Flow Editor | @xyflow/react v12 |
| MCP | @ai-sdk/mcp (Streamable HTTP + SSE) |
| Caching | Redis (ioredis, graceful fallback) |
| Validation | Zod v3 |
| UI | Radix UI + lucide-react |
| Tests | Vitest 2800+ unit · Playwright E2E |

---

## Project Structure

```
prisma/schema.prisma        # 41 models, pgvector, versioning, A2A, ECC
src/
  app/                      # Pages and 107 API routes
    builder/[agentId]/      # Flow editor
    chat/[agentId]/         # Chat interface
    knowledge/[agentId]/    # Knowledge base
    evals/[agentId]/        # Agent evals
    discover/               # Agent marketplace
    skills/                 # ECC Skills Browser
    cli-generator/          # CLI-to-MCP pipeline
    settings/               # API keys + account settings
  components/               # React components
  lib/
    runtime/                # Flow engine (55 handlers)
    knowledge/              # RAG pipeline
    ecc/                    # ECC module
    evals/                  # Eval runner
    mcp/                    # MCP client + pool
  data/                     # 250 agent templates (221 + 29 ECC)
services/ecc-skills-mcp/    # Python FastMCP server (Railway service)
e2e/                        # Playwright E2E tests
docs/                       # Documentation
scripts/                    # Dev tooling (pre-push-check.sh)
```

---

## Documentation

| Document | Description |
|---|---|
| [Platform Overview](docs/01-overview.md) | Features and architecture |
| [Getting Started](docs/08-getting-started.md) | Setup guide |
| [Node Reference](docs/10-node-reference.md) | All 55 node types |
| [Knowledge Base Guide](docs/09-knowledge-base-guide.md) | RAG pipeline |
| [CLI Generator](docs/12-cli-generator.md) | MCP bridge generation |
| [Agent Evals](docs/13-agent-evals.md) | Testing framework |
| [CHANGELOG](CHANGELOG.md) | Version history |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[Apache License 2.0](LICENSE)

```
Copyright 2026 Agent Studio Contributors
```
