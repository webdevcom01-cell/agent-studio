---
name: pipeline-debug
version: 1.0.0
description: >
  Reactive diagnostic skill for the SOMA pipeline (TI → HW → CR → Score Analyzer).
  Accepts a problem description, runs structured multi-dimensional checks, maps evidence
  to root cause via explicit IF-THEN rules, auto-applies trivial fixes, and delivers a
  prioritized debug report. Replaces 5–8 manual MCP calls with one structured investigation.
triggers:
  - "pipeline-debug"
  - "debug pipeline"
  - "pipeline se srušio"
  - "pipeline broke"
  - "pipeline failed"
  - "pipeline ne radi"
  - "TI ne radi"
  - "HW timeout"
  - "CR ne radi"
  - "prazan output"
  - "empty output"
  - "scores dropping"
  - "quality dropped"
  - "debug TI"
  - "debug HW"
  - "debug CR"
  - "šta je pokvareno u pipeline-u"
  - "zašto pipeline ne radi"
  - "provjeri SOMA"
  - "istražii grešku"
do_not_use_when:
  - User wants a preventive system-wide check before running (use agent-health-check)
  - User wants to fix KB wiring across all agents (use soma-memory-fix)
  - User wants to sync Obsidian vault to KB (use kb-sync)
  - User wants to run the pipeline (use soma-run)
  - User asks about AI Nekretnine CG agents (different architecture — not in scope)
---

# Skill: pipeline-debug

*Version: 1.0.0*
*Grounded in: live MCP schema audit 2026-05-17, forensic plan review, confirmed tool*
*behaviours from agent-health-check and soma-memory-fix live sessions.*
*Zero values from memory. All tool parameter names confirmed from live schemas.*

---

## Purpose

Diagnoses why the SOMA pipeline (TI → HW → CR → Score Analyzer) failed or degraded.
Takes a problem description, runs targeted multi-dimensional checks, and returns:
- Root cause classification (from an explicit IF-THEN table — not LLM inference)
- Evidence for each finding
- Auto-applied trivial fixes (with post-hoc log)
- Manual fix instructions for non-trivial issues

**Key architectural fact (confirmed 2026-05-16):**
SOMA is an externally-orchestrated pipeline. `soma-run` skill calls agents via
`as_chat_with_agent` (human-to-agent). These are NOT A2A calls. Therefore:
- `as_list_agent_calls` / `as_get_agent_call_log` return 0 results for SOMA runs
- `as_get_recent_executions` IS the correct tool for SOMA execution history
- A2A tools are retained as supplementary checks for internal `call_agent` nodes only

---

## Hard rules — zero hallucination

- Root cause is determined ONLY by the explicit IF-THEN table in Step 9 — never by LLM inference
- Fix commands use ONLY node_ids and kb_ids obtained from live MCP calls in this session
- Auto-apply only when all pre-conditions in Step 10 are met — never speculatively
- If a tool call fails → report UNKNOWN for that dimension, do NOT guess the result
- Evo-log parsing uses fixed field positions (documented below) — never free-form text analysis

---

## Confirmed constants (live-verified)

