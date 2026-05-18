#!/usr/bin/env bash
#
# ci-fix.sh — Patches .github/workflows/ci.yml to add `prisma migrate deploy`
#
# The current CI workflow uses `pnpm db:push` which does NOT apply migrations.
# This means RLS migrations are never tested in CI. This script applies the fix
# documented in PLAN-V2 §11.
#
# Strategy: Insert `prisma migrate deploy` step before any `db:push` or test
# step. Idempotent — won't add duplicate steps if already applied.
#
# Usage:
#   bash skills/rls-rollout/scripts/ci-fix.sh [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CI_FILE="$PROJECT_ROOT/.github/workflows/ci.yml"

DRY_RUN="false"
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN="true"
done

if [[ ! -f "$CI_FILE" ]]; then
  echo "ERROR: $CI_FILE not found" >&2
  exit 1
fi

# Check if already applied
if grep -q "prisma migrate deploy" "$CI_FILE"; then
  echo "✓ CI already runs prisma migrate deploy — no changes needed"
  exit 0
fi

echo "Patching $CI_FILE..."

PATCH_NOTE="# Added by skills/rls-rollout/scripts/ci-fix.sh — RLS migration enforcement"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "=== DRY RUN (no changes written) ==="
  echo ""
  echo "Would insert the following step BEFORE every 'pnpm db:push' line:"
  echo ""
  echo "    - name: Apply database migrations (RLS-aware)"
  echo "      $PATCH_NOTE"
  echo "      run: pnpm prisma migrate deploy"
  echo "      env:"
  echo "        DATABASE_URL: \${{ env.DATABASE_URL }}"
  exit 0
fi

# Backup
cp "$CI_FILE" "$CI_FILE.bak.$(date +%s)"
echo "✓ Backup created: $CI_FILE.bak.*"

# Insert step before any db:push line
# We use a Python helper for safe YAML-aware editing
python3 <<PYTHON
import re
import sys

path = "$CI_FILE"
with open(path, 'r') as f:
    content = f.read()

# Find any line with 'pnpm db:push' or 'pnpm prisma db push'
# Insert a new step right before it (matching indentation)
pattern = re.compile(r'^(\s*)- (?:name:.*\n\s+)?run: (pnpm db:push|pnpm prisma db push)', re.MULTILINE)

new_step_template = """{indent}- name: Apply database migrations (RLS-aware)
{indent}  # Added by skills/rls-rollout/scripts/ci-fix.sh
{indent}  run: pnpm prisma migrate deploy
{indent}  env:
{indent}    DATABASE_URL: \${{{{ env.DATABASE_URL }}}}
"""

inserted = False

def replace(match):
    global inserted
    inserted = True
    indent = match.group(1)
    return new_step_template.format(indent=indent) + match.group(0)

new_content = pattern.sub(replace, content, count=1)  # Only first match

if not inserted:
    print("⚠ No 'pnpm db:push' line found — CI may already be RLS-aware or use different pattern")
    print("  Manual review needed. See PLAN-V2.md §11 for the expected pattern.")
    sys.exit(0)

with open(path, 'w') as f:
    f.write(new_content)

print("✓ Inserted 'prisma migrate deploy' step before 'pnpm db:push'")
PYTHON

echo ""
echo "Next steps:"
echo "  1. Review the changes: git diff $CI_FILE"
echo "  2. Test in a PR before merging"
echo "  3. Commit: git add $CI_FILE && git commit -m 'ci(rls): apply migrations before db:push'"
exit 0
