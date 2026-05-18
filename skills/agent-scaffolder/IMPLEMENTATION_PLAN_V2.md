# agent-scaffolder — Implementation Plan v2
*Revised: 2026-05-15 | Supersedes: IMPLEMENTATION_PLAN.md*
*Changes based on: CRITICAL_ANALYSIS.md (17 issues resolved)*

---

## 1. What Changed From v1

| v1 Problem | v2 Fix |
|-----------|--------|
| DESIGN_SPEC written before output keys existed | Prompt generation moved to STEP 2, DESIGN_SPEC to STEP 3 |
| "Step 4A" ambiguous sub-step | Each step is numbered, no sub-steps |
| Q1 mixed name + type in one question | Name extracted from trigger message; Q1 = pipeline role only |
| Downstream agent ID never collected | Conditional STEP 1B resolves ID before flow is built |
| No web_search option | New Q3: "Does agent need live web data?" → adds web_search node |
| No post-flow verification | `as_inspect_flow` called after every `as_update_flow` |
| Empty instincts template | Domain-specific starter content generated at scaffold time |
| Temperature hardcoded at 0.7 | Temperature derived from agent type |
| topK=10 on fresh KB | topK=5 at creation; scaling note in agent-card |
| DESIGN_SPEC not seeded to KB | KB now seeds 3 docs: DESIGN_SPEC + instincts + evo-log |
| No agent-card.md | New file created in vault: agentId, KB ID, I/O contract |
| No smoke test | New STEP 8: `as_chat_with_agent` with UC-1 sample |
| No rollback docs | Full rollback section added |
| call_agent/extractor variable binding not enforced | Explicit validation rule added |

---

## 2. Tool Inventory

### 2.1 AgentStack MCP
| Tool | Step | Purpose |
|------|------|---------|
| `as_list_agents` | 1B | Resolve downstream agent name → ID |
| `as_create_agent` | 4 | Create agent with name, model, stub system_prompt |
| `as_inspect_flow` | 5, 5-verify | Read flow before and after update |
| `as_update_flow` | 5 | Write complete nodes + edges in one call |
| `as_patch_node_field` | 7 | Bind real KB ID to kb_search node |
| `as_list_knowledge_bases` | 7 | Get KB ID after user creates it via UI |
| `as_add_kb_text` | 7 | Seed 3 documents into KB |
| `as_get_kb_embedding_status` | 7 | Poll until ready |
| `as_chat_with_agent` | 8 | Smoke test with UC-1 sample |

### 2.2 Obsidian MCP
| Tool | Step | Purpose |
|------|------|---------|
| `obsidian_create_note` | 3, 6 | Write vault files |
| `obsidian_read_note` | 7 | Read vault files to seed into KB |

### 2.3 Other Tools
| Tool | Step | Purpose |
|------|------|---------|
| `AskUserQuestion` | 1 | Collect 3 structured choices from user |
| `TaskCreate` + `TaskUpdate` | 0 | Track scaffolding progress |

---

## 3. Spec Gathering Design (Revised)

### 3.1 Name Extraction (pre-AskUserQuestion)

Before calling AskUserQuestion, extract the agent name from the user's trigger message:
- "create a new agent called Price Monitor" → `agent_name = "Price Monitor"`
- "scaffold a Lead Enricher agent" → `agent_name = "Lead Enricher"`
- "napravi novog agenta za analizu trendova" → `agent_name = "Trend Analyzer"` (infer from description)
- "I want to build a new agent" → name unclear → ask: "What do you want to call this agent?"

If name is found: confirm it silently and proceed.
If name is NOT found: ask for it as a plain text question BEFORE the AskUserQuestion multi-question block.

Derive: `agent_slug` = name lowercased, spaces→hyphens, remove special chars.

### 3.2 AskUserQuestion — 3 Questions (Revised from 4)

All in a SINGLE call:

**Q1 — header="Pipeline Role"**
"How does `{agent_name}` connect to other agents?"
- Standalone — triggered by user, no A2A
- Receives input — downstream end, receives from upstream agent
- Sends output — upstream end, triggers a downstream agent after finishing
- Middle link — receives from one agent, triggers another

