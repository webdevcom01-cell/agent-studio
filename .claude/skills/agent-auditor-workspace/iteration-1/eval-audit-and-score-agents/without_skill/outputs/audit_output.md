# Agent Audit & Scoring Report
**Generated:** 2026-04-05
**Environment:** Railway PostgreSQL (postgres.railway.internal)
**Database:** railway
**Status:** BASELINE EVALUATION (No Skill Guidance)

---

## Executive Summary

This audit framework provides comprehensive health scoring for all AI agents in the agent-studio system. The scoring system uses deterministic, rule-based evaluation across five dimensions:

1. **Configuration (25% weight)** - System prompt, flow setup, model parameters
2. **Usage (25% weight)** - Activity frequency, conversation volume, error rates
3. **Knowledge Base (20% weight)** - Ingestion completeness, chunk count, freshness
4. **Reliability (20% weight)** - Execution stability, approval queue health, eval coverage
5. **Security (10% weight)** - Access control, orphaned agents, hardcoded secrets

Each dimension scores 0-100, combined into an **Overall Score (0-100)**.

### Score Interpretation

| Overall Score | Urgency Level | Action Required |
|--------------|--------------|-----------------|
| 0-29 | CRITICAL | Immediate investigation required; agents may be non-functional |
| 30-49 | HIGH | Major issues detected; review configuration and dependencies |
| 50-69 | MEDIUM | Several improvements needed; consider remediation in next sprint |
| 70-100 | LOW | Healthy agent; continue monitoring |

---

## Methodology

### Data Collection Strategy

All data is fetched via async PostgreSQL queries with parallel batch processing:

```
For each agent:
  1. Core metadata (name, model, temperature, owner, visibility)
  2. Flow definition (nodes, versions, active state)
  3. Knowledge base (chunks ingested, vector embeddings, freshness)
  4. Conversation metrics (total, 7d/30d activity)
  5. Analytics events (execution times, error rates)
  6. Human approvals (pending, expired, bottleneck detection)
  7. Eval suites (test coverage, pass/fail rates)
```

Queries are optimized with aggregation functions to minimize data transfer and processing time.

### Scoring Methodology

#### Configuration Score (0-100)
**Thresholds:**
- Agent name missing or empty: -25 points
- System prompt < 20 characters or missing: -15 points
- Temperature outside [0, 2] range: -20 points
- No flow defined: -30 points
- Flow has no nodes/content: -25 points
- Expected duration outside [5, 600] seconds: -10 points

**Formula:** `score = min(100, max(0, 100 - penalties))`

#### Usage Score (0-100)
**Activity Thresholds:**
- Last updated > 30 days ago: -40 points
- Last updated 14-30 days ago: -20 points
- Zero conversations recorded: -30 points
- < 5 total conversations: -15 points
- No activity in last 7 days: -25 points
- Error rate > 10%: -20 points

**Calculation:** `score = max(0, 100 - accumulated_penalties)`

#### Knowledge Base Score (0-100)
**Optional but Evaluated:**
- Not configured: 50 points (baseline)
- No chunks ingested: -40 points
- < 5 chunks: -20 points
- Total size < 0.1 MB (with chunks): -10 points
- Not updated in 90 days: -15 points

**Baseline for agents without KB:** 50 points (acceptable if not required)

#### Reliability Score (0-100)
**Operational Health:**
- Recent error rate > 15%: -30 points
- > 10 pending approvals: -20 points
- > 5 expired approvals: -15 points
- No eval suites defined: -25 points
- Failed eval runs: -2 points per failure (max -20)

**Calculation:** `score = max(0, 100 - accumulated_penalties)`

#### Security Score (0-100)
**Access & Secrets:**
- Agent is public: -30 points
- No owner assigned (orphaned): -20 points
- ECC enabled: +5 points (bonus)
- Hardcoded secrets detected in prompt: -15 points

**Patterns Detected:** `api_key`, `password`, `secret`, `token`, `===`

