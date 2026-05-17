---
name: soma-run
version: 1.1.0
description: >
  End-to-end SOMA pipeline runner: validates input, runs TI → HW → CR sequentially,
  captures outputs at each step, writes evo-logs to Obsidian, and logs winners.
  One skill call replaces manual as_chat_with_agent + evo-log-writer + winners-log-logger.
triggers:
  - "soma run"
  - "pokreni pipeline"
  - "run pipeline"
  - "pokreni SOMA"
  - "run SOMA"
  - "run TI"
  - "pokreni TI"
  - "full pipeline run"
  - "end-to-end run"
  - "soma-run"
  - "run the pipeline"
  - "pusti kroz pipeline"
  - "pusti trend kroz pipeline"
do_not_use_when:
  - User wants to validate input only (use pipeline-input-validator)
  - User wants to log an existing run (use evo-log-writer)
  - User wants to sync KB content (use kb-sync)
  - User wants a health check (use agent-health-check)
  - User wants to fix kb_search wiring (use soma-memory-fix)
---

# Skill: soma-run

*Version: 1.1.0*
*v1.0.0: initial implementation — live-verified 2026-05-16*
*v1.1.0 changes (2026-05-16):*
  *FIX 1 — Winners-log written immediately after HW (not end-of-pipeline) to prevent hook text loss on session compaction*
  *FIX 2 — Intermediate output persistence: each agent output saved to temp vault note; cleaned up on success*
  *FIX 3 — TI drift detection: original_input vs ti_trend comparison; logged in evo-log*
  *FIX 4 — Score cross-validation: HW scores vs CR scores; degradation flagged in report*
  *FIX 5 — Retry logic: 1 retry per agent on timeout or abort sentinel (+30s timeout on retry)*
  *FIX 6 — CR quality violations gate: if CR detects violations, amend winners-log with warning*

---

## Purpose

Runs the full SOMA content pipeline in a single skill invocation:

```
[User input] → VALIDATE → TI → HW → [Winners-log] → CR → [Evo-logs] → [Report]
```

Key change from v1.0.0: winners-log is written immediately after HW completes,
while hook texts are still in context. Evo-logs are written after CR completes.

---

## Hard rules — zero hallucination

- Never fabricate agent outputs, scores, hook text, or log entries
- Every evo-log entry must contain only data extracted from actual agent responses
- If an agent times out or returns an error → log `FAILED` — never invent a plausible output
- All Obsidian paths are fixed (confirmed 2026-05-16) — do NOT invent new paths
- Retry is limited to 1 attempt per agent — never retry more than once

---

## Confirmed constants (live-verified 2026-05-16)

```
TIMEOUTS (primary attempt):
  TI  → timeout_seconds: 180
  HW  → timeout_seconds: 120
  CR  → timeout_seconds: 120

TIMEOUTS (retry — +30s each):
  TI retry  → timeout_seconds: 210
  HW retry  → timeout_seconds: 150
  CR retry  → timeout_seconds: 150

EVO-LOG PATHS:
  TI  → agents/trend-intelligence/evo-log.md
  HW  → agents/hook-writer/evo-log.md
  CR  → agents/content-repurposer/evo-log.md

WINNERS-LOG PATH:
  → agents/hook-writer/winners-log.md
  → Threshold: score ≥ 17/20

TEMP NOTE PATHS (deleted after successful run):
  TI output  → temp/soma-run-{run_id}-ti.md
  HW output  → temp/soma-run-{run_id}-hw.md
  CR output  → temp/soma-run-{run_id}-cr.md

EVO-LOG FORMATS:
  TI: date | original_input (≤60 chars) | trend_found [DRIFT if detected] | confidence | angle_suggested | hook_writer_triggered
  HW: date | trend | platforms | scores | winner_platform | winner_score | flags
  CR: date | trend | platforms_completed | scores | flag | notes

WINNERS-LOG FORMAT:
  date | trend | platform | hook_text | score | pattern

HW SCORE PATTERN (regex): LI:\d+ X:\d+ YT:\d+ IG:\d+ TT:\d+

DRIFT THRESHOLD:
  If fewer than 3 words from original_input appear in ti_trend → flag as DRIFT

SCORE DEGRADATION THRESHOLD:
  If any platform score in CR is more than 2 points below HW score → flag as DEGRADED

ABORT SENTINELS (case-insensitive):
  - empty string or len < 50 characters
  - starts with "I cannot"
  - starts with "I don't have"
  - starts with "I'm unable"
  - starts with "I'm sorry, I"
  - contains "As an AI, I"
```

