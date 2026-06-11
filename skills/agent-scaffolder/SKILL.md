---
name: agent-scaffolder
description: >
  Fully scaffolds a new AgentStack agent from spec to live deployment using SOMA-standard
  architecture. Automates: agent creation, standard flow building (kb_search → processor →
  extractor → optional web_search and call_agent nodes), Obsidian vault initialization
  (DESIGN_SPEC.md, agent-card.md, instincts.md, evo-log.md), KB seeding with 3 documents,
  and smoke testing. Use for: quick throwaway prototype agent (no deterministic gate); for
  production use safe-agent-builder. Do NOT use for modifying existing agents (use
  as_patch_node_field directly) or debugging flows.
---

> ⚠️ **DEPRECATED za produkcijske agente.** Ovaj skil gradi prompt-level quality gate
> (model emituje QUALITY_GATE_FAIL), koji LLM ignoriše kad „hoće da pomogne" — isti failure
> mode koji je dozvolio agentu da izmisli trend i prođe sve prompt provere. Za produkcijske ili
> safety-osetljive agente koristi **safe-agent-builder** (deterministički function-validator +
> condition-gate koji kodom forsira PASS/BLOCK). Ovaj skil koristi samo za jednokratne prototipove.

# Skill: agent-scaffolder
*Version: 2.0 | Based on: IMPLEMENTATION_PLAN_V2.md*

## Trigger
Use this skill when the user wants to:
- "create a new agent", "scaffold an agent", "napravi novog agenta"
- "add agent to pipeline", "dodaj agenta u pipeline"
- "set up new AgentStack agent", "build a new agent from scratch"
- "I want a new agent that does X"

For modifying an existing agent's flow or prompts: describe what needs changing and use `as_patch_node_field` or `as_update_flow` directly.
For debugging a broken flow: use the flow-debugger skill (when available).
For syncing KB documents: use the kb-sync skill (when available).

---

## What This Skill Does

Fully scaffolds a new AgentStack agent using the SOMA-standard architecture:

1. Extracts agent name from trigger + collects 3 structured choices
2. Generates system prompts (processor + extractor) — output keys defined HERE first
3. Writes DESIGN_SPEC.md using real output keys
4. Creates agent in AgentStack
5. Builds standard flow: kb_search → [web_search?] → processor → extractor → [call_agent?]
6. Verifies flow was written correctly
7. Creates vault files: agent-card.md + instincts.md + evo-log.md
8. Seeds KB with 3 documents + patches kb_search node with real KB ID
9. Runs smoke test with UC-1 sample
10. Reports scaffold summary

---

## STEP 0 — Task List

Before anything else, call TaskCreate for each remaining step:
- "Extract agent name and collect spec"
- "Generate processor and extractor prompts"
- "Write DESIGN_SPEC.md to vault"
- "Create agent in AgentStack"
- "Build and verify flow"
- "Write vault files (agent-card, instincts, evo-log)"
- "Seed KB and patch kb_search node"
- "Run smoke test"
- "Deliver scaffold report"

Mark each task in_progress before starting it. Mark completed when done.

---

## STEP 1 — Extract Name + Collect Spec

### 1a. Extract agent name from the user's message

Look for patterns like:
- "create a new agent called X" → name = X
- "scaffold a X agent" → name = X
- "napravi agenta za X" → name = X (translate/infer)

If name is NOT clear: ask in plain text: "What do you want to call this agent?"

Derive `agent_slug` = name lowercased, spaces replaced with hyphens, no special characters.
Example: "Price Monitor" → `price-monitor`

### 1b. AskUserQuestion — 3 questions in ONE call

**Q1 — header="Pipeline Role"**
Question: "How does `{agent_name}` connect to other agents?"
Options:
- Standalone — triggered by user, no A2A connections (description: "Not connected to other agents")
- Receives input — gets input from an upstream agent (description: "Downstream end of a chain")
- Sends output — triggers a downstream agent when done (description: "Upstream end of a chain")
- Middle link — receives from one agent and triggers another (description: "Middle link in A2A chain")

**Q2 — header="Model"**
Question: "Which model should `{agent_name}` use?"
Options:
- claude-sonnet-4-6 (description: "Balanced quality + speed — best for most agents (Recommended)")
- claude-opus-4-6 (description: "Best reasoning, highest cost — for complex multi-step work")
- claude-haiku-4-5-20251001 (description: "Fastest and cheapest — good for simple extraction or classification")
- gpt-4.1-mini (description: "Cost-optimized OpenAI model — use if GPT ecosystem required")

