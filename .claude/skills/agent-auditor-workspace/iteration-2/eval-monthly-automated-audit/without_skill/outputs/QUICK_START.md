# Quick Start: Monthly Agent Audit System

## 30-Second Overview

**What:** Automated monthly evaluation of all AI agents across 6 dimensions  
**When:** First Sunday each month at 02:00 UTC (configurable)  
**Where:** Runs against your Railway PostgreSQL database  
**Output:** Audit records + email digest + Slack alerts + S3 archive

---

## The 6 Audit Dimensions

1. **Performance** - Latency, error rates, throughput
2. **Quality** - Accuracy, hallucination detection, consistency
3. **Compliance** - RAG citations, prompt injection defense, PII handling
4. **Operational** - Uptime, resources, database health
5. **Knowledge** - RAG coverage, embedding quality, document freshness
6. **User Experience** - DAU, satisfaction, engagement

---

## Files in This Package

| File | Purpose | Size |
|------|---------|------|
| `audit_output.md` | Complete methodology (8 sections) | 626 lines |
| `audit_script.py` | Python implementation (ready to deploy) | 621 lines |
| `metrics.json` | Metric definitions + thresholds | 627 lines |
| `README.md` | Setup guide + reference | 385 lines |
| `QUICK_START.md` | This file | - |

---

## Installation (5 Steps)

### Step 1: Create Database Tables
```sql
CREATE TABLE agent_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  audit_date DATE NOT NULL,
  p50_latency_ms FLOAT,
  p95_latency_ms FLOAT,
  p99_latency_ms FLOAT,
  -- ... (see audit_output.md section 5 for full schema)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_audits_agentId_date ON agent_audits(agent_id, audit_date DESC);
```

### Step 2: Install Python Dependencies
```bash
pip install psycopg2-binary numpy scikit-learn requests
```

### Step 3: Set Environment Variables
```bash
export DATABASE_URL="postgresql://user:pass@tramway.proxy.rlwy.net:54364/railway"
export OPENAI_API_KEY="sk-..."
export ADMIN_EMAIL="audit-admin@company.com"
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

### Step 4: Test the Script
```bash
python audit_script.py --mode full
```

### Step 5: Schedule with Cron
```bash
# First Sunday of month at 02:00 UTC
0 2 * * 0 cd /path/to/audit && python audit_script.py --mode full >> audit.log 2>&1
```

---

## Key Thresholds

### Critical Alerts (Immediate Action)
- **Error rate > 2%** - Something is broken
- **p95 latency > 5s** - Users experiencing delays
- **Uptime < 99%** - Service availability issue
- **Any prompt injection successful** - Security breach
- **PII detected in logs** - Compliance violation
- **API key age > 90 days** - Rotation overdue

### Warning Alerts (Review in 24h)
- **Error rate > 1%** - Trend toward degradation
- **p95 latency > 3s** - Performance concern
- **Hallucination rate > 10%** - Quality issue
- **Citation accuracy < 95%** - RAG misconfiguration
- **Cost jump > 50%** - Unexpected expense spike

---

## What Happens During Audit

```
02:00 UTC - Scheduler wakes up
  ↓
Fetch all active agents + 30 days of logs
  ↓
Performance analysis (latency percentiles, error rates)
  ↓
Quality testing (semantic similarity, hallucination detection)
  ↓
Compliance checks (RAG citations, prompt injection)
  ↓
Operational health (uptime, resources, database)
  ↓
User engagement metrics (DAU, satisfaction)
  ↓
Store results in PostgreSQL
  ↓
Generate report
  ↓
Email digest to admin@
  ↓
Post critical alerts to Slack
  ↓
Archive to S3
  ↓
Done (2-4 hours total)
```

---

## Understanding the Output

### agent_audits Table
One row per agent per month with all metrics:
```sql
SELECT agent_id, audit_date, p95_latency_ms, error_rate, 
       accuracy_score, hallucination_rate, uptime_pct
FROM agent_audits
WHERE audit_date = '2026-04-01'
ORDER BY error_rate DESC;
```

### Email Digest
```
Subject: Agent Audit Report — 2026-04-01

Executive Summary:
  ✓ Performance: Within SLA
  ⚠ Quality: 2 agents with hallucination spikes
  ✓ Compliance: 100% RAG citation coverage
  ✗ Knowledge: 5 agents overdue for KB refresh

Alerts:
  [CRITICAL] CodeGen agent hallucination: 8.2% (threshold: 5%)
  [CRITICAL] Customer Support KB not updated > 30 days
  [WARNING] Research agent cost jump: +$450

Agent Scorecard Example:
  CodeGen Agent
  ├─ Performance: 82% (p95: 1.5s)
  ├─ Quality: 68% (accuracy: 92%)
  ├─ Compliance: 95% (citations ✓)
  ├─ Operational: 98% (uptime: 99.8%)
  └─ Status: REVIEW REQUIRED
