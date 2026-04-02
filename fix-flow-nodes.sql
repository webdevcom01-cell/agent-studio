-- ============================================================
-- fix-flow-nodes.sql
-- Run in Railway Postgres (railway connect Postgres) or Supabase SQL editor
-- ============================================================
-- Fixes two function nodes in the Autonomous DevOps Swarm Orchestrator:
--   1. fn-parse-url  → returns plain string instead of { repo_path: "..." }
--   2. fn-prepare-pr → uses pure-JS base64 instead of btoa() / Buffer
-- ============================================================

-- 1. Fix fn-parse-url
UPDATE "Flow"
SET content = jsonb_set(
  content, '{nodes}',
  (SELECT jsonb_agg(
    CASE
      WHEN node->>'id' = 'fn-parse-url'
      THEN jsonb_set(node, '{data,code}',
        '"const url = variables.github_url || '''';\nconst m = url.match(/github\\.com\\/([^\\/]+\\/[^\\/\\s?#]+)/);\nreturn m ? m[1].replace(/\\.git$/, '''') : '''';\"'::jsonb
      )
      ELSE node
    END
  ) FROM jsonb_array_elements(content->'nodes') AS node)
)
WHERE "agentId" = 'cmncvdxny000do801f62p4g7a';

-- 2. Fix fn-prepare-pr (pure-JS base64, no btoa/Buffer)
UPDATE "Flow"
SET content = jsonb_set(
  content, '{nodes}',
  (SELECT jsonb_agg(
    CASE
      WHEN node->>'id' = 'fn-prepare-pr'
      THEN jsonb_set(node, '{data,code}',
        '"const repo = String(variables.repo_path || '''').trim();\nconst branchName = ''ai-security-patch-'' + Date.now();\nconst patchContent = String(variables.patch_content || variables.security_findings || ''Security audit findings'');\nconst chars = ''ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'';\nfunction b64(str) {\n  var result = '''', i = 0;\n  var bytes = [];\n  for (var j = 0; j < str.length; j++) bytes.push(str.charCodeAt(j));\n  while (i < bytes.length) {\n    var b0 = bytes[i++] || 0, b1 = bytes[i++] || 0, b2 = bytes[i++] || 0;\n    result += chars[b0>>2] + chars[((b0&3)<<4)|(b1>>4)] + (i-2<str.length?chars[((b1&15)<<2)|(b2>>6)]:''='') + (i-1<str.length?chars[b2&63]:''='');\n  }\n  return result;\n}\nreturn { repo: repo, branch: branchName, content_b64: b64(patchContent) };\"'::jsonb
      )
      ELSE node
    END
  ) FROM jsonb_array_elements(content->'nodes') AS node)
)
WHERE "agentId" = 'cmncvdxny000do801f62p4g7a';

-- Verify both nodes
SELECT node->>'id' AS node_id,
       LEFT(node->'data'->>'code', 100) AS code_preview
FROM "Flow",
     jsonb_array_elements(content->'nodes') AS node
WHERE "agentId" = 'cmncvdxny000do801f62p4g7a'
  AND node->>'id' IN ('fn-parse-url', 'fn-prepare-pr');