**Q3 — header="Web Search"**
Question: "Does `{agent_name}` need to search the web for live data?"
Options:
- No — works from KB memory and input payload only (description: "Most agents — no web access needed")
- Yes — needs real-time web search (description: "Research, trend, or monitoring agents")

After answers, compute:
```
model_id       = Q2 answer string
has_web_search = Q3 = "Yes"
pipeline_role  = Q1 answer
```

Infer agent type from name for temperature:
| Pattern in name | Type | Temperature |
|----------------|------|-------------|
| intelligence / scout / research / monitor + Q3=Yes | Research | 0.3 |
| score / rank / rate / classify / analyze | Classifier | 0.1 |
| writer / creator / hook / composer / generator | Content | 0.8 |
| transform / convert / extract / parse / format / repurpose | Middleware | 0.4 |
| anything else | General | 0.6 |

### 1c. Conditional — resolve downstream agent

**Only if Q1 = "Sends output" OR "Middle link":**

Ask: "Which existing agent will `{agent_name}` trigger?" Then call `as_list_agents` to find matches. Store `downstream_agent_id`.

If downstream agent doesn't exist yet: set `downstream_agent_id = "TODO:{downstream_name}"` and note this in the final report.

---

## STEP 2 — Generate System Prompts

Generate BOTH prompts now, before any files are written. Output keys must be known before DESIGN_SPEC can be completed.

### Processor Prompt

Decide the OUTPUT KEYS for this agent based on:
- What the downstream agent needs (if pipeline)
- What domain the agent operates in (inferred from name)
- Standard pattern: always include CONFIDENCE and DATE at the end

For a **research/trend agent**: TREND, CONFIDENCE_REASON, ANGLE, SOURCES_CHECKED
For a **content agent**: primary content key (e.g., HOOK), platform-specific variants, SCORE
For a **middleware agent**: transform the upstream keys into downstream keys
For a **standalone agent**: whatever makes sense for the purpose

Generate the processor prompt using the 6-section Anthropic structure:

```
You are {agent_name}, a specialized AI agent.
Today's date is {{current_date}}.

## Role
{2–3 sentences: specific purpose, what domain, what value this produces}
{If A2A: "Pipeline position: {upstream OR 'User'} → YOU → {downstream OR 'Final output'}"}

## Memory
{{kb_context}}
These are your learned patterns, past run history, and quality rules. Apply them.
If this context is empty: proceed with default behavior and note the absence.

## Input Contract
{If standalone:}
You receive a free-form message from the user: {{user_message}}

{If A2A receiving from upstream:}
You receive a structured payload. Detection: look for "{FIRST_KEY}:" in {{user_message}}.
If "{FIRST_KEY}:" is NOT found → immediately output: FORMAT_ERROR: Expected {FIRST_KEY} not found.

Expected payload:
{EXPECTED_KEY_1}: {what this contains}
{EXPECTED_KEY_2}: {what this contains}
(list all expected keys based on upstream output contract)

## Processing Instructions
1. {First concrete action — domain-specific}
2. {Second action}
3. {Third action — if research: search for data; if content: generate N variations}
4. Apply quality gate:
   - ✓ No fabricated data: all stats/metrics must come from input or web results
   - ✓ No banned phrases: "change the game", "revolutionize", "groundbreaking", "game-changer"
   - ✓ {Domain-specific rule 1}
   - ✓ {Domain-specific rule 2}
   If any check fails → QUALITY_GATE_FAIL: {describe what failed and why}
5. Format output exactly per Output Contract.

## Output Contract
Output ONLY these KEY:VALUE pairs. Plain text. No preamble. No markdown. No code blocks.

{OUTPUT_KEY_1}: {what to put here}
{OUTPUT_KEY_2}: {what to put here}
{...more keys...}
CONFIDENCE: ⭐ (weak/single source) OR ⭐⭐ (credible, limited) OR ⭐⭐⭐ (strong, multiple sources)
DATE: {{current_date}}

## Failure Modes
FORMAT_ERROR: Input missing expected detection key → output the error code, stop
QUALITY_GATE_FAIL: Output violates quality rule → output code + describe violation
GENERATION_ERROR: Output is empty or null → output error code
```

