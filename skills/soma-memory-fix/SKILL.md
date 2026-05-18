---
name: soma-memory-fix
version: 1.0.1
description: >
  Audits AgentStack agents for unwired kb_search nodes (missing knowledgeBaseId),
  proposes a fix plan, and — after confirmation — patches each node using only
  live MCP data. Zero hallucination tolerance: every ID used in a patch comes
  from a real tool response in the current session.
triggers:
  - "memory fix"
  - "fix kb wiring"
  - "soma memory fix"
  - "kb_search not wired"
  - "knowledgeBaseId missing"
  - "agents not using KB"
  - "popravni memory"
  - "popravi kb_search"
  - "wiring fix"
  - "fix agent memory"
  - "agent nema memory"
  - "popravni wiring"
do_not_use_when:
  - User wants to CREATE a new KB (use agent-scaffolder)
  - User wants to SYNC KB content from Obsidian (use kb-sync)
  - User wants to RUN an agent (use as_chat_with_agent)
  - User wants a full system health check (use agent-health-check)
---

# Skill: soma-memory-fix

*Version: 1.0.0 | Research grounded in: Anthropic Agent SDK (May 2026), Google ADK
patterns, industry auto-remediation standards.*

---

## Purpose

Some AgentStack agents have `kb_search` nodes in their flow that are missing a
`knowledgeBaseId`. Without this ID, the node silently skips KB lookup — the agent
runs without memory. This skill:

1. **Inspects** all production agents for unwired `kb_search` nodes
2. **Matches** each unwired node to its correct KB (1:1 match only — never guesses)
3. **Plans** the patch set and shows it to the user before touching anything
4. **Patches** confirmed fixes using `as_patch_node_field` with live IDs only
5. **Verifies** each patch with a post-patch re-read

**Hard rules (zero-hallucination constraints):**
- Every agent ID, KB ID, and node ID used in a patch command must come from a live
  MCP tool response in the current session. Never use values from memory or previous
  sessions.
- Never call `as_patch_node_field` without first reading current node state via
  `as_inspect_flow`.
- Never mark a node as FIXED without a post-patch re-read confirming the field is set.
- If KB matching is ambiguous (0 or 2+ KBs for an agent) → halt that agent and report.
  Never guess which KB to use.

---

## STEP 0 — Task List

Create tasks:
- "Phase 1 — Inspect all production agents"
- "Phase 2 — KB matching"
- "Phase 3 — Build patch plan"
- "Phase 4 — Execute patches (after confirmation)"
- "Phase 5 — Verify patches"

Mark each `in_progress` before starting, `completed` when done.

---

## STEP 1 — Determine Scope

### Default production agents

Run Phase 1 against these agents unless the user specifies otherwise:

```
SOMA pipeline:
  - "Trend Intelligence"
  - "Hook Writer"
  - "Content Repurposer"
  - "Score Analyzer"

AI Nekretnine CG:
  - "NLU Chat Agent — AI Nekretnine CG"
  - "Master Orchestrator — AI Nekretnine CG"
  - "Due Diligence Agent — AI Nekretnine CG"
  - "Market Intelligence Agent — AI Nekretnine CG"
```

**Note — confirmed 2026-05-16 via live as_list_agents:** The agents
"Property Analysis Agent — eKatastar CG" and "eKatastar Data Agent" do NOT exist
in the system. They have been removed from the default scope to prevent INSPECT_FAILED
noise on every run.

**Note — confirmed 2026-05-16 via live as_inspect_flow:** The 4 AI Nekretnine CG agents
above are API-calling agents (route to eKatastar REST API), NOT KB-based agents.
They have no `kb_search` nodes by design. `NO_KB_SEARCH` is the expected and correct
status for all 4 — this is NOT an error.

### Scope override

If the user names specific agents (e.g., "fix only SOMA agents"), restrict the
scope to those agents.

### Dry-run mode (default: ON)

By default, this skill runs in **dry-run mode**: it builds the full patch plan and
presents it to the user BEFORE executing any patches. The user must confirm before
patches are applied.

