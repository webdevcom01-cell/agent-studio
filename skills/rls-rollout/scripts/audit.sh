#!/usr/bin/env bash
#
# audit.sh — RLS Rollout STEP 0 (preflight) + STEP 1 (inventory)
#
# Read-only. Does NOT modify the database or codebase.
#
# Usage:
#   bash skills/rls-rollout/scripts/audit.sh --preflight
#   bash skills/rls-rollout/scripts/audit.sh --inventory
#   bash skills/rls-rollout/scripts/audit.sh --create-roles  (writes ONE migration file)
#
# Exit codes:
#   0  all checks passed
#   1  blocking failure (must fix and re-run)
#   2  non-blocking warnings (review before proceeding)

set -euo pipefail

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"
REFERENCE_DIR="$SKILL_DIR/reference"
mkdir -p "$REFERENCE_DIR"

# Colors
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  RED="$(tput setaf 1)"
  GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"
  BLUE="$(tput setaf 4)"
  BOLD="$(tput bold)"
  RESET="$(tput sgr0)"
else
  RED="" GREEN="" YELLOW="" BLUE="" BOLD="" RESET=""
fi

# Counters
PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
BLOCKING_FAILURES=()

# Detect database URL — prefer DATABASE_URL, fallback to .env
db_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "$DATABASE_URL"
  elif [[ -f "$PROJECT_ROOT/.env" ]]; then
    grep -E "^DATABASE_URL=" "$PROJECT_ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
  else
    echo ""
  fi
}

DB_URL="$(db_url)"

# psql wrapper — bails if psql unavailable
psql_exec() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "${RED}ERROR: psql not installed${RESET}" >&2
    return 1
  fi
  if [[ -z "$DB_URL" ]]; then
    echo "${RED}ERROR: DATABASE_URL not set${RESET}" >&2
    return 1
  fi
  psql "$DB_URL" "$@"
}

# Reporting helpers
pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "${GREEN}✓${RESET} $1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo "${YELLOW}⚠${RESET} $1"
  if [[ -n "${2:-}" ]]; then
    echo "  ${YELLOW}hint:${RESET} $2"
  fi
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  BLOCKING_FAILURES+=("$1")
  echo "${RED}✗${RESET} $1"
  if [[ -n "${2:-}" ]]; then
    echo "  ${RED}fix:${RESET} $2"
  fi
}

section() {
  echo ""
  echo "${BOLD}${BLUE}=== $1 ===${RESET}"
}

# -----------------------------------------------------------------------------
# STEP 0 — Pre-flight checks (14 items)
# -----------------------------------------------------------------------------