**Q2 — header="Model"**
"Which model should `{agent_name}` use?"
- claude-sonnet-4-6 → Balanced quality + speed (Recommended)
- claude-opus-4-6 → Best reasoning, highest cost
- claude-haiku-4-5-20251001 → Fast + cheap, good for simple tasks
- gpt-4.1-mini → Cost-optimized, use if GPT ecosystem required

**Q3 — header="Web Search"**
"Does `{agent_name}` need to search the web for live data?"
- No — works from KB memory only (most agents)
- Yes — needs real-time web search (research/trend agents)

Domain is NOT a separate question — derive it from the agent name and description the user gave in the trigger message. This is more accurate than a 4-choice dropdown.

### 3.3 Conditional STEP 1B — Downstream Agent Resolution

Triggered ONLY if Q1 = "Sends output" or "Middle link".

Ask (plain text or AskUserQuestion Q4):
"What is the downstream agent that `{agent_name}` will trigger?"
Options: [list from `as_list_agents` result] or "Other" → free text

Then call `as_list_agents` with search={input} to get the exact `agentId`.
Store as `downstream_agent_id`.

If the downstream agent doesn't exist yet: note this in the plan and build the `call_agent` node with `agentId: "TODO:{downstream_name}"`. Document in scaffold report.

---

## 4. Execution Steps (v2)

### STEP 0 — Task List
Create 9 tasks (one per remaining step). Mark each in_progress before starting it.

### STEP 1 — Extract Name + Collect Spec

Extract name from trigger. Call AskUserQuestion with Q1/Q2/Q3.

Derive after answers:
```
agent_name     = extracted name (proper case)
agent_slug     = agent_name.lower().replace(" ", "-")
model_id       = Q2 answer
has_web_search = Q3 answer (Yes/No)
pipeline_role  = Q1 answer
vault_path     = agents/{agent_slug}
agent_type     = infer from name + domain (content / research / pipeline / general)
temperature    = (see table in Section 5.2)
```

### STEP 1B — [Conditional] Resolve Downstream Agent

If pipeline_role = "Sends output" OR "Middle link":
- Ask for downstream agent name
- Call `as_list_agents` with search to find it
- Store `downstream_agent_id`

### STEP 2 — Generate System Prompt

Generate BOTH prompts before writing any files. This ensures output keys are known before DESIGN_SPEC is written.

**Processor Prompt** — 6 sections, Anthropic pattern:

```
You are {agent_name}, a specialized AI agent.
Today's date is {{current_date}}.

## Role
{2–3 sentences: purpose, scope, value this agent provides}
{If A2A: "Pipeline position: {upstream_or_trigger} → YOU → {downstream_or_final}"}

## Memory
{{kb_context}}
These are your learned patterns, past run history, and quality rules. Apply them.
If this is empty: proceed with default behavior and note the absence in your output.

## Input Contract
{If standalone:}
You receive a free-form user message: {{user_message}}

{If A2A — receiving from upstream:}
You receive a structured payload. Detection: look for "{FIRST_KEY}:" in {{user_message}}.
If "{FIRST_KEY}:" is NOT found → output: FORMAT_ERROR: Expected {FIRST_KEY} not found.

Expected payload structure:
{KEY}: {description}
{KEY}: {description}
(list ALL expected keys)

## Processing Instructions
1. {Concrete step 1 — domain-specific}
2. {Concrete step 2}
3. {Concrete step 3}
{If web_search: 2. Search the web for current information about {topic}}
4. Apply quality gate:
   - ✓ {Specific rule 1}
   - ✓ {Specific rule 2}
   - If any check fails → QUALITY_GATE_FAIL: {describe failure}
5. Format output per Output Contract.

## Output Contract
Output ONLY these KEY:VALUE pairs. Plain text. No preamble. No markdown.

{OUTPUT_KEY_1}: {description}
{OUTPUT_KEY_2}: {description}
{OUTPUT_KEY_3}: {description}
CONFIDENCE: ⭐ OR ⭐⭐ OR ⭐⭐⭐
DATE: {{current_date}}

## Failure Modes
FORMAT_ERROR: input missing expected keys → pass error through unchanged
QUALITY_GATE_FAIL: output violates quality rules → describe violation
GENERATION_ERROR: output is empty or null → pass error code
```