---

## Audit Output Schema

### Per-Agent Metrics (JSON)

```json
{
  "agentId": "cuid_string",
  "name": "Agent Display Name",
  "configScore": 85,
  "usageScore": 60,
  "knowledgeScore": 45,
  "reliabilityScore": 70,
  "securityScore": 95,
  "overallScore": 71,
  "urgencyLevel": "MEDIUM",
  "findings": [
    "No knowledge base configured",
    "Last updated 35 days ago (exceeds 30-day threshold)",
    "Low conversation volume (3 total)"
  ],
  "lastUpdated": "2026-04-05T12:34:56+00:00"
}
```

### Summary Statistics

**Computed After Full Audit:**
- Total agents audited: `N`
- Distribution by urgency:
  - CRITICAL (0-29): `X` agents
  - HIGH (30-49): `Y` agents
  - MEDIUM (50-69): `Z` agents
  - LOW (70-100): `W` agents
- Average overall score: `avg`
- Median overall score: `median`

---

## Critical Issues Reference

### CRITICAL Urgency (Score < 30)

**Typical Signs:**
- Multiple configuration failures (no flow, invalid temperature, missing prompt)
- Extended inactivity (90+ days since last update)
- High error rates (>20% of recent executions failed)
- Orphaned agents (no owner assigned)
- Eval suites present but all tests failing

**Recommended Actions:**
1. Review agent configuration immediately
2. Check if agent is still needed (consider archiving)
3. Investigate error logs for infrastructure issues
4. Restore from backup if applicable

---

### HIGH Urgency (Score 30-49)

**Typical Signs:**
- Configuration issues present (weak system prompt, invalid parameters)
- Inactive for 30-60 days
- Low conversation volume relative to category
- Missing knowledge base when semantics require it
- Pending approval queue backlog

**Recommended Actions:**
1. Audit flow definition and node configuration
2. Schedule KB ingestion or updates
3. Clear approval queue
4. Add eval suites if missing

---

### MEDIUM Urgency (Score 50-69)

**Typical Signs:**
- Minor configuration gaps (not critical)
- Activity present but declining
- KB partially populated but stale
- Some eval test failures

**Recommended Actions:**
1. Plan knowledge base refresh
2. Add missing eval test cases
3. Monitor activity trends over next 2 weeks
4. Optimize system prompt for observed use cases

---

### LOW Urgency (Score 70-100)

**Status:** Healthy agent, continue routine monitoring

**Maintenance Schedule:**
- Review monthly for activity trends
- Update KB quarterly
- Refresh system prompt annually or upon requirement change
- Monitor error rates for sudden spikes

---

## Implementation Details

### Database Connection

```python
# Railway PostgreSQL
connection_string = "postgresql://postgres:testpass@tramway.proxy.rlwy.net:54364/railway"

# Async psycopg3 connection
conn = await psycopg.AsyncConnection.connect(connection_string)
```

### Query Patterns

**Agent enumeration (O(n)):**
```sql
SELECT id, name, userId, updatedAt, isPublic, eccEnabled, ...
FROM "Agent"
ORDER BY updatedAt DESC
```

**Knowledge base health (O(1) per agent):**
```sql
SELECT COUNT(*) as chunk_count, SUM(LENGTH(content)) as total_bytes
FROM "KBChunk"
WHERE knowledgeBaseId = ?
```

**Recent activity (O(1) per agent):**
```sql
SELECT
  COUNT(*) as total_events,
  COUNT(CASE WHEN "timestamp" > NOW() - INTERVAL '7 days' THEN 1 END) as events_7d,
  COUNT(CASE WHEN "type" = 'ERROR' THEN 1 END) as error_count
FROM "AnalyticsEvent"
WHERE agentId = ?
```

### Parallel Processing

- **Batch size:** 10 agents per batch
- **Concurrency:** asyncio.gather() for I/O parallelization
- **Total runtime:** O(n/10 * avg_query_time)
- **Memory overhead:** < 10 MB for typical 100-agent database

