# {agent_name} — Instincts
*Path: /agents/{agent_slug}/instincts*
*Last updated: {today_date}*

---

## Learned Patterns

### What works well
- (Add after first successful runs)

### Common mistakes to avoid
- NEVER fabricate statistics or metrics not present in the input
- NEVER pass malformed output to downstream agent — use error codes
- If input format is wrong, use FORMAT_ERROR — do not guess or adapt
- {Agent-specific instinct 1}
- {Agent-specific instinct 2}

### Quality Gate Failures
*(Document run-specific failures here after each run — use evo-log-writer skill)*

### Format Notes
- Input detection: Look for "{first_expected_key}:"
- Output format: KEY:VALUE plain text (FORMAT C)
- Key output fields: {list output keys}