**Extractor Prompt** — minimal Haiku:
```
You are an output extractor. Extract KEY:VALUE pairs from the agent response below.
Return them VERBATIM. Do not reformat, summarize, or modify any pair.
Pass FORMAT_ERROR, QUALITY_GATE_FAIL, and GENERATION_ERROR codes through unchanged.

Agent response:
{{agent_response}}
```

Store both prompts in memory. They will be used in STEP 5.

### STEP 3 — Write DESIGN_SPEC.md

Now that output keys are known (from STEP 2), write DESIGN_SPEC.md to `agents/{agent_slug}/DESIGN_SPEC.md`:

```markdown
# {agent_name} — Design Spec
*Created: {today_date} | Version: 1.0 | Agent Slug: {agent_slug}*

---

## Purpose
{Paragraph 1: What this agent does — its specific function}
{Paragraph 2: Where it sits in the pipeline and what problem it solves}
{Paragraph 3: What makes its output useful — who or what receives it}

## Pipeline Position
- **Receives from:** {upstream agent name OR "User trigger"}
- **Sends to:** {downstream agent name OR "Final output — no handoff"}
- **A2A payload format:** KEY:VALUE plain text (FORMAT C)
- **Detection key:** {FIRST_KEY}

## Use Cases

### UC-1: Standard run — good input
**Input:** `{FIRST_KEY}: {realistic example value}`
**Expected output:** `{OUTPUT_KEY_1}: {realistic output} | CONFIDENCE: ⭐⭐⭐`

### UC-2: Error case — bad/missing input
**Input:** `{unstructured message or missing key}`
**Expected output:** `FORMAT_ERROR: Expected {FIRST_KEY} not found`

### UC-3: Edge case — valid input, borderline output quality
**Input:** `{FIRST_KEY}: {weak or ambiguous value}`
**Expected output:** `{OUTPUT_KEY_1}: {minimal output} | CONFIDENCE: ⭐`
*Note: Low confidence signals the evo-log-writer to flag for instincts review.*

## Tools & Resources
| Tool | Purpose | Notes |
|------|---------|-------|
| kb_search | Recall instincts + evo-log at runtime | KB created via AgentStack UI |
| ai_response (processor) | Core reasoning + generation | Model: {model_id} |
| ai_response (extractor) | Normalize to KEY:VALUE | Model: claude-haiku-4-5-20251001 |
{If web_search:}
| web_search | Live data retrieval | Required for real-time input |
{If call_agent:}
| call_agent | A2A trigger to {downstream_name} | Target ID: {downstream_agent_id} |

## Constraints & Safety Rules
- NEVER fabricate statistics, metrics, or data not present in the input or web results
- NEVER pass malformed output to downstream — use error codes
- NEVER use: "change the game", "revolutionize", "groundbreaking", "game-changer"
- If input format is not detected → FORMAT_ERROR immediately, do not guess
- Quality gate must pass before call_agent fires
- {Domain rule 1 — generated from agent purpose}
- {Domain rule 2}

## Input Contract
Detection: `{FIRST_KEY}:` present in message
Full expected payload:
{List all expected INPUT_KEY: description pairs}

## Output Contract
{List all OUTPUT_KEY: description pairs from the generated system prompt}
CONFIDENCE: ⭐ (single source/weak) | ⭐⭐ (credible, limited data) | ⭐⭐⭐ (strong signal, multiple sources)
DATE: YYYY-MM-DD
```

Use `obsidian_create_note` to write this file.

### STEP 4 — Create Agent in AgentStack

```json
as_create_agent({
  "name": "{agent_name}",
  "description": "{1-sentence purpose — derived from DESIGN_SPEC Purpose paragraph 1}",
  "model": "{model_id}",
  "system_prompt": "You are {agent_name}. Your instructions are in your flow nodes. Await input."
})
```

**Critical:** Always explicitly set `model` — never rely on the default (gpt-4.1-mini).

Store `agentId` and `publicUrl` from response.

Verify with `as_get_agent` — check `model` matches what was specified.

If `as_create_agent` fails with name conflict: call `as_list_agents` search={agent_name}, ask user: "Agent '{name}' already exists (ID: {id}). Overwrite flow, or use a different name?"

### STEP 5 — Build Flow + Verify

**5a. Determine node set:**

