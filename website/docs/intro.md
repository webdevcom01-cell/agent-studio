---
sidebar_position: 1
slug: /
---

# Agent Studio

Visual AI agent builder with multi-agent orchestration and continuous learning.

Build AI agents via a drag-and-drop flow editor, manage knowledge bases with RAG, enable agent-to-agent communication, and chat with your agents — all from a single platform.

## Key Features

- **Visual Flow Editor** — 32 node types (AI, logic, integrations, webhooks) powered by XyFlow
- **Enterprise RAG Pipeline** — Ingest URLs, PDFs, DOCX; 5 chunking strategies; hybrid search with pgvector
- **MCP + A2A Protocols** — Connect external tools via MCP; agent-to-agent communication (Google A2A v0.3)
- **137 Agent Templates** — Pre-built templates across 12 categories with one-click import
- **CLI Generator** — 6-phase AI pipeline wraps any CLI application as an MCP server
- **Agent Evals** — 3-layer testing: deterministic, semantic similarity, LLM-as-Judge
- **ECC Developer Skills** — 60+ skill modules with autonomous meta-orchestration
- **Embeddable Chat Widget** — Drop-in widget for any website with streaming responses

## Quick Start

```bash
git clone https://github.com/webdevcom01-cell/agent-studio.git
cd agent-studio
cp .env.example .env
# Fill in DEEPSEEK_API_KEY and OPENAI_API_KEY
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) and create your first agent.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5, App Router, Turbopack |
| Language | TypeScript strict |
| Database | PostgreSQL + pgvector, Prisma v6 |
| AI | Vercel AI SDK v6 (7 providers, 18 models) |
| Auth | NextAuth v5 (GitHub + Google OAuth) |
| Flow Editor | @xyflow/react v12 |

## Links

- [GitHub Repository](https://github.com/webdevcom01-cell/agent-studio)
- [Contributing Guide](https://github.com/webdevcom01-cell/agent-studio/blob/main/CONTRIBUTING.md)
- [License (Apache 2.0)](https://github.com/webdevcom01-cell/agent-studio/blob/main/LICENSE)
