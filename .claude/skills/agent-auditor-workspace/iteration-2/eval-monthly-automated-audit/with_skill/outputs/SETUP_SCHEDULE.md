# Setting Up Monthly Automated Audits

This guide walks you through scheduling monthly agent quality audits for agent-studio.

---

## Option 1: Using the `schedule` Skill (Recommended)

The easiest way to set up monthly audits is with Claude's built-in `schedule` skill.

### Step 1: Create Scheduled Task

```bash
# This creates a recurring monthly task on the 1st of each month at 2 AM UTC
# You can adjust the time and date as needed
```

Use this prompt in Claude Code to set up the task:

```
Create a scheduled monthly audit task that runs on the 1st of each month at 2 AM UTC.
The task should:
1. Connect to the agent-studio database at postgresql://[YOUR_DB]
2. Run the audit_script.py with full 10-dimension scoring
3. Generate metrics.json and audit_output.md reports
4. Email the report to [YOUR_EMAIL]
5. Block any deploy if agents score <8/10

Task ID: agent-monthly-audit
Description: Monthly enterprise quality audit of all AI agents
```

**Result:** Claude will create a cron-style scheduled task that runs automatically every month.

---

## Option 2: GitHub Actions (CI/CD)

Add this to `.github/workflows/monthly-audit.yml`:

```yaml
name: Monthly Agent Quality Audit
on:
  schedule:
    - cron: '0 2 1 * *'  # 1st of month at 2 AM UTC
  workflow_dispatch:      # Manual trigger

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: pip install psycopg2-binary

      - name: Download audit script
        run: |
          curl -o audit_script.py https://[YOUR_REPO]/audit_script.py

      - name: Run monthly audit
        env:
          DATABASE_URL: ${{ secrets.RAILWAY_DATABASE_URL }}
        run: python3 audit_script.py "$DATABASE_URL" 2>&1 | tee audit.log

      - name: Check deploy gate
        run: |
          if grep -q "DEPLOY BLOCKED" audit.log; then
            echo "❌ DEPLOY BLOCKED: Agents below 8/10 quality threshold"
            cat audit.log
            exit 1
          fi
          echo "✅ DEPLOY OK: All agents pass quality gate"

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: audit-reports
          path: |
            metrics.json
            audit_output.md

      - name: Send report to Slack (optional)
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Monthly agent audit complete. Check artifacts for details.'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

**Setup:**
1. Add this file to your repository
2. Set `RAILWAY_DATABASE_URL` secret in GitHub
3. Audit runs automatically on the 1st of each month at 2 AM UTC
4. Manual trigger available via "Run workflow" button

---

## Option 3: Railway Deployment Hook

If you host on Railway, add this to `railway.json` or your deployment config:

```json
{
  "scripts": {
    "predeploy": "python3 audit_script.py $DATABASE_URL || exit 1",
    "postdeploy": "python3 audit_script.py $DATABASE_URL > audit.log"
  }
}
```

Or add to your Procfile:

```
audit: python3 audit_script.py $DATABASE_URL
```

Then trigger manually via Railway CLI:

```bash
railway run python3 audit_script.py $DATABASE_URL
```

---

## Option 4: Cron Job (Self-Hosted)

If you run a Linux server, use cron:

```bash
# Edit crontab
crontab -e

# Add this line to run audit monthly at 2 AM UTC on the 1st
0 2 1 * * /usr/bin/python3 /path/to/audit_script.py postgresql://... >> /var/log/agent-audit.log 2>&1

# Optional: Email report on the 2nd
0 8 2 * * cat /var/log/agent-audit.log | mail -s "Agent Quality Audit Report" ops@company.com
```

**Verify cron is running:**
```bash
# Check cron logs
sudo journalctl -u cron -f

# View installed cron jobs
crontab -l
```

---

## Option 5: Pre-Deploy Hook (Mandatory)

**Always run audit before production deploy** to prevent regressions.

### In your CI/CD pipeline:

```bash
#!/bin/bash
# scripts/pre-deploy-quality-gate.sh

echo "Running pre-deploy agent quality audit..."

python3 audit_script.py $DATABASE_URL > /tmp/audit.log 2>&1

if grep -q "DEPLOY BLOCKED" /tmp/audit.log; then
    echo "ERROR: Agent quality gate failed"
    cat /tmp/audit.log
    exit 1
fi

echo "SUCCESS: All agents pass quality gate"
exit 0
```

Then in your deploy script:

```bash
./scripts/pre-deploy-quality-gate.sh || exit 1
npm run build
npm run deploy
```

---

## Configuration Variables

Before running audit, ensure these are set:

```bash
# Required
export DATABASE_URL="postgresql://postgres:PASSWORD@tramway.proxy.rlwy.net:54364/railway"
export AUDIT_THRESHOLD=8  # Minimum score for production agents

