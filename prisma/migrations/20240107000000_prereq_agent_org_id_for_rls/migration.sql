-- Pre-requisite for 20240108000000_enable_rls on fresh databases.
-- organizationId must exist before RLS policies can reference it.
-- On existing databases this is a no-op; FK + index are added in 20260403_missing_org_apikey_agent_cols.
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
