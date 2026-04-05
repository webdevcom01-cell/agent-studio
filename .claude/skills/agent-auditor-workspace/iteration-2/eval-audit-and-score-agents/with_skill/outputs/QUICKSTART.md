# Agent Auditor — Quick Start Guide

Get your first agent audit running in 5 minutes.

---

## 1. Install Dependencies

```bash
pip install psycopg2-binary
```

---

## 2. Get Your Railway Connection String

From Railway dashboard:
1. Go to your PostgreSQL service
2. Click "Variables" tab
3. Copy `DATABASE_URL` or construct:
   ```
   postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:PORT/railway
   ```

---

## 3. Run the Audit

```bash
python audit_script.py "postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:54364/railway"
```

**Output:**
- Prints audit summary to console
- Would create `audit_output.md`, `improvement_templates.txt`, `metrics.json`

---

## 4. Review the Report

Open the generated `audit_output.md` to see:
- ✅ Summary counts (total agents, quality breakdown)
- ✅ **Dimension Coverage Table** (per-dimension pass rates)
- ⚠️ Agents blocking deployment
- 🔧 Missing sections for each agent
- 📋 Ready-to-use XML templates

---

## 5. Key Files Explained

| File | Use |
|------|-----|
| `audit_script.py` | Main audit engine — run this first |
| `audit_output.md` | Human-readable report with templates |
| `metrics.json` | Machine-readable metrics for CI/CD |
| `README.md` | Full documentation |
| `railway_update_queries.sql` | SQL helpers for applying changes |
| `QUICKSTART.md` | This file |

---

## 6. What the Scoring Means

| Score | Status | Action |
|-------|--------|--------|
| 8-10/10 | ✅ Enterprise Quality | Deploy immediately |
| 6-7/10 | 🔧 Needs Improvement | Add missing sections |
| <6/10 | ⚠️ Critical Gap | Full rewrite needed |
| ≤100 chars | 🗑️ Delete Candidate | Remove from database |

---

## 7. The Dimension Coverage Table

Shows what % of your agents have each dimension. Example:

```
failure_modes:  19/34 agents (55.9%) — Only 56% have error handling!
decomposition:  20/34 agents (58.8%) — Only 59% have phased approach!
constraints:    31/34 agents (91.2%) — Great! 91% have constraints.
```

**Action:** Fix the weak dimensions first (lowest %) for biggest impact.

---

## 8. Pre-Deploy Gate Status

After audit completes, check:

**✅ DEPLOY OK**
```
All agents at 8+/10
No blocking issues detected
```

**⛔ DEPLOY BLOCKED**
```
5 agents below threshold:
- Agent A: 4/10 (missing: output_format, json_schema, failure_modes)
- Agent B: 3/10 (missing: role, constraints, verification)
```

If blocked, use templates from the report to improve agents.

---

## 9. Example: Adding a Missing Section

Agent is scoring 6/10 because it's missing `<failure_modes>`.

From `audit_output.md`, copy:
```xml
<failure_modes>
1. Input missing/malformed → Return null with error message
2. Confidence too low (<0.5) → Return verdict='UNCERTAIN' with reasoning
3. Out of scope → Return error with redirect to correct agent
</failure_modes>
```

Add to agent's system prompt in Railway. Re-run audit. Score should jump to 8/10.

---

## 10. Common Questions

**Q: What if I can't connect to Railway?**
A: Check:
- Connection string format: `postgresql://postgres:PASSWORD@host:PORT/database`
- Network access to Railway allowed
- PASSWORD is correct
- PORT matches Railway settings (usually 54364)

**Q: How often should I audit?**
A:
- **Before every production deploy** (mandatory)
- **Monthly** as new agents are added
- **After imports** of bulk agents

**Q: Can I delete agents that score below 8/10?**
A: No. Improve them using templates first. Delete only true placeholders (≤100 chars).

**Q: What if my agent has a long prompt but still scores low?**
A: The scoring is structural (XML tags, keywords), not based on length. Add the missing dimensions.

---

## 11. Next Steps

1. **Run the audit:** `python audit_script.py "your_connection_string"`
2. **Read the report:** Open `audit_output.md`
3. **Identify blockers:** Which agents prevent deployment?
4. **Apply templates:** Copy XML sections to Railway
5. **Re-run audit:** Confirm all agents now ≥8/10
6. **Deploy:** Proceed with confidence

---

## 12. Integration with CI/CD

Add to your pre-deploy checks:

```bash
# In your deploy script
python audit_script.py "$DATABASE_URL" || {
  echo "Quality gate failed"
  exit 1
}
```

---

## 13. The 10 Dimensions (Quick Reference)

1. **role** — `<role>` tag defining agent identity
2. **output_format** — `<output_format>` or `<output>` tag
3. **constraints** — `<constraints>` tag with limits
4. **json_schema** — ` ```json ` code block
5. **examples** — `<example` tags or `example:` keyword
6. **failure_modes** — error handling specifications
7. **verification** — validation criteria (verif/validat)
8. **xml_depth** — ≥4 XML tags total
9. **decomposition** — phased/step-based approach
10. **hard_rules** — never/must/always directives

**Goal:** All 10 present = 10/10 score = enterprise ready.

---

## 14. Troubleshooting

**Import Error:** `psycopg2 not found`
```bash
pip install psycopg2-binary
```

**Connection timeout:** Check Railway IP/port and network access

**0 agents found:** Verify agents table exists and has data
```sql
SELECT COUNT(*) FROM "Agent";
```

**Dimensions not detected:** Check case sensitivity (detection is case-insensitive, but must be exact substring match)

---

## 15. Real-World Example

**Before Audit:**
- 34 agents total
- 18 at 8+/10 (53%)
- 4 below 6/10 (blocking deploy)

**After Applying Templates:**
- 34 agents total
- 32 at 8+/10 (94%)
- All blockers cleared
- Deploy proceeds ✅

**Effort:** ~8 hours for critical agents, ~2 hours for improvements

---

**Ready? Run:**
```bash
python audit_script.py "postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:54364/railway"
```

**Questions? Read:** `README.md` for full documentation