---

## STEP 0 — Task List

Create tasks before starting:
- "VALIDATE — input gate"
- "TI — Trend Intelligence run"
- "HW — Hook Writer run + winners-log"
- "CR — Content Repurposer run"
- "LOG — Write evo-logs"
- "CLEANUP — Remove temp notes"
- "REPORT — Final summary"

Mark each `in_progress` before starting, `completed` when done.

---

## STEP 1 — Determine Pipeline Scope

### Full pipeline (default)
Run all three agents: TI → HW → CR.

### Partial pipeline (scope override)
If user explicitly specifies a shorter scope:

| User says | Scope |
|---|---|
| "samo TI" / "run TI only" | Run only TI. Stop after TI log. |
| "TI i HW" / "TI and HW" / "stop before CR" | Run TI → HW. Stop after HW log + winners-log. |
| (anything else) | Full pipeline: TI → HW → CR |

Store as `pipeline_scope`: `"TI"` / `"TI+HW"` / `"FULL"`.

---

## STEP 2 — VALIDATE: Input Gate

### 2a — Validator recommendation
Before running, check if the user has already run `pipeline-input-validator` on this
input. If they have not, recommend it:

> "💡 Preporučujem da prvo pokreneš `pipeline-input-validator` na ovom inputu. Ako je
> status PASS ili WARN+, nastavi sa soma-run. Nastavljamo svejedno?"

If user confirms (or if they already have a PASS/WARN+ result) → proceed to 2b.
If user has a WARN- or FAIL result → warn but allow override: "Input ima slab score.
Sigurno želiš da ga pustiš kroz pipeline?"

### 2b — Minimum input check

Extract the raw trend input from the user's message. Apply:

| Check | Abort condition |
|---|---|
| Empty | Input is empty or whitespace only → ABORT |
| Too short | Input is < 20 characters → ABORT: "Input je prekratak. Opiši trend konkretno." |
| Abort sentinel in input | Input contains an abort sentinel string → ABORT: "Input sadrži nevalidan sadržaj." |

If input passes → store as `{trend_input}`. Store also as `{original_input}` (immutable copy,
used for drift detection in Step 4). Proceed to Step 3.

---

## STEP 3 — Generate run_id

Generate run ID using current date and time:
```
run_id = YYYY-MM-DD-HHMMSS   (e.g. 2026-05-16-143022)
```

Use today's actual date. Do not guess or fabricate. If unsure of current time,
use `YYYY-MM-DD` only as the run_id.

Store as `{run_id}`. This ID appears in evo-log entries and temp note paths.

Initialize retry counters: `{ti_retries}` = 0, `{hw_retries}` = 0, `{cr_retries}` = 0.

---

## STEP 4 — TI: Run Trend Intelligence

### 4a — Mark task in_progress

### 4b — Build TI message

Construct the message as follows (date injection is mandatory):
```
Today is {YYYY-MM-DD}. {trend_input}
```

Example:
```
Today is 2026-05-16. Anthropic released Claude Sonnet 4 — 40% SWE-bench improvement.
```

**CRITICAL:** The `Today is {date}` prefix MUST be included. Without it, TI runs without
date context and may misclassify freshness. Confirmed bug on 2026-05-15.

### 4c — Call TI (with retry)

**Primary attempt:**
```
as_chat_with_agent(
  agent_name:      "Trend Intelligence",
  message:         "Today is {YYYY-MM-DD}. {trend_input}",
  timeout_seconds: 180
)
```

**On ABORT or timeout (retry — max 1):**
If `{ti_retries}` == 0:
- Set `{ti_retries}` = 1
- Wait 5 seconds
- Retry with `timeout_seconds: 210`
- Log: "⚠️ TI retry 1/1 — original attempt failed."

If retry also fails → mark TI as `FAILED`. Report ABORT. Stop pipeline.
Do NOT attempt a 3rd call.

### 4d — Capture output

Store the full reply text as `{ti_output}`.

### 4e — Save TI output to temp note

Call `obsidian_create_note`:
```
path:    "temp/soma-run-{run_id}-ti.md"
content: "# TI Output — soma-run {run_id}\n\n{ti_output}"
```

If this call fails → log warning but continue. Temp note is a safety net, not a blocker.

### 4f — Validate TI output