| Pipeline Role | Nodes |
|--------------|-------|
| Standalone, Receives only | 1(kb_search) + [2(web_search)] + 3(processor) + 4(extractor) |
| Sends only, Middle link | 1 + [2] + 3 + 4 + 5(call_agent) |

(Node 2 = web_search only if Q3 = Yes)

**5b. Build node array:**

```json
Node 1 — kb_search (always first):
{
  "id": "kb_search-{agent_slug}-memory",
  "type": "kb_search",
  "data": {
    "topK": 5,
    "label": "{agent_name} Memory",
    "queryVariable": "user_message",
    "knowledgeBaseId": "PENDING_KB_CREATION"
  },
  "position": {"x": 200, "y": 50}
}

[Node 2 — web_search — ONLY if Q3=Yes]:
{
  "id": "web_search-{agent_slug}-live",
  "type": "web_search",
  "data": {
    "label": "Live Web Search",
    "queryVariable": "user_message",
    "outputVariable": "search_results"
  },
  "position": {"x": 200, "y": 150}
}

Node 3 — ai_response processor:
{
  "id": "ai_response-{agent_slug}-processor",
  "type": "ai_response",
  "data": {
    "label": "{agent_name} Processor",
    "model": "{model_id}",
    "prompt": "{PROCESSOR_PROMPT from STEP 2}",
    "outputVariable": "agent_response",
    "temperature": {temperature from Section 5.2}
  },
  "position": {"x": 200, "y": 250}
}

Node 4 — ai_response extractor:
{
  "id": "ai_response-{agent_slug}-extractor",
  "type": "ai_response",
  "data": {
    "label": "Output Extractor",
    "model": "claude-haiku-4-5-20251001",
    "prompt": "{EXTRACTOR_PROMPT from STEP 2}",
    "outputVariable": "structured_output",
    "temperature": 0.1
  },
  "position": {"x": 200, "y": 400}
}

[Node 5 — call_agent — ONLY if pipeline agent]:
{
  "id": "call_agent-{agent_slug}-handoff",
  "type": "call_agent",
  "data": {
    "label": "Handoff to {downstream_name}",
    "agentId": "{downstream_agent_id OR 'TODO:downstream_name'}",
    "inputVariable": "structured_output"   ← MUST match extractor outputVariable
  },
  "position": {"x": 200, "y": 550}
}
```

**BINDING RULE:** `call_agent.inputVariable` MUST equal `extractor.outputVariable`. Both = `"structured_output"`. This is non-negotiable — changing either without changing the other silently breaks A2A.

**5c. Build edge array:**

Base edges (always):
```json
[
  {"id": "e-memory-processor", "source": "kb_search-{slug}-memory", "target": "ai_response-{slug}-processor"},
  {"id": "e-processor-extractor", "source": "ai_response-{slug}-processor", "target": "ai_response-{slug}-extractor"}
]
```

If web_search node exists:
```json
[
  {"id": "e-memory-processor", "source": "kb_search-{slug}-memory", "target": "web_search-{slug}-live"},
  {"id": "e-search-processor", "source": "web_search-{slug}-live", "target": "ai_response-{slug}-processor"},
  {"id": "e-processor-extractor", "source": "ai_response-{slug}-processor", "target": "ai_response-{slug}-extractor"}
]
```

If call_agent node exists:
```json
  {"id": "e-extractor-handoff", "source": "ai_response-{slug}-extractor", "target": "call_agent-{slug}-handoff"}
```

**5d. Call `as_update_flow`** with both arrays.

**5e. VERIFY — always:**
Immediately call `as_inspect_flow`. Check:
- [ ] Node count matches expected
- [ ] `kb_search-{slug}-memory` node exists
- [ ] `ai_response-{slug}-processor` and `-extractor` exist
- [ ] Edge count matches expected
- [ ] If call_agent: it exists and `agentId` is set

If any check fails → stop, report what's wrong, do NOT continue to KB/vault steps.

### STEP 6 — Initialize Vault Files

Create 3 files: agent-card.md, instincts.md, evo-log.md.

