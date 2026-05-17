# agent-scaffolder — Implementation Plan
*Drafted: 2026-05-15 | Based on: Anthropic Agent SDK docs + Google ADK May 2026 standards*

---

## 1. Research Summary

### 1.1 Anthropic Standards (May 2026)

Source: [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) | [Building agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) | [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**Core principles:**
- Orchestrator-worker pattern is the recommended architecture for multi-agent systems. A lead/orchestrator agent decomposes tasks and delegates to specialized sub-agents.
- Each sub-agent needs four things defined at creation time: **objective**, **output format**, **tool guidance**, and **task boundaries**. Missing any of these causes duplication, gaps, or tool misuse.
- **Memory = file-based persistence.** Claude's memory tool uses a persistent file system (outside context window) that survives across sessions. Agents build knowledge over time. This is exactly the `instincts.md` + `evo-log.md` pattern already in SOMA.
- **Just-In-Time context loading.** Agents maintain lightweight references (file paths, queries) and load data dynamically at runtime — not all at startup. The `kb_search` node at flow start is the AgentStack implementation of this pattern.
- **Context editing (2026 feature).** Reduces token consumption by 84% in long-running tasks. Agents that maintain progress summaries rather than full history perform better.
- **Minimal viable agent first.** Start with simple, composable patterns. Add complexity only when a simpler solution fails.
- **Sub-agent isolation.** Each sub-agent runs in its own context window. Only condensed summaries (1,000–2,000 tokens) pass between agents — not the full exploration trail.

**System prompt structure (Anthropic recommended):**
```
1. Role + scope
2. Input contract (what arrives, what format)
3. Processing instructions (step-by-step)
4. Output contract (what to produce, what format)
5. Quality gates (validation rules)
6. Failure modes (what to do when something is wrong)
```

### 1.2 Google ADK Standards (May 2026)

Source: [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/) | [Build Your First ADK Agent Workforce](https://cloud.google.com/blog/topics/developers-practitioners/build-your-first-adk-agent-workforce) | [Google ADK Docs](https://google.github.io/adk-docs/)

**Core principles:**
- **Spec-driven development.** `adk create` writes a `DESIGN_SPEC.md` BEFORE generating any code. The spec captures: purpose (2–3 paragraphs), 3–5 use cases with I/O examples, tools required, constraints & safety rules (specific — not generic).
- **Three-level knowledge loading (L1/L2/L3):**
  - **L1 Metadata** (~100 tokens per skill): loaded at startup for ALL skills
  - **L2 Instructions** (<5,000 tokens): loaded only when a skill is activated
  - **L3 Resources**: loaded only when step-level instruction requires it
  - Result: 90% reduction in baseline context vs. loading everything at startup
- **AgentCard for A2A discovery.** Each agent publishes a JSON document listing its identity, capabilities, skills, and auth requirements. Other agents use this to decide whether to delegate.
- **Workflow types:** SequentialAgent → ParallelAgent → LoopAgent
- **Skills architecture.** Each capability = a SKILL.md file with L1 metadata + L2 instructions. Reference files (L3) loaded only when needed. This maps directly to the Cowork plugin skill system.

**Scaffold artifacts (from `adk create` pattern):**
```
agent-name/
├── DESIGN_SPEC.md        ← Written first, captures purpose + constraints
├── agent.py              ← Core agent logic
├── agent_card.json       ← A2A discovery identity
├── instincts.md          ← Learned patterns (persistent memory L2)
├── evo-log.md            ← Run history (persistent memory L2)
└── tests/                ← Eval cases
```

### 1.3 Key Gaps Found

**KB Creation gap:** AgentStack MCP has no `as_create_kb` tool. Knowledge bases can only be created via the AgentStack UI. The skill must account for this with a guided manual step.

**Flow node KB ID binding:** The `kb_search` node requires a `knowledgeBaseId`. Since KB is created after agent, the skill must either:
  a. Build flow with a `TODO: kb_id_here` placeholder, then patch it after KB creation
  b. Poll `as_list_knowledge_bases` after user confirms KB creation to get the ID automatically

**Chosen approach:** Strategy B (automated polling after user confirms via UI).

---

## 2. Skill Definition

### 2.1 Trigger Conditions

The skill activates on:
- "create a new agent", "scaffold an agent", "napravi novog agenta"
- "add agent to pipeline", "dodaj agenta u pipeline"
- "set up new AgentStack agent", "new agent from scratch"
- Any description of building a new pipeline stage

### 2.2 Tool Requirements

| Tool | Purpose |
|------|---------|
| `AskUserQuestion` | Collect agent spec from user |
| `mcp__93684bab...as_create_agent` | Create agent in AgentStack |
| `mcp__93684bab...as_inspect_flow` | Read current (empty) flow after creation |
| `mcp__93684bab...as_update_flow` | Install standard SOMA flow nodes |
| `mcp__93684bab...as_list_knowledge_bases` | Poll for KB ID after user creates it in UI |
| `mcp__93684bab...as_patch_node_field` | Bind KB ID to kb_search node |
| `mcp__93684bab...as_add_kb_text` | Seed KB with instincts + evo-log |
| `mcp__93684bab...as_get_kb_embedding_status` | Verify embedding completed |
| `mcp__obsidian...obsidian_create_note` | Write DESIGN_SPEC.md, evo-log.md, instincts.md |
| `TaskCreate` + `TaskUpdate` | Track scaffolding progress |

---

## 3. Execution Phases

### Phase 0 — Spec Gathering (AskUserQuestion, max 4 questions)

```
Q1: Agent name & role
  - "What is this agent called and what does it do?"
  - Options: Content Creator | Research Agent | Pipeline Processor | Standalone Agent

Q2: Pipeline position
  - "How does this agent connect to others?"
  - Options: Standalone (no A2A) | Receives from another agent | Sends to another agent | Both (middle of chain)

Q3: Model preference
  - "Which model should this agent use?"
  - Options: claude-sonnet-4-6 (recommended, balanced) | claude-opus-4-6 (complex reasoning) | claude-haiku-4-5 (fast, simple tasks) | gpt-4.1-mini (cost-optimized)

Q4: Niche / domain
  - "What domain does this agent specialize in?"
  - Options: AI/Tech content | B2B marketing | E-commerce | Custom (text input)
```

After collecting answers → generate agent slug (lowercase-hyphenated from name).

### Phase 1 — DESIGN_SPEC.md Generation

Write to Obsidian vault: `agents/{agent-slug}/DESIGN_SPEC.md`

Template structure:
```markdown
# {AgentName} — Design Spec
*Created: {date} | Version: 1.0*

## Purpose
{2-3 paragraphs: what the agent does, why it exists in the pipeline, 
 what problem it solves}

## Pipeline Position
- **Receives from:** {upstream agent or "user trigger"}
- **Sends to:** {downstream agent or "final output"}
- **A2A format:** {KEY:VALUE plain text / FORMAT C}

## Use Cases (3-5 examples)
### UC-1: {example name}
**Input:** `{example input}`
**Output:** `{example output}`
...

## Tools & Resources
| Tool | Purpose | Auth |
|------|---------|------|
| kb_search | Memory recall from instincts + evo-log | KB ID required |
| ai_response | Core processing | Model token budget |
| call_agent | A2A handoff to downstream | Target agent ID |

## Constraints & Safety Rules
- {Specific rule 1 — not generic}
- {Specific rule 2}
- {Specific rule 3}
- NEVER fabricate statistics or metrics
- NEVER pass output until quality gate passes

## Input Contract
{Exact format the agent expects to receive}

## Output Contract
{Exact format the agent produces — KEY:VALUE pairs}
```

### Phase 2 — AgentStack Agent Creation

Call `as_create_agent` with:
```json
{
  "name": "{AgentName}",
  "description": "{1-line purpose}",
  "model": "{chosen model}",
  "system_prompt": "{minimal starter prompt — will be replaced by flow ai_response nodes}"
}
```

Store returned `agentId` for all subsequent calls.

### Phase 3 — Standard Flow Construction

Call `as_update_flow` with the SOMA-standard node structure.

**Standard node set (all 3 SOMA agents use this pattern):**

```json
nodes: [
  {
    "id": "kb_search-{slug}-memory",
    "type": "kb_search",
    "data": {
      "topK": 10,
      "label": "{AgentName} Memory",
      "queryVariable": "user_message",
      "knowledgeBaseId": "PENDING_KB_CREATION"
    },
    "position": {"x": 200, "y": 50}
  },
  {
    "id": "ai_response-{slug}-processor",
    "type": "ai_response",
    "data": {
      "label": "{AgentName} Processor",
      "model": "{chosen_model}",
      "prompt": "{GENERATED_SYSTEM_PROMPT}",
      "outputVariable": "agent_response",
      "temperature": 0.7
    },
    "position": {"x": 200, "y": 200}
  },
  {
    "id": "ai_response-{slug}-extractor",
    "type": "ai_response",
    "data": {
      "label": "Output Extractor",
      "model": "claude-haiku-4-5-20251001",
      "prompt": "{EXTRACTOR_PROMPT}",
      "outputVariable": "structured_output",
      "temperature": 0.1
    },
    "position": {"x": 200, "y": 350}
  }
]
```

**If pipeline agent (has downstream):** Add `call_agent` node:
```json
{
  "id": "call_agent-{slug}-handoff",
  "type": "call_agent",
  "data": {
    "label": "Handoff to {DownstreamAgent}",
    "agentId": "{downstream_agent_id}",
    "inputVariable": "structured_output"
  },
  "position": {"x": 200, "y": 500}
}
```

**Edge wiring:**
```json
edges: [
  {"id": "e-memory-processor", "source": "kb_search-{slug}-memory", "target": "ai_response-{slug}-processor"},
  {"id": "e-processor-extractor", "source": "ai_response-{slug}-processor", "target": "ai_response-{slug}-extractor"},
  // If pipeline: 
  {"id": "e-extractor-handoff", "source": "ai_response-{slug}-extractor", "target": "call_agent-{slug}-handoff"}
]
```

### Phase 4 — System Prompt Generation

Generate the processor prompt using Anthropic's 6-section structure:

```markdown
You are {AgentName}, a specialized AI agent in the {pipeline} pipeline.

## Role
{Purpose from DESIGN_SPEC, condensed to 2-3 sentences}
Current date: {{current_date}}

## Input Contract
You receive a message in this format:
{INPUT_FORMAT — e.g., "TREND: ...\nCONFIDENCE: ..."}

Detection: Look for "{first_key}:" followed by "{second_key}:"
If format is not detected, respond: FORMAT_ERROR: Expected {first_key} not found.

## Memory
You have access to learned patterns and run history:
{{kb_context}}
Use this to apply past lessons and avoid known failure modes.

## Processing Instructions
1. {Step 1}
2. {Step 2}
3. {Step 3}
4. Apply quality gate: check against constraints in your memory
5. If quality gate fails, retry with correction

## Output Contract
Produce exactly this format (no preamble, no markdown, plain text only):
{OUTPUT_KEY_1}: {description}
{OUTPUT_KEY_2}: {description}
...

## Failure Modes
- input_missing: {what to output}
- quality_gate_fail: {what to output}
- all_{key}_empty: {what to output}
```

**Extractor prompt (minimal, Haiku):**
```markdown
Extract the structured output from the agent response below.
Look for KEY: VALUE pairs. Return them verbatim without modification.
If the response contains FORMAT_ERROR or QUALITY_GATE_FAIL, pass it through unchanged.

Agent response:
{{agent_response}}
```

### Phase 5 — Vault Initialization

Create three files in Obsidian:

**`agents/{slug}/evo-log.md`:**
```markdown
# {AgentName} — Evolution Log
*Path: /agents/{slug}/evo-log*

---

## Log Format
Each entry appended after a run:
```
date | {key_metric} | confidence | summary | downstream_triggered
```

---

## Entries

*No entries yet. Agent created {date}.*
```

**`agents/{slug}/instincts.md`:**
```markdown
# {AgentName} — Instincts
*Path: /agents/{slug}/instincts*
*Last updated: {date}*

---

## Learned Patterns

### What works well
- (add after first successful runs)

### Common mistakes to avoid
- NEVER fabricate statistics or metrics
- NEVER pass malformed output to downstream agent
- If input format is wrong, use FORMAT_ERROR — do not guess

### Quality Gate Rules
- (add domain-specific rules after first runs)

### Format Notes
- Input: {input_format_summary}
- Output: {output_format_summary}
```

### Phase 6 — KB Seeding (Semi-automated)

1. Tell user: "Please go to AgentStack UI → {AgentName} → Add Knowledge Base. Once created, come back and say 'KB ready'."
2. When user confirms → call `as_list_knowledge_bases` to get KB ID
3. Seed with two documents:
   - `as_add_kb_text(kb_id, instincts_content, "instincts")`
   - `as_add_kb_text(kb_id, evo_log_content, "evo-log")`
4. Patch kb_search node: `as_patch_node_field(node_id="kb_search-{slug}-memory", field_name="knowledgeBaseId", field_value="{kb_id}")`
5. Poll `as_get_kb_embedding_status` until `embeddingStatus: "ready"`

### Phase 7 — Scaffold Report

Output a structured summary:
```
✅ AGENT SCAFFOLDED: {AgentName}

AgentStack:
  - Agent ID: {agentId}
  - Model: {model}
  - Flow: {node count} nodes, {edge count} edges
  - KB ID: {kb_id} | Status: {embedding_status}

Vault:
  - agents/{slug}/DESIGN_SPEC.md ✅
  - agents/{slug}/evo-log.md ✅
  - agents/{slug}/instincts.md ✅

Pipeline position:
  - Receives from: {upstream or "user"}
  - Sends to: {downstream or "final output"}

⚠️ Remaining manual step:
  - Open AgentStack UI → {AgentName} → test with a sample trigger
  - Review generated system prompt and adjust if needed
  - Add domain-specific quality rules to instincts.md after first run
```

---

## 4. Generated System Prompt Template

The prompt generated in Phase 4 must follow Anthropic's 6-section pattern. The skill generates this dynamically based on user-provided spec. The key variables are:

| Variable | Source |
|----------|--------|
| `{AgentName}` | User input Q1 |
| `{pipeline}` | Derived from Q2 (pipeline position) |
| `{INPUT_FORMAT}` | Derived from Q2 (what upstream sends) or "user message" |
| `{OUTPUT_KEY_N}` | Skill generates 4-8 KEY:VALUE pairs based on domain (Q4) |
| `{Step N}` | Generated from purpose description |
| `{{kb_context}}` | AgentStack variable — injected by kb_search node at runtime |
| `{{current_date}}` | AgentStack variable — injected at runtime |

For pipeline agents, the input contract must include explicit detection logic. This prevents the agent from processing random messages as if they were structured pipeline input.

---

## 5. Critical Design Decisions

### 5.1 No `as_create_kb` — KB creation is manual
**Decision:** Accept this gap. The skill guides the user to create the KB via UI, then auto-discovers the KB ID using `as_list_knowledge_bases`. This is a one-time 30-second UI step.
**Alternative considered:** Build flow without kb_search node and add it later. Rejected — the memory pattern is too important to skip even on first deploy.

### 5.2 System prompt lives in the flow, not agent.system_prompt
**Decision:** The agent's `system_prompt` field gets a minimal stub. The real prompts live in `ai_response` flow nodes.
**Rationale:** Flow nodes are editable via MCP (`as_patch_node_field`). The agent.system_prompt is harder to iterate on. SOMA pattern confirmed this works.

### 5.3 Always use two-node output pattern (processor + extractor)
**Decision:** Every agent gets both a `processor` node (expensive model, creative) and an `extractor` node (Haiku, cheap, deterministic).
**Rationale:** Separates reasoning from formatting. If downstream rejects the format, only the extractor prompt needs editing — not the entire processor prompt. Learned from HW extractor debug in SOMA.

### 5.4 L1/L2/L3 knowledge loading (Google ADK pattern applied to AgentStack)
**Decision:** 
- L1 (startup): `kb_search` node with topK=10 loads memory context at flow start
- L2 (processor): `{{kb_context}}` injected into processor prompt
- L3 (on-demand): Future `web_search` node added only for agents that need live data

### 5.5 Slug convention
**Decision:** Agent slug = lowercase, hyphenated from name. e.g. "Hook Writer" → `hook-writer`. Used as: node ID prefix, vault folder name, and reference in downstream agent's `call_agent` node.

---

## 6. Skill File Structure

```
skills/agent-scaffolder/
├── SKILL.md              ← Main skill instructions (this is the Claude-executable skill)
├── IMPLEMENTATION_PLAN.md ← This document (research + design)
└── templates/
    ├── design-spec.md    ← DESIGN_SPEC.md template
    ├── evo-log.md        ← evo-log.md template
    ├── instincts.md      ← instincts.md template
    └── system-prompt.md  ← Processor system prompt template
```

---

## 7. Validation Checklist

After skill execution, these must all be true:

- [ ] Agent visible in `as_list_agents`
- [ ] Flow has 3+ nodes (kb_search + processor + extractor), edges wired
- [ ] `agents/{slug}/DESIGN_SPEC.md` exists in vault
- [ ] `agents/{slug}/evo-log.md` exists in vault
- [ ] `agents/{slug}/instincts.md` exists in vault
- [ ] KB `embeddingStatus: "ready"` with 2 documents
- [ ] `kb_search` node has correct `knowledgeBaseId` (not "PENDING_KB_CREATION")
- [ ] Processor prompt contains all 6 sections
- [ ] Test call via `as_chat_with_agent` returns structured output (not error)

---

## 8. Known Limitations & Future Work

| Limitation | Workaround | Future fix |
|------------|-----------|-----------|
| No `as_create_kb` tool | Manual UI step for KB creation | Request AgentStack team to expose `POST /api/knowledge-bases` via MCP |
| No `as_deploy_agent` tool | Agent is live immediately after flow update | N/A — no deployment step needed |
| Templates are generic | User customizes prompts after scaffold | kb-sync skill will keep KB updated as instincts evolve |
| No test execution in skill | User manually tests via AgentStack UI | flow-debugger skill (Priority 1, next build) will automate this |

---

*Sources:*
- [Building agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents)
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Google ADK Docs](https://google.github.io/adk-docs/)
- [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/)
- [Build Your First ADK Agent Workforce](https://cloud.google.com/blog/topics/developers-practitioners/build-your-first-adk-agent-workforce)
- [AgentStack Documentation](https://docs.agentstack.sh/introduction)