Check `{ti_output}` against abort sentinels:
- If ABORT condition matched → mark TI as `FAILED`. Stop pipeline.
  Report: "⛔ TI vrati prazan ili nevalidan output. Pipeline abortiran."
- If OK → proceed to 4g.

### 4g — Extract TI data

From `{ti_output}`, extract:
- `{ti_trend}`: the trend name/title TI identified (first headline or sentence)
- `{ti_confidence}`: confidence rating (⭐⭐⭐ = HIGH, ⭐⭐ = MED, ⭐ = LOW/EVERGREEN)
- `{ti_angle}`: the content angle TI suggested
- Set `{ti_status}` = `"yes"` (hook_writer_triggered)

### 4h — Drift detection (FIX 3)

Compare `{original_input}` to `{ti_trend}`:

1. Tokenize both strings (split on spaces, lowercase, strip punctuation)
2. Count how many tokens from `{original_input}` appear in `{ti_trend}`

**Drift rule:**
- If < 3 tokens overlap → set `{drift_flag}` = `"DRIFT"`, `{drift_detected}` = true
- Otherwise → set `{drift_flag}` = `"none"`, `{drift_detected}` = false

If drift detected, log to console:
```
⚠️ DRIFT DETECTED
Original input : {original_input (first 60 chars)}
TI trend found : {ti_trend}
Overlap tokens : {N}
```

The pipeline does NOT abort on drift — it continues but records it in the evo-log and
the final report.

---

## STEP 5 — HW: Run Hook Writer + Write Winners-log

*Skip if `pipeline_scope == "TI"`.*

### 5a — Mark task in_progress

### 5b — Call HW (with retry)

Pass the full TI output as the message. Do not summarize or truncate.

**Primary attempt:**
```
as_chat_with_agent(
  agent_name:      "Hook Writer",
  message:         {ti_output},
  timeout_seconds: 120
)
```

**On ABORT or timeout (retry — max 1):**
If `{hw_retries}` == 0:
- Set `{hw_retries}` = 1
- Wait 5 seconds
- Retry with same message, `timeout_seconds: 150`
- Log: "⚠️ HW retry 1/1 — original attempt failed."

If retry also fails → mark HW as `FAILED`. Log TI evo-log only. Stop pipeline.
Report: "⛔ HW vrati nevalidan output. TI je logiran. Pipeline abortiran."

### 5c — Capture output

Store the full reply text as `{hw_output}`.

### 5d — Save HW output to temp note (FIX 2)

Call `obsidian_create_note`:
```
path:    "temp/soma-run-{run_id}-hw.md"
content: "# HW Output — soma-run {run_id}\n\n{hw_output}"
```

If this call fails → log warning and continue. Hook texts are still in `{hw_output}` in
active context — proceed. Temp note is a safety net only.

### 5e — Extract scores from HW output

Scan `{hw_output}` for the score pattern `LI:\d+ X:\d+ YT:\d+ IG:\d+ TT:\d+`.

- If pattern found → extract individual platform scores:
  ```
  {hw_scores_raw} = "LI:19 X:18 YT:17 IG:17 TT:18"   (example)
  {hw_scores} = { LI: 19, X: 18, YT: 17, IG: 17, TT: 18 }
  ```
- If pattern NOT found → set `{hw_scores_raw}` = `"UNSCORED"`, `{hw_scores}` = null.

Determine winner platform:
- If `{hw_scores}` is not null → find platform with highest score.
  Ties: prefer LinkedIn > X > YouTube > Instagram > TikTok.
  Store as `{hw_winner_platform}` and `{hw_winner_score}`.
- If `{hw_scores}` is null → `{hw_winner_platform}` = `"n/a"`, `{hw_winner_score}` = `"n/a"`.

Determine flags:
- If `{hw_scores}` is null → flag = `"UNSCORED"`
- If all platform scores identical → flag = `"SINGLE_HOOK_BUG"` (same hook on all platforms)
- If any quality violation detected (banned phrase / fabricated stat) → flag = `"QUALITY_VIOLATION"`
- If clean run → flag = `"none"`

Store as `{hw_flags}`.

### 5f — Write Winners-log immediately (FIX 1 + FIX 6 gate)

**Write winners-log here — while {hw_output} is still in active context.**
Do not defer to end-of-pipeline.

**Quality gate (FIX 6):**
If `{hw_flags}` contains `"QUALITY_VIOLATION"` → skip winners-log entirely for this run.
Log: "⏭️ Winners-log skipped — HW QUALITY_VIOLATION flag. Hooks are tainted."
Jump to Step 6.