The user can disable dry-run with: "just fix it", "skip confirmation", "no dry-run".
If dry-run is disabled, execute patches immediately after matching — skip Step 4 prompt.

---

## STEP 2 — Phase 1: Inspect All Agents

For each agent in scope, run **in parallel where possible**:

```
as_inspect_flow(agent_name: "<name>", node_type: "kb_search")
```

For each response, extract:
- `agent_name`: the agent being checked
- For each node in `nodes`:
  - `node_id`: the node's ID
  - `current_knowledgeBaseId`: `node.data.knowledgeBaseId` (may be null/empty/populated)

**Classification per node:**
| Condition | Status |
|---|---|
| `knowledgeBaseId` is non-empty string | ✅ WIRED — skip (idempotency) |
| `knowledgeBaseId` is null, undefined, or `""` | ❌ UNWIRED — needs fix |

**If `as_inspect_flow` returns no nodes (empty `nodes` array):**
- Agent has no `kb_search` nodes → mark as `NO_KB_SEARCH` → skip entirely

**If `as_inspect_flow` call fails:**
- Mark agent as `INSPECT_FAILED` → include in report → continue to next agent

Store results as `inspect_results[]`:
```
{
  agent_name: string,
  status: "UNWIRED" | "WIRED" | "NO_KB_SEARCH" | "INSPECT_FAILED",
  unwired_nodes: [ { node_id, label } ],  // only populated if status == UNWIRED
}
```

---

## STEP 3 — Phase 2: KB Matching

For each agent with `status == "UNWIRED"`, call:

```
as_list_knowledge_bases(agent_name: "<name>")
```

**Matching logic (strict — no inference allowed):**

| KB count returned | Action |
|---|---|
| `count == 0` | → Status: `NO_KB` — cannot fix. Report: "No KB exists. Create one first with agent-scaffolder." |
| `count == 1` | → Status: `MATCH` — use `bases[0].id` as the target KB ID |
| `count >= 2` | → Status: `AMBIGUOUS` — cannot auto-select. Report all KB names and IDs. Ask user to specify which KB to use for which node. |

**CRITICAL:** Do NOT attempt to match KBs by name similarity. The only safe auto-match
is `count == 1`. For `count >= 2`, halt and report — never guess.

**If `as_list_knowledge_bases` call fails:**
- Mark agent as `KB_LOOKUP_FAILED` → include in report → skip patching

**Add to `inspect_results`:**
```
{
  ...
  kb_status: "MATCH" | "NO_KB" | "AMBIGUOUS" | "KB_LOOKUP_FAILED",
  matched_kb_id: string | null,       // only if kb_status == MATCH
  matched_kb_name: string | null,     // for human-readable plan
  all_kbs: [ { id, name } ],          // always populated for transparency
}
```

---

## STEP 4 — Phase 3: Build and Present Patch Plan

Build a structured patch plan from `inspect_results` where `kb_status == "MATCH"`.

### Plan format

Present the plan as follows before executing anything:

```
🔧 SOMA MEMORY FIX — PATCH PLAN
══════════════════════════════════════════
Generated : <timestamp>
Dry-run   : ON (patches will NOT execute until you confirm)
══════════════════════════════════════════

AGENTS TO PATCH: <N>
AGENTS SKIPPED (already wired): <N>
AGENTS BLOCKED (no KB / ambiguous / error): <N>

──────────────────────────────────────────
PATCH PLAN:
──────────────────────────────────────────

1. Agent: <agent_name>
   Node:  <node_id> (<node label if available>)
   KB:    "<matched_kb_name>" (ID: <matched_kb_id>)
   Action: as_patch_node_field
             agent_name:  "<agent_name>"
             node_id:     "<node_id>"
             field_name:  "knowledgeBaseId"
             field_value: "<matched_kb_id>"

2. Agent: ...
   ...

──────────────────────────────────────────
BLOCKED (require manual action):
──────────────────────────────────────────

• <agent_name> — NO_KB: No knowledge base exists.
  → Fix: Run agent-scaffolder or create a KB manually, then re-run soma-memory-fix.

• <agent_name> — AMBIGUOUS: 2 KBs found: "<kb1_name>" (ID: ...), "<kb2_name>" (ID: ...).
  → Fix: Tell me which KB ID to use for node <node_id>.

──────────────────────────────────────────
SKIPPED (already wired — no action needed):
──────────────────────────────────────────
• <agent_name>: kb_search node already has knowledgeBaseId set ✅

══════════════════════════════════════════
⚡ Ready to execute <N> patches.
Type "confirm" to apply — or "cancel" to abort.
══════════════════════════════════════════
```