preflight() {
  echo "${BOLD}RLS Rollout — STEP 0: Pre-flight check${RESET}"
  echo "Project: $PROJECT_ROOT"
  echo ""

  section "Database environment"

  # Check 1: Postgres version >= 14
  local pg_version
  if pg_version=$(psql_exec -At -c "SHOW server_version_num;" 2>/dev/null); then
    if [[ "$pg_version" -ge 140000 ]]; then
      pass "Postgres version $pg_version (≥ 14)"
    else
      fail "Postgres version $pg_version is < 14" "Upgrade Postgres before RLS rollout"
    fi
  else
    fail "Cannot connect to database" "Check DATABASE_URL"
  fi

  # Check 2: pgvector extension
  if psql_exec -At -c "SELECT 1 FROM pg_extension WHERE extname='vector';" 2>/dev/null | grep -q 1; then
    pass "pgvector extension present"
  else
    warn "pgvector extension not detected" "Required for KBChunk/AgentMemory queries"
  fi

  # Check 3: Application role is not postgres in non-dev
  local current_user_db
  current_user_db=$(psql_exec -At -c "SELECT current_user;" 2>/dev/null || echo "")
  if [[ "$current_user_db" == "postgres" && "${NODE_ENV:-development}" != "development" ]]; then
    warn "Connected as postgres superuser in $NODE_ENV" "Use app_user role in non-dev environments"
  elif [[ "$current_user_db" == "postgres" ]]; then
    pass "Connected as postgres (dev OK)"
  else
    pass "Connected as $current_user_db (non-superuser)"
  fi

  section "Application configuration"

  # Check 4: RLS_ENFORCEMENT_ENABLED env var
  if grep -rE "^RLS_ENFORCEMENT_ENABLED=" "$PROJECT_ROOT"/.env* 2>/dev/null | head -1 >/dev/null; then
    pass "RLS_ENFORCEMENT_ENABLED defined"
  else
    fail "RLS_ENFORCEMENT_ENABLED env var not found" \
      "Add to .env.example and Railway: RLS_ENFORCEMENT_ENABLED=false"
  fi

  # Check 7: ADMIN_USER_IDS env var
  if grep -rE "^ADMIN_USER_IDS=" "$PROJECT_ROOT"/.env* 2>/dev/null | head -1 >/dev/null; then
    pass "ADMIN_USER_IDS defined"
  else
    warn "ADMIN_USER_IDS env var not found" "Required for admin route bypass"
  fi

  # Check 8: Sentry DSN
  if grep -rE "^SENTRY_DSN=" "$PROJECT_ROOT"/.env* 2>/dev/null | head -1 >/dev/null; then
    pass "SENTRY_DSN configured"
  else
    warn "SENTRY_DSN not found" "Strongly recommended for production monitoring"
  fi

  section "Database roles"

  # Check 5: app_user role
  if psql_exec -At -c "SELECT 1 FROM pg_roles WHERE rolname='app_user';" 2>/dev/null | grep -q 1; then
    pass "app_user role exists"
  else
    fail "app_user role does not exist" \
      "Run: bash skills/rls-rollout/scripts/audit.sh --create-roles"
  fi

  # Check 6: admin_user role
  if psql_exec -At -c "SELECT 1 FROM pg_roles WHERE rolname='admin_user';" 2>/dev/null | grep -q 1; then
    if psql_exec -At -c "SELECT rolbypassrls FROM pg_roles WHERE rolname='admin_user';" 2>/dev/null | grep -q t; then
      pass "admin_user role exists with BYPASSRLS"
    else
      fail "admin_user role exists but lacks BYPASSRLS" \
        "Run: ALTER ROLE admin_user BYPASSRLS;"
    fi
  else
    fail "admin_user role does not exist" \
      "Run: bash skills/rls-rollout/scripts/audit.sh --create-roles"
  fi

  section "CI/CD configuration"

  # Check 9: CI runs prisma migrate deploy
  local ci_file="$PROJECT_ROOT/.github/workflows/ci.yml"
  if [[ -f "$ci_file" ]]; then
    if grep -q "prisma migrate deploy" "$ci_file"; then
      pass "CI runs prisma migrate deploy"
    else
      fail "CI uses db:push, not migrate deploy" \
        "Run: bash skills/rls-rollout/scripts/ci-fix.sh"
    fi
  else
    warn "No .github/workflows/ci.yml found" "Skip if not using GitHub Actions"
  fi

  section "Application code prerequisites"

  # Check 10: withOrgContext uses $transaction
  local rls_mw="$PROJECT_ROOT/src/lib/db/rls-middleware.ts"
  if [[ -f "$rls_mw" ]]; then
    if grep -q '\$transaction' "$rls_mw"; then
      pass "withOrgContext uses \$transaction (Phase 0a complete)"
    else
      fail "withOrgContext does NOT use \$transaction" \
        "CRITICAL: Patch src/lib/db/rls-middleware.ts per PLAN-V2.md §4.1"
    fi
  else
    warn "src/lib/db/rls-middleware.ts not found" "Expected helper file missing"
  fi

  # Check 11: SET LOCAL hnsw.ef_search wrapped in tx
  local search_ts="$PROJECT_ROOT/src/lib/knowledge/search.ts"
  if [[ -f "$search_ts" ]]; then
    # Heuristic: find SET LOCAL hnsw.ef_search and check nearby for $transaction
    if grep -q "SET LOCAL hnsw.ef_search" "$search_ts"; then
      # Look for $transaction within 5 lines before each match
      if awk '/SET LOCAL hnsw.ef_search/{found=1} found && /\$transaction/{print "OK"; exit}' "$search_ts" | grep -q OK; then
        pass "SET LOCAL hnsw.ef_search is wrapped in \$transaction"
      else
        warn "SET LOCAL hnsw.ef_search may be outside transaction (Phase 0e)" \
          "Verify src/lib/knowledge/search.ts:201 wraps SET LOCAL in \$transaction"
      fi
    else
      pass "No SET LOCAL hnsw.ef_search found (may have been removed)"
    fi
  fi

  # Check 13: switch-org endpoint
  if [[ -d "$PROJECT_ROOT/src/app/api/users/switch-org" ]]; then
    pass "/api/users/switch-org endpoint exists"
  else
    fail "/api/users/switch-org endpoint missing" \
      "Create per PLAN-V2.md §4.3"
  fi

  # Check 14: JWT type includes currentOrgId
  local jwt_types="$PROJECT_ROOT/src/types/next-auth.d.ts"
  if [[ -f "$jwt_types" ]] && grep -q "currentOrgId" "$jwt_types"; then
    pass "JWT type definition includes currentOrgId"
  else
    fail "src/types/next-auth.d.ts missing currentOrgId field" \
      "Add per PLAN-V2.md §4.3 (NextAuth type augmentation)"
  fi

  section "Database state (Agent.organizationId NULL check)"

  # Check 12: No NULL Agent.organizationId
  local null_count
  null_count=$(psql_exec -At -c "SELECT COUNT(*) FROM \"Agent\" WHERE \"organizationId\" IS NULL;" 2>/dev/null || echo "?")
  if [[ "$null_count" == "0" ]]; then
    pass "No NULL Agent.organizationId rows (Phase 0d complete)"
  elif [[ "$null_count" == "?" ]]; then
    warn "Cannot query Agent table" "DB connection or table missing"
  else
    fail "$null_count Agent rows have NULL organizationId" \
      "Run Phase 0d backfill migration per PLAN-V2.md §4.4"
  fi

  # -----------------------------------------------------------------------------
  # Summary
  # -----------------------------------------------------------------------------

  section "Pre-flight summary"
  echo "Passed: ${GREEN}$PASS_COUNT${RESET}"
  echo "Warnings: ${YELLOW}$WARN_COUNT${RESET}"
  echo "Failed: ${RED}$FAIL_COUNT${RESET}"

  # Write JSON report
  local report_file="$REFERENCE_DIR/preflight-report.json"
  cat > "$report_file" <<JSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "passed": $PASS_COUNT,
  "warnings": $WARN_COUNT,
  "failed": $FAIL_COUNT,
  "blocking_failures": [
$(printf '    "%s",\n' "${BLOCKING_FAILURES[@]:-}" | sed '$s/,$//')
  ],
  "project_root": "$PROJECT_ROOT",
  "database_user": "$current_user_db"
}
JSON

  echo ""
  echo "Report: $report_file"

  if [[ $FAIL_COUNT -gt 0 ]]; then
    echo ""
    echo "${RED}${BOLD}STEP 0 BLOCKED.${RESET} Fix the failures above and re-run."
    exit 1
  elif [[ $WARN_COUNT -gt 0 ]]; then
    echo ""
    echo "${YELLOW}${BOLD}STEP 0 passed with warnings.${RESET} Review before proceeding to STEP 1."
    exit 2
  else
    echo ""
    echo "${GREEN}${BOLD}STEP 0 passed.${RESET} Proceed to STEP 1 with:"
    echo "  bash skills/rls-rollout/scripts/audit.sh --inventory"
    exit 0
  fi
}

