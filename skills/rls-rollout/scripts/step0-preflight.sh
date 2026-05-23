#!/usr/bin/env bash
# step0-preflight.sh — Phase 0 preflight check for RLS rollout
# Verifies Phase 0 is complete, feature flag is wired, and CI is green.
# Run this before any Phase 1 work.
#
# Usage:
#   bash skills/rls-rollout/scripts/step0-preflight.sh
#   bash skills/rls-rollout/scripts/step0-preflight.sh --fix-hints
#
# Exit codes:
#   0 — All checks passed; safe to proceed to STEP 1
#   1 — Blocking failure; fix and re-run
#   2 — Non-blocking warnings; review before proceeding

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REPORT_FILE="${ROOT}/skills/rls-rollout/reference/preflight-report.json"
PASS=0
WARN=0
FAIL=0
CHECKS=()

check() {
  local id="$1" label="$2" result="$3" detail="$4"
  CHECKS+=("{ \"id\": ${id}, \"label\": \"${label}\", \"status\": \"${result}\", \"detail\": \"${detail}\" }")
  case "$result" in
    PASS) PASS=$((PASS+1)) ;;
    WARN) WARN=$((WARN+1)) ;;
    FAIL) FAIL=$((FAIL+1)) ;;
  esac
  printf "[%s] %2d. %s\n" "$result" "$id" "$label"
  if [[ -n "$detail" && "$result" != "PASS" ]]; then
    printf "       → %s\n" "$detail"
  fi
}

echo "========================================="
echo " RLS Rollout — STEP 0: Preflight Check"
echo "========================================="
echo ""

# Check 1: Phase 0b.5 live (withOrgContext refactor merged)
if git log --oneline | grep -q "Phase 0b.5"; then
  check 1 "Phase 0b.5 (raw \$transaction refactor) merged" PASS ""
else
  check 1 "Phase 0b.5 (raw \$transaction refactor) merged" FAIL \
    "Run: git log --oneline | grep '0b.5'. Must be in main history."
fi

# Check 2: withOrgContext uses \$transaction (not broken helper)
if grep -q "\$transaction" "${ROOT}/src/lib/db/rls-middleware.ts" 2>/dev/null; then
  check 2 "withOrgContext wraps SET in \$transaction" PASS ""
else
  check 2 "withOrgContext wraps SET in \$transaction" FAIL \
    "Patch src/lib/db/rls-middleware.ts per PLAN-V2.md §4.1"
fi

# Check 3: RLS_ENFORCEMENT_ENABLED defined in .env files
if grep -rq "RLS_ENFORCEMENT_ENABLED" "${ROOT}/.env"* 2>/dev/null; then
  check 3 "RLS_ENFORCEMENT_ENABLED defined in env file" PASS ""
else
  check 3 "RLS_ENFORCEMENT_ENABLED defined in env file" WARN \
    "Add RLS_ENFORCEMENT_ENABLED=false to .env.local and .env.example"
fi

# Check 4: app_user role exists in DB (requires DATABASE_URL)
if command -v psql &>/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  if psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_roles WHERE rolname='app_user'" | grep -q 1; then
    check 4 "app_user DB role exists" PASS ""
  else
    check 4 "app_user DB role exists" FAIL \
      "Run Phase 0b migration to create app_user role"
  fi
else
  check 4 "app_user DB role exists" WARN "DATABASE_URL not set or psql unavailable — skipped"
fi

# Check 5: admin_user role exists
if command -v psql &>/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  if psql "$DATABASE_URL" -tAc "SELECT 1 FROM pg_roles WHERE rolname='admin_user'" | grep -q 1; then
    check 5 "admin_user DB role exists (BYPASSRLS)" PASS ""
  else
    check 5 "admin_user DB role exists (BYPASSRLS)" FAIL \
      "Run Phase 0b migration to create admin_user role with BYPASSRLS"
  fi
else
  check 5 "admin_user DB role exists (BYPASSRLS)" WARN "DATABASE_URL not set or psql unavailable — skipped"
fi

# Check 6: ADMIN_USER_IDS defined
if grep -rq "ADMIN_USER_IDS" "${ROOT}/.env"* 2>/dev/null || [[ -n "${ADMIN_USER_IDS:-}" ]]; then
  check 6 "ADMIN_USER_IDS env var defined" PASS ""
else
  check 6 "ADMIN_USER_IDS env var defined" WARN \
    "Set ADMIN_USER_IDS in .env.local (comma-separated user IDs)"
fi