```

### Slack Alert (Critical Only)
```
🚨 CRITICAL: CodeGen Agent Hallucination Spike
Error: Hallucination rate 8.2% (threshold: 5%)
Action: Review system prompt + retest accuracy suite
Link: https://dashboard.company.com/audits/2026-04-01
```

---

## Customization

### Change Audit Schedule
In `metrics.json`, modify:
```json
"audit_schedule": {
  "cron_expression": "0 2 * * 0"  // Change this
}
```

Cron format: `minute hour day_of_month month day_of_week`
- `0 2 * * 0` = First Sunday at 02:00 UTC
- `0 3 1 * *` = First day of month at 03:00 UTC
- `0 * * * 1` = Every Monday at 00:00 UTC

### Adjust Alert Thresholds
In `metrics.json`, find metric and adjust:
```json
"p95_latency_ms": {
  "target": 2000,
  "alert_threshold_critical": 5000,  // Change this
  "alert_threshold_warning": 3000    // Or this
}
```

### Add New Metric
1. Define in `metrics.json` under appropriate dimension
2. Add calculation to `audit_script.py` class
3. Add column to `agent_audits` table
4. Update sample audit report in `audit_output.md`

---

## Troubleshooting

### "Connection refused" Error
```bash
# Check DATABASE_URL
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"

# If Railway: use postgres.railway.internal (internal network)
```

### "No agents found"
```sql
-- Verify agents exist and are > 30 days old
SELECT id, name, created_at FROM agents
WHERE status = 'active'
AND created_at < NOW() - INTERVAL '30 days';
```

### "OpenAI API error"
```bash
# Verify API key
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models
```

### "Missing logs"
```sql
-- Check conversation_logs table populated
SELECT COUNT(*) FROM conversation_logs
WHERE created_at > NOW() - INTERVAL '30 days';
```

---

## Performance Tips

- **Parallel workers:** Deploy 4-8 audit workers in BullMQ for N agents
- **Caching:** Use Redis for embedding cache (avoid recomputing)
- **Batch queries:** Fetch all logs in one query, process in memory
- **Index:** Create index on `conversation_logs(agent_id, created_at)`
- **Scheduling:** Run audit during off-peak hours (02:00 UTC suggested)

---

## Advanced: Custom Test Suite

Add ground truth dataset for accuracy testing:

```python
# In audit_script.py, update QualityAssessor
def evaluate_accuracy(self, agent_id: str) -> float:
    test_cases = [
        {"query": "What is 2+2?", "expected": "4"},
        {"query": "Who is the CEO of OpenAI?", "expected": "Sam Altman"},
        # ... 50+ test cases
    ]
    
    passed = 0
    for test in test_cases:
        response = agent.execute(test["query"])
        if similarity(response, test["expected"]) > 0.85:
            passed += 1
    
    return passed / len(test_cases)
```

---

## Compliance & Legal

- **Data Retention:** Keep 24 months in PostgreSQL, 12 months in S3
- **PII Scanning:** Automatically scans logs with regex patterns
- **Audit Trail:** All audit records timestamped and immutable
- **Access Control:** Restrict audit reports to admins only
- **GDPR:** Comply with data deletion requirements (cleanup workers)

---

## Integration Points

### Send to External System
```python
# POST audit results to Datadog/NewRelic/etc
import requests

results = await orchestrator.run_full_audit()
requests.post(
    'https://api.datadoghq.com/api/v1/series',
    headers={'DD-API-KEY': dd_key},
    json={'series': [
        {'metric': f'agent.p95_latency', 
         'points': [[ts, m['p95_latency_ms']]],
         'tags': [f'agent:{m["agent_id"]}']}
        for m in results['results']
    ]}
)
```

### Webhook for Custom Actions
```python
# POST to custom webhook on critical alerts
if alert['severity'] == 'critical':
    requests.post(WEBHOOK_URL, json=alert)
```

---

## Support Matrix

| Component | Status | Notes |
|-----------|--------|-------|
| PostgreSQL 15+ | ✓ Supported | pgvector required for embeddings |
| Railway | ✓ Supported | Use postgres.railway.internal |
| OpenAI API | ✓ Required | For text-embedding-3-small |
| Slack | ✓ Optional | For critical alerts |
| S3 | ✓ Optional | For archival only |
| Redis | ✓ Optional | For caching + worker coordination |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-05 | Initial release with 6 audit dimensions |

---

## Next Steps

1. **Review audit_output.md** - Understand full methodology
2. **Deploy audit_script.py** - Test against your database
3. **Configure metrics.json** - Adjust thresholds for your agents
4. **Set up scheduler** - Enable monthly execution
5. **Establish baseline** - Run first audit, document findings

---

**Questions?** See detailed docs in `audit_output.md` sections 2-8.