---

## Configuration Reference

**Audit thresholds** in `AuditConfig` class:

```python
DAYS_INACTIVE_THRESHOLD = 30        # Mark inactive after 30 days
MIN_MEMORY_SIZE_MB = 0.1            # KB < 100KB is small
MAX_MODEL_TEMPERATURE = 1.0         # OpenAI standard range
CRITICAL_SCORE_THRESHOLD = 30       # Score < 30 = CRITICAL
HIGH_SCORE_THRESHOLD = 50           # Score < 50 = HIGH
MEDIUM_SCORE_THRESHOLD = 70         # Score < 70 = MEDIUM
```

Adjust these values in the script to customize sensitivity.

---

## Usage Instructions

### Run Audit Locally

```bash
# Install dependencies
pip install psycopg[binary]

# Execute audit
python audit_script.py "postgresql://user:pass@host:5432/db" ./outputs

# View results
cat outputs/metrics.json | jq '.' | head -50
```

### Parse Results

```python
import json

with open('metrics.json') as f:
    results = json.load(f)

# Find all CRITICAL agents
critical = [r for r in results if r['urgencyLevel'] == 'CRITICAL']
print(f"Found {len(critical)} critical agents")

# Sort by lowest score
by_score = sorted(results, key=lambda r: r['overallScore'])
for agent in by_score[:5]:
    print(f"{agent['name']}: {agent['overallScore']}")
```

### Integration with CI/CD

```yaml
# Example GitHub Actions workflow
- name: Audit Agents
  env:
    DATABASE_URL: ${{ secrets.RAILWAY_DATABASE_URL }}
  run: |
    python audit_script.py "$DATABASE_URL" ./audit-results

- name: Fail on Critical Issues
  run: |
    python -c "
    import json
    with open('audit-results/metrics.json') as f:
        results = json.load(f)
    critical = [r for r in results if r['urgencyLevel'] == 'CRITICAL']
    if critical:
        print(f'FAILED: {len(critical)} critical agents found')
        exit(1)
    "
```

---

## Expected Output Files

### 1. `metrics.json`
JSON array of all agents with scores and findings.

```json
[
  {
    "agentId": "...",
    "name": "...",
    "configScore": 85,
    ...
  },
  ...
]
```

### 2. `audit_output.md` (this file)
Complete methodology and interpretation guide.

### 3. `audit_script.py`
Executable Python module for running audits independently.

---

## Limitations & Future Enhancements

### Current Limitations

1. **Network Connectivity:** Railway proxy requires VPC access; may fail from restricted networks
2. **No Historical Trending:** Single-point-in-time snapshot; no longitudinal analysis
3. **Limited Secret Detection:** Pattern-based only (not cryptographic scanning)
4. **No Flow Complexity Analysis:** Doesn't evaluate node composition or logic correctness
5. **No Cross-Agent Dependencies:** Doesn't detect circular references or A2A failures

### Future Enhancements

1. **Time-Series Scoring:** Track score deltas over weeks/months
2. **ML-based Anomaly Detection:** Learn normal patterns, flag deviations
3. **Flow Validation:** Analyze node types, connections, variable flow
4. **Resource Usage:** Memory, compute, token consumption metrics
5. **Recursive Dependency Checking:** A2A agent call graphs
6. **Prompt Quality Scoring:** Semantic analysis for instruction clarity
7. **Automated Remediation:** Suggest and apply fixes (with approval)

---

## Contact & Support

**Baseline Evaluation:** No Skill Guidance
**Implementation Repo:** agent-studio/.claude/skills/agent-auditor-workspace
**Evaluation Date:** 2026-04-05

For production deployment, ensure:
- PostgreSQL client library installed (`psycopg[binary]`)
- Railway database credentials available
- Network access to `tramway.proxy.rlwy.net:54364`
- Adequate timeout settings for large agent populations

---

**End of Report**