### Extractor Prompt (fixed — same for all agents)

```
You are an output extractor. Your only job is to return KEY:VALUE pairs verbatim.

Rules:
- Extract KEY: VALUE lines from the agent response below
- Return them EXACTLY as written — do not reformat, summarize, reorder, or modify
- If the response contains FORMAT_ERROR, QUALITY_GATE_FAIL, or GENERATION_ERROR — pass it through unchanged
- Do not add any explanation or commentary

Agent response:
{{agent_response}}
```

Store both prompts in memory for use in STEP 5.

---

## STEP 3 — Write DESIGN_SPEC.md

Now that output keys exist, write the spec to vault:
Path: `agents/{agent_slug}/DESIGN_SPEC.md`

```markdown
# {agent_name} — Design Spec
*Created: {today_date} | Version: 1.0 | Slug: {agent_slug}*

---

## Purpose
{Paragraph 1: what this agent does — its specific function in the pipeline or standalone}
{Paragraph 2: why it exists — what problem it solves, why it can't be skipped}
{Paragraph 3: what makes its output valuable — who or what consumes it and why}

## Pipeline Position
- **Receives from:** {upstream agent name OR "User trigger"}
- **Sends to:** {downstream agent name OR "Final output — no handoff"}
- **A2A format:** KEY:VALUE plain text (FORMAT C)
- **Detection key:** {FIRST_KEY}

## Use Cases

### UC-1: Standard run — strong input
**Input:** `{FIRST_KEY}: {realistic example value with good data}`
**Expected output:**
```
{OUTPUT_KEY_1}: {realistic expected output}
CONFIDENCE: ⭐⭐⭐
DATE: {today_date}
```

### UC-2: Error case — missing or unstructured input
**Input:** `{a message without the detection key, or completely unstructured}`
**Expected output:** `FORMAT_ERROR: Expected {FIRST_KEY} not found`

### UC-3: Edge case — valid input, borderline quality
**Input:** `{FIRST_KEY}: {vague or ambiguous value}`
**Expected output:**
```
{OUTPUT_KEY_1}: {minimal but valid output}
CONFIDENCE: ⭐
DATE: {today_date}
```
*Low confidence triggers review in evo-log — correct behavior.*

## Tools & Resources
| Tool | Purpose | Notes |
|------|---------|-------|
| kb_search | Memory recall at runtime | KB created via UI; topK=5 (increase to 15 after 20+ evo-log entries) |
| ai_response (processor) | Core reasoning + generation | Model: {model_id}, temp: {temperature} |
| ai_response (extractor) | Normalize to KEY:VALUE | Model: gpt-4.1-mini (default; use claude-haiku-4-5-20251001 only if ANTHROPIC_API_KEY confirmed set), temp: 0.1 |
{If has_web_search: "| web_search | Live web data retrieval | Required for real-time input |"}
{If has_downstream: "| call_agent | A2A trigger to {downstream_name} | agentId: {downstream_agent_id} |"}

## Constraints & Safety Rules
- NEVER fabricate statistics, metrics, or data not present in input or web results
- NEVER pass malformed output to downstream — use error codes
- NEVER use: "change the game", "revolutionize", "groundbreaking", "game-changer"
- If input detection fails → FORMAT_ERROR immediately, do not guess
- Quality gate must pass before call_agent fires
- {Domain-specific constraint 1 based on agent purpose}
- {Domain-specific constraint 2}

## Input Contract
Detection signal: `{FIRST_KEY}:` present in message.
Full expected payload:
- `{INPUT_KEY_1}`: {description}
- `{INPUT_KEY_2}`: {description}
(all expected keys from the upstream agent's output contract)

## Output Contract
{List every OUTPUT_KEY with description, matching what was generated in STEP 2}
- `CONFIDENCE`: ⭐ weak | ⭐⭐ credible | ⭐⭐⭐ strong
- `DATE`: YYYY-MM-DD
```

Use `obsidian_create_note` to write this file.

---

## STEP 4 — Create Agent in AgentStack

```json
as_create_agent({
  "name": "{agent_name}",
  "description": "{1-sentence version of DESIGN_SPEC Purpose paragraph 1}",
  "model": "{model_id}",
  "system_prompt": "You are {agent_name}. Your detailed instructions are in your flow nodes. Await input."
})
```

