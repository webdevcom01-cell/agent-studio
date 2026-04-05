-- Agent Auditor — Railway PostgreSQL Update Queries
-- Use these queries to apply audit improvements directly to the Railway database
-- Always review and test in a development branch first!

-- ============================================================================
-- STEP 1: IDENTIFY AGENTS NEEDING UPDATES
-- ============================================================================

-- View all agents with their current prompt lengths
SELECT
  id,
  name,
  length("systemPrompt") as prompt_length,
  "isPublic",
  "createdAt",
  model
FROM "Agent"
ORDER BY name;

-- Find agents below 8/10 quality threshold (by name pattern or length)
SELECT
  id,
  name,
  length("systemPrompt") as prompt_length,
  CASE
    WHEN length("systemPrompt") <= 100 THEN 'DELETE_CANDIDATE'
    WHEN length("systemPrompt") < 4000 THEN 'TOO_SHORT'
    ELSE 'REVIEWABLE'
  END as category
FROM "Agent"
WHERE length("systemPrompt") < 4000 OR "systemPrompt" IS NULL
ORDER BY length("systemPrompt") DESC;

-- ============================================================================
-- STEP 2: DELETE CANDIDATES (Remove placeholder agents)
-- ============================================================================

-- BEFORE DELETING: Review these agents
SELECT id, name, "systemPrompt", length("systemPrompt")
FROM "Agent"
WHERE length("systemPrompt") IS NULL
   OR length("systemPrompt") <= 100
   OR "systemPrompt" = 'You are a helpful assistant.'
ORDER BY length("systemPrompt") ASC;

-- DELETE placeholder agents (ONLY after manual review)
-- WARNING: This is destructive. Review first!
-- DELETE FROM "Agent"
-- WHERE (length("systemPrompt") IS NULL OR length("systemPrompt") <= 100)
--   AND name IN ('Assistant', 'Placeholder', 'Test Agent');

-- ============================================================================
-- STEP 3: ADD MISSING SECTIONS TO CRITICAL AGENTS
-- ============================================================================

-- Template: Add <role> section to "Document Analyzer"
UPDATE "Agent"
SET "systemPrompt" = CONCAT(
  COALESCE("systemPrompt", ''),
  E'\n\n<role>\nYou are the Document Analyzer — a specialized agent for extracting structured information from unstructured documents.\nYour role is to parse documents (PDFs, Word docs, images) and return normalized data as part of the data ingestion pipeline.\nYou are an expert in OCR fallback handling, document classification, and entity extraction.\n</role>'
)
WHERE name = 'Document Analyzer'
RETURNING name, length("systemPrompt") as new_length;

-- Template: Add <output_format> section to "Code Reviewer v1"
UPDATE "Agent"
SET "systemPrompt" = CONCAT(
  COALESCE("systemPrompt", ''),
  E'\n\n<output_format>\nReturn a JSON object with:\n{\n  "verdict": "PASS" | "FAIL",\n  "confidence": 0.0-1.0,\n  "findings": [{ "type": "string", "severity": "high|medium|low" }],\n  "summary": "string"\n}\n</output_format>'
)
WHERE name = 'Code Reviewer v1'
RETURNING name, length("systemPrompt") as new_length;

-- Template: Add <failure_modes> section (multi-agent)
UPDATE "Agent"
SET "systemPrompt" = CONCAT(
  COALESCE("systemPrompt", ''),
  E'\n\n<failure_modes>\n1. Input missing/malformed → Return null with error message\n2. Confidence too low (<0.5) → Return verdict=''UNCERTAIN'' with reasoning\n3. Out of scope → Return error with redirect to correct agent\n</failure_modes>'
)
WHERE name IN ('Document Analyzer', 'Code Reviewer v1', 'SEO Auditor', 'Report Generator')
  AND "systemPrompt" NOT LIKE '%<failure_modes>%'
RETURNING name, length("systemPrompt") as new_length;

-- Template: Add <constraints> section to agents missing it
UPDATE "Agent"
SET "systemPrompt" = CONCAT(
  COALESCE("systemPrompt", ''),
  E'\n\n<constraints>\n• NEVER: Expose internal system details\n• MUST: Return structured JSON output\n• MAX: 30 second processing time\n• TIMEOUT: Kill process at 45 seconds\n</constraints>'
)
WHERE "systemPrompt" NOT LIKE '%<constraints>%'
  AND "systemPrompt" NOT LIKE '%<constraint%'
  AND length("systemPrompt") > 500
RETURNING name, length("systemPrompt") as new_length;

-- ============================================================================
-- STEP 4: VERIFY CHANGES
-- ============================================================================

-- View agents after updates (check prompt lengths increased)
SELECT
  id,
  name,
  length("systemPrompt") as prompt_length,
  CASE
    WHEN "systemPrompt" LIKE '%<role>%' THEN 'has_role'
    ELSE 'missing_role'
  END as has_role,
  CASE
    WHEN "systemPrompt" LIKE '%<output_format>%' OR "systemPrompt" LIKE '%<output>%' THEN 'has_output_format'
    ELSE 'missing_output_format'
  END as has_output_format,
  CASE
    WHEN "systemPrompt" LIKE '%<failure_modes>%' THEN 'has_failure_modes'
    ELSE 'missing_failure_modes'
  END as has_failure_modes
FROM "Agent"
WHERE name IN ('Document Analyzer', 'Code Reviewer v1', 'SEO Auditor', 'Report Generator')
ORDER BY name;

-- ============================================================================
-- STEP 5: DIMENSION COVERAGE CHECK (Manual Verification)
-- ============================================================================

