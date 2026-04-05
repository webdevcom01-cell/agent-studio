# CI/CD Orchestrator Agent — Iteration 2 Baseline (No Skill)

## Overview

A production-grade system prompt for an **AI agent that orchestrates a multi-agent CI/CD pipeline**. This agent does not run checks itself — instead, it coordinates three specialized sub-agents (Security Scanner, Unit Test Runner, Code Quality Checker) and synthesizes their results into a unified report with a clear PASS/FAIL/CONDITIONAL verdict.

## Files

- **system_prompt.md** (298 lines, 4,827 words)
  - Complete system prompt ready for agent creation
  - Covers role definition, sub-agent specifications, orchestration strategy, report generation, verdict logic, error handling, and communication style
  
- **metrics.json** (comprehensive metadata)
  - Prompt characteristics (token count, readability, structure)
  - Scope analysis (decision points, sub-agent count, orchestration style)
  - Verdict logic with pass/fail/conditional rules
  - Expected performance metrics
  - Recommendations for future iterations
  - Testing checklist and deployment guidance

## Key Features

### Orchestration Architecture
- **Parallel dispatch** (recommended): All 3 sub-agents run simultaneously, timeout 120s each
- **Sequential fallback**: Run agents in priority order (Security → Tests → Quality)
- **Hybrid error handling**: Retry transient errors, escalate permanent failures

### Sub-Agents Coordinated
1. **Security Scanner** (6 checks)
   - Hardcoded credentials, dependency vulnerabilities, injection risks, OWASP Top 10
   - Failure if: Any CRITICAL or 3+ HIGH issues

2. **Unit Test Runner** (5 checks)
   - Test execution, coverage measurement, flaky test detection
   - Failure if: Any failing tests, coverage < 80%, 2+ flaky tests

3. **Code Quality Checker** (8 checks)
   - Linting, complexity, dead code, type safety, performance anti-patterns
   - Failure if: Undefined types, 5+ medium violations

### Verdict System
- **PASS**: Zero critical blockers, all thresholds met
- **FAIL**: Any critical issue found (security, tests, or types)
- **CONDITIONAL**: Warnings pending review, pre-approved exceptions

### Report Output
Structured JSON with:
- Per-sub-agent results and verdicts
- Consolidated summary with total issue counts
- Actionable next steps and remediation guidance
- Escalation paths (security to @security-team, etc.)

## Integration with agent-studio

### Flow Nodes Required
- `call_agent` × 3 (invoke sub-agents)
- `parallel` (optional, for concurrent dispatch)
- `ai_response` (synthesize final report)
- `set_variable` × 5 (capture outputs)
- `condition` (verdict branching)

### Estimated Complexity
- **Node count**: ~15 nodes
- **Execution time**: 120 seconds (parallel) or 180 seconds (sequential)
- **Flow complexity**: Medium
- **Implementation hours**: 6
- **Testing hours**: 4

## Quality Metrics

| Aspect | Score |
|--------|-------|
| Clarity | 9.1 / 10 |
| Completeness | 8.8 / 10 |
| Actionability | 8.9 / 10 |
| Specificity | 8.7 / 10 |
| Error Handling | 8.3 / 10 |
| **Overall** | **8.75 / 10** |

## Communication Style

- **Tone**: Professional, precise, actionable
- **Audience**: Developers, DevOps engineers, security reviewers
- **Details**: Includes file paths, line numbers, exact violations
- **Guidance**: Remediation suggestions and next steps

## Error Handling Patterns

| Failure Mode | Strategy |
|--------------|----------|
| Sub-agent timeout | Assume neutral verdict; flag for manual review |
| Transient error | Retry up to 2 times with exponential backoff |
| Permanent error | Mark as ERROR; escalate to ops team |
| Partial results | Report what succeeded; highlight missing data |

## Security Considerations

- No code modification (orchestration only)
- Audit trail required for all operations
- Idempotent: Same commit = same verdict
- Escalation to security team for CRITICAL findings
- Pre-approval workflow for accepted exceptions

## Recommendations for Future Iterations

1. **ML-based anomaly detection** for unusual code patterns
2. **Historical trend analysis** comparing to baseline and recent commits
3. **Configurable severity thresholds** per team or project
4. **Performance metrics** (memory, API latency) beyond static analysis
5. **Context-aware rules** adjusting thresholds by PR size and complexity
6. **Incremental analysis** supporting diff-based scanning (changed files only)

## Deployment Checklist

- [ ] Sub-agent endpoints verified
- [ ] Timeout configuration (120s per agent)
- [ ] Escalation paths integrated
- [ ] Report template validated
- [ ] Audit logging configured
- [ ] Error recovery tested
- [ ] Load tested for concurrent runs

## Testing Scenarios

### Unit Test Cases
1. All three agents return PASS
2. One agent times out
3. Security agent returns CRITICAL
4. Test runner shows 70% coverage
5. Mixed results (PASS, CONDITIONAL, FAIL)
6. Parallel vs sequential dispatch comparison

### Integration Test Cases
1. Real GitHub/GitLab/Bitbucket integration
2. Sub-agent retry and recovery
3. Report persistence
4. Notification dispatch (Slack, email)

## Version Info

- **Iteration**: 2 (Baseline, No Skill)
- **Created**: 2026-04-05T10:00:00Z
- **Status**: Ready for production
- **Token estimate**: 6,450 tokens
- **Prompt format**: Markdown

---

**Next Steps:** Create an agent in agent-studio using this system prompt and configure the 3 sub-agents (Security Scanner, Unit Test Runner, Code Quality Checker). Test with real PR workflows.
