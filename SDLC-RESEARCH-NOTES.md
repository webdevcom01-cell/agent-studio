# SDLC Pipeline — Research Notes
**Datum istraživanja:** 2026-03-31
**Izvori:** 7 Anthropic/Google/MCP dokumenata

---

## IZVOR 1: Anthropic — Building Effective Agents
**URL:** https://www.anthropic.com/research/building-effective-agents
**Relevantno za:** SVE agente (core architectural patterns)

### Ključni patterns za 2026

**5 workflow patterns (od jednostavnog ka složenom):**

| Pattern | Kada koristiti | Naš pipeline |
|---------|---------------|--------------|
| **Prompt Chaining** | Fiksni koraci, sekvencijalno | Product Discovery → Architecture → Code Gen |
| **Routing** | Klasifikacija → specijalizovani handler | Orchestrator rutira po tipu zadatka |
| **Parallelization** | Nezavisni subtaskovi ili voting | PR Gate (Security ‖ Quality ‖ Risk) |
| **Orchestrator-Workers** | Nepredvidivi subtaskovi | SDLC Orchestrator → dinamički delegira |
| **Evaluator-Optimizer** | Iterativno poboljšanje | Code Gen reflexive loop |

**Kritična preporuka:**
> "Finding the simplest solution possible, and only increasing complexity when needed."

**Agent loop dizajn:**
1. Počni od korisnikovog zahteva
2. Planiraj i radi nezavisno
3. Vrati se korisniku za informacije/prosudbu kad treba
4. Koristi "ground truth from environment" (tool results, test results)
5. Pauziraj za feedback na checkpoint-ima
6. Završi kad je zadatak gotov ILI dostigne max iteracija

**Tool dizajn (ACI — Agent-Computer Interface):**
> "Invest just as much effort in creating good agent-computer interfaces (ACI) as you would creating good HCI"

Konkretno:
- Tool opisi kao "docstring za junior developera"
- Uključi primere korišćenja, edge case-ove, format inputa
- Testiraj kako model ZAISTA koristi tool
- Poka-yoke: dizajniraj argumente tako da greške budu teže

**Anti-patterns:**
- Ne kombinovati guardrails sa core response u istom pozivu (koristiti parallelization)
- Ne koristiti framework bez razumevanja internala
- Ne dodavati kompleksnost bez merenja performance poboljšanja

### Primena u našem pipeline-u

| Agent | Pattern | Obrazloženje |
|-------|---------|-------------|
| Orchestrator | Orchestrator-Workers + Routing | Dinamički decompose + rutira po complexity |
| Product Discovery | Prompt Chaining | Fiksni koraci: idea → PRD → stories → AC |
| Architecture | Prompt Chaining + Parallelization | Sequential analysis + parallel security review |
| Code Generation | Evaluator-Optimizer | Generate → validate → improve loop |
| CI/CD Generator | Prompt Chaining | Fixed: analyze stack → generate configs |
| Deploy Decision | Routing | Classify: GO/NO-GO based on criteria |
| Perf Regression | Parallelization (Voting) | Multiple metric analyses in parallel |

---

## IZVOR 2: Anthropic — Multi-Agent Research System
**URL:** https://www.anthropic.com/engineering/multi-agent-research-system
**Relevantno za:** SDLC Orchestrator, Code Generation Agent

### Ključni patterns

**Orchestrator arhitektura:**
- Lead Agent (Opus) koordinira, Subagents (Sonnet) izvršavaju
- Lead spawns 3-5 parallel subagents
- Svaki subagent dobija: **Objective + Output Format + Tool Guidance + Task Boundaries**

**Kritičan nalaz za naš pipeline:**
> "Simple instructions like 'research the semiconductor shortage' caused subagents to duplicate work. Detailed task descriptions prevented overlap."

**Primena:** Orchestrator MORA dati detaljne instrukcije svakom agentu, ne generičke.

**Scaling rules (ugradi u Orchestrator):**
- Simple fact-finding: 1 agent, 3-10 tool calls
- Comparisons: 2-4 subagents, 10-15 calls each
- Complex research: 10+ subagents with clearly divided responsibilities

**Context management:**
- Save research plan to external memory pre nego kontekst pređe 200K tokena
- Fresh subagents se spawn-uju sa clean context + retrieved plan
- Subagents kompresuju findings pre vraćanja lead agentu
- **Direktna primena:** Koristiti memory_write/memory_read nodes za context persistence

**Error handling:**
- Resume from last checkpoint, ne restart
- Model se adaptira kad tool fails
- Combine AI adaptability + deterministic safeguards (retry logic + checkpoints)

**Performance:**
- Multi-agent: ~15x više tokena od single chat
- Ali: parallelization cut research time by 90%
- Token usage alone = 80% of performance variance
- Upgrading model (Sonnet 3.7 → Sonnet 4) > doubling token budget on worse model

