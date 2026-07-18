# Glossary

> Terminology of the Agent Studio project. Definitions are derived from `README.md`, `FEATURES.md`, `AGENTS.md`, and the code; each term lists its primary source.

| Term | Definition | Source |
|------|-----------|--------|
| **Agent** | The central entity: an AI agent with its own flow, model, prompt, knowledge base, and settings. | `prisma/schema.prisma` (model `Agent`), `FEATURES.md` §27 |
| **Flow** | An agent's visual workflow — a graph of nodes and edges stored as JSON. Versioned (`FlowVersion`) with a deploy pipeline (`FlowDeployment`). | `prisma/schema.prisma` (model `Flow`), `README.md` |
| **Node** | A step in a flow. There are 66 formal types (the `NodeType` union). | `src/types/index.ts:32` |
| **Handler** | The runtime implementation of one node type. The registry has 67 keys (66 `NodeType` + the internal `code_review`). | `src/lib/runtime/handlers/index.ts` |
| **NodeType** | The TypeScript union of all formal node types — the source of truth for the node count (66). | `src/types/index.ts:32` |
| **Knowledge Base (KB)** | A collection of sources (URL/text/file) that gets chunked, embedded, and searched to provide RAG context to an agent. | `docs/01-getting-started/knowledge-base.md` |
| **RAG** | Retrieval-Augmented Generation — hybrid search (semantic + BM25, RRF fusion) over KB chunks, injected into the model's context. | `src/lib/knowledge/search.ts` |
| **Chunk** | A piece of source text (~512 tokens by default) with an embedding vector (1536 dims, `text-embedding-3-small`). | `src/lib/knowledge/chunker.ts:20`, `src/lib/ai.ts:117` |
| **hybridAlpha** | The weight of the semantic component in hybrid search (default 0.7; 0.8 with contextual enrichment). | `src/lib/schemas/kb-config.ts:61`, `src/lib/knowledge/search.ts:563` |
| **MCP** | Model Context Protocol — a protocol for connecting external tools; agents use it via the `mcp_tool` node and MCP servers. | `FEATURES.md`, `src/app/api/mcp-servers/` |
| **A2A** | Google's Agent-to-Agent protocol — lets external agents discover and call Agent Studio agents (agent card). | `src/app/api/a2a/` |
| **ECC** | A module of specialized developer agents (30 templates) and a skills MCP service. | `src/lib/ecc/`, `src/data/ecc-agent-templates.json` |
| **SDLC pipeline** | An autonomous software-development pipeline built from specialized agent prompts. | `sdlc-prompts/`, `src/lib/sdlc/` |
| **Eval / Eval Suite** | The agent evaluation framework: suite → case → run → result, with regression detection. | `src/lib/evals/`, `docs/02-guides/agent-evals.md` |
| **HITL** | Human-in-the-loop — the `human_approval` node and approval policies (`ApprovalPolicy`). | `src/lib/runtime/handlers/`, `prisma/schema.prisma` |
| **RLS** | PostgreSQL Row-Level Security — per-organization enforcement via the `withOrgContext` middleware; controlled by the `RLS_ENFORCEMENT_ENABLED` flag. | `docs/02-guides/rls-testing.md`, `.env.example` |
| **Organization** | The multi-tenant unit (`Organization`, `OrganizationMember`, `Invitation`) — the carrier of RLS isolation. | `prisma/schema.prisma` |
| **Template** | A shareable agent recipe (221 templates in 20 categories), optionally with a starter flow. | `src/data/agent-templates.json` |
| **CLI generator** | The module that generates a standalone CLI tool from an agent. | `docs/02-guides/cli-generator.md`, `src/app/api/cli-generator/` |
| **Heartbeat** | A scheduled periodic wake-up of an agent with injected context (schedule + context). | `prisma/schema.prisma`, `src/app/api/schedules/` |
| **BullMQ** | The Redis-based queue for background jobs (executions, KB ingestion, cron). | `README.md` (tech stack), `REDIS_URL` in `.env.example` |
| **pgvector** | The PostgreSQL extension for vector search (HNSW indexes) — the embeddings store. | `prisma/schema.prisma`, `README.md` |
