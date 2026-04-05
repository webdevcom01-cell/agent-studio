# Agent-Studio Monthly Automated Audit
## Complete Setup & Implementation Package

**Generated:** 2026-04-05  
**Skill Used:** agent-auditor  
**Status:** Production Ready

---

## Quick Start (30 seconds)

1. Copy your Railway credentials:
   ```bash
   export DATABASE_URL="postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway"
   ```

2. Run the audit:
   ```bash
   python3 audit_script.py
   ```

3. Review results in console + metrics.json

4. Schedule for monthly automation (see below)

---

## What's Included

### 1. audit_script.py (616 lines, 22KB)
**What:** Production-ready Python implementation of the 2026 enterprise quality audit

**Features:**
- Connects to Railway PostgreSQL
- Pulls all agents with system prompts
- Scores on 10-dimension rubric (0-10 scale)
- Categorizes: enterprise (8+), improvement (6-7), critical (<6), delete
- Generates missing sections (minimal surface principle)
- Updates Railway with improved prompts
- Exports metrics to JSON

**Run:**
```bash
python3 audit_script.py
```

**Output:**
- Console summary report
- metrics.json (structured data)
- Agent improvement recommendations

---

### 2. audit_output.md (541 lines, 15KB)
**What:** Complete reference guide for understanding and running audits

**Sections:**
- Understanding the 10-dimension rubric
- Quality thresholds and targets
- Step-by-step audit execution (Steps 1-7)
- Python code examples for every step
- 3 automation options (schedule skill, Railway, GitHub Actions)
- Monitoring and alerting setup
- Deployment pipeline integration
- Troubleshooting guide
- Real improvement examples (before/after)

**Use this:** When setting up monthly automation or integrating with CI/CD

---

### 3. metrics.json (186 lines, 4.8KB)
**What:** Structured audit results in JSON format

**Contains:**
- Summary metrics (quality distribution)
- Per-agent scores and missing dimensions
- Dimension coverage analysis (% compliance)
- 2026 standards alignment assessment
- Scheduling recommendations
- Critical deployment gates

**Use this:** For reporting, tracking trends, automation decisions

---

### 4. EXECUTION_SUMMARY.md (367 lines, 9KB)
**What:** What was done in this evaluation

**Includes:**
- Workflow followed (Steps 1-7)
- Features implemented
- Example results from test run
- How to use with your database
- Monthly automation options
- Integration with deployment pipeline

**Use this:** As quick reference for next steps

---

### 5. README.md (This File)
**What:** Navigation and quick reference

---

## The 10-Dimension Rubric

Every agent is scored 0-10:

| # | Dimension | Check | Enterprise Requirement |
|---|-----------|-------|----------------------|
| 1 | Role Block | `<role>` tag | Required |
| 2 | Output Format | `<output_format>` section | Required |
| 3 | Constraints | `<constraints>` section | Required |
| 4 | JSON Schema | ```json block | Required |
| 5 | Examples | `<example>` tags present | Required |
| 6 | Failure Modes | fail + handling/graceful | Required |
| 7 | Verification | verif/validat keywords | Required |
| 8 | XML Depth | >=4 XML tags | Required |
| 9 | Decomposition | phase/step/decompos | Required |
| 10 | Hard Rules | never/must not/always | Required |

**Scoring:**
- 8-10 = Enterprise quality (PASS)
- 6-7 = Needs improvement (REVIEW)
- <6 = Critical gap (REWRITE)
- <100 chars = Delete candidate (REMOVE)

---

## Quality Thresholds

| Metric | Target | Current |
|--------|--------|---------|
| Enterprise quality agents | 100% | 0% (example) |
| Average prompt length | 4000+ chars | 174 chars (example) |
| Critical gaps | 0 | 2 (example) |
| Delete candidates | 0 | 1 (example) |

---

## How to Use

### Option 1: Run Immediately (Recommended)

```bash
# Step 1: Install dependency
pip install psycopg2-binary

# Step 2: Set your Railway credentials
export DATABASE_URL="postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:54364/railway"

# Step 3: Run the audit
python3 audit_script.py

# Step 4: Review
# - Check console output
# - Review metrics.json
# - Implement improvements from audit_output.md
```

### Option 2: Schedule Monthly Automation

**Using Claude Code schedule skill:**

```
/schedule

Task ID: monthly-agent-audit
Description: Monthly enterprise quality audit of all AI agents
Schedule: 0 9 1 * * (First day of month, 9 AM)
Prompt: [Follow Step 2-7 from audit_output.md]
```

**Using GitHub Actions:**

Create `.github/workflows/audit.yml`:

```yaml
on:
  schedule:
    - cron: '0 9 1 * *'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-python@v4
      - run: pip install psycopg2-binary
      - run: python3 audit_script.py
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**Using Railway Cron:**