**agent-card.md** (`agents/{agent_slug}/agent-card.md`):
```markdown
# {agent_name} — Agent Card
*Created: {today_date} | Format: AgentStack A2A Reference*

## Identity
- **Agent Name:** {agent_name}
- **Agent ID:** {agentId}
- **Public URL:** {publicUrl}
- **Model:** {model_id}
- **Slug:** {agent_slug}

## Knowledge Base
- **KB ID:** PENDING_KB_CREATION  ← Updated in STEP 7
- **KB Documents:** instincts, evo-log, DESIGN_SPEC
- **topK:** 5 (increase to 15 after 20+ evo-log entries)

## Pipeline
- **Receives from:** {upstream OR "User trigger"}
- **Sends to:** {downstream OR "Final output"}
- **Downstream Agent ID:** {downstream_agent_id OR "N/A"}

## Input Contract
- **Detection key:** {FIRST_KEY}
- **Full payload:** See DESIGN_SPEC.md → Input Contract

## Output Contract
{List OUTPUT_KEY fields}
- **CONFIDENCE:** ⭐ / ⭐⭐ / ⭐⭐⭐
- **DATE:** YYYY-MM-DD

## How to Connect This Agent to Another
To wire a new upstream agent to trigger this one, use:
```
as_patch_node_field(
  agent_name="{upstream_agent_name}",
  node_id="call_agent-{upstream_slug}-handoff",
  field_name="agentId",
  field_value="{agentId}"
)
```
```

**instincts.md** (`agents/{agent_slug}/instincts.md`) — with DOMAIN-SPECIFIC STARTER CONTENT:

```markdown
# {agent_name} — Instincts
*Path: /agents/{agent_slug}/instincts*
*Last updated: {today_date}*

---

## Learned Patterns

### Quality Gate Rules
- NEVER fabricate data not present in input or search results
- NEVER output partial KEY:VALUE (all keys must be present or use error code)
- Banned phrases: "change the game", "revolutionize", "groundbreaking", "game-changer"
- If CONFIDENCE ⭐ → include a note in the summary about why confidence is low

### Input Validation
- Detection key: `{FIRST_KEY}:`
- If detection fails → FORMAT_ERROR immediately, do not attempt to parse anyway
- If a secondary key is missing but FIRST_KEY is present → still process, treat missing as empty

### Output Format Rules
- All outputs: KEY:VALUE, one per line, no markdown, no preamble
- CONFIDENCE uses stars: ⭐ ⭐⭐ ⭐⭐⭐ — never text like "high" or "low"
- DATE format: YYYY-MM-DD — always use {{current_date}} variable

{DOMAIN STARTER BLOCK — generated based on agent type:}

[For RESEARCH / TREND agents:]
### Signal Quality Rules
- Signals with version numbers outperform vague category signals
- Official source + measurable metric + reaction data = ⭐⭐⭐
- Single source, no reactions, or content older than 48h = ⭐
- NEVER report "X is transforming Y industry" — too vague, downstream will reject

[For CONTENT CREATION agents:]
### Content Quality Rules
- Hook must contain: specific number OR named tool/person OR direct challenge
- No passive voice in output lines 1–2
- Each generated variation must use a different rhetorical pattern
- If all variations feel similar → regenerate with explicit diversity constraint

[For PIPELINE MIDDLEWARE agents:]
### Transformation Rules
- Never drop keys from input payload — pass unmodified keys through if not transforming them
- Only transform the keys your Output Contract defines — do not invent new keys
- If a key value is unusable → transform to empty string, do not omit the key

[For GENERAL PURPOSE agents:]
### General Quality Rules
- Prefer specificity over generality in all output fields
- When uncertain about a value → use lowest confidence score, do not omit
- Never guess at data you don't have — use error codes instead

---

### Common Mistakes to Avoid
- (Add after first runs — use evo-log-writer skill)

### Quality Gate Failures
- (Add after first failed runs — use evo-log-writer skill)
```

**evo-log.md** (`agents/{agent_slug}/evo-log.md`):
```markdown
# {agent_name} — Evolution Log
*Path: /agents/{agent_slug}/evo-log*

---

## Log Format
Each entry appended after a run:
```
date | {primary_output_key} | confidence | summary | downstream_triggered
```

---

## Entries

*No entries yet. Agent created {today_date}.*
```

Use `obsidian_create_note` for all 3 files.

### STEP 7 — KB Seeding + Node Patching

