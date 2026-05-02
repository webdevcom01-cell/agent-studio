# SOMA Shared — Niche Glossary
*Path: /shared/niche-glossary*

Shared terminology for all SOMA agents. Use these definitions for consistent language
across Trend Intelligence signals, Hook Writer copy, and Content Repurposer output.

---

## Terms

**A2A** — Agent-to-Agent protocol. Direct communication between AI agents without human in the loop.

**Agentic pipeline** — A sequence of AI agents where each agent's output triggers the next.

**Context window** — The maximum amount of text an LLM can process in a single call.

**Function calling / Tool use** — LLM capability to invoke external functions and APIs.

**Guardrails** — Rules and checks that prevent an agent from producing harmful or off-spec output.

**MCP (Model Context Protocol)** — Anthropic's open protocol for connecting LLMs to external tools and data sources.

**Multi-agent** — Architecture where multiple specialized AI agents collaborate on a task.

**Orchestrator** — An agent that coordinates and delegates tasks to other agents.

**RAG (Retrieval-Augmented Generation)** — Technique where relevant documents are retrieved from a knowledge base and injected into the LLM prompt before generation.

**SOMA (Self-Organizing Microagent Architecture)** — The 3-node, single-responsibility agent pattern used in this system.

**Stateful agent** — An agent that retains memory between calls (vs. stateless agents that start fresh each run).

**Subagent** — An agent called by another agent via A2A to perform a specialized subtask.

**Tool call** — When an LLM decides to call an external function rather than generating text directly.

---

## Platform-specific terms

**LinkedIn feed** — The main content stream on LinkedIn; posts compete for "see more" clicks.
**TikTok FYP** — "For You Page" — TikTok's algorithmic content feed.
**YouTube CTR** — Click-through rate on thumbnail; primary signal for YouTube SEO.
**Instagram carousel** — Multi-slide post format; each slide is a separate image.
**X thread** — A series of connected tweets numbered [1/N].

---

## Audience assumptions

Primary audience: **AI developers and agent builders**
- Technically literate — skip basic explanations
- Building with LLMs professionally or seriously as a side project
- Following the AI tooling ecosystem closely
- Skeptical of hype — responds to specificity and proof

Secondary audience: **Technical founders and CTOs**
- Evaluating AI infrastructure decisions
- Less hands-on but tracking the space
