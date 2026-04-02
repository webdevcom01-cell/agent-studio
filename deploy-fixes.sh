#!/bin/bash
# ============================================================
# deploy-fixes.sh — Run this on your Mac to deploy all fixes
# ============================================================
#
# WHAT THIS DOES:
#   1. Merges the fix branch to main → triggers Railway auto-deploy
#   2. Fixes the fn-parse-url DB data (repo_path object→string)
#   3. Fixes the fn-prepare-pr DB data (btoa base64 fix)
#
# HOW TO RUN:
#   chmod +x deploy-fixes.sh && ./deploy-fixes.sh

set -e

REPO_DIR="$(pwd)"
AGENT_ID="cmncvdxny000do801f62p4g7a"  # Swarm Orchestrator

echo ""
echo "=== Step 1: Merge fix branch → main (triggers Railway deploy) ==="
git fetch origin
git checkout main
git pull origin main
git merge --no-edit origin/fix/human-approval-conversational-fallback
git push origin main
echo "✅ Pushed to main — Railway will start rebuilding in ~30s"

echo ""
echo "=== Step 2: Fix fn-parse-url in DB (repo_path should be a string) ==="
echo "Connecting to Railway Postgres..."

# The SQL fixes fn-parse-url to return a plain string, not { repo_path: "..." }
railway connect Postgres <<'PSQL'
UPDATE "Flow"
SET content = jsonb_set(
  content, '{nodes}',
  (SELECT jsonb_agg(
    CASE
      WHEN node->>'id' = 'fn-parse-url'
      THEN jsonb_set(
        node,
        '{data,code}',
        to_jsonb(
          'const url = variables.github_url || '''';'
          || E'\n'
          || 'const m = url.match(/github\\.com\\/([^\\/]+\\/[^\\/\\s?#]+)/);'
          || E'\n'
          || 'return m ? m[1].replace(/\\.git$/, '''') : '''';'
        )
      )
      WHEN node->>'id' = 'fn-prepare-pr'
      THEN jsonb_set(
        node,
        '{data,code}',
        to_jsonb(
          'const repo = String(variables.repo_path || '''').trim();'
          || E'\n'
          || 'const branchName = ''ai-security-patch-'' + Date.now();'
          || E'\n'
          || 'const patchContent = String(variables.patch_content || variables.security_findings || ''No patch content'');'
          || E'\n'
          || 'const chars = ''ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'';'
          || E'\n'
          || 'function b64(str) {'
          || E'\n'
          || '  let result = '''', i = 0;'
          || E'\n'
          || '  const bytes = str.split('''').map(function(c) { return c.charCodeAt(0); });'
          || E'\n'
          || '  while (i < bytes.length) {'
          || E'\n'
          || '    const b0 = bytes[i++] || 0, b1 = bytes[i++] || 0, b2 = bytes[i++] || 0;'
          || E'\n'
          || '    result += chars[b0>>2] + chars[((b0&3)<<4)|(b1>>4)] + (i-1<str.length?chars[((b1&15)<<2)|(b2>>6)]:''='') + (i<str.length?chars[b2&63]:''='');'
          || E'\n'
          || '  }'
          || E'\n'
          || '  return result;'
          || E'\n'
          || '}'
          || E'\n'
          || 'return { repo: repo, branch: branchName, content_b64: b64(patchContent) };'
        )
      )
      ELSE node
    END
  )
  FROM jsonb_array_elements(content->'nodes') AS node)
)
WHERE "agentId" = 'cmncvdxny000do801f62p4g7a';

-- Verify
SELECT node->>'id', LEFT(node->'data'->>'code', 80)
FROM "Flow", jsonb_array_elements(content->'nodes') AS node
WHERE "agentId" = 'cmncvdxny000do801f62p4g7a'
AND node->>'id' IN ('fn-parse-url', 'fn-prepare-pr');
PSQL

echo ""
echo "✅ DB fixes applied"
echo ""
echo "=== Step 3: Wait for Railway build ==="
echo "Railway build takes ~3-5 minutes."
echo "Watch progress at: https://railway.app/project/your-project"
echo ""
echo "After deploy completes, go to:"
echo "  https://agent-studio-production-c43e.up.railway.app/chat/cmncvdxny000do801f62p4g7a"
echo "  (make sure you're logged in first via /login)"
echo ""
echo "Done! All fixes deployed. 🚀"