# Check 7: Sentry DSN configured
if grep -rq "SENTRY_DSN" "${ROOT}/.env"* 2>/dev/null || [[ -n "${SENTRY_DSN:-}" ]]; then
  check 7 "Sentry DSN configured" PASS ""
else
  check 7 "Sentry DSN configured" WARN \
    "Set SENTRY_DSN in .env.local — required for permission-denied alerting"
fi

# Check 8: CI runs prisma migrate deploy
if grep -q "prisma migrate deploy" "${ROOT}/.github/workflows/ci.yml" 2>/dev/null; then
  check 8 "CI runs 'prisma migrate deploy'" PASS ""
else
  check 8 "CI runs 'prisma migrate deploy'" FAIL \
    "Run: bash skills/rls-rollout/scripts/ci-fix.sh"
fi

# Check 9: No NULL Agent.organizationId rows (post-Phase 0d backfill)
if command -v psql &>/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  null_count=$(psql "$DATABASE_URL" -tAc 'SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL' 2>/dev/null || echo "ERR")
  if [[ "$null_count" == "0" ]]; then
    check 9 "No NULL Agent.organizationId rows" PASS ""
  elif [[ "$null_count" == "ERR" ]]; then
    check 9 "No NULL Agent.organizationId rows" WARN "Query failed — verify manually"
  else
    check 9 "No NULL Agent.organizationId rows" FAIL \
      "${null_count} agents have NULL organizationId. Run Phase 0d backfill migration."
  fi
else
  check 9 "No NULL Agent.organizationId rows" WARN "DATABASE_URL not set or psql unavailable — skipped"
fi

# Check 10: JWT type includes currentOrgId
if grep -q "currentOrgId" "${ROOT}/src/types/next-auth.d.ts" 2>/dev/null; then
  check 10 "JWT type includes currentOrgId" PASS ""
else
  check 10 "JWT type includes currentOrgId" FAIL \
    "Add currentOrgId to src/types/next-auth.d.ts per PLAN-V2.md §4.3"
fi

# Check 11: hnsw.ef_search wrapped in \$transaction
if grep -q "\$transaction" "${ROOT}/src/lib/knowledge/search.ts" 2>/dev/null; then
  check 11 "SET LOCAL hnsw.ef_search wrapped in \$transaction" PASS ""
else
  check 11 "SET LOCAL hnsw.ef_search wrapped in \$transaction" WARN \
    "Patch src/lib/knowledge/search.ts per PLAN-V2.md §4.5"
fi

# Check 12: RLS_ENFORCEMENT_ENABLED feature flag wired in src/lib/feature-flags
if grep -q "RLS_ENFORCEMENT_ENABLED" "${ROOT}/src/lib/feature-flags/index.ts" 2>/dev/null; then
  check 12 "RLS_ENFORCEMENT_ENABLED wired in feature-flags" PASS ""
else
  check 12 "RLS_ENFORCEMENT_ENABLED wired in feature-flags" FAIL \
    "Check src/lib/feature-flags/index.ts — flag must be in DEFAULT_FLAGS map"
fi

# Check 13: model-classifications.md present (STEP 1 prerequisite)
if [[ -f "${ROOT}/skills/rls-rollout/reference/model-classifications.md" ]]; then
  check 13 "model-classifications.md exists" PASS ""
else
  check 13 "model-classifications.md exists" WARN \
    "Run STEP 1 (step1-inventory.ts) to generate model classifications"
fi

echo ""
echo "========================================="
printf " Results: %d PASS  %d WARN  %d FAIL\n" "$PASS" "$WARN" "$FAIL"
echo "========================================="

# Write report JSON
{
  echo "{"
  echo "  \"generatedAt\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\","
  echo "  \"passed\": ${PASS},"
  echo "  \"warnings\": ${WARN},"
  echo "  \"failures\": ${FAIL},"
  echo "  \"checks\": ["
  for i in "${!CHECKS[@]}"; do
    if [[ $i -lt $((${#CHECKS[@]}-1)) ]]; then
      echo "    ${CHECKS[$i]},"
    else
      echo "    ${CHECKS[$i]}"
    fi
  done
  echo "  ]"
  echo "}"
} > "$REPORT_FILE"

echo " Report: ${REPORT_FILE}"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo "BLOCKING FAILURES: Fix all FAIL items before proceeding to STEP 1."
  exit 1
elif [[ $WARN -gt 0 ]]; then
  echo "Non-blocking warnings present. Review before proceeding."
  exit 2
else
  echo "All checks passed. Safe to run STEP 1 (step1-inventory.ts)."
  exit 0
fi
