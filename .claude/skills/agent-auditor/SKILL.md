---
name: agent-auditor
description: >
  Periodic enterprise quality audit and improvement of AI agents against 2026 standards.
  Use this skill ANY TIME the user wants to audit agents, check agent quality, evaluate agents,
  improve existing agents, find underperforming agents, run a quality check, do an agent review,
  "proveri agente", "evaluiraj agente", "unapredi agente", "koje agente treba popraviti",
  or says anything like "let's review all agents" or "which agents need work".
  Connects to Railway PostgreSQL, scores every agent on a 10-dimension rubric,
  identifies agents below the 8/10 enterprise threshold, and generates improved system prompts.
  Always use this before deploying a new version of agent-studio to production.
---

# Agent Auditor — 2026 Enterprise Quality Audit

You audit and improve AI agents in agent-studio's Railway PostgreSQL database.
The goal is to ensure every agent meets the 2026 enterprise quality bar (8+/10 on all dimensions)
before they interact with users or are called by orchestrators.

Poor agents cause: pipeline failures, inconsistent outputs, security gaps, and user frustration.
This audit catches those problems systematically, not by accident.

---

## Step 1 — Connect to Railway and Pull All Agents

The production database is Railway PostgreSQL. Use the connection string the user provides,
or ask for it if not already in context. The URL format is:
`postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway`

Pull all agents with full system prompts:

```python
import psycopg2, json

conn = psycopg2.connect(RAILWAY_URL)
cur = conn.cursor()
cur.execute('SELECT id, name, "systemPrompt", model, "isPublic", "createdAt" FROM "Agent" ORDER BY name')
rows = cur.fetchall()
```

Report count immediately: "Found N agents in Railway PostgreSQL."

---

## Step 2 — Score Every Agent (10-Dimension Rubric)

Score each agent on these 10 binary checks (1 point each, max 10):

| # | Dimension | How to check |
|---|---|---|
| 1 | `<role>` block present | `'<role>' in prompt` |
| 2 | `<output_format>` or `<output>` section | tag present |
| 3 | `<constraints>` section | tag present |
| 4 | JSON schema defined | ` ```json ` block present |
| 5 | Examples present | `<example` tag or `example:` keyword |
| 6 | Failure modes defined | `fail` + `handling/modes/graceful` OR `<failure_modes>` |
| 7 | Verification criteria | `verif` or `validat` keyword |
| 8 | XML structure depth (≥4 XML tags total) | `prompt.count('<') > 4` |
| 9 | Phased/decomposed approach | `phase` or `step` or `decompos` keyword |
| 10 | Hard rules (never/must/always) | `never` or `must not` or `always` keyword |

**Thresholds:**
- ✅ Enterprise quality: **8–10 / 10**
- 🔧 Needs improvement: **6–7 / 10**
- ⚠️ Critical gap: **< 6 / 10**
- 🗑️ Delete candidate: prompt ≤ 100 chars OR is "You are a helpful assistant."

**Length check:** Minimum 4000 characters. Below this = automatic flag regardless of score.

---

## Step 3 — Identify and Prioritize Issues

After scoring all agents, produce:

### Summary Report
```
AUDIT SUMMARY — [date]
Total agents: N
✅ Enterprise quality (8+/10): N
🔧 Needs improvement (6-7/10): N
⚠️ Critical gaps (<6/10): N
🗑️ Delete candidates: N

Average prompt length: N chars
Shortest prompt: "Agent Name" (N chars)

Dimension coverage across all agents:
  1. role:           N/N agents (XX%)
  2. output_format:  N/N agents (XX%)
  3. constraints:    N/N agents (XX%)
  4. json_schema:    N/N agents (XX%)
  5. examples:       N/N agents (XX%)
  6. failure_modes:  N/N agents (XX%)
  7. verification:   N/N agents (XX%)
  8. xml_depth:      N/N agents (XX%)
  9. decomposition:  N/N agents (XX%)
  10. hard_rules:    N/N agents (XX%)