-- Check how many agents have each required dimension
SELECT
  COUNT(*) as total_agents,
  SUM(CASE WHEN "systemPrompt" LIKE '%<role>%' THEN 1 ELSE 0 END) as has_role,
  SUM(CASE WHEN "systemPrompt" LIKE '%<output_format>%' OR "systemPrompt" LIKE '%<output>%' THEN 1 ELSE 0 END) as has_output_format,
  SUM(CASE WHEN "systemPrompt" LIKE '%<constraints>%' THEN 1 ELSE 0 END) as has_constraints,
  SUM(CASE WHEN "systemPrompt" LIKE '%```json%' THEN 1 ELSE 0 END) as has_json_schema,
  SUM(CASE WHEN "systemPrompt" LIKE '%<example%' OR "systemPrompt" LIKE '%example:%' THEN 1 ELSE 0 END) as has_examples,
  SUM(CASE WHEN "systemPrompt" LIKE '%<failure_modes>%' OR "systemPrompt" LIKE '%fail%' THEN 1 ELSE 0 END) as has_failure_modes,
  SUM(CASE WHEN "systemPrompt" LIKE '%verif%' OR "systemPrompt" LIKE '%validat%' THEN 1 ELSE 0 END) as has_verification,
  SUM(CASE WHEN "systemPrompt" LIKE '%<decompos%' OR "systemPrompt" LIKE '%phase%' OR "systemPrompt" LIKE '%step%' THEN 1 ELSE 0 END) as has_decomposition
FROM "Agent";

-- Agents by prompt length (quality indicator)
SELECT
  name,
  length("systemPrompt") as prompt_length,
  CASE
    WHEN length("systemPrompt") >= 6000 THEN 'EXCELLENT'
    WHEN length("systemPrompt") >= 4000 THEN 'GOOD'
    WHEN length("systemPrompt") >= 2000 THEN 'FAIR'
    WHEN length("systemPrompt") > 0 THEN 'POOR'
    ELSE 'EMPTY'
  END as quality
FROM "Agent"
ORDER BY prompt_length DESC;

-- ============================================================================
-- STEP 6: REVERT CHANGES (if needed)
-- ============================================================================

-- Backup original before making bulk updates
CREATE TABLE "Agent_backup_2026_04_05" AS SELECT * FROM "Agent";

-- View backup
SELECT COUNT(*) as backup_count FROM "Agent_backup_2026_04_05";

-- Restore from backup if something went wrong
-- UPDATE "Agent" SET "systemPrompt" = b."systemPrompt"
-- FROM "Agent_backup_2026_04_05" b
-- WHERE "Agent".id = b.id;

-- ============================================================================
-- STEP 7: FINAL AUDIT CHECK
-- ============================================================================

-- Run this after all updates to verify quality improvements
SELECT
  name,
  length("systemPrompt") as final_length,
  CASE
    WHEN length("systemPrompt") >= 4000
      AND "systemPrompt" LIKE '%<role>%'
      AND ("systemPrompt" LIKE '%<output_format>%' OR "systemPrompt" LIKE '%<output>%')
      AND "systemPrompt" LIKE '%<constraints>%'
      AND "systemPrompt" LIKE '%<failure_modes>%'
    THEN 'PASS ✓'
    ELSE 'REVIEW'
  END as audit_status
FROM "Agent"
ORDER BY name;

-- ============================================================================
-- ADDITIONAL HELPERS
-- ============================================================================

-- Find agents with very short or missing prompts
SELECT
  id,
  name,
  length(COALESCE("systemPrompt", '')) as prompt_length,
  SUBSTRING("systemPrompt", 1, 100) as preview
FROM "Agent"
WHERE length(COALESCE("systemPrompt", '')) < 500
ORDER BY prompt_length ASC;

-- Search for specific dimension in all agents
SELECT
  id,
  name,
  CASE
    WHEN "systemPrompt" LIKE '%<role>%' THEN 'FOUND'
    ELSE 'MISSING'
  END as role_status
FROM "Agent"
ORDER BY role_status, name;

-- Find agents missing critical dimensions (failure_modes)
SELECT
  id,
  name,
  length("systemPrompt") as prompt_length
FROM "Agent"
WHERE "systemPrompt" NOT LIKE '%<failure_modes>%'
  AND "systemPrompt" NOT LIKE '%fail%'
  AND "systemPrompt" NOT LIKE '%error handling%'
ORDER BY prompt_length DESC;

-- Statistics: How many agents have XML structure?
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN "systemPrompt" LIKE '%<%' THEN 1 ELSE 0 END) as has_xml,
  SUM(CASE WHEN "systemPrompt" LIKE '%<%' THEN 0 ELSE 1 END) as no_xml
FROM "Agent";

-- Get agents sorted by current quality (simple heuristic)
SELECT
  name,
  length("systemPrompt") as length,
  ROUND(
    (LENGTH("systemPrompt") - LENGTH(REPLACE("systemPrompt", '<', ''))) / 5.0
  ) as approx_dimension_count,
  "createdAt"
FROM "Agent"
WHERE "systemPrompt" IS NOT NULL
ORDER BY length DESC;

-- ============================================================================
-- ROLLBACK / RESTORE STRATEGY
-- ============================================================================

-- If you need to undo all changes:
-- 1. Backup is in "Agent_backup_2026_04_05" table
-- 2. To restore a single agent:
-- UPDATE "Agent"
-- SET "systemPrompt" = (SELECT "systemPrompt" FROM "Agent_backup_2026_04_05" WHERE id = 'agent_id')
-- WHERE id = 'agent_id';

-- 3. To restore all agents:
-- DROP TABLE "Agent";
-- ALTER TABLE "Agent_backup_2026_04_05" RENAME TO "Agent";

-- Clean up backup after confirming all changes are good
-- DROP TABLE "Agent_backup_2026_04_05";
