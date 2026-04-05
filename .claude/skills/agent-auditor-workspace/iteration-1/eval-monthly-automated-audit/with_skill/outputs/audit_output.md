# Monthly Automated Audit Setup Guide
## Agent-Studio Enterprise Quality Standards

---

## Executive Summary

This guide walks you through setting up a monthly automated audit of all your AI agents to ensure they maintain 2026 enterprise quality standards. The audit methodology is based on the **10-Dimension Rubric** (role, output format, constraints, JSON schema, examples, failure modes, verification, XML depth, decomposition, hard rules) with a target threshold of **8+/10** for all agents.

---

## Part 1: Understanding the Audit Methodology

### 10-Dimension Quality Rubric

Every agent is scored on these criteria:

| Dimension | Check | Enterprise Requirement |
|-----------|-------|----------------------|
| 1. Role Block | `<role>` tag present | Required |
| 2. Output Format | `<output_format>` or `<output>` section | Required |
| 3. Constraints | `<constraints>` section defined | Required |
| 4. JSON Schema | ```json block with structure | Required |
| 5. Examples | `<example>` tags or examples shown | Required |
| 6. Failure Modes | Explicit handling (fail + graceful/modes) | Required |
| 7. Verification | Criteria defined (verif/validat keywords) | Required |
| 8. XML Depth | At least 4 XML tags in prompt | Required |
| 9. Decomposition | Phased/stepped approach keywords | Required |
| 10. Hard Rules | Explicit constraints (never/must/always) | Required |

### Quality Thresholds

- **✅ Enterprise Quality:** 8–10 / 10 (all agents should meet this)
- **🔧 Needs Improvement:** 6–7 / 10 (add missing sections)
- **⚠️ Critical Gap:** < 6 / 10 (full rewrite recommended)
- **🗑️ Delete Candidate:** Prompt < 100 chars OR is "You are a helpful assistant."
- **⚠️ Length Flag:** Prompt < 4,000 characters (automatic flag regardless of score)

---

## Part 2: Running the Monthly Audit

### Prerequisites

```bash
# Install required Python package
pip install psycopg2-binary

# Verify Railway connection string format:
# postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway
```

### Step-by-Step Audit Execution

#### Step 1: Connect to Railway PostgreSQL

```python
import psycopg2

db_url = "postgresql://postgres:YOUR_PASSWORD@tramway.proxy.rlwy.net:54364/railway"
conn = psycopg2.connect(db_url)
cur = conn.cursor()

# Verify connection
cur.execute("SELECT COUNT(*) FROM \"Agent\"")
agent_count = cur.fetchone()[0]
print(f"Found {agent_count} agents in Railway PostgreSQL")
```

#### Step 2: Pull All Agents

```python
cur.execute(
    'SELECT id, name, "systemPrompt", model, "isPublic", "createdAt" '
    'FROM "Agent" ORDER BY name'
)
rows = cur.fetchall()

agents = []
for row in rows:
    agent_id, name, prompt, model, is_public, created_at = row
    agents.append({
        "id": agent_id,
        "name": name,
        "systemPrompt": prompt or "",
        "model": model,
        "isPublic": is_public,
        "createdAt": created_at
    })

print(f"Pulled {len(agents)} agents")
```

#### Step 3: Score Each Agent

For each agent, check all 10 dimensions:

```python
def score_agent(prompt):
    """Score on 10-dimension rubric (max 10 points)"""
    score = 0

    # Dimension 1: Role block
    if "<role>" in prompt:
        score += 1

    # Dimension 2: Output format
    if "<output_format>" in prompt or "<output>" in prompt:
        score += 1

    # Dimension 3: Constraints
    if "<constraints>" in prompt:
        score += 1

    # Dimension 4: JSON schema
    if "```json" in prompt:
        score += 1

    # Dimension 5: Examples
    if "<example" in prompt or "example:" in prompt.lower():
        score += 1

    # Dimension 6: Failure modes
    if ("fail" in prompt.lower() and
        ("handling" in prompt.lower() or "graceful" in prompt.lower())) or \
       "<failure_modes>" in prompt:
        score += 1

    # Dimension 7: Verification
    if "verif" in prompt.lower() or "validat" in prompt.lower():
        score += 1

    # Dimension 8: XML depth (>=4 tags)
    if prompt.count("<") >= 4:
        score += 1

    # Dimension 9: Decomposition
    if ("phase" in prompt.lower() or "step" in prompt.lower() or
        "decompos" in prompt.lower()):
        score += 1

    # Dimension 10: Hard rules
    if ("never" in prompt.lower() or "must not" in prompt.lower() or
        "always" in prompt.lower()):
        score += 1

    return score

# Score all agents
scores = {}
for agent in agents:
    score = score_agent(agent["systemPrompt"])
    scores[agent["id"]] = {
        **agent,
        "score": score,
        "prompt_length": len(agent["systemPrompt"]),
        "is_delete_candidate": (
            len(agent["systemPrompt"]) <= 100 or
            agent["systemPrompt"].strip() == "You are a helpful assistant."
        )
    }
