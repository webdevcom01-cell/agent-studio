---
description: Lint SOMA vault — run the deterministic scripts/lint-vault.mjs, relay its output VERBATIM, then add advice
---

RULE: counting is done EXCLUSIVELY by the script. You do NOT recount, do NOT re-bucket, do NOT invent any number or file.

1. Run: `node scripts/lint-vault.mjs`
2. Relay the script's stdout **VERBATIM** (the whole table + sections), without changing a single number or file listing. You may put it in a code block.
3. ONLY BELOW that, in a separate "## Advice" section, add prioritization and interpretation per system/vault-standard.md — but do not cite any new number/file that is not in the script output.
4. If the script fails, report the error and STOP. Change NOTHING in the vault.