**If dry-run is OFF:** skip this step, proceed directly to Step 5.

**If the patch plan is empty (0 agents to patch):**
- Report: "All kb_search nodes are already wired — no action needed."
- Stop.

---

## STEP 5 — Phase 4: Execute Patches

**Only proceed if:**
- Dry-run OFF, OR
- User typed "confirm" (or equivalent: "yes", "apply", "go", "uradi")

**If user typed "cancel" (or "ne", "abort", "stop"):**
- Report: "Aborted. No patches applied." → Stop.

### For each agent in the patch plan (sequential — do not parallelize patches):

#### 5a — Incident Guard

Before patching each agent, call:
```
as_get_recent_executions(agent_name: "<name>")
```

Check if any execution has `status == "running"` OR started within the last 60 seconds.

- If YES → **Skip this agent**. Report: "⚠️ <agent_name> is currently executing — skipped to avoid race condition. Re-run soma-memory-fix after execution completes."
- If NO → proceed to 5b

**If `as_get_recent_executions` fails or is unavailable:**
- Log: "⚠️ Could not check execution status for <agent_name> — proceeding with caution."
- Continue to 5b (do not block on unavailable guard)

#### 5b — Re-read Current State (pre-patch safety)

Before patching, re-read the node to confirm it's still unwired:
```
as_inspect_flow(agent_name: "<name>", node_type: "kb_search")
```

Find the specific `node_id` from the patch plan.

- If `knowledgeBaseId` is now non-empty → **Skip this node**. Log: "ℹ️ <agent_name> / <node_id>: Already wired (another process patched it). Skipping."
- If still empty → proceed to 5c

#### 5c — Apply Patch

```
as_patch_node_field(
  agent_name: "<agent_name>",
  node_id:    "<node_id>",
  field_name: "knowledgeBaseId",
  field_value: "<matched_kb_id>"
)
```

**CRITICAL:** Use ONLY the `matched_kb_id` from Step 3's live `as_list_knowledge_bases`
response. Never substitute a different ID.

- If the call returns an error → mark node as `PATCH_FAILED`. Log the error. Continue to next node.
- If the call succeeds → proceed to 5d

#### 5d — Post-Patch Verification

Re-read the node to confirm the patch took effect:
```
as_inspect_flow(agent_name: "<name>", node_type: "kb_search")
```

Find the node by `node_id`. Check `node.data.knowledgeBaseId`.

- If `knowledgeBaseId == matched_kb_id` → mark node as `FIXED` ✅
- If `knowledgeBaseId` is still empty → mark node as `VERIFY_FAILED` ❌
  - Log: "❌ Patch appeared to succeed but re-read shows field still empty. Manual investigation required."
- If `knowledgeBaseId` is set to a DIFFERENT value → mark node as `VERIFY_MISMATCH` ❌
  - Log: "❌ knowledgeBaseId is set but to an unexpected value: <value>. Not overwriting — manual review required."

---

## STEP 6 — Phase 5: Final Report

After all patches are attempted, output:

