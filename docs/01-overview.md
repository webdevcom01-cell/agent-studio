# Agent Studio — Platform Overview

## What is Agent Studio?

Agent Studio is a visual builder for creating AI agents with multi-agent orchestration and continuous learning. Using a drag-and-drop flow editor, you can create intelligent conversational agents backed by Knowledge Base RAG search, 7 AI providers, agent-to-agent communication, and an extensible skill system powered by ECC (everything-claude-code) integration.

## Main Components

### 1. Flow Builder
A visual editor (XyFlow) where you connect nodes to define conversation and automation flows. 55 node types available — from basic message/condition nodes to AI response, MCP tool calls, parallel execution, loops, webhooks, guardrails, cost monitoring, and the Learn node for continuous improvement.

### 2. Knowledge Base (KB)
RAG pipeline: add URLs, upload files (PDF/DOCX), or paste text. Content is automatically scraped, chunked (400 tokens, 20% overlap), embedded (OpenAI text-embedding-3-small), and stored in pgvector. Hybrid search combines semantic cosine similarity (70%) + BM25 keyword search (30%) with optional LLM re-ranking.

### 3. Chat Interface
Every agent has a public chat link at `/chat/[agentId]` with streaming support (NDJSON protocol). Also available as an embeddable widget (`public/embed.js`) for external websites.

### 4. MCP Servers
Connect external tool servers via the Model Context Protocol (MCP). Supports Streamable HTTP and SSE transports. Manage servers globally from the dashboard, then enable per-agent with optional tool filtering. Connection pooling with 5-min TTL.

### 5. CLI Generator
Wraps any CLI application as a fully functional MCP server via a 6-phase AI pipeline (Analyze → Design → Implement → Test → Document → Publish). Dual-target: generates Python FastMCP or TypeScript Node.js MCP SDK output. Register the generated bridge as an MCP server with one click. Available at `/cli-generator`.

### 6. Agent Evals
3-layer testing framework for agent quality assurance:
- **Layer 1 — Deterministic** (free): exact_match, contains, regex, json_valid, latency, etc.
- **Layer 2 — Semantic Similarity** (~$0.001/eval): cosine distance via embeddings
- **Layer 3 — LLM-as-Judge** (~$0.01/eval): custom rubric, KB faithfulness, relevance

12 assertion types. Auto-run on deploy with `runOnDeploy` flag. Available at `/evals/[agentId]`.

### 7. Inbound Webhooks
Standard Webhooks spec with HMAC-SHA256 signatures. Public trigger endpoint for external services. Provider presets for GitHub, Stripe, Slack. Event filtering, idempotency, secret rotation. Managed at `/webhooks/[agentId]`.

### 8. Agent Marketplace
Discover and share agents at `/discover`. Faceted search by category, tags, model, scope. 250 templates across 21 categories available at `/templates`.

### 9. Agent-as-Tool Orchestration
AI response nodes can dynamically call sibling agents as tools. Circuit breaker, rate limiter, circular call detection, depth limiting (max 3), and audit logging protect the call chain.

### 10. A2A Protocol
Agent-to-agent communication following Google A2A v0.3 spec. Agent Cards for discovery, task-based communication between agents.

---

## ECC Integration — everything-claude-code

### Developer Agents (25 templates)
25 specialized developer agent templates in the "Developer Agents" category, imported from the ECC framework. Model routing: Opus for complex reasoning (planner, architect), Sonnet for balanced tasks (code-reviewer, tdd-guide), Haiku for fast operations (doc-updater, test-writer).

### Skills Browser
Browse 60+ skill modules at `/skills`. Skills are parsed from SKILL.md files with YAML frontmatter, stored in the Skill model, and vectorized into the Knowledge Base (255 chunks) for RAG retrieval. Faceted filters by language, category, and agent.

### Meta-Orchestrator
Autonomous agent routing based on the ECC chief-of-staff pattern. 4 pre-built flow templates:
1. **TDD Pipeline**: Planner → TDD Guide → parallel[Code Reviewer + Security] → end
2. **Full Dev Workflow**: Planner → Architect → parallel[Backend+Security+Docs] → Reviewer → end
3. **Security Audit**: Security Reviewer → parallel[OWASP + Secret scan + Deps] → Doc Updater → end
4. **Code Review Pipeline**: Planner → parallel[Reviewer + language-specific] → summary → end

### Learn Node and Continuous Learning
The Learn node extracts patterns from AgentExecution history into instincts. Instincts accumulate confidence scores (0.0–1.0) and frequency counters. When confidence exceeds 0.85, instincts are promoted to full KB skills via the `/api/skills/evolve` endpoint (runs daily at 3 AM via cron).

### ECC Skills MCP Server
Separate service running Python FastMCP. Exposes 3 tools: `get_skill`, `search_skills`, `list_skills`. Communicates via internal networking on `/mcp` path. URL configured via `ECC_MCP_URL` env var.

---

## Basic Workflow

1. Create an agent — give it a name and description (or pick a template)
2. Add Knowledge Base — enter URLs, upload files, or paste text
3. Build a flow — add and connect nodes in the Builder (55 node types)
4. Configure webhooks — set up external triggers if needed
5. Add evals — define test cases with assertions for quality assurance
6. Test — use Test Chat to verify the agent works correctly
7. Deploy — publish a version and share the chat link

---

## How Flow Execution Works

When a user sends a message:
1. The flow starts from the first node (the one with no incoming connections)
2. Each node executes in order, with safety limits: MAX_ITERATIONS=50, MAX_HISTORY=100
3. If a node waits for user input (e.g. Capture, Human Approval), the flow pauses
4. After the user responds, the flow continues from that node
5. The flow ends when it reaches an End node or there are no more nodes
6. AI response nodes stream tokens via NDJSON; parallel nodes execute branches concurrently

---

## Available AI Models

18 models across 7 providers, tiered by capability:

| Tier | Models |
|------|--------|
| Fast | deepseek-chat, gpt-4.1-mini, claude-haiku-4-5, gemini-2.5-flash, llama-3.3-70b, mistral-small-3.1 |
| Balanced | gpt-4.1, claude-sonnet-4-6, compound-beta, mistral-medium-3, kimi-k2 |
| Powerful | deepseek-reasoner, o4-mini, o3, claude-opus-4-6, gemini-2.5-pro, mistral-large-3, kimi-k2-thinking |

DeepSeek is the default. OpenAI API key is required for embeddings (DeepSeek has no embedding support).

---

## Variables in the Flow

Variables store and pass data between nodes using `{{variable_name}}` syntax. Supports nested paths (`{{user.address.city}}`) and bracket notation (`{{items[0]}}`).

Automatically available:
- `{{last_message}}` — the user's last message
- `{{kb_context}}` — Knowledge Base search results (after a KB Search node)
- `{{__webhook_payload}}` — webhook request body (in webhook-triggered flows)
- `{{__webhook_event_type}}` — resolved event type from webhook headers/body

Custom variables are created through the Capture node or Set Variable node.
