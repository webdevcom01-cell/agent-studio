# agent-scaffolder — Critical Analysis of v1 Plan
*Analyst: Claude | Date: 2026-05-15 | Reviewing: IMPLEMENTATION_PLAN.md + SKILL.md*

---

## Summary

17 issues identified across 5 categories:
- **A. Logic / Sequencing errors** — 4 issues
- **B. Data collection gaps** — 3 issues
- **C. Template quality problems** — 4 issues
- **D. Missing steps** — 4 issues
- **E. Minor inconsistencies** — 2 issues

Severity: 🔴 Critical (blocks execution) | 🟡 Major (degrades output quality) | 🟢 Minor (polish)

---

## A. Logic / Sequencing Errors

### A1 🔴 DESIGN_SPEC written before output contract is defined

**Where:** Phase 1 (DESIGN_SPEC) comes before Phase 4 (system prompt generation).

**Problem:** DESIGN_SPEC.md contains an "Output Contract" section listing `{KEY_N}` placeholders. But the actual output keys are only generated during Phase 4, when the processor system prompt is constructed. The DESIGN_SPEC ends up with unfilled `{KEY_1}`, `{KEY_2}` placeholders — which defeats the purpose of spec-driven development.

**Evidence:** Plan Phase 1 template includes `{KEY_1}: {description of value}` but there is no instruction for how those keys get decided before Phase 4 runs.

**Fix:** Reverse the order. Generate the system prompt (with real output keys) FIRST, then write DESIGN_SPEC.md using those generated keys. New order: **[Spec Gather] → [Generate Prompt] → [DESIGN_SPEC] → [Create Agent] → [Build Flow] → [Vault Files] → [KB] → [Test] → [Report]**

---

### A2 🔴 Step numbering breaks at "4A" — untraceable in execution

**Where:** SKILL.md Step 4 and Step 4A.

**Problem:** The processor system prompt is placed as a sub-section "4A" inside the flow-building step. This means Claude executes both flow construction AND prompt generation in the same cognitive step, with no clear checkpoint between them. In practice this leads to prompt content being referenced before it's created, or the flow being built with a placeholder prompt and never updated.

**Fix:** Give system prompt generation its own numbered step (STEP 4). The flow build becomes STEP 5. No sub-steps.

---

### A3 🟡 Post-flow-write has no verification

**Where:** SKILL.md Step 4 — calls `as_update_flow` then moves on.

**Problem:** `as_update_flow` replaces the entire nodes/edges array. It returns success/fail at the DB level, but does NOT validate that edge wiring is correct, that all node IDs were accepted, or that the flow is actually executable. A typo in a node ID (e.g., `kb_search-{slug}-memory` with an unresolved `{slug}`) would silently write broken data.

**Evidence:** In SOMA session, we had to use `as_inspect_flow` iteratively to verify HW flow changes. Just calling `as_update_flow` and trusting it was insufficient.

**Fix:** After every `as_update_flow` call, ALWAYS call `as_inspect_flow` immediately to verify node count, edge count, and that key node IDs exist as expected. If mismatch → abort and report.

---

### A4 🟡 `call_agent` inputVariable must match extractor outputVariable — not enforced

**Where:** SKILL.md Step 4, Node 3 (extractor) and Node 4 (call_agent).

**Problem:** Node 3 sets `outputVariable: "structured_output"`. Node 4 expects `inputVariable: "structured_output"`. This match is critical — if they differ, the A2A handoff silently sends an empty or wrong payload. The plan mentions both values but never flags this as a binding constraint that must be validated.

**Fix:** Add an explicit rule: "The `call_agent` node's `inputVariable` MUST exactly match the extractor node's `outputVariable`. Default: both = `structured_output`. Document this in the scaffold report so the user knows not to change one without the other."

---

## B. Data Collection Gaps

### B1 🔴 Q1 mixes agent type (multiple choice) with agent name (free text) — unresolvable

**Where:** SKILL.md Step 1, Q1.

**Problem:** Q1 says "What is this agent called? Give it a short name and one-line description" but then provides OPTIONS like "Content Creator | Research Agent | Pipeline Processor | Standalone Agent". These are agent TYPES, not agent NAMES. The AskUserQuestion tool requires predefined options — there's no mechanism for pure free-text entry except via "Other". So a user who wants to name their agent "Price Monitor" or "Lead Scorer" is forced to always pick "Other", which makes the options pointless.

