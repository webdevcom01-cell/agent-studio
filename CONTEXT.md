# agent-studio — Domain Glossary

Canonical vocabulary for this codebase. Use these terms exactly in issue titles, test names,
refactor proposals, and code comments. Don't drift to synonyms listed under "Not".

---

## Core Entities

**Agent** — An AI persona with a system prompt, model selection, and an attached Flow.
Scoped to a Workspace. Not: "bot", "assistant", "chatbot".

**Flow** — A directed graph of Nodes defining an agent's conversation and automation logic.
Stored as JSON in `flow.content`. Not: "pipeline", "graph", "workflow" (workflow is reserved for n8n).

**Node** — A single step in a Flow. Has a type (e.g. `start`, `llm`, `condition`, `kb_query`,
`input`, `human_approval`, `loop`, `api_call`, `claude_agent_sdk`). Not: "step", "block", "task".

**NodeHandler** — The runtime function that executes a Node. Lives in
`src/lib/runtime/handlers/`. Not: "executor", "processor".

**Execution** — A single run of a Flow triggered by a user message, webhook, or heartbeat.
Tracked as a `Conversation` in the DB. Not: "session" (session = user auth session), "run".

**Knowledge Base (KB)** — A collection of vector-embedded documents for RAG retrieval.
Linked to an Agent. Not: "vector store", "embeddings store", "document collection".

**Channel** — A deployment endpoint connecting an Agent to an external surface
(web widget, WhatsApp, Telegram, email). Not: "integration", "connector", "endpoint".

**Workspace** — Multi-tenant organizational unit. All resources (agents, KBs, channels,
members) are scoped to a Workspace. Not: "organization", "account", "tenant".

---

## Orchestration & Automation

**Swarm** — A multi-agent coordination pattern where a Coordinator Agent delegates subtasks
to Worker Agents. Not: "cluster", "pool", "ensemble".

**A2A (Agent-to-Agent)** — Protocol for one Agent to invoke another as a tool.
Governed by Department permissions. Not: "inter-agent", "agent communication".

**Department** — An organizational grouping of Agents with defined A2A permissions.
Part of the Org Chart (Paperclip F2). Not: "team", "group", "category".

**Goal** — A mission-level objective linked to an Agent, injected into every Execution
via the Heartbeat. Part of Goal Alignment (Paperclip F3). Not: "mission", "objective" alone.

**Heartbeat** — A scheduled BullMQ job that injects context into an Agent at regular intervals.
Part of Heartbeat Lifecycle (Paperclip F3). Not: "cron", "scheduler", "ping".

**SDLC Pipeline** — Automated software development lifecycle triggered via webhook.
Produces PRDs, architecture docs, and PRs. Not: "CI/CD" (CI/CD = GitHub Actions).

---

## Data & AI

**RAG (Retrieval-Augmented Generation)** — KB query embedded in Flow Execution.
Uses pgvector hybrid search (vector + keyword). Not: "semantic search", "knowledge retrieval".

**Instinct** — A reusable pattern extracted from successful Executions by the ECC SDK Learn Hook.
Stored per-agent and injected into future Executions. Not: "memory", "learning", "example".

**Eval** — A test case measuring Agent quality. Three layers: deterministic (exact match),
semantic (embedding similarity), LLM-as-Judge. Not: "test", "benchmark", "check".

**Embedding** — A 1536-dimension vector from OpenAI `text-embedding-3-small`.
Used for KB indexing and RAG retrieval. Not: "vector", "representation".

---

## Platform & Infrastructure

**Budget** — Spend caps with 402 enforcement and monthly reset (Paperclip F0).
Not: "limit", "quota", "credit".

**Clipmart** — The agent template marketplace. Export/import with SHA-256 checksum and
secret scrubbing. Not: "marketplace", "store", "registry".

**MCP (Model Context Protocol)** — Tool servers connected to Agents for web browsing,
external APIs, and custom tools. Transport: Streamable HTTP + SSE. Not: "plugin", "extension".

**ECC (Experiential Continuous Compression)** — External module for instinct extraction,
meta-orchestration, and Skills Browser. Guard all usage with `ECC_ENABLED` env var.

**Seam** — Where an interface lives; a place behavior can be altered without editing in place.
(From improve-codebase-architecture skill vocabulary.) Not: "boundary", "interface point".

**Deep Module** — A module with high leverage: a lot of behavior behind a small, stable interface.
The opposite of a shallow pass-through wrapper.

---

## Triage & Workflow

**AFK slice** — A vertical implementation slice an agent can complete without human interaction.
**HITL slice** — A slice requiring human input (architectural decision, design review).
**Tracer bullet** — A thin vertical slice that cuts through all layers end-to-end (schema → API → UI → tests).