⚠️ **Always explicitly set `model`** — the API default is `gpt-4.1-mini`. Never rely on it.

Store from response: `agentId`, `publicUrl`.

**Verify:** Call `as_get_agent(agent_name="{agent_name}")` and confirm:
- `model` = `{model_id}` (not gpt-4.1-mini)
- `name` = `{agent_name}`

If `as_create_agent` fails (name conflict): call `as_list_agents(search="{agent_name}")`, show result, ask user: "Agent '{name}' already exists (ID: {id}). Do you want to overwrite its flow, or use a different name?"

---

## STEP 5 — Build Flow + Verify

### 5a. Read current flow state

Call `as_inspect_flow(agent_name="{agent_name}")` first. Note current node/edge state.

### 5b. Build node array

**Node 1 — kb_search (always):**
```json
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
```

**[Node 2 — web_search — ONLY if Q3=Yes]:**
```json
{
  "id": "web_search-{agent_slug}-live",
  "type": "web_search",
  "data": {
    "label": "Live Web Search",
    "queryVariable": "user_message",
    "outputVariable": "search_results"
  },
  "position": {"x": 200, "y": 175}
}
```

**Node 3 — ai_response processor (always):**
```json
{
  "id": "ai_response-{agent_slug}-processor",
  "type": "ai_response",
  "data": {
    "label": "{agent_name} Processor",
    "model": "{model_id}",
    "prompt": "{PROCESSOR_PROMPT from STEP 2 — full text, no truncation}",
    "outputVariable": "agent_response",
    "temperature": {temperature from table}
  },
  "position": {"x": 200, "y": 300}
}
```

**Node 4 — ai_response extractor (always):**
```json
{
  "id": "ai_response-{agent_slug}-extractor",
  "type": "ai_response",
  "data": {
    "label": "Output Extractor",
    "model": "gpt-4.1-mini",
    "prompt": "{EXTRACTOR_PROMPT from STEP 2}",
    "outputVariable": "structured_output",
    "temperature": 0.1
  },
  "position": {"x": 200, "y": 450}
}
```

**[Node 5 — call_agent — ONLY if pipeline_role = Sends output OR Middle link]:**
```json
{
  "id": "call_agent-{agent_slug}-handoff",
  "type": "call_agent",
  "data": {
    "label": "Handoff to {downstream_name}",
    "agentId": "{downstream_agent_id}",
    "inputVariable": "structured_output"
  },
  "position": {"x": 200, "y": 600}
}
```

⚠️ **BINDING RULE:** `call_agent.inputVariable` MUST equal `extractor.outputVariable`. Both must be `"structured_output"`. Never change one without changing the other.

### 5c. Build edge array

**If NO web_search, NO call_agent:**
```json
[
  {"id": "e-memory-processor", "source": "kb_search-{slug}-memory", "target": "ai_response-{slug}-processor"},
  {"id": "e-processor-extractor", "source": "ai_response-{slug}-processor", "target": "ai_response-{slug}-extractor"}
]
```

**If web_search YES, NO call_agent:**
```json
[
  {"id": "e-memory-search", "source": "kb_search-{slug}-memory", "target": "web_search-{slug}-live"},
  {"id": "e-search-processor", "source": "web_search-{slug}-live", "target": "ai_response-{slug}-processor"},
  {"id": "e-processor-extractor", "source": "ai_response-{slug}-processor", "target": "ai_response-{slug}-extractor"}
]
```

**If call_agent YES (add to whichever edge set above):**
```json
  {"id": "e-extractor-handoff", "source": "ai_response-{slug}-extractor", "target": "call_agent-{slug}-handoff"}
```

### 5d. Write flow

Call `as_update_flow(agent_name="{agent_name}", nodes_json=..., edges_json=...)`.

### 5e. Verify — MANDATORY

Immediately call `as_inspect_flow(agent_name="{agent_name}")`. Confirm:
- [ ] `kb_search-{slug}-memory` node exists
- [ ] `ai_response-{slug}-processor` node exists
- [ ] `ai_response-{slug}-extractor` node exists
- [ ] If web_search: `web_search-{slug}-live` exists
- [ ] If call_agent: `call_agent-{slug}-handoff` exists
- [ ] Edge count = node count - 1 (linear chain)

If any check fails → STOP. Report exactly which node or edge is missing. Do not proceed to STEP 6.

---