```
🔧 SOMA MEMORY FIX — RESULTS
══════════════════════════════════════════
Completed : <timestamp>
══════════════════════════════════════════

✅ FIXED (<N> nodes):
  • <agent_name> / node <node_id> → KB "<matched_kb_name>" wired successfully

❌ FAILED (<N> nodes):
  • <agent_name> / node <node_id> — PATCH_FAILED: <error message>
  • <agent_name> / node <node_id> — VERIFY_FAILED: patch didn't stick
  • <agent_name> / node <node_id> — VERIFY_MISMATCH: unexpected value after patch

⏭️ SKIPPED (<N> agents):
  • <agent_name> — Currently executing (incident guard triggered)
  • <agent_name> — Already wired (no action needed)
  • <agent_name> — NO_KB: create KB first
  • <agent_name> — AMBIGUOUS: multiple KBs found, specify which to use
  • <agent_name> — INSPECT_FAILED: could not read flow
  • <agent_name> — KB_LOOKUP_FAILED: could not list KBs

══════════════════════════════════════════
SUMMARY: <N_FIXED> fixed | <N_FAILED> failed | <N_SKIPPED> skipped
══════════════════════════════════════════
```

**If any FAILED or VERIFY_FAILED nodes exist:**
- Add: "⚠️ Re-run soma-memory-fix to retry failed nodes, or inspect manually."

**If all nodes are FIXED:**
- Add: "✅ All kb_search nodes are now wired. Consider running agent-health-check to confirm overall system health."

---

## Constraints Summary

| Constraint | Rule |
|---|---|
| ID provenance | All agent IDs, KB IDs, node IDs from live MCP calls this session ONLY |
| Idempotency | If `knowledgeBaseId` is already set → skip, never overwrite |
| KB matching | Auto-patch only if exactly 1 KB exists. 0 or 2+ → halt and report |
| Pre-patch re-read | Always re-read node state before patching (5b) |
| Post-patch re-read | Always verify patch after applying (5d) |
| Incident guard | If agent is running or ran in last 60s → skip that agent |
| Dry-run default | Show plan first. Execute only after "confirm" |
| Error handling | Per-node errors logged, continue to next node — never abort entire run |
| No name inference | Never match KBs by name similarity — count == 1 is the only auto-match |

---

## Tool Reference

| Tool | Used for |
|---|---|
| `as_inspect_flow(agent_name, node_type: "kb_search")` | Read kb_search nodes + their current knowledgeBaseId |
| `as_list_knowledge_bases(agent_name)` | List KBs for an agent — get KB ID for matching |
| `as_patch_node_field(agent_name, node_id, field_name, field_value)` | Apply the fix |
| `as_get_recent_executions(agent_name)` | Incident guard — check if agent is mid-execution |

---

## Examples

### Invocation examples

```
"run soma-memory-fix"
"popravi kb_search wiring"
"fix agent memory"
"which agents don't have KB wired?"
"soma memory fix — dry run first"
"soma memory fix — just fix it"
"fix only SOMA agents"
"fix only Trend Intelligence"
```

### Example of ambiguous KB case

```
⚠️ BLOCKED — AMBIGUOUS
Agent: "Trend Intelligence"
Node:  node_abc123 (kb_search)
Found 2 KBs:
  1. "SOMA Trend Intelligence KB" (ID: kb_111)
  2. "TI Archive KB" (ID: kb_222)

→ Cannot auto-select. Tell me which KB ID to use:
  "use kb_111 for Trend Intelligence" or "use kb_222 for Trend Intelligence"
```

### Example of a successful 1-agent run

```
User: "fix only Score Analyzer"

[Phase 1] Inspecting Score Analyzer...
  → 1 kb_search node found, knowledgeBaseId: null → UNWIRED

[Phase 2] Looking up KBs for Score Analyzer...
  → 1 KB found: "Score Analyzer KB" (ID: kb_xyz789) → MATCH

[Plan]
  1. Score Analyzer / node_kb_001 → KB "Score Analyzer KB" (ID: kb_xyz789)

Type "confirm" to apply.

User: confirm

[5a] Checking executions... no active runs ✅
[5b] Re-reading node... still unwired ✅
[5c] Patching...
[5d] Verifying... knowledgeBaseId = kb_xyz789 ✅

✅ FIXED: Score Analyzer / node_kb_001 → KB "Score Analyzer KB" wired.
```