**7a. Prompt user (manual UI step):**
> "One manual step required: Open AgentStack UI → find **{agent_name}** → click **Knowledge Base** → create a new KB for this agent. Once done, come back and confirm."

**7b. Wait for confirmation.**

**7c. Get KB ID:**
Call `as_list_knowledge_bases(agent_name="{agent_name}")`.
Extract `id` from the KB object. Store as `kb_id`.

**7d. Seed 3 documents** (read from vault first):
```
obsidian_read_note("agents/{agent_slug}/DESIGN_SPEC.md")
obsidian_read_note("agents/{agent_slug}/instincts.md")
obsidian_read_note("agents/{agent_slug}/evo-log.md")

as_add_kb_text(kb_id, DESIGN_SPEC content, title="DESIGN_SPEC")
as_add_kb_text(kb_id, instincts content, title="instincts")
as_add_kb_text(kb_id, evo-log content, title="evo-log")
```

**7e. Patch kb_search node with real KB ID:**
```
as_patch_node_field(
  agent_name="{agent_name}",
  node_id="kb_search-{agent_slug}-memory",
  field_name="knowledgeBaseId",
  field_value="{kb_id}"
)
```

**7f. Update agent-card.md** with real KB ID:
```
obsidian_update_note("agents/{agent_slug}/agent-card.md")
  → replace "PENDING_KB_CREATION" with "{kb_id}"
```

**7g. Poll embedding status:**
Call `as_get_kb_embedding_status(kb_id)` repeatedly.
- `"ready"` → continue
- `"processing"` → wait 20s, retry (max 5 attempts)
- `"failed"` → report failure, offer to re-seed (re-run 7d)

### STEP 8 — Smoke Test

**8a. Get UC-1 input from DESIGN_SPEC.**
The UC-1 input field contains a realistic sample. Use it as the test message.

**8b. Call `as_chat_with_agent`:**
```
as_chat_with_agent(
  agent_name="{agent_name}",
  message="{UC-1 input from DESIGN_SPEC}"
)
```

**8c. Validate response:**
- [ ] Response is not empty
- [ ] `FORMAT_ERROR` is NOT present (unless UC-1 was intentionally an error case)
- [ ] All output keys from Output Contract are present in response
- [ ] `CONFIDENCE:` is present with a star value
- [ ] `DATE:` is present

**8d. If test PASSES:** Proceed to STEP 9.