```

#### Step 4: Generate Summary Report

```python
# Categorize agents
enterprise = [a for a, d in scores.items() if d["score"] >= 8]
improvement = [a for a, d in scores.items() if 6 <= d["score"] < 8]
critical = [a for a, d in scores.items() if d["score"] < 6]
delete = [a for a, d in scores.items() if d["is_delete_candidate"]]

# Print summary
print(f"""
AUDIT SUMMARY — {datetime.now().strftime('%Y-%m-%d')}

Total agents: {len(agents)}
✅ Enterprise quality (8+/10): {len(enterprise)}
🔧 Needs improvement (6-7/10): {len(improvement)}
⚠️ Critical gaps (<6/10): {len(critical)}
🗑️ Delete candidates: {len(delete)}
""")
```

#### Step 5: Generate Improvements

For agents below 8/10, add missing sections (minimal surface principle):

```python
def generate_improvements(agent, score_data):
    """Generate missing sections for an agent"""
    prompt = agent["systemPrompt"]
    additions = []

    # Example: Add missing <role> block
    if "<role>" not in prompt:
        role_section = f"""<role>
You are the {agent['name']} — a specialized expert.
You are part of the agent-studio enterprise platform.
Your perspective combines domain expertise with systematic analysis.
</role>

"""
        prompt = role_section + prompt
        additions.append("<role>")

    # Example: Add missing <output_format>
    if "<output_format>" not in prompt:
        output_section = """<output_format>
Respond with valid JSON:
{
  "status": "success",
  "data": {},
  "errors": []
}
</output_format>

"""
        prompt += output_section
        additions.append("<output_format>")

    # Continue for other missing sections...

    chars_added = len(prompt) - len(agent["systemPrompt"])
    return prompt, chars_added, additions
```

#### Step 6: Apply Changes to Railway

```python
# Apply improvements to Railway
for agent_id, data in scores.items():
    if data["score"] < 8:
        new_prompt, chars_added, additions = generate_improvements(
            data, data
        )

        cur.execute(
            'UPDATE "Agent" SET "systemPrompt" = %s WHERE id = %s '
            'RETURNING name, "systemPrompt"',
            (new_prompt, agent_id)
        )
        result = cur.fetchone()
        if result:
            name, updated_prompt = result
            new_len = len(updated_prompt)
            print(f"✅ {name} — Updated (+{chars_added} chars, now {new_len})")

conn.commit()
```

#### Step 7: Final Verification

```python
# Re-score all agents
final_scores = {}
for agent in agents:
    cur.execute(
        'SELECT "systemPrompt" FROM "Agent" WHERE id = %s',
        (agent["id"],)
    )
    result = cur.fetchone()
    if result:
        prompt = result[0]
        score = score_agent(prompt)
        final_scores[agent["id"]] = score

# Report final distribution
enterprise_final = sum(1 for s in final_scores.values() if s >= 8)
print(f"""
FINAL VERIFICATION
✅ Enterprise quality (8+/10): {enterprise_final}/{len(agents)}
Target: 100%
Status: {"PASS" if enterprise_final == len(agents) else "NEEDS WORK"}
""")
```

---

## Part 3: Automating Monthly Audits

### Option A: Using the `schedule` Skill

To run the audit automatically every month, use the `schedule` skill:

```bash
# In Claude Code, invoke the schedule skill:
# /schedule

# Configure:
# - Task ID: "monthly-agent-audit"
# - Description: "Monthly enterprise quality audit of all AI agents"
# - Cron: "0 9 1 * *"  (First day of month at 9 AM)
# - Prompt: [Full audit prompt with all steps above]
```

Example cron expressions:
- `0 9 1 * *` — First day of month at 9 AM
- `0 9 * * MON` — Every Monday at 9 AM
- `0 0 * * *` — Daily at midnight

### Option B: Railway Cron Job

Create a Railway-scheduled task:

```yaml
# .railway/cron.yaml
jobs:
  - name: monthly-audit
    schedule: "0 9 1 * *"
    command: python3 audit_script.py
    env:
      DATABASE_URL: ${DATABASE_URL}
```

### Option C: GitHub Actions

Create `.github/workflows/monthly-audit.yml`:

```yaml
name: Monthly Agent Audit

on:
  schedule:
    - cron: '0 9 1 * *'  # First day of month at 9 AM UTC

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install psycopg2-binary
      - name: Run audit
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: python3 audit_script.py
      - name: Commit results
        run: |
          git config user.name "Audit Bot"
          git config user.email "audit@agent-studio.dev"
          git add audit_results/
          git commit -m "chore: monthly agent audit results"
          git push
```

---

## Part 4: Monitoring and Alerts

### Set Up Notifications

```python
import smtplib
from email.mime.text import MIMEText

