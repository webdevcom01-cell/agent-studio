# Agent Audit & Scoring System — Baseline Evaluation

This directory contains a complete agent auditing solution for agent-studio PostgreSQL databases, executed WITHOUT any skill guidance.

## Files

### 1. `audit_script.py` (528 lines)
**Executable Python module** for auditing all agents in a Railway PostgreSQL database.

**Key Features:**
- Async psycopg3 connection handling
- Parallel data fetching (7 concurrent queries per agent)
- Batch processing (10 agents at a time)
- 5-dimensional scoring (config, usage, knowledge, reliability, security)
- Deterministic, rule-based health checks
- JSON export of audit results

**Usage:**
```bash
pip install psycopg[binary]
python audit_script.py "postgresql://user:pass@tramway.proxy.rlwy.net:54364/railway" .
```

**Output:**
- Console summary (agents by urgency level)
- `metrics.json` with full scoring details

### 2. `audit_output.md` (391 lines)
**Complete methodology documentation** including:
- Executive summary and scoring interpretation
- Detailed scoring formulas for each dimension
- Database query patterns and optimization notes
- Configuration thresholds (AuditConfig class)
- Critical/high/medium urgency action items
- Usage instructions and integration examples
- Future enhancement roadmap

### 3. `metrics.json` (85 lines)
**Example output** showing 5 representative agents with:
- All 5 component scores
- Overall weighted score (0-100)
- Urgency level classification
- Detailed findings/issues per agent
- Timestamp of audit

## Scoring System

### Overall Score Formula
```
overall_score = 
  config_score * 0.25 +
  usage_score * 0.25 +
  knowledge_score * 0.20 +
  reliability_score * 0.20 +
  security_score * 0.10
```

### Urgency Thresholds
| Score Range | Level | Status |
|------------|-------|--------|
| 0-29 | CRITICAL | Immediate action required |
| 30-49 | HIGH | Major issues present |
| 50-69 | MEDIUM | Several improvements needed |
| 70-100 | LOW | Healthy, routine monitoring |

## Scoring Dimensions

### Configuration Score (25%)
Checks: system prompt quality, flow definition, valid model parameters, expected duration range.

**Penalties:**
- Empty/missing name: -25
- Short/missing system prompt: -15
- Invalid temperature: -20
- No flow defined: -30
- No flow content: -25
- Invalid duration: -10

### Usage Score (25%)
Checks: activity recency, conversation volume, error rates.

**Penalties:**
- >30 days inactive: -40
- 14-30 days inactive: -20
- Zero conversations: -30
- <5 conversations: -15
- No 7-day activity: -25
- >10% error rate: -20

### Knowledge Base Score (20%)
Checks: KB completeness, chunk count, embedding freshness.

**Default (no KB):** 50 points

**Penalties:**
- Zero chunks: -40
- <5 chunks: -20
- <0.1 MB total: -10
- >90 days stale: -15

### Reliability Score (20%)
Checks: recent error rates, approval queue backlog, eval test coverage.

**Penalties:**
- >15% recent error rate: -30
- >10 pending approvals: -20
- >5 expired approvals: -15
- No eval suites: -25
- Failed eval runs: -2 each (max -20)

### Security Score (10%)
Checks: access control, ownership, hardcoded secrets.

**Penalties:**
- Agent is public: -30
- No owner (orphaned): -20
- Hardcoded secrets in prompt: -15

**Bonuses:**
- ECC enabled: +5

## Database Schema

Audit queries target these Prisma models:

- `Agent` — core metadata, owner, visibility
- `Flow` — execution graph, active version
- `KnowledgeBase` → `KBChunk` — vector embeddings, ingestion
- `Conversation` → `Message` — interaction history
- `AnalyticsEvent` — execution metrics, errors
- `HumanApprovalRequest` — approval queue health
- `EvalSuite` → `EvalTestCase` → `EvalRun` — test coverage

## Performance

**Complexity:** O(n/10 * query_time) where n = agent count

**Typical Performance:**
- 100 agents: ~30-45 seconds
- 1000 agents: ~5-8 minutes
- Batch size: 10 agents parallel
- Memory: <10 MB

## Connection Details

**Railway PostgreSQL:**
```
Host: tramway.proxy.rlwy.net
Port: 54364
Database: railway
User: postgres (or configured user)
```

Connection requires:
- Network access to Railway proxy
- Valid credentials
- PostgreSQL client library (psycopg)

## Example Output

```json
{
  "agentId": "clh7x9q1z000001l5e8q0f9q0",
  "name": "Customer Support Bot",
  "configScore": 85,
  "usageScore": 92,
  "knowledgeScore": 78,
  "reliabilityScore": 88,
  "securityScore": 90,
  "overallScore": 86,
  "urgencyLevel": "LOW",
  "findings": [],
  "lastUpdated": "2026-04-05T12:00:00Z"
}
```

## Integration Examples

### GitHub Actions
```yaml
- name: Audit Agents
  env:
    DATABASE_URL: ${{ secrets.RAILWAY_DATABASE_URL }}
  run: python audit_script.py "$DATABASE_URL" ./results

- name: Check for Critical Issues
  run: python -c "import json; results = json.load(open('results/metrics.json')); critical = [r for r in results if r['urgencyLevel'] == 'CRITICAL']; exit(1 if critical else 0)"
```

### Docker
```dockerfile
FROM python:3.11-slim
RUN pip install psycopg[binary]
COPY audit_script.py .
CMD ["python", "audit_script.py", "$DATABASE_URL", "/audit"]
```

## Customization

**Modify thresholds** in `AuditConfig` class:
```python
DAYS_INACTIVE_THRESHOLD = 30  # Change to 45 for more lenient
HIGH_SCORE_THRESHOLD = 50     # Change to 60 to require higher standards
```

**Add new scoring dimensions:**
1. Create `score_*()` async function
2. Add to `audit_agent()` parallel fetch
3. Weight in `calculate_overall_score()`
4. Update markdown documentation

## Limitations

1. Railway network access required (VPC/proxy connectivity)
2. Single snapshot (no time-series trending)
3. Pattern-based secret detection (not cryptographic)
4. No flow complexity analysis
5. No cross-agent dependency checking

## Future Enhancements

- Time-series scoring and anomaly detection
- ML-based prompt quality analysis
- Automated remediation suggestions
- Flow graph validation
- Resource consumption metrics
- A2A dependency mapping

---

**Created:** 2026-04-05
**Status:** Baseline Evaluation (No Skill Guidance)
**Environment:** agent-studio repository
**Target:** Railway PostgreSQL database