## STEP 6 — Write Vault Files

Create 3 files using `obsidian_create_note`.

### agent-card.md — `agents/{agent_slug}/agent-card.md`
```markdown
# {agent_name} — Agent Card
*Created: {today_date}*

## Identity
- Agent Name : {agent_name}
- Agent ID   : {agentId}
- Public URL : {publicUrl}
- Model      : {model_id}
- Slug       : {agent_slug}

## Knowledge Base
- KB ID      : PENDING_KB_CREATION  ← Updated in STEP 7
- Documents  : DESIGN_SPEC, instincts, evo-log
- topK       : 5  (increase to 15 after 20+ evo-log entries)

## Pipeline
- Receives from       : {upstream OR "User trigger"}
- Sends to            : {downstream OR "Final output"}
- Downstream Agent ID : {downstream_agent_id OR "N/A"}

## Input
- Detection key : {FIRST_KEY}
- Full contract : See DESIGN_SPEC.md → Input Contract

## Output
{list output keys}
- CONFIDENCE, DATE

## How to Wire Another Agent to This One
```
as_patch_node_field(
  agent_name="{upstream_agent_name}",
  node_id="call_agent-{upstream_slug}-handoff",
  field_name="agentId",
  field_value="{agentId}"
)
```
```

### instincts.md — `agents/{agent_slug}/instincts.md`

Generate with DOMAIN-SPECIFIC STARTER CONTENT (do not leave blank):

```markdown
# {agent_name} — Instincts
*Path: /agents/{agent_slug}/instincts*
*Last updated: {today_date}*

---

## Quality Gate Rules
- NEVER fabricate data not present in input or search results
- NEVER output partial KEY:VALUE — all output keys must be present, or use error code
- Banned phrases: "change the game", "revolutionize", "groundbreaking", "game-changer"
- If CONFIDENCE is ⭐ → note the reason in your output summary

## Input Validation
- Detection key: `{FIRST_KEY}:`
- If detection fails → FORMAT_ERROR immediately, do not attempt to process anyway
- If secondary key is missing but FIRST_KEY is present → process, treat missing key as empty

## Output Format Rules
- All outputs: KEY:VALUE, one pair per line, plain text, no markdown, no preamble
- CONFIDENCE uses stars only: ⭐ ⭐⭐ ⭐⭐⭐ — never write "high" or "medium"
- DATE format: YYYY-MM-DD — use {{current_date}} variable, do not hardcode

---

{INJECT domain-specific starter block based on inferred agent type:}

[RESEARCH / TREND DETECTION AGENTS — use when has_web_search=Yes or "intelligence/monitor/scout" in name]
## Signal Quality Rules
- Signals with version numbers or specific benchmarks outperform vague category descriptions by 3x
- Official source + measurable metric + practitioner reaction = ⭐⭐⭐
- Single source, no reactions, or content older than 48h = ⭐
- NEVER report "X is transforming Y industry" — too generic, downstream will reject
- When 2+ signals compete: pick the most specific name (tool name > category name)
- Angle suggestion must tie to what developers/users can DO — not just what it IS

[CONTENT CREATION / HOOK WRITING AGENTS — use when "writer/creator/hook/composer" in name]
## Content Quality Rules
- Each generated piece must contain: specific number OR named tool/person OR direct challenge
- Avoid passive voice in the opening 2 lines of any piece
- Each variation must use a different rhetorical pattern — never repeat patterns in one run
- If all variations feel similar → regenerate with explicit diversity instruction
- Confidence ⭐⭐⭐ = hook passes pattern interrupt + specificity + platform fit

[CLASSIFICATION / SCORING AGENTS — use when "score/rank/rate/classify/analyze" in name]
## Scoring Rules
- Score must be derived from explicit criteria, not gut feel
- If scoring criteria are partially met → score the met percentage, do not round up
- Document which criteria drove the score in the output field
- Confidence ⭐⭐⭐ = all scoring criteria could be evaluated; ⭐ = criteria were missing

[PIPELINE MIDDLEWARE AGENTS — use when "transform/convert/extract/parse/repurpose" in name]
## Transformation Rules
- Never drop keys from the input payload — pass unmodified keys through if not transforming them
- Only transform keys defined in your Output Contract — do not invent new keys
- If a key value is unusable → transform to empty string, do not omit the key entirely
- Chain integrity: downstream agent depends on exact key names — never rename keys mid-chain

[GENERAL PURPOSE — fallback]
## General Quality Rules
- Prefer specificity over generality in all output fields
- When uncertain about a value → use ⭐ confidence, do not omit
- Never guess at data you don't have — use error codes instead

---

## Common Mistakes to Avoid
*(Add after first runs — use evo-log-writer skill)*

## Quality Gate Failures
*(Add after first failed runs — use evo-log-writer skill)*
```