# Optional
export AUDIT_LOG_PATH="/var/log/agent-audit.log"
export AUDIT_ALERT_EMAIL="ops@company.com"
export AUDIT_SLACK_WEBHOOK="https://hooks.slack.com/services/..."
```

---

## Interpreting Results

### If audit passes:
```
✅ DEPLOY OK: All 12 agents at 8+/10
Dimension coverage: 85% (all dimensions >80%)
Average prompt length: 4,847 chars
```
→ **Safe to deploy**

### If audit fails:
```
❌ DEPLOY BLOCKED: 3 agents below 8/10
  - Agent X: 5/10 (missing: role, output_format, constraints)
  - Agent Y: 6/10 (missing: failure_modes, verification)
  - Agent Z: 4/10 (missing: everything)

Dimension coverage: 72% (failures dimension at 45%)
```
→ **Fix these agents before deploy:**
1. Review audit output for missing sections
2. Add missing dimensions to system prompts
3. Re-run audit to verify improvements
4. Re-deploy after all agents score 8+/10

---

## Monthly Review Checklist

After each monthly audit, review:

- [ ] **Summary:** How many agents at 8+/10? Any new gaps?
- [ ] **Dimension coverage:** Any dimension <70%? Fleet-wide issue?
- [ ] **Prompt length:** Any agents below 4,000 chars? Length trend?
- [ ] **New agents:** Do new agents follow 10-dimension template?
- [ ] **Improvements:** Did last month's fixes improve scores?
- [ ] **Regressions:** Did any agent score drop since last month?
- [ ] **Delete candidates:** Any agents still under 100 chars?
- [ ] **Next steps:** What will you improve next month?

---

## Example: Full Monthly Audit Workflow

```bash
#!/bin/bash
# scripts/monthly-audit.sh

set -e

echo "=========================================="
echo "AGENT QUALITY AUDIT — $(date +%Y-%m-%d)"
echo "=========================================="

# 1. Pull latest code
git pull origin main

# 2. Run audit
python3 audit_script.py $DATABASE_URL > audit.log 2>&1

# 3. Display results
cat audit.log

# 4. Check deploy gate
if grep -q "DEPLOY BLOCKED" audit.log; then
    echo ""
    echo "RESULT: ❌ DEPLOY BLOCKED"
    echo "ACTION: Fix agents below 8/10 before deploying"
    exit 1
else
    echo ""
    echo "RESULT: ✅ DEPLOY OK"
    echo "ACTION: Safe to deploy if all other checks pass"
    exit 0
fi
```

Run it:
```bash
chmod +x scripts/monthly-audit.sh
./scripts/monthly-audit.sh
```

---

## Troubleshooting

### "Connection failed: could not translate host name"
Railway is not accessible from your network. This is expected in dev mode.
- ✅ Audit falls back to demo data
- ✅ Script still generates reports (synthetic agents)
- ✅ Use this to test the audit pipeline locally

**To test with real data:** Run from Railway Postgres connection or use a bastion host.

### "psycopg2 not installed"
```bash
pip install psycopg2-binary
# or
pip install -r requirements.txt
```

### "No metrics.json generated"
Check the audit.log for errors. Ensure DATABASE_URL is set:
```bash
export DATABASE_URL="postgresql://..."
python3 audit_script.py "$DATABASE_URL"
```

### "DEPLOY keeps blocking"
1. Run audit locally: `python3 audit_script.py $DATABASE_URL`
2. Identify failing agents (score <8/10)
3. Fix missing dimensions in their system prompts
4. Re-run audit to verify improvements
5. Commit and push fixes before deploying

---

## Best Practices

1. **Run before every deploy** — catches regressions immediately
2. **Fix critical gaps first** — agents <6/10 block deployment
3. **Enforce 10-dimension template** — all new agents must follow it
4. **Review monthly trends** — monitor dimension coverage over time
5. **Archive reports** — keep audit history for compliance
6. **Alert on regressions** — if agent score drops >2 points, investigate
7. **Celebrate improvements** — agents moving from 6→9 are success stories

---

## Next Steps

1. **Choose a scheduling method** above (Schedule skill, GitHub Actions, or Cron)
2. **Configure DATABASE_URL** with your Railway connection
3. **Test the audit locally:**
   ```bash
   python3 audit_script.py "postgresql://..."
   ```
4. **Deploy the automation** (GitHub Actions or cron)
5. **Add pre-deploy gate** to CI/CD pipeline
6. **Monitor first run** — check audit.log and metrics.json
7. **Review with team** — discuss dimension gaps and improvements

---

**Questions?** Refer to the agent-auditor skill documentation or audit_output.md for the full framework.