```
SOMA PRODUCTION SCOPE:
  Primary pipeline : Trend Intelligence (TI), Hook Writer (HW), Content Repurposer (CR)
  Secondary        : Score Analyzer (execution check only — no evo-log, different arch)

EVO-LOG PATHS (confirmed):
  TI  → agents/trend-intelligence/evo-log.md
  HW  → agents/hook-writer/evo-log.md
  CR  → agents/content-repurposer/evo-log.md

EVO-LOG PIPE-FIELD POSITIONS (0-indexed, confirmed from soma-run v1.1.0):
  TI fields: [0]date | [1]INPUT:... | [2]trend_found | [3]confidence | [4]angle | [5]triggered
  HW fields: [0]date | [1]trend | [2]platforms | [3]scores | [4]winner | [5]winner_score | [6]flags
  CR fields: [0]date | [1]trend | [2]platforms_completed | [3]scores | [4]flag | [5]notes

QUALITY TRIGGER KEYWORDS (case-insensitive):
  "quality", "scores", "score", "dropping", "evo-log", "UNSCORED",
  "violations", "hook quality", "platform", "degradation"

TIMEOUT TRIGGER KEYWORDS:
  "timeout", "slow", "stuck", "hanging", "waiting", "RUNNING", "ne odgovara"

CRASH TRIGGER KEYWORDS:
  "crashed", "failed", "FAILED", "error", "ne radi", "pokvareno", "srušio"

EMPTY OUTPUT TRIGGER KEYWORDS:
  "empty output", "prazan output", "ništa ne vraća", "blank", "nema outputa"

EXECUTION STATUS VALUES (confirmed from schema):
  as_get_recent_executions: PENDING | RUNNING | COMPLETED | FAILED | CANCELLED

A2A CALL STATUS VALUES (confirmed from schema):
  as_list_agent_calls: SUBMITTED | WORKING | INPUT_REQUIRED | COMPLETED | FAILED

TIMEOUT ANOMALY THRESHOLD:
  If RUNNING status and duration > 5 minutes → classify as TIMEOUT

QUALITY DEGRADATION THRESHOLD:
  2 consecutive UNSCORED entries in HW evo-log → QUALITY_DEGRADATION
  OR cr_flag = "QUALITY_VIOLATIONS" in 2 of last 5 CR entries

TRIVIAL FIX AUTO-APPLY CONDITIONS (see Step 10 for full rules):
  1. Missing outputVariable: fix command taken verbatim from as_find_broken_flows response
  2. KB unwired (knowledgeBaseId missing) + exactly 1 KB exists for that agent
```

---

## STEP 0 — Task List

Create tasks before starting:
- "PARSE — Input analysis and symptom detection"
- "D0+D1 — Infrastructure and execution status"
- "D4+D5 — Flow integrity checks"
- "D6 — KB status"
- "D7 — Evo-log analysis (conditional)"
- "ROOT CAUSE — IF-THEN mapping"
- "AUTO-FIX — Apply trivial fixes"
- "REPORT — Debug report"

Mark each `in_progress` before starting, `completed` when done.

---

## STEP 1 — Parse Input and Detect Symptom Profile

Extract from user's message:

### 1a — Agent scope
Detect if user named a specific agent:
- Mentions "TI" / "Trend Intelligence" → scope to TI (+ cascade check for HW/CR)
- Mentions "HW" / "Hook Writer" → scope to HW (+ check TI as upstream cause)
- Mentions "CR" / "Content Repurposer" → scope to CR (+ check HW as upstream)
- Mentions "Score Analyzer" → secondary scope only
- No specific agent → full SOMA scope (all 4 agents)

Store as `{debug_scope}`: `"TI"` / `"HW"` / `"CR"` / `"SCORE"` / `"FULL"`.

### 1b — Symptom type detection
Scan message for keyword groups (case-insensitive):

| Detected keyword group | Symptom type | D7 triggered? |
|---|---|---|
| Quality trigger keywords | `QUALITY` | Yes (Standard mode) |
| Timeout trigger keywords | `TIMEOUT` | No |
| Crash trigger keywords | `CRASH` | No |
| Empty output trigger keywords | `EMPTY_OUTPUT` | No |
| No keyword match | `UNKNOWN` | No (Deep only) |

Store as `{symptom_type}`. Store D7 flag as `{d7_in_standard}` = true/false.

### 1c — Time reference
If user mentions a specific time ("u 14:30", "sat ago", "zadnji run", "yesterday"):
- Store as `{time_reference}` = user-provided string
- Use as context note in report (cannot filter MCP calls by time — no timestamp filters on D1)
- If no time reference → use default: "last 10 executions per agent"

### 1d — Determine diagnostic depth
```
Default depth: STANDARD
Escalate to DEEP if (evaluated at end of Step 8):
  - STANDARD found 0 issues AND symptom_type != UNKNOWN (user reported a real problem)
  - STANDARD found only WARNINGs AND symptom_type = CRASH
  - All D0-D6 checks pass but user explicitly says "deep" / "detaljno" / "sve provjeri"
```

---

## STEP 2 — D0: Infrastructure Check

Mark task in_progress.

Call:
```
as_health_check()
```

Takes no parameters. Returns basic DB connection counts.

**Classification:**
- Call succeeded → `{d0_status}` = `REACHABLE`
- Call failed / exception → `{d0_status}` = `DOWN`

If DOWN → immediately halt all further steps. Report:
```
🔴 INFRA DOWN — MCP server cannot reach database.
No agent diagnostics possible. Check AgentStack MCP configuration.
```