**Threshold check:**
For each platform in `{hw_scores}`:
- If score ≥ 17 → qualifies for winners-log

If no platform qualifies → skip winners-log. Jump to Step 6.

**Extract hook text per qualifying platform:**

For each qualifying platform, scan `{hw_output}` for:
- Platform label: `**LinkedIn:**`, `HOOK_LINKEDIN:`, `LinkedIn hook:`, or similar
- Extract the hook text that follows the label (first 2–3 sentences or up to the next
  platform label)
- If hook text not extractable → use `"[hook text not found in output]"`

Extract pattern type if visible (P1–P6). If not visible → use `"unknown"`.

**Read before write:**
Call `obsidian_read_note` on `agents/hook-writer/winners-log.md`.
If not found → create first with `obsidian_create_note`.

**Write one entry per qualifying platform:**
Call `obsidian_update_note` for each:
```
path:    "agents/hook-writer/winners-log.md"
mode:    "append"
content: "{date} | {ti_trend} | {platform} | {hook_text} | {score}/20 | {hook_pattern}"
```

Real format example:
```
2026-05-16 | Anthropic Claude Sonnet 4 release | LinkedIn | Human code isn't the bottleneck anymore — your AI agent is. | 19/20 | P1
```

Store count of winners written as `{winners_written}`.
Store list of winning platforms as `{winners_platforms}`.

---

## STEP 6 — CR: Run Content Repurposer

*Skip if `pipeline_scope == "TI"` or `pipeline_scope == "TI+HW"`.*

### 6a — Mark task in_progress

### 6b — Call CR (with retry)

Pass the full HW output as the message. Do not summarize or truncate.

**Primary attempt:**
```
as_chat_with_agent(
  agent_name:      "Content Repurposer",
  message:         {hw_output},
  timeout_seconds: 120
)
```

**On ABORT or timeout (retry — max 1):**
If `{cr_retries}` == 0:
- Set `{cr_retries}` = 1
- Wait 5 seconds
- Retry with same message, `timeout_seconds: 150`
- Log: "⚠️ CR retry 1/1 — original attempt failed."

If retry also fails → mark CR as `FAILED`. Log TI and HW evo-logs. Skip CR log.
Report: "⛔ CR vrati nevalidan output. TI i HW su logirani. CR nije logiran."

### 6c — Capture output

Store the full reply text as `{cr_output}`.

### 6d — Save CR output to temp note (FIX 2)

Call `obsidian_create_note`:
```
path:    "temp/soma-run-{run_id}-cr.md"
content: "# CR Output — soma-run {run_id}\n\n{cr_output}"
```

### 6e — Extract CR data

- Scan for score pattern `LI:\d+ X:\d+ YT:\d+ IG:\d+ TT:\d+` in `{cr_output}`.
  If found → store as `{cr_scores_raw}`, parse into `{cr_scores}`.
  If not found → `{cr_scores_raw}` = `"UNSCORED"`, `{cr_scores}` = null.
- Count platforms completed: scan for LinkedIn / X/Twitter / YouTube / Instagram / TikTok sections.
  Store as `{cr_platforms_completed}` = `"N/5"`.
- Determine CR flag:
  - If `{cr_scores_raw}` = `"UNSCORED"` → flag = `"WARN"`
  - If quality violation detected (banned phrase / fabricated stat) → flag = `"QUALITY_VIOLATIONS"`
  - If clean → flag = `"none"`
  Store as `{cr_flag}`.
- Notes: short 1-line summary (e.g., "✅ CLEAN RUN" or specific issue).
  Store as `{cr_notes}`.

### 6f — Score cross-validation (FIX 4)

*Only if both `{hw_scores}` and `{cr_scores}` are not null.*

For each platform, compare:
```
delta = cr_scores[platform] - hw_scores[platform]
```

- If any delta < -2 → set `{score_degradation}` = true, store degraded platforms
- If all deltas ≥ -2 → set `{score_degradation}` = false

If `{score_degradation}` = true:
```
⚠️ SCORE DEGRADATION DETECTED
Platform scores dropped by more than 2 points after CR:
  [list platform: HW score → CR score]
This may indicate CR modified hooks in a way that reduced quality.
```

### 6g — CR quality violation → amend winners-log (FIX 6 follow-up)