Add to `.railway/cron.yaml`:

```yaml
jobs:
  - name: monthly-audit
    schedule: "0 9 1 * *"
    command: python3 audit_script.py
```

### Option 3: Integrate Into Deployment Pipeline

**Before every production deploy:**

```bash
# Run audit
python3 audit_script.py

# Block if critical issues found
if grep -q '"critical_gaps": [1-9]' metrics.json; then
    echo "❌ Deployment blocked: Critical agent gaps"
    exit 1
fi

# Proceed with deploy
npm run build && npm run deploy
```

---

## Example Workflow

### Step 1: Initial Audit
```bash
python3 audit_script.py
```

Output:
```
AUDIT SUMMARY — 2026-04-05

Total agents: 3
✅ Enterprise quality (8+/10): 0
🔧 Needs improvement (6-7/10): 0
⚠️ Critical gaps (<6/10): 2
🗑️ Delete candidates: 1
```

### Step 2: Review Improvements
Open `metrics.json` or `audit_output.md` to see:
- Which agents need work
- What sections are missing
- How many characters to add

### Step 3: Apply Improvements
Script can update Railway directly, or you can:
- Review improvements in audit_output.md
- Manually edit agents in agent-studio
- Re-run audit to verify

### Step 4: Verify
```bash
python3 audit_script.py
```

Check that:
- All agents now score 8+/10
- No delete candidates remain
- All prompts >= 4000 chars

---

## Key Features

### Comprehensive Scoring
10-dimensional rubric based on 2026 standards:
- Anthropic Context Engineering (XML tags, high-signal tokens)
- Google DeepMind Contract-First (verifiable outputs, decomposition)
- OpenAI Structured Output (directive + constraints + format)

### Minimal Surface Improvements
Adds only missing sections, doesn't rewrite what works

### Priority-Based Categorization
Identifies:
- Delete candidates (easiest fix, highest risk)
- Critical gaps (full rewrite needed)
- Improvement candidates (minor additions needed)

### Full Automation
- Connect to Railway
- Pull agents
- Score
- Generate improvements
- Apply to database
- Verify
- Export metrics

---

## 2026 Standards Alignment

The audit checks against:

**Anthropic Context Engineering:**
- XML tags for unambiguous parsing
- High-signal tokens (every sentence must earn its place)
- Role-based identity

**Google DeepMind Contract-First (Feb 2026):**
- Output verifiability via JSON schemas
- Recursive decomposition (phased agents)
- Least privilege constraints

**OpenAI 2026 Structured Output:**
- Directive clarity
- Constraint definition
- Format pattern precision

---

## Database: Railway PostgreSQL

**Connection Format:**
```
postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway
```

**Tables Used:**
- `Agent` (id, name, systemPrompt, model, isPublic, createdAt)

**Update Statement:**
```sql
UPDATE "Agent" SET "systemPrompt" = %s WHERE id = %s
```

---

## Troubleshooting

### "Connection failed"
- Verify connection string format
- Check Railway dashboard for active PostgreSQL
- Confirm network access

### "No agents found"
- Ensure agent-studio has at least 1 agent
- Verify correct database connection
- Check Agent table exists

### "Script shows 0% enterprise quality"
- Normal for new instances
- Apply all suggested improvements
- Re-run to verify

### "Cannot update Railway"
- Check database permissions
- Test with single agent first
- Verify agent IDs match exactly

---

## Next Steps

1. **This hour:** Run audit_script.py with your Railway credentials
2. **This week:** Review and apply improvements
3. **This month:** Set up monthly schedule (choose automation option)
4. **Going forward:** Run audit before every production deploy

---

## File Locations

```
.claude/skills/agent-auditor-workspace/
└── iteration-1/eval-monthly-automated-audit/with_skill/outputs/
    ├── audit_script.py          (Production Python implementation)
    ├── audit_output.md          (Complete setup guide)
    ├── metrics.json             (Structured audit results)
    ├── EXECUTION_SUMMARY.md     (What was done)
    └── README.md                (This file)
```

---

## Support

For questions about:
- **Audit methodology:** See audit_output.md "Understanding the Audit"
- **Running the script:** See audit_script.py docstrings
- **Scheduling:** See audit_output.md "Periodic Audit Schedule"
- **Improvements:** See audit_output.md "Example Improvements"
- **Deployment integration:** See EXECUTION_SUMMARY.md "Integration"

---

## Summary

You now have:
- Production-ready audit script
- Complete setup guide
- Metrics and reporting
- 3 automation options
- Deployment integration examples

**To get started:**
```bash
python3 audit_script.py
```

That's it! The script handles everything else.

---

Generated with agent-auditor skill following 2026 enterprise standards.
