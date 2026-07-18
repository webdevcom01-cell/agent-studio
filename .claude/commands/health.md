---
description: Project health — run the deterministic scripts/project-health.mjs, then give prioritized advice (verbatim + judgment)
---

RULE: counting is done EXCLUSIVELY by the script. You do NOT recount and do NOT invent numbers or findings.

1. Run: `node scripts/project-health.mjs`
   (add `--full` for tests+coverage — slow; skipped by default).
2. Relay the table and sections from the script output **VERBATIM** (a code block is fine).
3. ONLY BELOW that, in an "## Advice" section, add prioritization by ROI (high impact / low effort first) based on THOSE findings — without a single new number/file that is not in the output.
4. If a tool is missing (e.g. `madge`/`knip` does not exist or fails), suggest installing/fixing it — do NOT invent a finding.