# -----------------------------------------------------------------------------
# STEP 1 — Inventory
# -----------------------------------------------------------------------------

inventory() {
  echo "${BOLD}RLS Rollout — STEP 1: Audit & inventory${RESET}"
  echo "Project: $PROJECT_ROOT"
  echo ""

  section "Parsing Prisma schema"
  local schema_file="$PROJECT_ROOT/prisma/schema.prisma"
  if [[ ! -f "$schema_file" ]]; then
    fail "prisma/schema.prisma not found"
    exit 1
  fi

  local model_count
  model_count=$(grep -c "^model " "$schema_file")
  echo "Total models in schema: $model_count"

  # Categorize models — pass to TS script for proper parsing
  local classify_script="$SCRIPT_DIR/classify-models.ts"
  local classifications_file="$REFERENCE_DIR/model-classifications.json"

  if [[ -f "$classify_script" ]] && command -v pnpm >/dev/null 2>&1; then
    cd "$PROJECT_ROOT"
    pnpm tsx "$classify_script" > "$classifications_file" || {
      warn "classify-models.ts failed; emitting basic classification"
      basic_classify > "$classifications_file"
    }
  else
    basic_classify > "$classifications_file"
  fi

  pass "Wrote $classifications_file"

  section "Querying current RLS state"

  # RLS state per table. forcerowsecurity is NOT a pg_tables column — both the
  # enabled and forced flags live on pg_class (relrowsecurity/relforcerowsecurity).
  # No ::text cast: psql -At renders an uncast boolean as t/f, which the summary
  # awk ($2=="t") counts. A ::text cast would emit true/false and silently break
  # the count.
  psql_exec -At -F$'\t' -c "
    SELECT
      c.relname AS tablename,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  " > "$REFERENCE_DIR/existing-rls-state.tsv" 2>/dev/null || {
    warn "Could not query pg_class; writing empty file"
    : > "$REFERENCE_DIR/existing-rls-state.tsv"
  }
  pass "Wrote existing-rls-state.tsv ($(wc -l < "$REFERENCE_DIR/existing-rls-state.tsv") tables)"

  # Existing policies
  psql_exec -At -F$'\t' -c "
    SELECT
      tablename,
      policyname,
      cmd,
      qual::text
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  " > "$REFERENCE_DIR/existing-policies.tsv" 2>/dev/null || {
    : > "$REFERENCE_DIR/existing-policies.tsv"
  }
  pass "Wrote existing-policies.tsv ($(wc -l < "$REFERENCE_DIR/existing-policies.tsv") policies)"

  # Composite indexes on organizationId
  psql_exec -At -F$'\t' -c "
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexdef ILIKE '%organizationId%'
    ORDER BY tablename, indexname;
  " > "$REFERENCE_DIR/composite-indexes.tsv" 2>/dev/null || {
    : > "$REFERENCE_DIR/composite-indexes.tsv"
  }
  pass "Wrote composite-indexes.tsv ($(wc -l < "$REFERENCE_DIR/composite-indexes.tsv") indexes)"

  section "Scanning for raw SQL sites"

  local raw_sql_file="$REFERENCE_DIR/raw-sql-sites.txt"
  grep -rn '\$queryRaw\|\$executeRaw' "$PROJECT_ROOT/src" \
    --include="*.ts" --exclude-dir=__tests__ --exclude-dir=generated \
    2>/dev/null > "$raw_sql_file" || true

  local raw_count
  raw_count=$(wc -l < "$raw_sql_file" || echo "0")
  pass "Found $raw_count raw SQL statements (see raw-sql-sites.txt)"

  section "Detecting cross-tenant routes"

  local routes_file="$REFERENCE_DIR/cross-tenant-routes-actual.md"
  {
    echo "# Cross-tenant routes detected by audit"
    echo ""
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "## Public routes (no auth)"
    echo ""
    grep -rn "isPublic\|public path" "$PROJECT_ROOT/src/middleware.ts" 2>/dev/null | head -20 || echo "(none found)"
    echo ""
    echo "## Admin routes"
    echo ""
    find "$PROJECT_ROOT/src/app/api/admin" -name "route.ts" 2>/dev/null || echo "(none found)"
    echo ""
    echo "## GDPR routes"
    echo ""
    find "$PROJECT_ROOT/src/app/api/user/export" "$PROJECT_ROOT/src/app/api/user/account" \
      -name "route.ts" 2>/dev/null || echo "(none found)"
    echo ""
    echo "## ADMIN_USER_IDS references"
    echo ""
    grep -rn "ADMIN_USER_IDS" "$PROJECT_ROOT/src" --include="*.ts" 2>/dev/null | head -10 || echo "(none found)"
  } > "$routes_file"
  pass "Wrote cross-tenant-routes-actual.md"

  section "Writing summary"

  local summary_file="$REFERENCE_DIR/STEP1-summary.md"
  {
    echo "# STEP 1 — Audit & inventory summary"
    echo ""
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    echo "## Counts"
    echo ""
    echo "| Item | Count |"
    echo "|------|-------|"
    echo "| Prisma models | $model_count |"
    echo "| Tables with RLS enabled | $(awk -F'\t' '$2=="t"' "$REFERENCE_DIR/existing-rls-state.tsv" | wc -l) |"
    echo "| Existing policies | $(wc -l < "$REFERENCE_DIR/existing-policies.tsv") |"
    echo "| Composite indexes on organizationId | $(wc -l < "$REFERENCE_DIR/composite-indexes.tsv") |"
    echo "| Raw SQL sites | $raw_count |"
    echo ""
    echo "## Next steps"
    echo ""
    echo "1. Review reference/model-classifications.json"
    echo "2. Review reference/cross-tenant-routes-actual.md"
    echo "3. Run STEP 2 (plan generation):"
    echo "   \`\`\`bash"
    echo "   pnpm tsx skills/rls-rollout/scripts/generate-migration.ts --phase=1"
    echo "   \`\`\`"
  } > "$summary_file"
  pass "Wrote STEP1-summary.md"

  echo ""
  echo "${GREEN}${BOLD}STEP 1 complete.${RESET}"
  echo "Review: $summary_file"
  exit 0
}