**Evaluacija:**
- Start with ~20 test cases representing real usage
- LLM-as-judge with single prompt (0.0-1.0 + pass/fail) aligns with human judgment
- **Već imamo ovo u Agent Studio eval framework!**

---

## IZVOR 3: Claude Agent SDK
**URL:** https://claude.com/blog/building-agents-with-the-claude-agent-sdk
**Relevantno za:** Svi agenti (implementation patterns)

### Ključni patterns

**Core agent loop:** Gather context → Take action → Verify work → Repeat

**Tool types (4 kategorije):**
1. Custom Tools — primary actions
2. Bash/Scripts — general-purpose
3. Code Generation — Python scripts za complex ops
4. MCPs — standardized integrations

**Compaction:** SDK automatski summarizes previous messages kad se context limit približi — agent ne ostaje bez konteksta

**Verifikacija (3 metode):**
1. **Rules-based:** Code linting, format validation (brzo, deterministički)
2. **Visual:** Screenshots/renders za UI rad
3. **LLM-as-judge:** Drugi model evaluira fuzzy requirements

**Best practices:**
- Start with agentic search over semantic search for transparency
- Design tools consciously for context efficiency
- Add formal rules in tool calls to identify and fix failures
- Build representative test sets
> "The best way to improve an agent is to look carefully at its output, especially the cases where it fails."

### Primena u našem pipeline-u
- Code Gen agent: rules-based verification (lint) + LLM-as-judge (quality)
- Orchestrator: compaction za long-running pipelines
- All agents: formal rules za output validation

---

## IZVOR 4: Code Execution via MCP
**URL:** https://www.anthropic.com/engineering/code-execution-with-mcp
**Relevantno za:** Code Generation Agent

### Ključni patterns

**Progressive disclosure:** Agent discovers tools by exploring filesystem, reads only necessary definitions — ne učitava SVE tools upfront

**Token efficiency:**
> "Reduces usage from 150,000 tokens to 2,000 tokens" — 98.7% saving

Kako: Tool definitions load on-demand, results filtered/transformed pre konteksta, complex logic executes u environment ne looped through model

**Security (PII):**
- Intermediate results stay in execution environment
- MCP client intercepts sensitive data (PII tokenization)
- Data never passes through model unnecessarily

**Skills pattern:**
- Agent piše reusable functions ("skills") tokom rada
- Čuva ih kao fajlove za buduće korišćenje
- **Direktna veza sa našim ECC instinct → skill promotion!**

### Primena u Code Gen agentu
- Generiši kod → execute u sandboxu → verify output → iterate
- Koristi progressive disclosure za tool loading
- PII filtering za sensitive code patterns

---

## IZVOR 5: Google A2A Protocol
**URL:** https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
**Relevantno za:** Orchestrator, agent discovery

### Ključni koncepti

**Agent Card (/.well-known/agent-card.json):**
- Name, capabilities, endpoint
- JSON format na well-known URL
- **Već implementirano u Agent Studio! (`/api/agents/[agentId]/card.json`)**

**4 capabilities:**
1. Capability discovery (Agent Cards)
2. Task management (defined lifecycle states)
3. Agent-to-agent collaboration (context + instruction sharing)
4. UX negotiation (adapts to UI capabilities)

**v0.3 updates (2026):**
- gRPC support
- Security card signing
- Extended Python SDK

**Built on:** HTTP + SSE + JSON-RPC (existing standards)

### Primena
- Orchestrator koristi Agent Cards za discovery pre delegiranja
- Svaki SDLC agent treba imati ažuriran Agent Card
- Task lifecycle states: SUBMITTED → WORKING → INPUT_REQUIRED → COMPLETED → FAILED

---

## IZVOR 6: MCP Specification
**URL:** https://modelcontextprotocol.io/specification/2025-11-25
**Relevantno za:** Tool integration, Code Gen, CI/CD

### Ključne features

| Feature | Opis | Naša primena |
|---------|------|-------------|
| **Tools** | Server exposes callable functions | Svaki agent koristi MCP tools |
| **Resources** | Server exposes data to LLMs | KB dokumenti kao resources |
| **Roots** | Workspace scoping (filesystem boundaries) | Per-agent workspace |
| **Sampling** | Server requests LLM completions from client | Code Gen → validation loop |
| **Tool Output Schemas** | Client knows output shape ahead of time | Structured output za sve agente |

**Security:**
> "Tools represent arbitrary code execution and must be treated with appropriate caution"
- Tool descriptions treated as untrusted unless from trusted server
- Explicit user consent before invoking any tool

### Primena
- Tool Output Schemas za structured output (umesto free-form text)
- Roots za per-agent workspace isolation
- Sampling za bi-directional communication u Code Gen

---

## IZVOR 7: Anthropic 2026 Agentic Coding Trends Report
**URL:** https://resources.anthropic.com/2026-agentic-coding-trends-report
**Relevantno za:** Strategija, validacija pristupa

### 8 trendova

