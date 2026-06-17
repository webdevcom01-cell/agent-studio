-- Enforce NOT NULL on organizationId for tenant-scoped tables.
-- Live schema had these nullable while schema.prisma declares them NOT NULL.
-- Pre-checked on production: 0 NULL rows across all 8 tables (tables empty),
-- so SET NOT NULL is non-destructive. Re-running is a no-op (column already NOT NULL).
ALTER TABLE "AgentPermissionGrant" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApprovalPolicy" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Department" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Goal" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "HeartbeatConfig" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "HeartbeatContext" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "HeartbeatRun" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Template" ALTER COLUMN "organizationId" SET NOT NULL;
