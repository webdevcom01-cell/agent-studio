#!/bin/bash
#
# ECC Smoke Test — Phase 9
#
# Usage: ./scripts/smoke-test.sh https://your-domain.up.railway.app
#
# Tests all critical endpoints after deployment.
# Exit code 0 = all pass, non-zero = failures detected.

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0

green() { printf "\033[32m✓ %s\033[0m\n" "$1"; }
red()   { printf "\033[31m✗ %s\033[0m\n" "$1"; }

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"

  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected_status" ]; then
    green "$name (HTTP $status)"
    PASS=$((PASS + 1))
  else
    red "$name (expected $expected_status, got $status)"
    FAIL=$((FAIL + 1))
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local jq_filter="$3"

  result=$(curl -s --max-time 10 "$url" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d$jq_filter'))" 2>/dev/null || echo "ERROR")
  if [ "$result" != "ERROR" ] && [ "$result" != "False" ] && [ -n "$result" ]; then
    green "$name ($result)"
    PASS=$((PASS + 1))
  else
    red "$name (check failed)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  ECC Smoke Test — $BASE_URL"
echo "═══════════════════════════════════════════════"
echo ""

echo "── Infrastructure ──"
check "Health endpoint" "$BASE_URL/api/health"
check_json "Health DB status" "$BASE_URL/api/health" "['status']"

echo ""
echo "── Auth ──"
check "Login page" "$BASE_URL/login"
check "Auth callback exists" "$BASE_URL/api/auth/providers" "200"

echo ""
echo "── Skills API ──"
check "Skills list" "$BASE_URL/api/skills" "401"

echo ""
echo "── ECC Ingestion (no auth) ──"
check "ECC ingest (no body)" "$BASE_URL/api/ecc/ingest-skills" "405"

echo ""
echo "── Static Assets ──"
check "Embed script" "$BASE_URL/embed.js"

echo ""
echo "═══════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