**8e. If test FAILS:** Report which check failed, show raw response, list likely causes:
- Missing KB (kb_search returned empty) → verify KB ID and embedding status
- Wrong prompt (system prompt wasn't saved) → inspect flow with `as_inspect_flow`
- Format error → check processor prompt Output Contract section

Do NOT mark scaffold as complete if smoke test fails without user explicitly overriding.

### STEP 9 — Scaffold Report

Output structured summary:

```
✅ SCAFFOLD COMPLETE: {agent_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTSTACK
  Agent ID  : {agentId}
  Model     : {model_id}
  Flow nodes: {node_count}
  Flow edges: {edge_count}
  KB ID     : {kb_id}
  KB status : ready ({doc_count} documents)
  Smoke test: ✅ PASSED

VAULT  (agents/{agent_slug}/)
  DESIGN_SPEC.md   ✅
  agent-card.md    ✅ (contains ID reference for future A2A wiring)
  instincts.md     ✅ (domain starter content pre-loaded)
  evo-log.md       ✅

PIPELINE
  Receives from : {upstream OR "User trigger"}
  Sends to      : {downstream OR "Final output"}
  {If TODO downstream: ⚠️ Downstream agent ID is TODO — wire manually when downstream is created}

VARIABLE BINDING
  extractor outputVariable  : structured_output
  call_agent inputVariable  : structured_output
  → MATCH ✅

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS
  1. Run a real test trigger via AgentStack UI
  2. After first run → use evo-log-writer skill to log the result
  3. After 3+ runs → instincts.md will have enough real data to improve accuracy
  4. Increase topK to 15 once evo-log exceeds 20 entries
     → as_patch_node_field(node_id="kb_search-{slug}-memory", field_name="topK", field_value="15")
```

---

## 5. Reference Tables

### 5.1 Node ID Naming Convention

| Node Type | ID Pattern | Example |
|-----------|-----------|---------|
| kb_search | `kb_search-{slug}-memory` | `kb_search-price-monitor-memory` |
| web_search | `web_search-{slug}-live` | `web_search-trend-scout-live` |
| processor | `ai_response-{slug}-processor` | `ai_response-price-monitor-processor` |
| extractor | `ai_response-{slug}-extractor` | `ai_response-price-monitor-extractor` |
| call_agent | `call_agent-{slug}-handoff` | `call_agent-price-monitor-handoff` |

### 5.2 Temperature by Agent Type

| Agent Type | Temperature | Rationale |
|-----------|-------------|-----------|
| Research / Trend detection | 0.3 | Needs consistency; creativity adds noise |
| Classification / Scoring | 0.1 | Deterministic scoring; randomness = wrong scores |
| Content creation / Hook writing | 0.8 | Needs variation; same temp = same hooks |
| Pipeline middleware / Transformation | 0.4 | Predictable transformation, slight flex |
| General purpose | 0.6 | Balanced default |

Infer type from agent name + Q3 (web search):
- Has web_search + "intelligence/scout/research/monitor" in name → Research (0.3)
- "score/rank/rate/classify/analyze" in name → Classification (0.1)
- "writer/creator/generator/composer/hook" in name → Content (0.8)
- "transform/convert/extract/parse/format" in name → Middleware (0.4)
- Everything else → General (0.6)

### 5.3 Rollback Procedures

| Failure Point | State | Recovery |
|--------------|-------|---------|
| Before STEP 4 | Nothing in AgentStack | Retry from STEP 1 |
| After STEP 4, before STEP 5 | Agent exists, empty flow | Resume at STEP 5 using stored `agentId` |
| After STEP 5, before STEP 6 | Agent + flow exist, no vault | Resume at STEP 6 |
| After STEP 6, before STEP 7 | Agent + flow + vault exist, no KB | Resume at STEP 7 |
| STEP 7 fails mid-seed | KB exists, partial docs | Re-add missing docs; don't delete KB |
| STEP 8 smoke test fails | Everything built, agent broken | Debug: check prompt + KB; do NOT delete |

---

## 6. Validation Checklist (v2)

After scaffold, ALL of these must be true:

**AgentStack:**
- [ ] `as_list_agents` shows agent with correct name
- [ ] `as_get_agent` returns correct model (not the gpt-4.1-mini default)
- [ ] `as_inspect_flow` returns: kb_search + processor + extractor nodes (+ optional web_search + call_agent)
- [ ] Edge count matches node count - 1 (linear chain)
- [ ] `kb_search` node has real KB ID (not "PENDING_KB_CREATION")
- [ ] `extractor.outputVariable` = `call_agent.inputVariable` = `"structured_output"` (if call_agent exists)
- [ ] KB `embeddingStatus: "ready"` with 3 documents

**Vault:**
- [ ] `agents/{slug}/DESIGN_SPEC.md` exists
- [ ] `agents/{slug}/agent-card.md` exists with real agentId + KB ID
- [ ] `agents/{slug}/instincts.md` exists with domain starter content
- [ ] `agents/{slug}/evo-log.md` exists

**Smoke Test:**
- [ ] `as_chat_with_agent` with UC-1 input returns structured output
- [ ] All output keys from Output Contract are present
- [ ] `CONFIDENCE:` and `DATE:` present in response
- [ ] No FORMAT_ERROR or QUALITY_GATE_FAIL for valid UC-1 input

---

## 7. Vault File Structure After Scaffold

```
agents/
└── {agent_slug}/
    ├── DESIGN_SPEC.md    ← Purpose, use cases, I/O contract, constraints
    ├── agent-card.md     ← agentId, KB ID, pipeline wiring reference
    ├── instincts.md      ← Domain starter content + accumulated learning
    └── evo-log.md        ← Run history (empty at scaffold, grows over time)
```

KB contents (3 documents):
1. `DESIGN_SPEC` — agent's own spec; provides quality gate rules at runtime
2. `instincts` — learned patterns; primary source of domain knowledge
3. `evo-log` — run history; provides trend/pattern calibration

---

*Supersedes: IMPLEMENTATION_PLAN.md*
*Analysis that drove changes: CRITICAL_ANALYSIS.md*