Additionally, Q1 bundles name AND description into one question, but the description field in AgentStack (`as_create_agent`) is separate from the name.

**Fix:** Remove name collection from AskUserQuestion entirely. Instead: extract the agent name from the user's TRIGGER message (e.g., "create an agent called Price Monitor" → name = "Price Monitor"). If no name is detectable in the trigger, ask for it in plain text BEFORE launching AskUserQuestion. Use AskUserQuestion ONLY for structured choices: pipeline role, model, domain, web search need.

---

### B2 🔴 Downstream agent ID never collected — call_agent node built with placeholder

**Where:** Phase 3 (flow construction), Node 4 (call_agent).

**Problem:** When user selects "Sends only" or "Middle" (pipeline agent), the `call_agent` node needs a `downstream_agent_id`. The plan says "ask user for it OR use `as_list_agents`" — but this is not in the AskUserQuestion step, and there's no step that actually resolves the downstream agent ID before the flow is built. The plan leaves this as "handle it somewhere in Step 4".

**Evidence:** In SOMA, the TI → HW link required knowing the exact HW agent ID. This was a manual lookup, not automatically handled.

**Fix:** If user selects "Sends to" or "Middle" in Q1 (pipeline role), add a CONDITIONAL follow-up question: "What is the downstream agent name?" Then use `as_list_agents` to resolve to ID before building the flow. This should be an explicit step BEFORE `as_update_flow`.

---

### B3 🟡 Web search capability never asked — web_search node completely absent from scaffold

**Where:** Plan mentions "Future `web_search` node added only for agents that need live data" but no question collects this decision.

**Problem:** TI (Trend Intelligence) is entirely useless without web_search. Any research or trend-discovery agent would need it. But the scaffold always creates the same 3-node flow (kb_search → processor → extractor) with no option for web_search. A user creating a TI-equivalent agent would get a broken scaffold.

**Fix:** Add Q4 (replacing current Q4 domain question or combining): "Does this agent need to search the web for live data?" Options: Yes — includes web_search node | No — KB memory only. If Yes, add a `web_search` node positioned between kb_search and processor.

---

## C. Template Quality Problems

### C1 🟡 instincts.md template is empty — gives agent no head start

**Where:** SKILL.md Step 5, instincts.md creation.

**Problem:** The generated instincts.md contains only:
```
- (Add after first successful runs)
- NEVER fabricate statistics
- NEVER pass malformed output  
- If input format is wrong, use FORMAT_ERROR
```
Three generic lines and a placeholder. This is worse than the real SOMA instincts.md which had 37 lines of specific, calibrated patterns after only a few runs. An empty instincts file means the agent starts blind — its KB search returns nothing useful on the first run.

**Evidence:** Real TI instincts.md has: source priority ordering, scoring calibration rules, specific signal types, format examples for angle suggestions. All of this was built progressively but should be SEEDED from domain knowledge at creation time.

**Fix:** Generate domain-specific starter instincts based on Q3 (domain) and Q1 (agent type). For AI/Tech: include signal quality rules, confidence calibration, format examples. For B2B: include persona language rules, CTA patterns. For e-commerce: include product copy patterns. General: include quality gate rules and FORMAT C compliance checklist.

---

### C2 🟡 Temperature hardcoded at 0.7 regardless of agent type

**Where:** SKILL.md Step 4, Node 2 (processor), `"temperature": 0.7`.

**Problem:** 0.7 is a creative midpoint — right for Hook Writer (needs creativity) but wrong for:
- Research/trend agents: should be 0.3–0.4 (lower = more consistent, fact-based output)
- Classification/scoring agents: should be 0.1–0.2 (deterministic scoring)
- Content generation agents: can go 0.8–0.9 (more variation = better hooks)

Using 0.7 for a scoring or classification agent introduces unnecessary randomness.

**Fix:** Map temperature to agent type derived from Q1/Q4:
| Agent type | Temperature |
|-----------|-------------|
| Research / trend detection | 0.3 |
| Classification / scoring | 0.1 |
| Content creation | 0.8 |
| Pipeline middleware | 0.5 |
| General purpose | 0.6 |

---

### C3 🟡 topK=10 on fresh agent with 2 documents — should scale with KB size

**Where:** SKILL.md Step 4, Node 1 (kb_search), `"topK": 10`.

**Problem:** topK=10 means "return top 10 most relevant chunks." A freshly seeded KB has only 2 documents (instincts + evo-log), which means at most 2 chunks will be returned regardless of topK. Setting topK=10 gives the misleading impression it's doing something sophisticated when it isn't.