1. **Shifting engineering roles** — Engineers focus on architecture/design, agents write code
2. **Multi-agent coordination** — Parallel reasoning across separate context windows standard
3. **Extended task horizons** — Minutes → days/weeks autonomno
4. **Human-AI collaboration** — Strategic checkpoints, not micro-management
5. **Scaling beyond engineering** — Non-engineers koriste agentic tools
6. **AI-automated review systems** — Maintain quality at speed
7. **Context engineering** — Well-maintained context files = 40% fewer errors, 55% faster
8. **Multi-agent dev teams** — Orchestrator + specialized workers

**Kritična statistika:**
> "Projects with well-maintained context files see 40% fewer agent errors and 55% faster task completion."

### Validacija našeg pristupa
- ✅ Multi-agent pipeline (trend #2, #8)
- ✅ Human checkpoints za deploy (trend #4)
- ✅ Orchestrator + workers (trend #8)
- ✅ CLAUDE.md kao context file (trend #7)
- ✅ Eval framework za quality (trend #6)

---

## IZVOR 8: Anthropic Tool Use Documentation
**URL:** https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/overview
**Relevantno za:** Svi agenti (tool implementation)

### Ključni detalji

**Client vs Server tools:**
- Client tools: run in YOUR app (tool_use → execute → tool_result)
- Server tools: run on Anthropic's infra (web_search, code_execution, web_fetch)

**`strict: true`** — Guarantee schema conformance:
> "Add `strict: true` to your tool definitions to ensure Claude's tool calls always match your schema exactly."

**Model behavior sa tools:**
- Opus: više likely da traži pojašnjenje ako fali parametar
- Sonnet: more likely to infer/guess missing parameters
- **Primena:** Orchestrator (needs precision) → Opus-like behavior; Execution agents → Sonnet ok

**Token costs:**
- Tool definitions add 346 tokens (auto/none) ili 313 tokens (any/tool)
- Per tool_use block: variable
- **Budgeting:** Za 8 agenata sa po 5 tools = ~2800 extra tokens per pipeline run

---

## SINTEZA — KEY DECISIONS ZA NAŠ PIPELINE

### 1. Orchestrator Architecture
**Odluka:** Orchestrator-Workers pattern (ne prompt chaining)
**Razlog:** Anthropic eksplicitno preporučuje za "complex tasks where subtasks cannot be predicted beforehand"
**Implementacija:** Orchestrator spawns agents dinamički, ne fiksni redosled

### 2. Code Generation Strategy
**Odluka:** Evaluator-Optimizer pattern + reflexive_loop
**Razlog:** Anthropic: "one LLM generates response while another provides evaluation and feedback in a loop"
**Implementacija:** Generate (Opus) → Lint validate (rules-based) → LLM review (Sonnet) → iterate max 3x

### 3. Context Passing
**Odluka:** Flow variables za mali kontekst (<4K tokens), memory_write/read za veliki (>4K)
**Razlog:** Anthropic multi-agent: "save research plan to external memory" + "fresh subagents with clean context"
**Implementacija:** memory_write posle svakog agenta, Orchestrator čuva master state

### 4. Verification Strategy (3-layer)
**Odluka:** Rules-based → LLM-as-judge → Human approval
**Razlog:** Claude Agent SDK preporučuje tačno ovo: "formal rules + LLM judge + human oversight"
**Implementacija:**
- Layer 1: Format validation, lint (deterministic, free)
- Layer 2: LLM quality score (Sonnet, ~$0.003)
- Layer 3: Human approval (production deploy only)

### 5. Model Selection
**Odluka:** Opus SAMO za Code Gen; Sonnet za sve ostale
**Razlog:**
- Anthropic: "Upgrading model provides larger gains than doubling token budget"
- Ali: Code Gen je jedini koji zahteva Opus-level reasoning
- Ostali su structured output + classification → Sonnet dovoljno

### 6. Error Recovery
**Odluka:** Checkpoint-based resume (ne restart)
**Razlog:** Anthropic: "System resumes from agent's last checkpoint rather than restarting"
**Implementacija:** Svaki agent čuva checkpoint u memory pre završetka

### 7. Evaluation
**Odluka:** 20 test cases, LLM-as-judge (0.0-1.0 + pass/fail)
**Razlog:** Anthropic: "Small sample sizes detect dramatic improvements" + "single prompt aligns with human judgment"
**Implementacija:** Koristimo postojeći Agent Studio eval framework (3-layer!)

---

## RESEARCH COMPLETE — NEXT STEPS

Svi potrebni patterns su identifikovani. Spremni za pisanje system promptova.

**Prioritet pisanja:**
1. SDLC Orchestrator (koristi Orchestrator-Workers + Routing patterns)
2. Product Discovery (Prompt Chaining pattern)
3. Code Generation (Evaluator-Optimizer + reflexive_loop)
4. Architecture Decision (upgrade ECC Architect)
5. CI/CD Generator (Prompt Chaining)
6. Deploy Decision (Routing pattern)
7. Perf Regression (Parallelization)