# Basic fallback classification — emits a minimal JSON if classify-models.ts is unavailable
basic_classify() {
  cat <<EOF
{
  "_note": "Basic classification (TS classifier unavailable). Run pnpm install and pnpm tsx scripts/classify-models.ts for full inventory.",
  "models": []
}
EOF
}

# -----------------------------------------------------------------------------
# --create-roles — writes a single migration file to create app_user and admin_user
# -----------------------------------------------------------------------------

create_roles() {
  echo "${BOLD}Generating database roles migration${RESET}"
  echo ""

  local migrations_dir="$PROJECT_ROOT/prisma/migrations"
  local timestamp
  timestamp=$(date +%Y%m%d%H%M%S)
  local target_dir="$migrations_dir/${timestamp}_rls_create_roles"
  mkdir -p "$target_dir"

  cat > "$target_dir/migration.sql" <<'SQL'
-- Phase 0b: Create app_user and admin_user roles for RLS rollout
-- Generated by skills/rls-rollout/scripts/audit.sh --create-roles
-- Idempotent — safe to re-run

DO $$
BEGIN
  -- app_user: tenant-scoped operations (no BYPASSRLS)
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE format('CREATE ROLE app_user WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS',
                   current_setting('app_user.password', true));
  END IF;

  -- admin_user: cross-tenant operations (BYPASSRLS for admins, GDPR, cross-tenant cron)
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin_user') THEN
    EXECUTE format('CREATE ROLE admin_user WITH LOGIN PASSWORD %L NOSUPERUSER BYPASSRLS',
                   current_setting('admin_user.password', true));
  END IF;
END
$$;

-- Grant base privileges
GRANT CONNECT ON DATABASE current_database() TO app_user, admin_user;
GRANT USAGE ON SCHEMA public TO app_user, admin_user;

-- Default privileges for FUTURE tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, admin_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, admin_user;

-- Grant on EXISTING tables (one-time)
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user, admin_user', table_name);
  END LOOP;
END
$$;

-- Grant on EXISTING sequences (one-time)
DO $$
DECLARE
  seq_name text;
BEGIN
  FOR seq_name IN
    SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO app_user, admin_user', seq_name);
  END LOOP;
END
$$;
SQL

  echo "${GREEN}✓${RESET} Wrote $target_dir/migration.sql"
  echo ""
  echo "Next steps:"
  echo "  1. Set DB session vars for the passwords:"
  echo "     export PGOPTIONS='-c app_user.password=YOUR_PWD -c admin_user.password=YOUR_PWD'"
  echo "  2. Apply: pnpm prisma migrate deploy"
  echo "  3. Re-run STEP 0: bash skills/rls-rollout/scripts/audit.sh --preflight"
  exit 0
}

# -----------------------------------------------------------------------------
# Main entrypoint
# -----------------------------------------------------------------------------

usage() {
  cat <<EOF
${BOLD}audit.sh${RESET} — RLS Rollout STEP 0 + STEP 1

Usage:
  $0 --preflight       Run STEP 0 (pre-flight checks, 14 items)
  $0 --inventory       Run STEP 1 (read-only inventory of schema + RLS state)
  $0 --create-roles    Generate migration file for app_user + admin_user roles

Exit codes:
  0   all checks passed
  1   blocking failure
  2   non-blocking warnings
EOF
  exit 64
}

case "${1:-}" in
  --preflight)    preflight ;;
  --inventory)    inventory ;;
  --create-roles) create_roles ;;
  *)              usage ;;
esac
