# audit-verify

Skill that empirically verifies the V1 Agent Studio architectural audit by running real commands (typecheck, vitest, lint, knip, npm audit, license-checker) against the current codebase.

Produces a Markdown V2 verification report with confirmed / refuted / could-not-test status for each of the 27 V1 claims, plus new findings.

## Quick start

```bash
# Default run (uses existing node_modules, ~5-15 min)
bash skills/audit-verify/verify.sh

# With install (~3 min slower)
bash skills/audit-verify/verify.sh --install

# Clean macOS Time Machine duplicates first (recommended on macOS)
bash skills/audit-verify/verify.sh --clean-mac-dups

# Help
bash skills/audit-verify/verify.sh --help
```

## Trigger phrases (used by Claude in Cowork mode)

**English:** "verify audit", "audit verify", "v2 audit", "validate audit findings", "audit accuracy check"

**Serbian/Croatian/Bosnian:** "verifikuj audit", "potvrdi audit", "v2 audit", "audit verifikacija", "ponovo proveri audit", "potvrdi nalaze"

## Output

Reports written to `reports/Audit-V2-Verification-YYYY-MM-DD.md` (gitignored).

Contains:
- Executive summary (X/27 confirmed)
- V1 corrections pre-applied (C01, C14, C16)
- Per-claim verification table
- Recommended V1 patches
- Out-of-scope items

## Requirements

- Node 20+ and bash 5+
- `node_modules/` installed (or use `--install`)
- Git repository (uses `git log` for commit counts)

Optional but recommended:
- `pnpm` globally installed (improves behavioral check coverage)
- `jq` (for npm audit + outdated parsing)

## Out of scope

This skill does NOT cover:
- E2E test runs (require localhost + DB + Redis)
- Load tests (require running service)
- Threat modeling (human-driven analysis)
- Live API tracing (require deployed instance)
- Lighthouse / bundle-analyzer
- AI cost analysis
- MCP integration (planned for v2 of this skill)

## CLI flags

| Flag | Description |
|---|---|
| `--output DIR` | Write report to `DIR` (default `$REPO_ROOT/reports`) |
| `--install` | Run `pnpm install` before checks (slow) |
| `--clean-mac-dups` | Delete macOS Time Machine duplicates in `src/generated` (`* 2.ts`) |
| `--verbose` | Extra progress detail |
| `--help`, `-h` | Show usage |

## Exit codes

- `0` — all 27 checks ran cleanly
- `2` — some checks skipped due to env limitation (e.g. no pnpm) — still valid result
- `1` — skill itself failed (bash error, missing repo)

## Maintenance

When V1 audit is revised:
1. Update `expected` values in `verify.sh` CHECKS section
2. Add new checks if V1 added new claims
3. Bump `version:` in `SKILL.md` frontmatter
4. Re-package: `cd skills/ && zip -r audit-verify.skill audit-verify/ -x '*/reports/*'`

## Documentation chain

This skill was developed via:
1. `Agent-Studio-Deep-Audit-2026-05-17.md` — V1 audit (the document being verified)
2. `Audit-Review-Self-Critique-2026-05-17.md` — meta-review of V1 audit
3. `skill-audit-verify-ANALYSIS.md` — analysis before skill creation
4. `skill-audit-verify-PLAN.md` (V1) — first plan
5. `skill-audit-verify-PLAN-REVIEW.md` — zero-tolerance plan review
6. `skill-audit-verify-PLAN-V2.md` — revised plan (this skill's foundation)

All documents in repo root.
