# Agent Studio

Visual AI agent builder with multi-agent orchestration and continuous learning.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15.5-000000?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-v6-2D3748?logo=prisma)
![Railway](https://img.shields.io/badge/Railway-deployed-0B0D0E?logo=railway)
![Tests](https://img.shields.io/badge/Tests-1500%2B-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

<!-- ![Dashboard](docs/assets/dashboard.png) -->

---

## Features

### Flow Builder
Drag-and-drop visual editor with 32 node types powered by XyFlow. Build complex conversation flows, automation pipelines, and multi-agent orchestrations without writing code.

### Knowledge Base (RAG)
Add URLs, upload files (PDF/DOCX), or paste text. Content is chunked, embedded (OpenAI text-embedding-3-small), and stored in pgvector. Hybrid search combines semantic similarity (70%) + BM25 keyword matching (30%) with optional LLM re-ranking.

### Multi-Provider AI
18 models across 7 providers in three tiers (fast/balanced/powerful). DeepSeek (default), OpenAI, Anthropic, Google Gemini, Groq, Mistral, and Moonshot/Kimi.

### Agent Marketplace
137 agent templates across 12 categories. Discover and share agents with faceted search by category, tags, model, and scope.

### Agent-as-Tool Orchestration
AI agents dynamically call sibling agents as tools. Circuit breaker, rate limiter, depth limiting, and audit logging protect the call chain.

### CLI Generator
6-phase AI pipeline wraps any CLI application as an MCP server. Dual-target: Python FastMCP or TypeScript Node.js MCP SDK. Analyze, design, implement, test, document, publish.

### Agent Evals
3-layer testing framework: deterministic assertions, semantic similarity via embeddings, and LLM-as-Judge evaluation. 12 assertion types with auto-run on deploy.

### Inbound Webhooks
Standard Webhooks spec with HMAC-SHA256 signatures. Provider presets for GitHub, Stripe, and Slack. Event filtering, idempotency, and secret rotation.

### MCP Integration
Connect external tool servers via Model Context Protocol. Streamable HTTP + SSE transports. Connection pooling with 5-min TTL. Per-agent tool filtering.

### A2A Protocol
Agent-to-agent communication following Google A2A v0.3 spec. Agent Cards for discovery, task-based inter-agent messaging.

### Embeddable Chat Widget
Drop-in chat widget for any website. Customizable colors, title, welcome message, and proactive messaging. Mobile-responsive with full-screen mode.

---

## ECC Integration

Agent Studio integrates [everything-claude-code](https://github.com/affaan-m/everything-claude-code) (ECC) as a module in `src/lib/ecc/`, adding developer-focused AI agent capabilities:

- **25 Developer Agent Templates** — Specialized agents (planner, architect, code-reviewer, tdd-guide, security-reviewer, etc.) with model routing: Opus for complex reasoning, Sonnet for balanced tasks, Haiku for fast operations
- **60+ Skill Modules** — Parsed from SKILL.md files, stored in the Skill model, and vectorized into the Knowledge Base (255 chunks) for RAG retrieval
- **Skills Browser** — Search and filter skills by language, category, and agent at `/skills`
- **Meta-Orchestrator** — Autonomous agent routing with 4 pre-built flow templates (TDD Pipeline, Full Dev Workflow, Security Audit, Code Review Pipeline)
- **Continuous Learning** — Learn node extracts patterns into instincts (confidence 0.0-1.0). High-confidence instincts auto-promote to KB skills via daily cron
- **ECC Skills MCP Server** — Separate Railway service (Python FastMCP) exposing `get_skill`, `search_skills`, `list_skills` tools

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5, App Router, Turbopack |
| Runtime | React 19 |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL + pgvector (Supabase), Prisma v6 |
| AI | Vercel AI SDK v6 (7 providers, 18 models) |
| Auth | NextAuth v5 (GitHub + Google OAuth, JWT) |
| Flow Editor | @xyflow/react v12 |
| MCP | @ai-sdk/mcp (Streamable HTTP + SSE) |
| Validation | Zod v3 |
| UI | Radix UI + lucide-react icons |
| Charts | recharts |
| Data Fetching | SWR |
| Unit Tests | Vitest + @vitest/coverage-v8 |
| E2E Tests | Playwright (8 spec files) |
| Deploy | Railway (Nixpacks) |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL with pgvector extension

### Setup

```bash
# Clone
git clone https://github.com/webdevcom01-cell/agent-studio.git
cd agent-studio

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Required: DATABASE_URL, DIRECT_URL, DEEPSEEK_API_KEY, OPENAI_API_KEY,
#           AUTH_SECRET, AUTH_GITHUB_ID/SECRET, AUTH_GOOGLE_ID/SECRET

# Setup database
pnpm db:push

# Generate Prisma client
pnpm db:generate

# Enable pgvector (run in Supabase SQL editor)
# CREATE EXTENSION IF NOT EXISTS vector;

# Start dev server
pnpm dev
```

### Available Commands

```
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm test             # Vitest unit tests (1500+)
pnpm test:e2e         # Playwright E2E tests
pnpm db:push          # Sync schema to DB
pnpm db:generate      # Generate Prisma client
pnpm db:studio        # Prisma Studio UI
```

---

## Railway Deployment

Production URL: `https://agent-studio-production-c43e.up.railway.app`

### Services

| Service | Description |
|---------|------------|
| agent-studio | Next.js 15.5 application (Nixpacks, auto-deploy from main) |
| positive-inspiration | ECC Skills MCP server (Python FastMCP, internal networking, `/mcp` path) |
| PostgreSQL | pgvector/pgvector:pg16, persistent volume, HNSW index |
| Cron Service | Scheduled flows (5min) + instinct evolution (daily 3AM) |

See [docs/deployment/ECC-DEPLOY-RUNBOOK.md](docs/deployment/ECC-DEPLOY-RUNBOOK.md) for full deployment guide.

---

## Project Structure

```
prisma/schema.prisma          # 30+ models, pgvector, versioning, A2A, ECC
src/
  app/                        # Next.js App Router pages and API routes
    api/                      # 50+ API endpoints
    builder/[agentId]/        # Flow editor
    chat/[agentId]/           # Chat interface
    knowledge/[agentId]/      # Knowledge base management
    skills/                   # ECC Skills Browser
    evals/[agentId]/          # Agent evals
    webhooks/[agentId]/       # Webhook management
    cli-generator/            # CLI-to-MCP pipeline
    discover/                 # Agent marketplace
    templates/                # Template gallery
  components/                 # React components (builder, chat, UI primitives)
  lib/                        # Core libraries
    runtime/                  # Flow execution engine (32 handlers)
    knowledge/                # RAG pipeline (chunk, embed, search)
    ecc/                      # ECC module (skills, orchestrator, instincts)
    webhooks/                 # Webhook verification and execution
    evals/                    # Eval assertions and runner
    cli-generator/            # 6-phase pipeline
    mcp/                      # MCP client and connection pool
  data/                       # Templates and static data
services/ecc-skills-mcp/      # Python FastMCP server (separate Railway service)
e2e/                          # Playwright E2E tests
docs/                         # Documentation
```

---

## Testing

- **1500+ unit tests** across 114+ test files (Vitest)
- **8 E2E spec files** (Playwright): auth, dashboard, flow editor, KB, chat, import/export, API, webhooks
- Run: `pnpm test` (unit), `pnpm test:e2e` (E2E)

---

## Documentation

| Document | Description |
|----------|------------|
| [Platform Overview](docs/01-overview.md) | Features and architecture |
| [Getting Started](docs/08-getting-started.md) | Setup guide |
| [Node Reference](docs/10-node-reference.md) | All 32 node types |
| [Knowledge Base Guide](docs/09-knowledge-base-guide.md) | RAG pipeline details |
| [CLI Generator](docs/12-cli-generator.md) | MCP bridge generation |
| [Agent Evals](docs/13-agent-evals.md) | Testing framework |
| [ECC Deploy Runbook](docs/deployment/ECC-DEPLOY-RUNBOOK.md) | Production deployment |
| [CHANGELOG](CHANGELOG.md) | Version history |

---

## License

MIT

---

Built with Next.js, Vercel AI SDK, XyFlow, Prisma, and pgvector. Deployed on Railway.
