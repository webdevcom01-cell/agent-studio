#!/usr/bin/env bash
#
# verify-staging.sh — RLS Rollout STEP 4: staging verification
#
# Runs the cross-tenant test suite, public/admin/GDPR route tests, performance
# benchmarks, and lockout recovery tests against the staging DB.
#
# Usage:
#   bash skills/rls-rollout/scripts/verify-staging.sh --phase=1
#   bash skills/rls-rollout/scripts/verify-staging.sh --phase=1 --skip-perf
#
# Exit codes:
#   0  all tests passed — safe to plan production cutover
#   1  cross-tenant leak detected (STOP, do not deploy)
#   2  performance regression (>10% p95 increase)
#   3  public/admin/GDPR route broken
#   4  lockout recovery failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(cd "$SKILL_DIR/../.." && pwd)"

# Colors
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"
  BOLD="$(tput bold)"; RESET="$(tput sgr0)"
else
  RED="" GREEN="" YELLOW="" BLUE="" BOLD="" RESET=""
fi

# Args
PHASE="1"
SKIP_PERF="false"
for arg in "$@"; do
  case $arg in
    --phase=*) PHASE="${arg#*=}" ;;
    --skip-perf) SKIP_PERF="true" ;;
    *) echo "Unknown arg: $arg" >&2; exit 64 ;;
  esac
done

# Counters
PASSED=0
FAILED=0
FAILED_TESTS=()

run_test() {
  local name="$1"
  local file="$2"
  local fail_exit="$3"

  echo "${BOLD}${BLUE}=== $name ===${RESET}"

  if [[ ! -f "$file" ]]; then
    echo "${YELLOW}⚠ Test file not found: $file (skipping)${RESET}"
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    if pnpm vitest run "$file" 2>&1; then
      PASSED=$((PASSED + 1))
      echo "${GREEN}✓ $name passed${RESET}"
      echo ""
    else
      FAILED=$((FAILED + 1))
      FAILED_TESTS+=("$name (exit $fail_exit)")
      echo "${RED}✗ $name FAILED${RESET}"
      echo ""
      # Cross-tenant failure is CRITICAL — bail immediately
      if [[ "$fail_exit" == "1" ]]; then
        echo "${RED}${BOLD}CROSS-TENANT LEAK DETECTED. STOPPING.${RESET}"
        exit 1
      fi
    fi
  else
    echo "${YELLOW}⚠ pnpm not available; skipping $name${RESET}"
  fi
}

# Sanity check — must run against staging, not production
section() {
  echo ""
  echo "${BOLD}${BLUE}━━━ $1 ━━━${RESET}"
}

section "Environment safety check"

# Refuse to run if DATABASE_URL looks like production
if [[ -n "${DATABASE_URL:-}" ]] && [[ "$DATABASE_URL" == *"production"* ]]; then
  echo "${RED}REFUSING TO RUN — DATABASE_URL contains 'production'.${RESET}"
  echo "verify-staging.sh must NOT run against production."
  exit 1
fi

# Confirm RLS_ENFORCEMENT_ENABLED is true for staging
if [[ "${RLS_ENFORCEMENT_ENABLED:-false}" != "true" ]]; then
  echo "${YELLOW}WARNING: RLS_ENFORCEMENT_ENABLED is not 'true'.${RESET}"
  echo "Tests may not exercise RLS code paths."
  echo "Export RLS_ENFORCEMENT_ENABLED=true before running."
  echo ""
  read -r -p "Continue anyway? (y/N) " response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "${GREEN}✓ Environment check passed${RESET}"

# -----------------------------------------------------------------------------
# Run test suites
# -----------------------------------------------------------------------------

section "Phase $PHASE verification suite"

cd "$PROJECT_ROOT"

# Critical: cross-tenant isolation (exit 1 if fail)
run_test "Cross-tenant isolation" \
  "$SKILL_DIR/tests/cross-tenant.test.ts" "1"

# Public route handling (exit 3 if fail)
run_test "Public route handling" \
  "$SKILL_DIR/tests/public-routes.test.ts" "3"

# Admin route handling (exit 3 if fail)
run_test "Admin route handling" \
  "$SKILL_DIR/tests/admin-routes.test.ts" "3"

# GDPR endpoints (exit 3 if fail)
run_test "GDPR export" \
  "$SKILL_DIR/tests/gdpr-export.test.ts" "3"

# Worker tenant context
run_test "BullMQ worker tenant context" \
  "$SKILL_DIR/tests/worker-tenant-context.test.ts" "3"

# Performance (exit 2 if regression > 10%)
if [[ "$SKIP_PERF" == "false" ]]; then
  run_test "Performance benchmark (p95 regression < 10%)" \
    "$SKILL_DIR/tests/performance.test.ts" "2"
else
  echo "${YELLOW}⚠ Skipping performance test (--skip-perf)${RESET}"
fi

# Lockout recovery (exit 4 if fail)
run_test "Lockout recovery" \
  "$SKILL_DIR/tests/lockout-recovery.test.ts" "4"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------

section "Verification summary"

echo "Passed: ${GREEN}$PASSED${RESET}"
echo "Failed: ${RED}$FAILED${RESET}"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "${RED}${BOLD}STEP 4 FAILED${RESET}"
  echo "Failed tests:"
  for t in "${FAILED_TESTS[@]}"; do
    echo "  - $t"
  done
  echo ""
  echo "DO NOT proceed to production cutover."
  exit 3
fi

echo ""
echo "${GREEN}${BOLD}STEP 4 passed.${RESET}"
echo ""
echo "Next: review STEP 5 runbook before production cutover:"
echo "  cat $SKILL_DIR/reference/runbook-phase${PHASE}-production.md"
exit 0