If `{cr_flag}` = `"QUALITY_VIOLATIONS"` AND `{winners_written}` > 0:

Call `obsidian_read_note` on `agents/hook-writer/winners-log.md`.
Call `obsidian_update_note` to append:
```
path:    "agents/hook-writer/winners-log.md"
mode:    "append"
content: "⚠️ {date} | QUALITY_VIOLATION AMENDMENT | run {run_id} | CR detected quality violations after winners were logged. Review winners from this run before use."
```

---

## STEP 7 — LOG: Write Evo-logs

### 7a — Read before write (mandatory)

Before writing to any evo-log, call `obsidian_read_note` to confirm the note exists.
If `"Note not found"` → create with `obsidian_create_note`, then append.

### 7b — Write TI evo-log

Format includes `{original_input}` and `{drift_flag}` for traceability (FIX 3):

```
path:    "agents/trend-intelligence/evo-log.md"
mode:    "append"
content: "{date} | INPUT:{original_input ≤60 chars} | {ti_trend}{drift_flag_inline} | {ti_confidence} | {ti_angle} | {ti_status}"
```

**{drift_flag_inline}** — appended directly to trend if drift occurred:
- If drift: `" [DRIFT from input]"`
- If no drift: `""` (nothing appended)

Real format example (drift detected):
```
2026-05-16 | INPUT:Claude for Small Business launch | Anthropic Claude Sonnet 4 release [DRIFT from input] | ⭐⭐⭐ | Self-improving AI agents | yes
```

Real format example (no drift):
```
2026-05-16 | INPUT:Anthropic Claude Sonnet 4 released | Anthropic Claude Sonnet 4 release | ⭐⭐⭐ | Self-improving AI agents | yes
```

### 7c — Write HW evo-log

*Skip if HW was not run or FAILED.*

```
path:    "agents/hook-writer/evo-log.md"
mode:    "append"
content: "{date} | {ti_trend} | all-5 (platform-specific) | {hw_scores_raw} | {hw_winner_platform} | {hw_winner_score}/20 | {hw_flags}"
```

If retry was used: append ` | RETRY:1` at end of entry.

### 7d — Write CR evo-log

*Skip if CR was not run or FAILED.*

```
path:    "agents/content-repurposer/evo-log.md"
mode:    "append"
content: "{date} | {ti_trend} | {cr_platforms_completed} | {cr_scores_raw} | {cr_flag} | {cr_notes}"
```

If score degradation detected: append ` | ⚠️ SCORE_DEGRADED` at end of entry.
If retry was used: append ` | RETRY:1`.

---

## STEP 8 — CLEANUP: Remove Temp Notes

*Only run if the full pipeline completed without FAILED steps.*

For each temp note created during this run, call `obsidian_delete_note`:
```
temp/soma-run-{run_id}-ti.md
temp/soma-run-{run_id}-hw.md   (if HW ran)
temp/soma-run-{run_id}-cr.md   (if CR ran)
```

If any delete fails → log warning and continue. Stale temp notes are harmless.

**If any agent FAILED** → do NOT delete temp notes. They serve as recovery artifacts.
Note in report: "📁 Temp notes preserved for recovery: temp/soma-run-{run_id}-*.md"

---

## STEP 9 — REPORT: Final Summary

```
🚀 SOMA RUN — COMPLETE
══════════════════════════════════════════
Run ID   : {run_id}
Scope    : {pipeline_scope}
Input    : {trend_input (first 80 chars)}
══════════════════════════════════════════

STEP RESULTS:
  TI  → {✅ COMPLETED | ⛔ FAILED | ⏭️ SKIPPED} {⚠️ RETRY:1 if retried}
  HW  → {✅ COMPLETED | ⛔ FAILED | ⏭️ SKIPPED} {⚠️ RETRY:1 if retried}
  CR  → {✅ COMPLETED | ⛔ FAILED | ⏭️ SKIPPED} {⚠️ RETRY:1 if retried}

══════════════════════════════════════════
TI OUTPUT SUMMARY:
  Original input : {original_input (first 60 chars)}
  Trend found    : {ti_trend}
  Drift          : {⚠️ DRIFT DETECTED | ✅ none}
  Confidence     : {ti_confidence}
  Angle          : {ti_angle}

HW OUTPUT SUMMARY:
  Scores         : {hw_scores_raw}
  Winner         : {hw_winner_platform} ({hw_winner_score}/20)
  Flags          : {hw_flags}

CR OUTPUT SUMMARY:
  Platforms      : {cr_platforms_completed}
  Scores         : {cr_scores_raw}
  Flag           : {cr_flag}
  Score vs HW    : {✅ consistent | ⚠️ DEGRADED: [platforms]}
  Notes          : {cr_notes}

══════════════════════════════════════════
LOGGING:
  TI evo-log    → {✅ written | ⛔ failed}
  HW evo-log    → {✅ written | ⛔ failed | ⏭️ skipped}
  CR evo-log    → {✅ written | ⛔ failed | ⏭️ skipped}
  Winners-log   → {✅ N entries written | ⏭️ no hooks ≥17 | ⏭️ skipped (quality gate)}
  Temp notes    → {✅ cleaned up | 📁 preserved for recovery}
══════════════════════════════════════════
```