If REACHABLE → proceed to Step 3.

---

## STEP 3 — D1: Execution Status Per Agent

Run all 4 agent checks **in parallel**:

```
as_get_recent_executions(agent_name: "Trend Intelligence",    limit: 10)
as_get_recent_executions(agent_name: "Hook Writer",           limit: 10)
as_get_recent_executions(agent_name: "Content Repurposer",    limit: 10)
as_get_recent_executions(agent_name: "Score Analyzer",        limit: 5)
```

For agents outside `{debug_scope}`, still run but mark as "context only" (to detect cascading).

For each agent, extract and store:
- `{agent}_last_status`: most recent execution status (COMPLETED / FAILED / RUNNING / PENDING / CANCELLED)
- `{agent}_last_timestamp`: timestamp of most recent execution (if available)
- `{agent}_consecutive_failed`: count of consecutive FAILED entries at top of results
- `{agent}_execution_count`: total executions returned (0 = never ran)
- `{agent}_has_running`: true if any execution has status=RUNNING

**Edge cases:**
- If tool call fails → `{agent}_d1_status` = `UNKNOWN` — continue with other agents
- If returns empty array → `{agent}_execution_count` = 0, `{agent}_last_status` = `NEVER_RAN`

### D1b — Supplementary A2A check (for internal call_agent nodes)

Call:
```
as_list_agent_calls(since_hours: 24, limit: 20)
```

This shows calls between agents via internal `call_agent` flow nodes. Useful if any SOMA
agent internally routes to another via `call_agent`. Store as `{a2a_calls}`.

If `{a2a_calls}` is empty → normal (SOMA is externally orchestrated). Do not flag.
If `{a2a_calls}` contains FAILED entries → note in report as supplementary finding.

---

## STEP 4 — D4: Static Flow Check

Call:
```
as_find_broken_flows()
```

Scans ALL agents for 4 known patterns:
1. `ai_response` with no `outputVariable` — result permanently lost
2. `ai_response` with empty prompt — model gets no instructions
3. `call_agent` targeting non-existent agent
4. `sandbox_verify` with mismatched `inputVariable`

Store full `issues` array as `{d4_issues}`.