### evo-log.md — `agents/{agent_slug}/evo-log.md`
```markdown
# {agent_name} — Evolution Log
*Path: /agents/{agent_slug}/evo-log*

---

## Log Format
```
date | {primary_output_key} | confidence | summary | downstream_triggered
```

---

## Entries

*No entries yet. Agent created {today_date}.*
```

---

## STEP 7 — KB Seeding + Node Patching

### 7a. Guide user to create KB (manual step)

Tell user:
> "One manual step needed: Open **AgentStack UI** → find **{agent_name}** → go to **Knowledge Base** tab → create a new KB. Once created, come back and confirm."

Wait for confirmation: "KB ready", "done", "napravio sam", or similar.

### 7b. Get KB ID

Call `as_list_knowledge_bases(agent_name="{agent_name}")`.
Extract `id` field from the returned KB object. Store as `kb_id`.

If returns empty: KB not created yet — re-send the UI instruction.

### 7c. Seed 3 documents

Read each file from vault first:
```
obsidian_read_note("agents/{agent_slug}/DESIGN_SPEC.md")
obsidian_read_note("agents/{agent_slug}/instincts.md")
obsidian_read_note("agents/{agent_slug}/evo-log.md")
```

Then seed:
```
as_add_kb_text(kb_id="{kb_id}", text="{DESIGN_SPEC content}", title="DESIGN_SPEC")
as_add_kb_text(kb_id="{kb_id}", text="{instincts content}", title="instincts")
as_add_kb_text(kb_id="{kb_id}", text="{evo-log content}", title="evo-log")
```

### 7d. Patch kb_search node

```
as_patch_node_field(
  agent_name="{agent_name}",
  node_id="kb_search-{agent_slug}-memory",
  field_name="knowledgeBaseId",
  field_value="{kb_id}"
)
```

### 7e. Update agent-card.md with real KB ID

Use `obsidian_update_note` to replace `PENDING_KB_CREATION` with `{kb_id}`.

### 7f. Poll embedding status

Call `as_get_kb_embedding_status(kb_id="{kb_id}")` every 20s, up to 5 times.
- `"ready"` → continue to STEP 8
- `"processing"` → wait and retry
- `"failed"` → report error, offer to re-seed (re-run 7c)

---

## STEP 8 — Smoke Test

### 8a. Get test input from DESIGN_SPEC UC-1

Read `agents/{agent_slug}/DESIGN_SPEC.md` and extract the UC-1 `**Input:**` value.

### 8b. Run test

```
as_chat_with_agent(
  agent_name="{agent_name}",
  message="{UC-1 input}"
)
```

### 8c. Validate response — check ALL of these:

- [ ] Response is not empty
- [ ] `FORMAT_ERROR` is NOT present
- [ ] All output keys from Output Contract are present in response
- [ ] `CONFIDENCE:` is present with a ⭐ value
- [ ] `DATE:` is present in YYYY-MM-DD format

### 8d. Pass → go to STEP 9.

### 8e. Fail → report what failed:

| Failure | Likely cause | How to fix |
|---------|-------------|-----------|
| "I couldn't generate a response" | Missing API key for a node model | Run `as_diagnose_models` — patch broken node model to one with a valid key |
| Empty response | Agent not responding | Check `as_get_agent` — agent may be paused |
| FORMAT_ERROR on valid input | Processor prompt detection key wrong | `as_inspect_flow` → check processor prompt |
| Missing output keys | Output Contract in prompt incomplete | `as_patch_node_field` → update processor prompt |
| `{{kb_context}}` empty | KB not embedded yet | Wait for embedding or re-seed |

Do NOT mark scaffold complete if smoke test fails unless user explicitly overrides.

---

## STEP 9 — Scaffold Report

