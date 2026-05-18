#!/usr/bin/env bash
#
# rollback.sh — Emergency RLS rollback (4 layers)
#
# Usage:
#   Layer 1 (env flag — no DB change needed):
#     # Set RLS_ENFORCEMENT_ENABLED=false in Railway env, redeploy.
#     # This script doesn't do that — manual via Railway UI.
#
#   Layer 2 (per-table escape hatch):
#     bash skills/rls-rollout/scripts/rollback.sh --disable-tables=KBChunk,KBSource
#
#   Layer 3 (migration revert):
#     git revert <migration_commit_sha>
#     pnpm prisma migrate deploy
#
#   Layer 4 (nuclear — disable RLS on ALL tables):
#     bash skills/rls-rollout/scripts/rollback.sh --nuclear --confirm=RLS_DISABLE_ALL
#
# Exit codes:
#   0  rollback succeeded
#   1  argument error or no confirmation
#   2  DB operation failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  RED="$(tput setaf 1)"; YELLOW="$(tput setaf 3)"
  GREEN="$(tput setaf 2)"; BOLD="$(tput bold)"; RESET="$(tput sgr0)"
else
  RED="" YELLOW="" GREEN="" BOLD="" RESET=""
fi

# DB URL
DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" && -f "$PROJECT_ROOT/.env" ]]; then
  DB_URL=$(grep -E "^DATABASE_URL=" "$PROJECT_ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

if [[ -z "$DB_URL" ]]; then
  echo "${RED}ERROR: DATABASE_URL not set${RESET}" >&2
  exit 1
fi

# Args
DISABLE_TABLES=""
NUCLEAR="false"
CONFIRM=""
for arg in "$@"; do
  case $arg in
    --disable-tables=*) DISABLE_TABLES="${arg#*=}" ;;
    --nuclear) NUCLEAR="true" ;;
    --confirm=*) CONFIRM="${arg#*=}" ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

# -----------------------------------------------------------------------------
# Layer 2 — Disable RLS on specific tables
# -----------------------------------------------------------------------------

if [[ -n "$DISABLE_TABLES" ]]; then
  echo "${YELLOW}${BOLD}Layer 2 rollback: disable RLS on ${DISABLE_TABLES}${RESET}"
  echo "DB: ${DB_URL//:*@/:***@}"
  echo ""
  read -r -p "Confirm disable RLS on these tables? (y/N) " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi

  IFS=',' read -ra TABLES <<< "$DISABLE_TABLES"
  for table in "${TABLES[@]}"; do
    echo "${YELLOW}→ Disabling RLS on \"$table\"${RESET}"
    psql "$DB_URL" -c "ALTER TABLE \"$table\" DISABLE ROW LEVEL SECURITY;" || {
      echo "${RED}✗ Failed on $table${RESET}"
      exit 2
    }
    echo "${GREEN}✓ \"$table\" RLS disabled${RESET}"
  done

  echo ""
  echo "${GREEN}${BOLD}Layer 2 rollback complete.${RESET}"
  echo "App can continue running. Plan a proper Layer 3 fix (migration revert) when ready."
  exit 0
fi

# -----------------------------------------------------------------------------
# Layer 4 — Nuclear: disable RLS on ALL tables
# -----------------------------------------------------------------------------

if [[ "$NUCLEAR" == "true" ]]; then
  if [[ "$CONFIRM" != "RLS_DISABLE_ALL" ]]; then
    echo "${RED}${BOLD}NUCLEAR rollback requires explicit confirmation.${RESET}"
    echo "Re-run with: --nuclear --confirm=RLS_DISABLE_ALL"
    exit 1
  fi

  echo "${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo "${RED}${BOLD}║  NUCLEAR ROLLBACK — disabling RLS on ALL public tables       ║${RESET}"
  echo "${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo "DB: ${DB_URL//:*@/:***@}"
  echo ""
  read -r -p "Type 'NUCLEAR' to proceed: " response
  if [[ "$response" != "NUCLEAR" ]]; then
    echo "Aborted."
    exit 1
  fi

  echo ""
  echo "${YELLOW}Disabling RLS on every public table...${RESET}"

  psql "$DB_URL" <<'SQL'
DO $$
DECLARE
  t text;
  disabled int := 0;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    disabled := disabled + 1;
    RAISE NOTICE 'Disabled RLS on %', t;
  END LOOP;
  RAISE NOTICE 'Total tables: %', disabled;
END
$$;
SQL

  echo ""
  echo "${GREEN}${BOLD}Nuclear rollback complete.${RESET}"
  echo "RLS is now DISABLED on all tables. Production should recover within ~1 minute."
  echo ""
  echo "Next steps:"
  echo "  1. Verify app recovered (smoke test 5 routes)"
  echo "  2. Investigate what went wrong"
  echo "  3. Plan corrected migration"
  echo "  4. Re-enable RLS via standard rollout"
  exit 0
fi

# -----------------------------------------------------------------------------
# Usage
# -----------------------------------------------------------------------------

cat <<EOF
${BOLD}rollback.sh${RESET} — Emergency RLS rollback

Layer 1 (no DB change — preferred):
  Set RLS_ENFORCEMENT_ENABLED=false in Railway env, redeploy.

Layer 2 (per-table escape):
  $0 --disable-tables=KBChunk,KBSource

Layer 3 (migration revert):
  Manual: git revert <sha>, then pnpm prisma migrate deploy

Layer 4 (nuclear — last resort):
  $0 --nuclear --confirm=RLS_DISABLE_ALL
EOF
exit 1
