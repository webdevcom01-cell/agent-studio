---
name: instincts-updater
description: Extracts patterns from SOMA agent evo-logs, proposes new instincts, and — after human approval — appends them to the correct instincts.md files in the Obsidian vault. Use when the user says "update instincts", "ažuriraj instinkte", "instincts update", "nauči agente iz evo-logova", "analiziraj logove za instinkte", "šta su agenti naučili", "provjeri greške u logovima", "izgeneriši instinkte iz logova", "what have agents learned", "extract patterns", "ekstrakcija obrazaca", "nauči iz grešaka", "izvuci obrasce", "dodaj instinkte", or after a batch of runs when the user wants to consolidate learnings. Do NOT use for general Obsidian writes (use obsidian-knowledge-logger), for running agents (use soma-run), or for checking pipeline health (use agent-health-check). ALWAYS wait for explicit human approval before writing any instinct to the vault.
---

# Instincts Updater

Batch-extract patterns from SOMA evo-logs, surface proposed instincts to the user for approval, then append confirmed instincts to the correct vault files. **Human approval is mandatory before any write.** This skill never self-modifies agents without confirmation.

## Core principle

Instincts are learned, not invented. Every proposed instinct must be grounded in at least one observed event from the evo-log. If no evidence exists in the log, no proposal is made. Zero tolerance for hallucinated patterns.

---

## STEP 0 — Task list

Create tasks:
- "Parse evo-logs per agent"
- "Parse winners-log and detect P-code patterns"
- "Build instinct proposals (with semantic dedup)"
- "Present proposals to user — await approval"
- "Write approved instincts to vault"

Mark each in_progress before starting, completed when done.

---

## STEP 1 — Vault discovery

Read the following files to understand current instinct state. Do NOT skip — writing without reading first leads to format mismatches.

### Evo-log vault paths

| Agent | Evo-log path |
|---|---|
| Trend Intelligence (TI) | `agents/trend-intelligence/evo-log.md` |
| Hook Writer (HW) | `agents/hook-writer/evo-log.md` |
| Content Repurposer (CR) | `agents/content-repurposer/evo-log.md` |
| Score Analyzer (SA) | `agents/score-analyzer/evo-log.md` |

### Instincts vault paths

| Agent | Instincts path | Has QGF section | Has YAML frontmatter |
|---|---|---|---|
| TI | `agents/trend-intelligence/instincts.md` | ❌ No | ❌ No |
| HW | `agents/hook-writer/instincts.md` | ❌ No | ❌ No |
| CR | `agents/content-repurposer/instincts.md` | ✅ Yes | ❌ No |
| SA | `agents/score-analyzer/instincts.md` | ❌ No | ✅ Yes |

### Other paths

| Path | Status |
|---|---|
| `agents/hook-writer/winners-log.md` | HW winners log |
| `shared/` | Folder exists, may have no files |
| `system/` | Folder exists, currently empty |

Use `obsidian_read_note` for each path. For instincts files, note the existing section structure and writing style — you will write new content in the same style.

---

## STEP 2 — Parse evo-logs

### 2a — Minimum run threshold

An agent with fewer than **3 entries** in its evo-log is below the analysis threshold. Skip it with a note: *"Skipped — N entries, need ≥3 before pattern extraction."*

**Score Analyzer currently has 1 entry and will be skipped.**

### 2b — Multi-line entry handling (F4)

Evo-logs use pipe-delimited single-line entries, but TI entries can span multiple lines with continuation lines. Parser rule:

```
For each line in the ## Entries section:
  IF line starts with YYYY-MM-DD |  → new entry, start collecting
  ELSE IF line is blank              → skip
  ELSE                               → continuation of previous entry (append to it)
```

Continuation lines in TI evo-log start with `⚠️ FLAG:` or `ℹ️ NOTE:`. They belong to the entry above them, not a new entry.

### 2c — Score Analyzer section skip (F6)

Score Analyzer evo-log has a `## Instincts Update Trigger` section containing meta-rules (not run data). Parse **only the `## Entries` section** for SA. Ignore all other sections.

### 2d — Flag syntax per agent (F10)

Each agent uses a different flag syntax. Match exactly — not substring, not case-insensitive:

| Agent | Flag syntax to detect |
|---|---|
| Trend Intelligence | `⚠️ FLAG:` |
| Hook Writer | `QUALITY_VIOLATION` |
| Content Repurposer | `QUALITY_VIOLATIONS` or `WARN` |
| Score Analyzer | `QUALITY_GATE_FAIL` |