```
✅ SCAFFOLD COMPLETE: {agent_name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENTSTACK
  Agent ID  : {agentId}
  Model     : {model_id}
  Flow      : {node_count} nodes, {edge_count} edges
  KB ID     : {kb_id}
  KB status : ready (3 documents: DESIGN_SPEC, instincts, evo-log)
  Smoke test: ✅ PASSED  (or ⚠️ SKIPPED if user overrode)

VAULT  [agents/{agent_slug}/]
  DESIGN_SPEC.md   ✅
  agent-card.md    ✅  ← Use this to wire other agents to/from {agent_name}
  instincts.md     ✅  ← Domain starter content loaded
  evo-log.md       ✅

PIPELINE
  Receives from : {upstream OR "User trigger"}
  Sends to      : {downstream OR "Final output"}
  {If TODO agent ID:}
  ⚠️  Downstream agent ID not resolved — wire it when {downstream_name} is created:
      as_patch_node_field(agent="{agent_name}", node="call_agent-{slug}-handoff", field="agentId", value="{id}")

VARIABLE BINDING (A2A integrity)
  extractor outputVariable : structured_output
  call_agent inputVariable : structured_output
  Status : ✅ MATCH

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT STEPS
  1. Run a real trigger via AgentStack UI
  2. After first run → evo-log-writer skill to log result
  3. After 3+ runs → instincts.md grows with real patterns
  4. When evo-log exceeds 20 entries, increase topK from 5 → 15:
     as_patch_node_field(node="kb_search-{slug}-memory", field="topK", value="15")
  5. Use kb-sync skill to keep KB documents updated after instincts.md changes
```

---

## Error Handling Reference

| Error | Step | Action |
|-------|------|--------|
| Name not found in trigger | 1 | Ask user in plain text before AskUserQuestion |
| Downstream agent not in list | 1B | Set `TODO:{name}`, document in report |
| `as_create_agent` name conflict | 4 | Ask user: overwrite flow OR rename |
| `as_get_agent` shows wrong model | 4 | `as_update_agent_model` to fix |
| `as_update_flow` fails | 5 | Inspect current flow, rebuild and retry |
| Flow verify fails (missing node/edge) | 5e | Stop, report exact mismatch, do not continue |
| `as_list_knowledge_bases` returns empty | 7b | KB not created — re-prompt manual UI step |
| Embedding status `"failed"` | 7f | Delete failed doc, re-add with `as_add_kb_text` |
| Smoke test fails | 8 | Report cause, fix, re-run test before reporting complete |
| Vault create fails (note exists) | 6 | Use `obsidian_update_note` instead — never silently overwrite |

---

## Rollback Guide

| Scaffold failed at... | What exists | Recovery |
|----------------------|-------------|---------|
| Before STEP 4 | Nothing in AgentStack | Retry from STEP 1 |
| STEP 4 succeeded, STEP 5 failed | Agent with empty flow | Use stored `agentId`, retry STEP 5 only |
| STEP 5 succeeded, STEP 6 failed | Agent + flow, no vault | Retry STEP 6 only |
| STEP 6 succeeded, STEP 7 failed | Agent + flow + vault, no KB | Retry STEP 7 only (KB docs are additive) |
| STEP 8 smoke test failed | Everything built, agent not working | Debug per STEP 8e failure table |

---

## Quality Bar (v2 — 14 checks)

**AgentStack:**
- [ ] `as_list_agents` shows agent with correct name
- [ ] `as_get_agent` shows correct model (not gpt-4.1-mini default)
- [ ] `as_inspect_flow` returns correct node count with correct IDs
- [ ] `kb_search` node has real KB ID (not "PENDING_KB_CREATION")
- [ ] If call_agent: `inputVariable` = `extractor outputVariable` = `"structured_output"`
- [ ] KB `embeddingStatus: "ready"` with exactly 3 documents

**Vault:**
- [ ] `agents/{slug}/DESIGN_SPEC.md` exists with all sections filled
- [ ] `agents/{slug}/agent-card.md` exists with real `agentId` + `kb_id`
- [ ] `agents/{slug}/instincts.md` exists with domain starter content (not just placeholders)
- [ ] `agents/{slug}/evo-log.md` exists

**Smoke Test:**
- [ ] `as_chat_with_agent` with UC-1 input returns non-empty response
- [ ] All output keys from Output Contract present in response
- [ ] `CONFIDENCE:` and `DATE:` present
- [ ] No FORMAT_ERROR or QUALITY_GATE_FAIL on valid input
