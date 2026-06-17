#!/usr/bin/env bash
# RLS coverage guard.
#
# Fails the build if application code touches an RLS-protected (tenant) model
# without going through a tenant-context wrapper:
#   - withOrgContext(prisma, orgId, (tx) => tx.<model>...)   // request paths
#   - withTenant((tx) => tx.<model>...)                      // ALS / engine paths
#   - withAdminBypass((db) => db.<model>...)                 // admin/cron/public
#
# Two checks:
#   1. A file uses `prisma.<model>` / `prismaRead.<model>` directly but contains
#      no wrapper at all.
#   2. A file uses a raw `prisma.$transaction(...)` AND references a tenant model
#      (this is how the agent-import RLS bug slipped through: the write was
#      `tx.<model>` inside `prisma.$transaction`, not `prisma.<model>`).
#      Tenant work in a transaction must use withOrgContext, which manages its
#      own transaction.
set -euo pipefail

ROOT="${1:-src}"

# All RLS-enabled tenant models (Prisma camelCase accessors).
MODELS='agent|flow|knowledgeBase|template|goal|department|agentPermissionGrant|agentSkillPermission|approvalPolicy|companyMission|evalSuite|evalRun|evalResult|heartbeatConfig|heartbeatContext|heartbeatRun|invitation|organizationMember|policyDecision|webhookConfig'
WRAPPERS='withOrgContext|withTenant|withAdminBypass'

# Files allowed to use the raw client / raw transaction (review each addition!).
ALLOWLIST=(
  "src/lib/api/auth-guard.ts"        # uses withAdminBypass internally
  "src/lib/api/tenant-context.ts"    # defines the wrappers
  "src/lib/db/rls-middleware.ts"     # defines withOrgContext (uses $transaction)
  "src/lib/org/ensure-personal-org.ts" # provisioning outside any tenant context (admin bypass)
)

is_allowed() { local f="$1"; for a in "${ALLOWLIST[@]}"; do [[ "$f" == "$a" ]] && return 0; done; return 1; }

violations=0

# ── Check 1: direct prisma.<model> without any wrapper ────────────────────────
while IFS= read -r f; do
  case "$f" in *.test.ts|*/generated/*|*/__tests__/*) continue;; esac
  is_allowed "$f" && continue
  if grep -qE "(prisma|prismaRead)\.($MODELS)\b" "$f" && ! grep -qE "$WRAPPERS" "$f"; then
    echo "RLS-COVERAGE VIOLATION (direct client): $f"
    grep -nE "(prisma|prismaRead)\.($MODELS)\b" "$f" | sed 's/^/    /'
    violations=$((violations+1))
  fi
done < <(grep -rIlE "(prisma|prismaRead)\.($MODELS)\b" "$ROOT" | grep -v generated || true)

# ── Check 2: raw prisma.$transaction in a file that touches a tenant model ────
while IFS= read -r f; do
  case "$f" in *.test.ts|*/generated/*|*/__tests__/*) continue;; esac
  is_allowed "$f" && continue
  if grep -qE "prisma\.\\\$transaction\(" "$f" && grep -qE "\b($MODELS)\.(create|update|delete|upsert|createMany|updateMany|deleteMany|findMany|findFirst|findUnique|count|aggregate)\b" "$f"; then
    echo "RLS-COVERAGE VIOLATION (raw \$transaction over tenant model): $f"
    echo "    use withOrgContext(prisma, orgId, (tx) => ...) instead of prisma.\$transaction"
    violations=$((violations+1))
  fi
done < <(grep -rIlE "prisma\.\\\$transaction\(" "$ROOT" | grep -v generated || true)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "✗ $violations RLS coverage violation(s). Wrap tenant queries in withOrgContext/withTenant, or use withAdminBypass for admin/cron/public paths."
  exit 1
fi
echo "✓ RLS coverage guard passed."