More importantly: when evo-log grows to 50+ entries (after 20-30 runs), topK=10 is too low and misses recent run history. But when evo-log has only 3 entries, topK=10 pulls everything anyway.

**Fix:** Start with `topK: 5` for new agents. Document in scaffold report: "Increase topK to 15 after 20+ evo-log entries." Add this as a note in the agent-card.md.

---

### C4 🟡 DESIGN_SPEC has only 3 use cases, all described generically

**Where:** SKILL.md Step 2, DESIGN_SPEC template, UC-1 / UC-2 / UC-3.

**Problem:** UC-3 is described as `{domain-specific third example}` with placeholder I/O. There is no instruction for how to generate a meaningful UC-3. The plan says "generate dynamically based on user input" but provides no framework for what makes a good UC-3 for each domain.

Google ADK's standard requires 3–5 use cases that together cover: the happy path, an error/edge case, and a representative variation. The current template provides UC-1 (happy path) and UC-2 (error) but no coverage variation.

**Fix:** Define UC-3 as the "partial data" or "low confidence" case — where input is valid but output quality is borderline. This is the most instructive edge case for agents that score or rate things (like SOMA's confidence ⭐ vs ⭐⭐⭐ logic). Provide a concrete UC-3 generation rule for each domain.

---

## D. Missing Steps

### D1 🔴 No smoke test step

**Where:** Validation checklist mentions "`as_chat_with_agent` returns structured output" but no execution step does this.

**Problem:** The skill builds the agent and declares success without ever testing it. A broken system prompt, wrong variable name, or KB not yet ready would only be discovered when the user tries to use it — not during scaffolding. This defeats the purpose of having a "Quality Bar."

**Fix:** Add STEP 8 — Smoke Test. After KB embedding is ready:
1. Take the UC-1 sample input from DESIGN_SPEC
2. Call `as_chat_with_agent` with it
3. Verify: response contains expected output keys, no FORMAT_ERROR, no empty fields
4. If test fails: report exactly which check failed and what the raw output was
5. Only proceed to final Report if smoke test passes (or user explicitly skips)

---

### D2 🔴 No agent-card.md in vault — A2A reference is lost after scaffolding

**Where:** Vault initialization step creates only evo-log.md and instincts.md.

**Problem:** After scaffolding, the agent's `agentId` (a cuid like `cm2abc...`), `KB ID`, input format, and output format exist only in the AgentStack database and in the conversation context. If someone needs to connect a NEW agent to this one later (e.g., building UC-2 scaffold that needs to send to this agent), they have to go back to AgentStack UI to find the ID.

Google ADK's `agent_card.json` pattern solves this: each agent publishes its identity in a discoverable file. The vault should have the equivalent.

**Fix:** Create `agents/{agent_slug}/agent-card.md` in vault during Step 6. Contents:
```
agentId: {agentId}
name: {agent_name}
model: {model_id}
publicUrl: {publicUrl from as_create_agent response}
KB ID: {kb_id}
input: {detection key}
output: {list of output keys}
pipeline: {upstream} → THIS → {downstream}
created: {date}
```
This file becomes the source of truth for any future A2A wiring.

---

### D3 🟡 DESIGN_SPEC not seeded into KB — only 2 of 3 vault docs go to KB

**Where:** SKILL.md Step 6 (KB Seeding) seeds instincts + evo-log only.

**Problem:** DESIGN_SPEC.md contains the most dense knowledge: purpose description, use cases, constraints, input/output contracts. This is exactly what the agent should recall at runtime via `{{kb_context}}`. But the plan only seeds instincts + evo-log.

**Evidence:** The agent's quality gate rules, banned phrases, and output key definitions are all in DESIGN_SPEC. If these aren't in the KB, the kb_search returns memory about past runs but NOT the agent's own definition of what good output looks like.

**Fix:** Seed 3 documents: `as_add_kb_text` for DESIGN_SPEC + instincts + evo-log. This makes the agent "self-aware" from run 1 — it can retrieve its own spec from its own KB.

---

### D4 🟡 No rollback/cleanup documentation

**Where:** Error handling table lists errors but not what to do about partially-created state.

**Problem:** If the scaffold fails midway (e.g., agent created in Step 3, but flow build in Step 4 fails), the user is left with:
- An agent in AgentStack with an empty/broken flow
- Possibly partial vault files
- No guidance on whether to retry, delete and restart, or continue

**Fix:** Add a "Rollback" section:
- If fail BEFORE `as_create_agent`: nothing to clean up, retry from scratch
- If fail AFTER `as_create_agent` but BEFORE `as_update_flow`: agent exists with empty flow — document agentId, report to user, offer to retry flow build only
- If fail AFTER `as_update_flow` but BEFORE vault: flow is built, vault missing — can continue from Step 6 with the stored agentId
- If fail DURING KB seeding: KB docs can be re-added without deleting KB; re-run Step 7 only

---

## E. Minor Inconsistencies

### E1 🟢 `as_create_agent` default model is `gpt-4.1-mini` — plan doesn't flag this

**Where:** `as_create_agent` tool description states `"model": {"default": "gpt-4.1-mini"}`.

**Problem:** If the skill builds the `as_create_agent` call and the model parameter is somehow not included (e.g., user says "use default"), the agent gets `gpt-4.1-mini` when most SOMA agents use Claude. This is a silent gotcha.

**Fix:** Always explicitly include the `model` parameter in `as_create_agent`. Never rely on the default. The skill should confirm the model was set correctly by checking `as_get_agent` response.

---

### E2 🟢 Skill trigger says "Do NOT use for modifying existing agents — use `as_patch_node_field` directly"

**Where:** SKILL.md, Trigger section.

**Problem:** This is bad guidance. `as_patch_node_field` is a low-level tool, not a skill. The correct guidance should point to the future `flow-debugger` skill (Priority 1), not to raw tool use. Exposing tool names in user-facing trigger guidance also creates dependency on implementation details.

**Fix:** Change to: "For modifying an existing agent's flow or prompts, describe what you want changed and Claude will use the appropriate tools. This skill is for creation only."

---

## Verdict by Severity

| Issue | Severity | Impact if unfixed |
|-------|----------|------------------|
| A1 — DESIGN_SPEC before output keys | 🔴 | Empty `{KEY_N}` placeholders in all DESIGN_SPECs |
| A2 — Step 4A numbering | 🔴 | Prompt may be skipped or built with no context |
| B1 — Q1 name/type confusion | 🔴 | Agent created with wrong name or no name |
| B2 — No downstream agent ID collection | 🔴 | `call_agent` node built with undefined agentId |
| D1 — No smoke test | 🔴 | Broken agents shipped without detection |
| A3 — No post-flow verification | 🟡 | Broken flows written silently |
| A4 — Variable binding not enforced | 🟡 | A2A handoff silently fails |
| B3 — No web_search option | 🟡 | Research agents get broken scaffold |
| C1 — Empty instincts template | 🟡 | Agent starts with no domain knowledge |
| C2 — Temperature hardcoded | 🟡 | Classification agents have wrong randomness |
| C3 — topK=10 on empty KB | 🟡 | Misleading, not harmful short-term |
| C4 — UC-3 is a placeholder | 🟡 | DESIGN_SPEC missing coverage variation |
| D2 — No agent-card.md | 🟡 | A2A wiring requires manual ID lookup |
| D3 — DESIGN_SPEC not in KB | 🟡 | Agent can't retrieve its own spec at runtime |
| D4 — No rollback documentation | 🟡 | Users stuck with partial state after failures |
| E1 — Default model gotcha | 🟢 | Silent GPT-4.1-mini instead of Claude |
| E2 — Bad trigger guidance | 🟢 | User confusion about what to do for edits |

---

## Recommended New Step Order for v2

```
STEP 0 — Task List
STEP 1 — Extract name from trigger + AskUserQuestion (3 clean questions)
STEP 1B — Conditional: resolve downstream agent ID if pipeline
STEP 2 — Generate system prompt (output keys defined HERE first)
STEP 3 — Write DESIGN_SPEC.md to vault (uses real output keys from Step 2)
STEP 4 — Create agent in AgentStack
STEP 5 — Build flow (post-write: as_inspect_flow verification)
STEP 6 — Initialize vault files (agent-card.md + instincts with starter content + evo-log)
STEP 7 — KB seeding (3 docs: DESIGN_SPEC + instincts + evo-log)
STEP 8 — Smoke test (as_chat_with_agent with UC-1 input)
STEP 9 — Scaffold report
```

Total steps: 10 (vs. 8 ambiguous steps in v1). Cleaner, verifiable, no ambiguous sub-steps.