If any step FAILED:
```
⚠️ Neke faze nisu završene. Provjeri agent status u Agent Studio.
```

If full pipeline completed cleanly:
```
✅ Pipeline završen. Možeš pokrenuti soma-performance-review za historijski pregled.
```

---

## STEP 10 — Error Recovery Guide

Include only if a FAILED step occurred:

| Failed step | Likely cause | Action |
|---|---|---|
| TI FAILED (timeout, both attempts) | Web search timeout | Pokušaj ponovo — TI timeout je 180s (210s retry) |
| TI FAILED (abort sentinel) | Agent misconfigured | Pokreni agent-health-check |
| HW FAILED (timeout, both attempts) | Large TI output | Pokušaj ponovo — HW timeout je 120s (150s retry) |
| HW FAILED (abort sentinel) | Bad TI output passed | Provjeri TI output u temp/soma-run-{run_id}-ti.md |
| CR FAILED (any) | Pokušaj ponovo | CR rijetko faila na validan HW output |
| Evo-log write failed | Obsidian MCP nedostupan | Provjeri Obsidian MCP konekciju |
| Winners-log amendment failed | Obsidian MCP nedostupan | Ručno dodaj quality warning u winners-log |

**Temp note recovery:**
If a pipeline run aborts mid-way and leaves temp notes, the hook texts and agent
outputs are preserved in:
```
temp/soma-run-{run_id}-ti.md
temp/soma-run-{run_id}-hw.md
temp/soma-run-{run_id}-cr.md
```
These can be read manually or used to restart the pipeline from the failed step.
Delete temp notes manually after recovery.

---

## Tool Reference

| Tool | Used for | Key params |
|---|---|---|
| `as_chat_with_agent` | Run TI / HW / CR | `agent_name`, `message`, `timeout_seconds` |
| `obsidian_read_note` | Read evo-log / winners-log before write | `path` |
| `obsidian_update_note` | Append evo-log or winners-log entry | `path`, `mode: "append"`, `content` |
| `obsidian_create_note` | Create note if missing / save temp output | `path`, `body` |
| `obsidian_delete_note` | Delete temp notes after successful run | `path` |

---

## Constraints Summary

| Constraint | Rule |
|---|---|
| Date injection | ALWAYS prefix TI message with "Today is YYYY-MM-DD." |
| Output passing | Pass FULL agent output to next agent — never truncate or summarize |
| Abort on sentinel | Check every agent output before passing downstream |
| Retry limit | Max 1 retry per agent — never more |
| Log only real data | Never write fabricated scores, trends, or hook text |
| Read before write | Always `obsidian_read_note` before `obsidian_update_note` |
| Timeouts | TI: 180s (retry: 210s) | HW: 120s (retry: 150s) | CR: 120s (retry: 150s) |
| Winners threshold | Score ≥ 17/20 per platform |
| Winners timing | Write winners-log AFTER HW, not at end of pipeline |
| Winners quality gate | Skip winners-log if hw_flags = QUALITY_VIOLATION |
| Temp notes | Create after each agent, delete after full success |
| Drift detection | Log and report — do NOT abort pipeline |
| Score cross-validation | Compare HW vs CR per platform — flag if delta > 2 |

---

## Invocation examples

```
"soma run — Claude Sonnet 4 released, SWE-bench +40%"
"pokreni pipeline — https://anthropic.com/news/claude-sonnet-4"
"run SOMA — samo TI"
"pusti trend kroz pipeline: OpenAI GPT-5 Turbo announced"
"soma-run — TI i HW samo, bez CR"
"run the pipeline on this: Anthropic released Claude 4 Opus today"
```