An entry containing the agent's flag syntax = a quality gate failure event. Collect all such entries as `flagged_entries[]` per agent.

### 2e — What to collect per entry

For each flagged entry, record:
- `date`: the entry date
- `trend`: the input trend topic
- `flag_text`: the full flag line(s)
- `agent`: which agent

For unflagged entries, record only `date` and `trend` (used for run count and P-code analysis in HW).

---

## STEP 3 — Parse winners-log

Winners-log path: `agents/hook-writer/winners-log.md`

### 3a — Filter invalid entries (F7)

Some older entries have placeholder text instead of real P-code data. Skip any entry where the P-code column contains `[not` (e.g., `[not preserved]`, `[not recovered]`). These are not usable for frequency analysis.

### 3b — Count P-code frequency

From valid entries, count how many times each P-code (P1, P1a, P2, P3, P4, P5) appears as the winning hook type. A P-code that appears in fewer than 20% of valid entries across ≥5 runs may indicate the agent is underutilizing that pattern — note this for the user but do not auto-propose an instinct (not enough signal unless there's also a flagged entry explaining why).

---

## STEP 4 — Pattern detection

For each agent with ≥3 entries:

### 4a — Quality gate failure patterns

Group `flagged_entries[]` by topic similarity:
- Same root cause (same flag text theme) appearing ≥2 times = **recurring pattern** → propose instinct
- Single occurrence = **one-off** → include in report but do NOT propose instinct (not enough signal)

### 4b — Cross-agent pattern detection (global promotion)

If the same root cause appears in **≥3 agents** with ≥2 occurrences each → propose writing to `shared/global-instincts.md` in addition to (not instead of) per-agent instincts.

### 4c — SOMA-format for instinct content

Per SOMA.md, every instinct entry follows this structure:

```
**situation:** <when does this happen>
**mistake:** <what went wrong>
**fix:** <concrete action to prevent recurrence>
```

Use English for CR and SA (their files already use English). Use whichever language the existing instincts.md uses for TI and HW (currently English bullet format — follow that).

---

## STEP 5 — Semantic dedup (F9)

Before proposing any instinct, check whether the topic is already covered in the target instincts.md file.

**Rule:** Scan existing instincts.md content for topic keywords. If a keyword match is found, skip the proposal and log: *"Skipped — topic already covered in [agent] instincts (keyword: [word])."*

### Keyword sets by topic

| Topic | Keywords to search for |
|---|---|
| Fabricated stats / hallucinated numbers | `fabricated`, `stat`, `percentage`, `invented`, `invent`, `hallucinated`, `made-up` |
| Banned phrases / tone | `banned`, `phrase`, `cliché`, `forbidden`, `change the game` |
| Empty input / vague input | `vague`, `empty input`, `VAGUE_INPUT`, `missing trend` |
| Double orchestration | `double`, `duplicate`, `chain`, `auto-call` |
| Low confidence | `low confidence`, `single source`, `⭐` |

Add new topics as they emerge. If no keyword match → proceed with proposal.

---

## STEP 6 — Build and present proposals

Format each proposal as a numbered block for the user to review:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROPOSAL #N — [Agent Name]
Target file: agents/[agent]/instincts.md
Section: ## Quality Gate Failures  (will be CREATED if missing)
Evidence: [N occurrences] — dates: [date1, date2, ...]
Trigger: [flag text from log]

Content to append:
---
**situation:** [extracted from log]
**mistake:** [extracted from log]
**fix:** [extracted from log]
<!-- added: YYYY-MM-DD -->
---
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

After all proposals, ask:

> *"Ovo su predloženi instinkti. Koje da potvrdim? (npr. '1, 3' ili 'sve' ili 'nijedan')"*

Wait for the user's explicit answer before proceeding. Do not write anything to the vault until approval is received.

---

## STEP 7 — Write approved instincts

For each approved proposal, execute the following write logic.

### 7a — Per-agent format rules (F5)

Read the existing `## Quality Gate Failures` section in each file to infer the exact format in use, then match it exactly:

| Agent | Existing QGF format |
|---|---|
| TI | No section — create with SOMA **situation/mistake/fix** format |
| HW | No section — create with SOMA **situation/mistake/fix** format |
| CR | `**What happened:**` / `**Root cause:**` / `**Fix:**` (English) |
| SA | SOMA **situation/mistake/fix** format if section exists, create otherwise |

When creating a new QGF section for TI or HW, use SOMA format. Do NOT impose the CR English format on TI or HW — they are separate files with separate histories.

### 7b — Creating the QGF section for TI or HW (F11)

HW (and possibly TI) instincts.md has **no** `## Quality Gate Failures` section. To create it:

Use `obsidian_update_note` with `mode: "append"` — append the entire section header + first entry:

```
## Quality Gate Failures

**situation:** [...]
**mistake:** [...]
**fix:** [...]
<!-- added: YYYY-MM-DD -->
```

Do not use `mode: "replace"` — that would overwrite existing instincts.

### 7c — Adding to existing QGF section

For CR (which already has `## Quality Gate Failures`):

Use `obsidian_update_note` with `mode: "append"` — the new entry appends after existing entries. Do not use `section_heading` — it creates duplicate headers.

### 7d — YAML frontmatter safety (F12)

| Agent | Pass `new_frontmatter`? |
|---|---|
| TI | ❌ Never |
| HW | ❌ Never |
| CR | ❌ Never |
| SA | ✅ Only if SA frontmatter needs updating |

TI, HW, CR instincts.md files have NO YAML frontmatter. Passing `new_frontmatter` to these files would inject unexpected YAML markup and corrupt the files.

### 7e — Date header rule (F1)

Do NOT attempt to update the `*Last updated:` line in any instincts.md header. This line is in the file header and cannot be updated with `mode: "append"`. It is also not critical to update — each written instinct block carries its own `<!-- added: YYYY-MM-DD -->` timestamp marker.

### 7f — Write to shared/ (global promotion)

If a cross-agent pattern was approved for global promotion:
- File path: `shared/global-instincts.md`
- If the file does not exist: use `obsidian_create_note`
- If the file already exists: use `obsidian_update_note` with `mode: "append"`
- Never use `mode: "replace"` on shared files

---

## STEP 8 — Confirm writes

For each written instinct, confirm with:

```
✅ Instinct #N written → [agent] instincts.md ([bytes_written] bytes)
```

If a proposal was skipped (semantic dedup, below threshold, single occurrence):

```
⏭️ Skipped #N → [reason]
```

Final summary:

```
Instincts update complete.
Written: N  |  Skipped: M  |  Rejected by user: K
```

---

## Anti-hallucination rules

1. **Every proposed instinct must cite at least one evo-log entry by date.** If you cannot name a specific entry with a date, do not propose the instinct.

2. **Never infer patterns from a single occurrence.** A single flagged entry is informational only — not enough for an instinct.

3. **Never reformat an existing instincts.md file.** Append only. Existing content is untouched.

4. **Never invent flag text.** The `flag_text` in a proposal must be quoted verbatim from the evo-log entry.

5. **`bytes_written` is the only confirmation of a successful write.** Do not report "saved" without a tool response confirming the write.

6. **Never call `obsidian_create_note` on an existing file.** Always read first to check if the file exists; use `obsidian_update_note` for existing files.

7. **Always read instincts.md before writing.** Never write blind — you need the existing content for semantic dedup and format detection.

---

## Edge cases

**All entries are clean (no flags):**
Report: *"No quality gate failures found in any agent's evo-log. No instinct proposals generated. If you want P-code analysis, I can report on winners-log patterns."*

**Agent below threshold (< 3 entries):**
Log the skip and explain to the user. Score Analyzer will typically hit this early on (1 entry as of 2026-05-16).

**Semantic dedup fires on a proposal the user believes is different:**
Present both the existing instinct and the proposed new one to the user and let them decide. Do not override the dedup automatically — let the human judge.

**User approves a partial list (e.g., "1, 3" out of 5):**
Write only proposals 1 and 3. Mark 2, 4, 5 as "Rejected by user" in the final summary.

**Global promotion proposed but `shared/global-instincts.md` does not exist:**
Use `obsidian_create_note` with vault path `shared/global-instincts.md`. Initialize with a header:
```
# Global Instincts — SOMA Pipeline
*Cross-agent patterns appearing in ≥3 agents.*

## Quality Gate Failures
```
Then append the instinct entry.

**TI evo-log has continuation lines that contain useful context:**
Include the continuation line content in the `flag_text` of the flagged entry. The full flag message may span the base entry line plus one or more continuation lines.

---

## Scope boundary

| Scenario | Correct tool |
|---|---|
| Running a SOMA pipeline | soma-run |
| Logging a completed run | evo-log-writer |
| Logging a winner hook | winners-log-logger |
| General Obsidian writes | obsidian-knowledge-logger |
| Diagnosing a broken pipeline | pipeline-debug |
| Checking agent memory wiring | soma-memory-fix |
| SOMA performance report | soma-performance-review |
