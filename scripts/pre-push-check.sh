#!/usr/bin/env bash
# Pre-push CI simulation — run this before every git push
# Usage: bash scripts/pre-push-check.sh
# Usage (specific file): bash scripts/pre-push-check.sh src/components/builder/property-panel.tsx

CHANGED_FILE="${1:-}"
PASS=0
FAIL=0

ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
step() { echo ""; echo "── $1 ──"; }

# ─── 1. TypeScript ───────────────────────────────────────────────────────────
step "TypeScript (tsc --noEmit)"
if npx tsc --noEmit 2>&1; then
  ok "TypeScript OK"
else
  fail "TypeScript errors found — fix before pushing"
fi

# ─── 2. Targeted tests ───────────────────────────────────────────────────────
step "Vitest (targeted)"

TEST_FILES=""
if [[ -n "$CHANGED_FILE" ]]; then
  BASENAME=$(basename "$CHANGED_FILE" .tsx)
  BASENAME=$(basename "$BASENAME" .ts)
  TEST_FILES=$(grep -rl "$BASENAME" src --include="*.test.ts" --include="*.test.tsx" 2>/dev/null || true)

  if [[ -z "$TEST_FILES" ]]; then
    echo "  ℹ️  No test files found for '$BASENAME' — running full suite"
  fi
fi

if [[ -n "$TEST_FILES" ]]; then
  echo "  Running: $TEST_FILES"
  if npx vitest run $TEST_FILES --reporter=verbose 2>&1; then
    ok "Targeted tests passed"
  else
    fail "Tests failed — fix before pushing"
  fi
else
  if npx vitest run --reporter=dot 2>&1; then
    ok "Full test suite passed"
  else
    fail "Tests failed — fix before pushing"
  fi
fi

# ─── 3. Lucide icon mock check ────────────────────────────────────────────────
step "Lucide icon mock check"

if [[ -n "$CHANGED_FILE" && -f "$CHANGED_FILE" ]]; then
  # Only look at the lucide-react import line(s), not all imports
  IMPORTED_ICONS=$(grep 'from "lucide-react"' "$CHANGED_FILE" | grep -oP '\{[^}]+\}' | tr ',' '\n' | grep -oP '\b[A-Z][a-zA-Z]+\b' | sort -u 2>/dev/null || true)
  # Only check test files that actually test THIS component (not all test files)
  BASENAME_FOR_MOCK=$(basename "$CHANGED_FILE" .tsx)
  BASENAME_FOR_MOCK=$(basename "$BASENAME_FOR_MOCK" .ts)
  MOCK_FILES=$(grep -rl "vi.mock.*lucide\|lucide.*Icon" src --include="*.test.tsx" --include="*.test.ts" 2>/dev/null \
    | xargs grep -l "$BASENAME_FOR_MOCK" 2>/dev/null || true)

  ICON_ERRORS=0
  for ICON in $IMPORTED_ICONS; do
    for MOCK_FILE in $MOCK_FILES; do
      if ! grep -q "$ICON" "$MOCK_FILE" 2>/dev/null; then
        echo "  ⚠️  Icon '$ICON' NOT in lucide mock in $(basename $MOCK_FILE)"
        echo "     Add:  $ICON: Icon,"
        ICON_ERRORS=$((ICON_ERRORS + 1))
      fi
    done
  done

  if [[ $ICON_ERRORS -eq 0 ]]; then
    ok "All icons present in mocks"
  else
    fail "$ICON_ERRORS icon(s) missing from mock — tests will crash"
  fi
else
  echo "  ℹ️  No specific file — skipping icon check"
fi

# ─── 4. Placeholder/string consistency ───────────────────────────────────────
step "Placeholder/string consistency"

if [[ -n "$CHANGED_FILE" && -f "$CHANGED_FILE" ]]; then
  STRINGS=$(grep -oP '(?<=placeholder=")[^"]+' "$CHANGED_FILE" 2>/dev/null | head -20 || true)
  STRING_ERRORS=0

  while IFS= read -r STR; do
    [[ -z "$STR" ]] && continue
    SHORT="${STR:0:30}"
    FOUND=$(grep -rl "$SHORT" src --include="*.test.tsx" --include="*.test.ts" 2>/dev/null || true)
    if [[ -n "$FOUND" ]]; then
      for TF in $FOUND; do
        if ! grep -qF "$STR" "$TF" 2>/dev/null; then
          echo "  ⚠️  Placeholder changed but test still uses old text:"
          echo "     File: $(basename $TF)"
          echo "     Expected: \"$STR\""
          STRING_ERRORS=$((STRING_ERRORS + 1))
        fi
      done
    fi
  done <<< "$STRINGS"

  if [[ $STRING_ERRORS -eq 0 ]]; then
    ok "Strings consistent between component and tests"
  else
    fail "$STRING_ERRORS string(s) out of sync"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════"
echo "  PASS: $PASS   FAIL: $FAIL"
echo "══════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  echo "  🚫 DO NOT PUSH — fix the issues above first"
  exit 1
else
  echo "  🚀 Ready to push!"
  exit 0
fi