```

**Always include the dimension coverage table** — it shows systemic gaps across the fleet,
not just per-agent problems. If 80% of agents are missing failure_modes, that's a systemic
issue worth highlighting.

### Priority List (sorted by urgency)
1. Delete candidates (hardest risk, easiest fix)
2. Critical gaps (<6/10) — list with missing dimensions
3. Needs improvement (6-7/10) — list with missing dimensions

---

## Step 4 — Generate Improvements

For each agent below 8/10, generate the missing sections. Don't rewrite what's working —
add only what's missing. This is the "minimal surface" principle applied to prompt engineering.

### Adding a missing `<role>` block
Extract the agent's purpose from existing text, then wrap:
```
<role>
You are the [Agent Name] — [specific expert identity with domain and mission].
You [what it does] as part of [which pipeline/context].
[One sentence on what makes this agent's perspective unique.]
</role>
```

### Adding a missing `<output_format>`
Determine the agent type (pipeline leaf vs user-facing) and generate appropriate schema:
- **Pipeline/orchestrator-facing:** JSON schema with verdict, id, findings[], summary
- **User-facing:** Markdown structure with defined sections

### Adding missing `<constraints>`
Pull relevant constraints from:
- The agent's domain (security → OWASP/CVSS rules, accessibility → WCAG 2.2, etc.)
- agent-studio tech stack rules (no `any` type, Railway not Supabase, pnpm not npm)
- The agent's pipeline position (blocking agents need explicit PASS/FAIL thresholds)

### Adding missing `<failure_modes>`
Cover the three universal failure scenarios:
1. Input missing or malformed → what to do
2. Confidence too low → what to say
3. Out of scope → how to redirect

---

## Step 5 — Present and Apply Changes

Present the improvements to the user grouped by priority:

```
## Improvements Ready

### 🗑️ Delete (N agents)
These have no meaningful system prompts and should be removed:
- "Agent Name" — "prompt preview..."

### ⚠️ Critical Rewrites (N agents)
- "Agent Name" — Added: <role>, <output_format>, <constraints> (+N chars)

### 🔧 Minor Additions (N agents)
- "Agent Name" — Added: <failure_modes>, JSON schema (+N chars)
```

Ask: **"Should I apply all improvements to Railway now, or review them first?"**

If applying to Railway, use `UPDATE "Agent" SET "systemPrompt" = %s WHERE name = %s RETURNING name`
and confirm each update with the new character count.

---

## Step 6 — Final Verification

After applying changes, re-score all agents and confirm the new distribution:

```
FINAL VERIFICATION
✅ Enterprise quality (8+/10): N/N (target: 100%)
Average prompt length: N chars (target: ≥4000)
Agents improved this session: N
```

If any agents still score below 8, report them explicitly and ask if the user wants
a deeper rewrite (not just section additions, but full content review).

---

## Pre-Deploy Quality Gate

**ALWAYS recommend running the audit as a pre-deployment quality gate.**

Before any production deploy, every agent should pass the 10-dimension check at 8+/10.
Suggest the user integrate this into their CI/CD pipeline:

```python
# Pre-deploy check: fail the pipeline if any agent scores below threshold
DEPLOY_THRESHOLD = 8
failing_agents = [a for a in scored_agents if a['score'] < DEPLOY_THRESHOLD]
if failing_agents:
    print(f"DEPLOY BLOCKED: {len(failing_agents)} agents below {DEPLOY_THRESHOLD}/10")
    for a in failing_agents:
        print(f"  - {a['name']}: {a['score']}/10 (missing: {', '.join(a['missing'])})")
    sys.exit(1)
print(f"DEPLOY OK: all {len(scored_agents)} agents at {DEPLOY_THRESHOLD}+/10")
```

Tell the user: "I recommend running this audit before every production deploy to prevent
quality regressions. Agents that scored below 8/10 should block deployment."

---

## Periodic Audit Schedule

Recommend running this audit:
- **Before every production deploy** — catches regressions from edits (MANDATORY)
- **Monthly** — as new agents are added or models change
- **After bulk imports** — imported agents often have minimal prompts

To set up automated monthly auditing, suggest using the `schedule` skill.

---

## 2026 Standards Reference

The dimensions we check against are derived from:

**Anthropic 2026 (Context Engineering)**
- XML tags (`<role>`, `<constraints>`, `<output_format>`) for unambiguous parsing
- High-signal tokens — every sentence must earn its place
- Role-based identity — even one sentence changes agent behavior significantly

**Google DeepMind Contract-First (Feb 2026)**
- Output must be verifiable — JSON schemas enable automated verification
- Recursive decomposition — phased agents are more reliable than monolithic ones
- Least privilege — constraints define what the agent is NOT allowed to do

**OpenAI 2026 Structured Output**
- Directive + constraints + format pattern
- JSON at token level reduces iteration rate from 38.5% to 12.3%
- Failure handling prevents cascading failures in multi-agent pipelines

---

## Quick Reference: Common Missing Sections

Read `references/common-sections.md` for pre-written constraint blocks for:
- TypeScript/Next.js agents
- Security analysis agents
- Code review agents
- Pipeline orchestrators
- User-facing support agents