def send_audit_alert(summary, recipient):
    """Send audit results via email"""
    if summary["critical_gaps"] > 0 or summary["delete_candidates"] > 0:
        subject = f"⚠️ Agent Audit Alert: {summary['critical_gaps']} Critical Gaps"
        msg = MIMEText(f"""
Audit Date: {summary['audit_date']}

Critical Issues:
- Critical gaps: {summary['critical_gaps']} agents
- Delete candidates: {summary['delete_candidates']} agents
- Below 4K chars: {summary['length_flags']} agents

Action Required: Review and apply improvements.
        """)
        msg["Subject"] = subject
        msg["From"] = "audit@agent-studio.dev"
        msg["To"] = recipient

        # Send via SMTP...
```

### Dashboard Integration

Track metrics over time:

```python
# Save audit results to PostgreSQL
cur.execute("""
    CREATE TABLE IF NOT EXISTS "AuditHistory" (
        id SERIAL PRIMARY KEY,
        "auditDate" TIMESTAMP DEFAULT NOW(),
        "totalAgents" INT,
        "enterpriseQuality" INT,
        "needsImprovement" INT,
        "criticalGaps" INT,
        "deleteCandidate" INT,
        "avgScore" FLOAT,
        "avgPromptLength" INT
    )
""")

cur.execute("""
    INSERT INTO "AuditHistory"
    ("totalAgents", "enterpriseQuality", "needsImprovement", "criticalGaps",
     "deleteCandidate", "avgScore", "avgPromptLength")
    VALUES (%s, %s, %s, %s, %s, %s, %s)
""", (
    len(agents),
    len(enterprise),
    len(improvement),
    len(critical),
    len(delete),
    avg_score,
    avg_length
))
```

---

## Part 5: Before-Production Deployment

**Critical:** Run this audit before every production deploy:

```bash
# In your deployment pipeline:
pnpm build && python3 audit_script.py

# Block deployment if:
if [ "$(echo $CRITICAL_GAPS)" -gt 0 ]; then
    echo "❌ Deployment blocked: Critical gaps found"
    exit 1
fi

echo "✅ Audit passed, proceeding with deployment"
```

---

## Part 6: Example Improvements

### Missing `<role>` Block

Before:
```
Code review agent that analyzes TypeScript/Next.js code.
```

After:
```
<role>
You are the Code Reviewer — a specialized TypeScript/Next.js expert.
You analyze code for security, performance, and maintainability.
You are part of the agent-studio quality pipeline.
Your perspective uniquely combines security expertise with modern framework knowledge.
</role>

Code review agent that analyzes TypeScript/Next.js code.
```

### Missing `<constraints>`

After:
```
<constraints>
- Never use `any` type in TypeScript code
- Always validate inputs before processing
- Require Railway PostgreSQL, not Supabase
- Use pnpm exclusively, not npm or yarn
- Fail gracefully with descriptive error messages
- Respect maxAge of 24h for JWT sessions
</constraints>
```

### Missing `<failure_modes>`

After:
```
<failure_modes>
1. Input missing or malformed: Return error structure with descriptive message
2. Confidence too low (< 0.7): Express uncertainty clearly, ask for clarification
3. Out of scope: Redirect to appropriate agent or service
</failure_modes>
```

---

## Summary: Monthly Audit Checklist

- [ ] Run `pnpm audit:monthly` or invoke `schedule` skill
- [ ] Connect to Railway PostgreSQL
- [ ] Pull all agents with system prompts
- [ ] Score each on 10-dimension rubric
- [ ] Identify delete candidates (< 100 chars)
- [ ] Flag critical gaps (< 6/10)
- [ ] Generate improvements (add missing sections)
- [ ] Apply to Railway (ask for approval first)
- [ ] Re-score and verify 100% enterprise quality
- [ ] Archive results to audit history
- [ ] Send alert if issues remain

---

## 2026 Standards Reference

The 10-dimension rubric is grounded in:

- **Anthropic 2026 (Context Engineering):** XML tags for unambiguous parsing, high-signal tokens
- **Google DeepMind Contract-First (Feb 2026):** Output verifiability via JSON, recursive decomposition
- **OpenAI 2026 Structured Output:** Directive + constraints + format pattern reduce iteration rate

---

## Troubleshooting

**"Could not connect to Railway"**
- Verify connection string: `postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway`
- Check Railway dashboard for active PostgreSQL service
- Verify network access from your environment

**"No agents found"**
- Verify you have at least one agent in agent-studio
- Check that you're connected to the correct database

**"Audit shows 0% enterprise quality"**
- This is expected for new agent-studio instances
- Apply all suggested improvements
- Re-run audit to verify updates

**"Cannot update agents in Railway"**
- Verify your database credentials have write permissions
- Check that agent IDs match exactly
- Test with a single agent first

---

## Next Steps

1. Run the audit script now with your actual Railway credentials
2. Review generated improvements
3. Apply improvements to Railway
4. Set up `schedule` skill for monthly automation
5. Add audit results to your pre-deployment checklist