Filter `{d4_issues}` to SOMA agents only (TI, HW, CR, Score Analyzer) for report.
Keep non-SOMA findings as informational only (don't include in SOMA report).

**From the schema:** `as_find_broken_flows` returns a `fix` field per issue.
Store fix command verbatim — do NOT modify. This is the auto-apply source in Step 10.

---

## STEP 5 — D5: Flow Config Inspection

Run `as_inspect_flow` for agents that meet any of these conditions:
- Agent appears in `{d4_issues}` (broken flow detected)
- Agent has `{agent}_last_status` = FAILED or NEVER_RAN
- `{debug_scope}` targets this agent specifically
- All agents if `{debug_scope}` = FULL and ≥1 anomaly detected in D1/D4

Call per qualifying agent:
```
as_inspect_flow(agent_name: "<agent_name>")
```

Returns full `nodes[]` and `edges[]`.

For each agent inspected, extract:
- `{agent}_kb_search_nodes`: all nodes where `node.type == "kb_search"`
  - For each: `node.id`, `node.data.knowledgeBaseId` (null/empty = unwired)
- `{agent}_prompt_nodes`: all `ai_response` nodes
  - For each: `node.id`, `node.data.prompt` (empty string = broken)
- `{agent}_model`: model configured on main ai_response node
- `{agent}_input_mapping`: inputMapping config (for cascading analysis)

**What D5 checks that D4 does NOT:**
- `kb_search` nodes with missing `knowledgeBaseId` (KB unwired — auto-fixable)
- Prompt content that is technically non-empty but placeholder/incomplete
- Model configuration

---

## STEP 6 — D6: KB Embedding Status

Run for agents that have `kb_search` nodes (from D5) or are KB-based:
Primary KB agents (confirmed): Trend Intelligence, Hook Writer, Content Repurposer
Score Analyzer: check only if D5 reveals a kb_search node.

```
as_list_knowledge_bases(agent_name: "Trend Intelligence")
as_list_knowledge_bases(agent_name: "Hook Writer")
as_list_knowledge_bases(agent_name: "Content Repurposer")
```

For each, store:
- `{agent}_kb_embedding_status`: empty | processing | ready | partial_failure | failed
- `{agent}_kb_document_count`: total documents
- `{agent}_kb_id`: KB ID (needed for auto-fix in Step 10)
- `{agent}_kb_count`: number of KBs returned (0 = no KB at all)

**Cross-reference with D5:**
For each agent:
- If `kb_embedding_status` = empty AND `kb_search_nodes` exist → KB_DEAD (CRITICAL)
- If `kb_embedding_status` = empty AND no `kb_search_nodes` → KB_UNSEEDED (WARN)
- If `kb_count` = 0 AND `kb_search_nodes` exist → KB_MISSING (CRITICAL)

---

## STEP 7 — D7: Evo-log Pattern Analysis (Conditional)

**Run D7 if:**
- `{d7_in_standard}` = true (quality keywords detected in Step 1), OR
- Depth escalated to DEEP

**Skip D7 if:**
- `{d7_in_standard}` = false AND depth = STANDARD

### 7a — Read all three evo-logs (read-before-analyze)

```
obsidian_read_note("agents/trend-intelligence/evo-log.md")
obsidian_read_note("agents/hook-writer/evo-log.md")
obsidian_read_note("agents/content-repurposer/evo-log.md")
```

If any note returns "Note not found" → log as WARN: "Evo-log missing for {agent}."

### 7b — Parse HW evo-log for QUALITY_DEGRADATION

For each entry line in HW evo-log body (lines starting with "20" are entries):
1. Split by " | " (with spaces)
2. Extract field [6] (0-indexed) = `flags`
3. Build ordered list of last 5 entries: `hw_recent_flags[]`

**Detection rule:**
```
consecutive_unscored = 0
for entry in hw_recent_flags (newest first):
  if "UNSCORED" in entry.flags:
    consecutive_unscored += 1
  else:
    break

if consecutive_unscored >= 2:
  → set {hw_quality_degradation} = true
  → set {hw_unscored_count} = consecutive_unscored
```

### 7c — Parse CR evo-log for violation pattern

For each entry in CR evo-log (last 5):
1. Split by " | "
2. Extract field [4] = `flag`
3. Count entries where flag contains "QUALITY_VIOLATIONS"

If count >= 2 → `{cr_quality_violations}` = true.

### 7d — Parse TI evo-log for DRIFT pattern

For each entry in TI evo-log (last 5):
1. Split by " | "
2. Check if field [2] (trend_found) contains "[DRIFT from input]"
3. Count DRIFT occurrences

If count >= 2 → `{ti_drift_pattern}` = true (TI consistently redirecting from inputs).

---

## STEP 8 — Escalation Check

After Steps 2–7 complete, evaluate whether to escalate to DEEP:

```
issues_found = count of all CRITICAL + MAJOR findings so far

Escalate to DEEP if:
  a) issues_found == 0 AND symptom_type != "UNKNOWN"
     (user reported problem but Standard found nothing)
  b) issues_found > 0 AND all findings are WARN only AND symptom_type == "CRASH"
     (crash reported but only warnings found — something is hidden)
  c) User input contains "deep" / "detaljno" / "sve" / "full"

If escalating to DEEP:
  - Run D7 if not already run
  - Run as_get_agent_call_log for each SOMA agent (limit: 10, status omitted):
    as_get_agent_call_log(agent_name: "Trend Intelligence",    limit: 10)
    as_get_agent_call_log(agent_name: "Hook Writer",           limit: 10)
    as_get_agent_call_log(agent_name: "Content Repurposer",    limit: 10)
  - Run as_inspect_flow for ALL 4 SOMA agents (not just anomalous ones)
  Note: as_get_agent_call_log has no time filter — returns most recent N entries.
  Output preview is limited to 300 chars — useful for detecting empty/sentinel outputs only.
```

---

## STEP 9 — Root Cause Mapping (IF-THEN Table)

**CRITICAL: All root cause classification uses ONLY this table. No free-form LLM reasoning.**

Evaluate all rules. Multiple rules can fire simultaneously. Process in priority order.

### 9a — CRITICAL severity rules

```
RULE C1 — INFRA_DOWN
  IF d0_status == "DOWN"
  → Category: INFRA_DOWN | Severity: CRITICAL
  → Stop all other rules. Report infra issue only.

RULE C2 — FLOW_BROKEN (from D4)
  IF {agent}_appears_in d4_issues with severity != "WARN"
  → Category: FLOW_BROKEN | Severity: CRITICAL | Agent: {agent}
  → Evidence: d4_issues[agent].issue
  → Fix source: d4_issues[agent].fix (verbatim — do NOT modify)
  → Auto-apply: YES (trivial) — see Step 10

RULE C3 — FLOW_BROKEN (from D4, WARN severity)
  IF {agent}_appears_in d4_issues with severity == "WARN"
  → Category: FLOW_BROKEN | Severity: MAJOR | Agent: {agent}
  → Evidence: d4_issues[agent].issue
  → Fix source: d4_issues[agent].fix (verbatim)
  → Auto-apply: YES (trivial) — see Step 10

RULE C4 — KB_DEAD
  IF {agent}_kb_embedding_status == "empty"
  AND {agent}_kb_search_nodes is non-empty (agent queries KB)
  → Category: KB_DEAD | Severity: CRITICAL | Agent: {agent}
  → Evidence: "KB empty AND kb_search node exists — agent runs without memory"
  → Fix: "Run kb-sync skill to seed KB"
  → Auto-apply: NO (kb-sync is a separate skill)

RULE C5 — KB_MISSING
  IF {agent}_kb_count == 0
  AND {agent}_kb_search_nodes is non-empty
  → Category: KB_MISSING | Severity: CRITICAL | Agent: {agent}
  → Evidence: "No KB exists AND kb_search node wired — agent queries non-existent KB"
  → Fix: "Create KB via agent-scaffolder, then run kb-sync"
  → Auto-apply: NO

RULE C6 — KB_FAILED
  IF {agent}_kb_embedding_status == "failed"
  → Category: KB_FAILED | Severity: CRITICAL | Agent: {agent}
  → Evidence: "KB embedding permanently failed — agent memory is broken"
  → Fix: "Delete and recreate KB, then reseed with kb-sync"
  → Auto-apply: NO

RULE C7 — KB_UNWIRED
  IF D5 reveals {agent}_kb_search_node with knowledgeBaseId null or empty
  AND {agent}_kb_count == 1 (exactly one KB exists)
  → Category: KB_UNWIRED | Severity: CRITICAL | Agent: {agent}
  → Evidence: "kb_search node exists but knowledgeBaseId is unset"
  → Fix: as_patch_node_field (node_id from D5, kb_id from D6)
  → Auto-apply: YES (trivial)

RULE C8 — AGENT_FAILED (consecutive)
  IF {agent}_consecutive_failed >= 3
  → Category: AGENT_FAILED | Severity: CRITICAL | Agent: {agent}
  → Evidence: "{N} consecutive FAILED executions"
  → Fix: "Check flow config (D5) and KB status (D6) for this agent"
  → Auto-apply: NO
```

### 9b — MAJOR severity rules

```
RULE M1 — TIMEOUT
  IF {agent}_has_running == true AND any RUNNING execution duration > 5 min
  → Category: TIMEOUT | Severity: MAJOR | Agent: {agent}
  → Evidence: "Agent has RUNNING execution exceeding 5 minutes"
  → Fix: "Increase timeout on call_agent node; check if web search is hanging"
  → Auto-apply: NO

RULE M2 — CASCADING
  Cascade detection (requires at least 2 agents checked):
  IF ti_last_status == "FAILED"
  AND (hw_execution_count == 0 OR hw_last_timestamp < ti_last_timestamp)
  → Category: CASCADING | Severity: MAJOR
  → Evidence: "TI failed; HW has no subsequent executions → pipeline blocked at TI"
  → Primary: TI fix (from C2/C3/C8/M1 rules above)
  → Note: "Fix TI first — HW and CR failures are downstream consequences"

  IF ti_last_status == "COMPLETED"
  AND hw_last_status == "FAILED"
  AND (cr_execution_count == 0 OR cr_last_timestamp < hw_last_timestamp)
  → Category: CASCADING | Severity: MAJOR
  → Evidence: "TI OK; HW failed; CR has no subsequent executions → pipeline blocked at HW"
  → Primary: HW fix

RULE M3 — AGENT_FAILED (single)
  IF {agent}_consecutive_failed == 1 OR == 2
  → Category: AGENT_FAILED | Severity: MAJOR | Agent: {agent}
  → Evidence: "{N} recent FAILED executions"
  → Fix: "Review D5 flow config; may be transient — retry pipeline"
  → Auto-apply: NO
```

### 9c — WARNING severity rules

```
RULE W1 — KB_UNSEEDED
  IF {agent}_kb_embedding_status == "empty"
  AND {agent}_kb_search_nodes is empty (agent does NOT query KB)
  → Category: KB_UNSEEDED | Severity: WARN | Agent: {agent}
  → Evidence: "KB exists but empty; no kb_search node — not operationally blocking"
  → Fix: "Seed KB via kb-sync when ready to enable memory"
  → Auto-apply: NO

RULE W2 — KB_PROCESSING
  IF {agent}_kb_embedding_status == "processing"
  → Category: KB_PROCESSING | Severity: WARN | Agent: {agent}
  → Evidence: "KB embedding in progress — temporary state"
  → Fix: "Wait 60s and re-run pipeline-debug"
  → Auto-apply: NO

RULE W3 — KB_DEGRADED
  IF {agent}_kb_embedding_status == "partial_failure"
  → Category: KB_DEGRADED | Severity: WARN | Agent: {agent}
  → Evidence: "Some KB documents failed embedding — memory partially degraded"
  → Fix: "Run kb-sync to re-upload failed documents"
  → Auto-apply: NO

RULE W4 — QUALITY_DEGRADATION (HW)
  IF hw_quality_degradation == true (from D7)
  → Category: QUALITY_DEGRADATION | Severity: WARN | Agent: HW
  → Evidence: "{hw_unscored_count} consecutive UNSCORED entries in HW evo-log"
  → Fix: "Check HW prompt (D5) for score output format; check KB for instincts freshness"
  → Auto-apply: NO

RULE W5 — QUALITY_DEGRADATION (CR)
  IF cr_quality_violations == true (from D7)
  → Category: QUALITY_DEGRADATION | Severity: WARN | Agent: CR
  → Evidence: "Repeated QUALITY_VIOLATIONS in CR evo-log"
  → Fix: "Check CR instincts.md via kb-sync; update banned phrase list"
  → Auto-apply: NO

RULE W6 — NEVER_RAN
  IF {agent}_execution_count == 0 (NEVER_RAN)
  AND {agent} is in debug_scope
  → Category: NEVER_RAN | Severity: WARN | Agent: {agent}
  → Evidence: "No execution records found — agent may never have been triggered"
  → Fix: "Run soma-run to trigger the pipeline"
  → Auto-apply: NO

RULE W7 — DRIFT_PATTERN (TI)
  IF ti_drift_pattern == true (from D7)
  → Category: DRIFT_PATTERN | Severity: WARN | Agent: TI
  → Evidence: "TI consistently redirecting from provided inputs to different trends"
  → Fix: "Review TI prompt and instincts — consider whether drift is intentional"
  → Auto-apply: NO
```

### 9d — CLEAN result
```
IF no rules fired above:
  → {root_cause} = CLEAN
  → Report: "No issues detected across all checked dimensions."
  → If symptom_type != UNKNOWN: escalate to DEEP (Step 8 trigger)
```

---

## STEP 10 — Auto-Apply Trivial Fixes

Auto-apply is executed for findings classified as auto-fixable in Step 9.

**Trivial = auto-apply without confirmation:**
1. RULE C2/C3 (FLOW_BROKEN from D4): fix command verbatim from `d4_issues[agent].fix`
2. RULE C7 (KB_UNWIRED): `as_patch_node_field` with live IDs from D5 + D6

**Non-trivial = NEVER auto-apply:**
- Empty prompt (needs human content)
- Wrong model value (needs target from user)
- KB empty/failed (needs kb-sync — different skill)
- Phantom call_agent (needs deletion decision)
- Ambiguous KB (2+ KBs — same rule as soma-memory-fix)

### 10a — Pre-fix safety checks (per agent to fix)

Before touching any agent:

1. **Active execution guard:** Check `{agent}_has_running`. If true → SKIP this agent.
   Log: "⚠️ {agent} is currently RUNNING — skipping auto-fix to avoid race condition."

2. **Pre-patch re-read:** Call `as_inspect_flow(agent_name: "{agent}")` to confirm
   condition still exists. If condition resolved (another process fixed it) → SKIP.
   Log: "ℹ️ {agent}: condition already resolved. Skipping."

### 10b — Apply FLOW_BROKEN fix (from D4)

Use fix command verbatim from `d4_issues[agent].fix`:
```
as_patch_node_field(
  agent_name: "<from d4_issues>",
  node_id:    "<from d4_issues>",
  field_name: "<from d4_issues>",
  field_value: "<from d4_issues>"
)
```

Do NOT paraphrase or modify the command. The fix field is the authoritative source.

### 10c — Apply KB_UNWIRED fix (from D5+D6)

```
as_patch_node_field(
  agent_name: "<agent_name>",
  node_id:    "<node.id from D5 as_inspect_flow>",
  field_name: "knowledgeBaseId",
  field_value: "<bases[0].id from D6 as_list_knowledge_bases>"
)
```

Only if `{agent}_kb_count` == 1. If 0 or 2+ → skip, report as manual.

### 10d — Post-patch verification

After each patch, re-read to confirm:
```
as_inspect_flow(agent_name: "<agent_name>", node_type: "<patched_node_type>")
```

- If field now has expected value → mark as `FIXED ✅`
- If field still empty → mark as `VERIFY_FAILED ❌` — log error, report for manual follow-up
- If field has unexpected value → mark as `VERIFY_MISMATCH ❌` — do NOT overwrite, report

### 10e — Track results
```
{auto_fixes_applied}   = list of FIXED nodes
{auto_fixes_failed}    = list of VERIFY_FAILED / VERIFY_MISMATCH
{auto_fixes_skipped}   = list of skipped (running agent / ambiguous)
```

---

## STEP 11 — Generate Debug Report

```
🔍 SOMA PIPELINE DEBUG REPORT
══════════════════════════════════════════════════════════════
Generated  : {timestamp}
Scope      : {debug_scope}
Symptom    : {symptom_type}
Depth      : {STANDARD | DEEP}
Time ref   : {time_reference or "last 10 executions per agent"}
══════════════════════════════════════════════════════════════

INFRASTRUCTURE: {✅ REACHABLE | 🔴 DOWN}

EXECUTION STATUS SUMMARY:
  TI  → {last_status} | {execution_count} executions | {consecutive_failed} consecutive failed
  HW  → {last_status} | {execution_count} executions | {consecutive_failed} consecutive failed
  CR  → {last_status} | {execution_count} executions | {consecutive_failed} consecutive failed
  SA  → {last_status} | {execution_count} executions

══════════════════════════════════════════════════════════════
OVERALL: {🔴 CRITICAL | 🟠 MAJOR | 🟡 WARN | ✅ CLEAN} — {N total issues}
══════════════════════════════════════════════════════════════

🔴 CRITICAL ({N})
──────────────────────────────────────────
[For each CRITICAL finding:]
  [Rule: {RULE_ID}] [{Category}] Agent: {agent}
  Issue    : {description}
  Evidence : {specific data from MCP response}
  Fix      : {verbatim fix command or "Manual: instruction"}
  Auto-fix : {✅ Applied | ❌ Failed | ⏭️ Skipped | — N/A}

🟠 MAJOR ({N})
──────────────────────────────────────────
[Same format]

🟡 WARN ({N})
──────────────────────────────────────────
[Same format]

══════════════════════════════════════════════════════════════
ROOT CAUSE HYPOTHESIS
══════════════════════════════════════════════════════════════
Primary   : {highest-severity category} — {agent}
Cascade   : {CASCADING note if M2 fired}
Evidence  : {key data point from MCP that confirms root cause}
Fix order : {numbered list of fixes in priority order}

══════════════════════════════════════════════════════════════
AUTO-FIX LOG
══════════════════════════════════════════════════════════════
Applied   ({N}): {list of FIXED nodes}
Failed    ({N}): {list of VERIFY_FAILED nodes}
Skipped   ({N}): {reasons}

══════════════════════════════════════════════════════════════
NEXT STEPS
══════════════════════════════════════════════════════════════
{Numbered action list — manual fixes only, auto-fixes already applied}

1. [CRITICAL] ...
2. [MAJOR] ...
...
══════════════════════════════════════════════════════════════
```

**If CLEAN (no issues found):**
```
✅ No issues detected across all {N} dimensions checked.
{If symptom reported}: Escalating to DEEP diagnostic...
```

**If auto-fixes were applied:**
```
⚡ {N} trivial fix(es) auto-applied. Recommend re-running soma-run to verify pipeline health.
```

**If DEEP mode ran:**
```
📋 DEEP mode: reviewed call log previews (300-char limit) for output content.
   Useful for: detecting empty outputs, abort sentinels.
   Not useful for: quality analysis, score patterns (use D7 evo-log for those).
```

---

## Diagnostic Dimension Summary

| Dim | Tool | What it finds | SOMA-specific note |
|---|---|---|---|
| D0 | `as_health_check` | DB connectivity | Returns basic counts only |
| D1 | `as_get_recent_executions` × 4 | Execution history per agent | PRIMARY tool for SOMA (external orchestration) |
| D1b | `as_list_agent_calls` | A2A internal calls | Supplementary — usually empty for SOMA |
| D4 | `as_find_broken_flows` | 4 static flow patterns | Does NOT check KB wiring |
| D5 | `as_inspect_flow` | Full config: prompts, model, KB wiring | KB wiring check done here |
| D6 | `as_list_knowledge_bases` | KB embedding status | Cross-referenced with D5 |
| D7 | `obsidian_read_note` × 3 | Evo-log quality patterns | Conditional on symptom type |

**MCP call count (corrected):**
```
STANDARD (no quality trigger):
  D0(1) + D1(4) + D1b(1) + D4(1) + D5(0–4) + D6(0–3) = 7–13 calls, ~90s

STANDARD (quality trigger, D7 added):
  +3 obsidian reads = 10–16 calls, ~2min

DEEP:
  All above + as_get_agent_call_log × 3 + full D5 × 4 = max 22 calls, ~4min
```

---

## Tool Reference

| Tool | Parameters used | Notes |
|---|---|---|
| `as_health_check` | none | Returns basic counts only |
| `as_get_recent_executions` | `agent_name`, `limit`, optional `status` | PRIMARY execution check |
| `as_list_agent_calls` | `since_hours`, `limit` | A2A only — supplementary |
| `as_get_agent_call_log` | `agent_name`, `limit`, optional `status` | A2A only, no time filter |
| `as_find_broken_flows` | none (optional `public_only`) | 4 patterns, all agents |
| `as_inspect_flow` | `agent_name`, optional `node_type` | Full flow config |
| `as_list_knowledge_bases` | `agent_name` | KB status per agent |
| `as_patch_node_field` | `agent_name`, `node_id`, `field_name`, `field_value` | Auto-fix only |
| `obsidian_read_note` | `path` | Evo-log analysis |

**Excluded tools and reasons:**
- `as_get_heartbeat_status`: requires exact `agent_id` — needs extra as_list_agents call for minimal value
- `as_get_kb_embedding_status`: redundant — `as_list_knowledge_bases` already returns full status breakdown
- `as_diagnose_models`: covered by agent-health-check scope, not needed reactively

---

## Constraints Summary

| Constraint | Rule |
|---|---|
| Root cause | ONLY from IF-THEN table in Step 9 — never LLM inference |
| Fix IDs | ONLY from live MCP calls in current session — never from memory |
| Auto-apply | ONLY trivial fixes (C2/C3 from D4 verbatim, C7 with 1 KB) |
| Auto-apply guard | Check RUNNING status + pre-patch re-read before every patch |
| Post-patch verify | Always re-read to confirm patch took effect |
| A2A tools | D1b only — never as primary SOMA diagnostic |
| D7 trigger | Quality keywords in input → Standard; otherwise → Deep only |
| CONFIG_DRIFT | Not a category — cannot detect without config baseline |
| Score Analyzer | D1 check only — no evo-log, no auto-fix, secondary scope |
| 300-char limit | Call log output preview detects empty/sentinel outputs only |
| Time filter | as_get_recent_executions has no time filter — always last N records |

---

## Invocation Examples

```
"pipeline-debug"
"debug pipeline — HW timeout jutros u 10h"
"zašto pipeline ne radi? scores dropping"
"pipeline se srušio — provjeri sve"
"debug TI — ne vraća ništa"
"CR daje prazan output od jučer"
"pipeline-debug — deep"
"šta je pokvareno u SOMA-i?"
"provjeri SOMA — quality je pala"
```
