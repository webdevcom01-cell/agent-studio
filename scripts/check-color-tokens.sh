#!/usr/bin/env bash
# Color-token guard.
#
# Fails the build if UI code uses off-token colors instead of the semantic
# design tokens (bg-primary, text-foreground, bg-success, text-destructive, …).
#
# Three checks:
#   1. Tailwind PALETTE colors (bg-red-500, text-zinc-400, border-blue-300 …)
#   2. Dark-only overlay bug pattern (bg-white/[0.04] / bg-black/[..]) — invisible
#      in light mode; use bg-foreground/[..] which adapts to both themes.
#   3. Hardcoded hex in utilities (bg-[#111], text-[#abc] …)
#
# Intentional exceptions live in ALLOWLIST below — each with a documented reason.
set -euo pipefail

ROOT="${1:-src}"

PALETTE='slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

# Files allowed to use raw colors (review every addition!).
ALLOWLIST=(
  "src/app/devsecops/page.tsx"                       # hand-drawn SVG architecture diagram (dark, self-contained)
  "src/components/auth/auth-shell.tsx"               # intentional dark brand panel (inline hex)
  "src/app/login/page.tsx"                           # official Google OAuth logo colors
  "src/app/soma/review-queue/[batchId]/page.tsx"     # PLATFORM_COLORS — deliberate per-platform identity (decision D2)
  "src/components/templates/template-gallery.tsx"    # decorative per-category palette (decision D4)
)

is_allowed() { local f="$1"; for a in "${ALLOWLIST[@]}"; do [[ "$f" == "$a" ]] && return 0; done; return 1; }

violations=0
report() { echo "COLOR-TOKEN VIOLATION ($1): $2"; grep -nE "$3" "$2" | sed 's/^/    /'; violations=$((violations+1)); }

while IFS= read -r f; do
  case "$f" in */generated/*|*.test.tsx|*/__tests__/*) continue;; esac
  is_allowed "$f" && continue
  # 1) Tailwind palette colors
  if grep -qE "(bg|text|border|ring|fill|stroke|from|to|via|decoration|outline|shadow)-($PALETTE)-[0-9]{2,3}" "$f"; then
    report "palette" "$f" "(bg|text|border|ring|fill|stroke|from|to|via|decoration|outline|shadow)-($PALETTE)-[0-9]{2,3}"
  fi
  # 2) dark-only overlay bug
  if grep -qE "(bg|border)-(white|black)/\[" "$f"; then
    report "dark-only-overlay (use -foreground/[..])" "$f" "(bg|border)-(white|black)/\["
  fi
  # 3) hardcoded hex in utility
  if grep -qE "(bg|text|border|ring|shadow|fill|stroke)-\[#[0-9a-fA-F]" "$f"; then
    report "hardcoded-hex" "$f" "(bg|text|border|ring|shadow|fill|stroke)-\[#[0-9a-fA-F]"
  fi
done < <(grep -rIlE "(bg|text|border|ring|fill|stroke)-" "$ROOT" --include="*.tsx" | grep -v generated || true)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "✗ $violations color-token violation(s). Use semantic tokens (bg-primary, text-success, border-border, bg-foreground/[..] …) or add a documented exception to ALLOWLIST."
  exit 1
fi
echo "✓ Color-token guard passed."
