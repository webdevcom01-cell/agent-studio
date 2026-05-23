# Phase 0d Test Plan — Personal Org Backfill Migration

## Objective

Verify that the `20260524000000_personal_org_backfill` migration correctly
creates a personal `Organization` for every user who owns `Agent` rows with
`organizationId = NULL`, assigns those agents to the personal org, and leaves
the database with zero NULL-org agents.

---

## Pre-conditions

- Railway PostgreSQL is the target (not Supabase — it is paused).
- The migration history up to and including `20260521000000_hal8_null_exploit_hotfix`
  has been applied before this migration runs.
- `pnpm prisma migrate deploy` is the only supported execution path — never
  `prisma db push` against production.

---

## Test Scenarios

### Scenario A — Fresh database (CI / new dev environment)

**Setup**: A clean PostgreSQL instance with all prior migrations applied
but no seed data.

**Expected result after migration**:
```sql
SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL;
-- Expected: 0 (no agents exist, so no backfill needed)

SELECT COUNT(*) FROM "Organization";
-- Expected: 0 (no users exist, so no personal orgs were created)
```

**Migration exit**: COMMIT with no errors. The sanity check passes because
0 = 0.

---

### Scenario B — Production database (post-HAL-8 hotfix)

**Setup**: The prod Railway database where Phase 0a.5 (HAL-8) already ran.
All agents already have `organizationId` set.

**Expected result after migration**:
```sql
SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL;
-- Expected: 0 (HAL-8 already fixed this; migration is a no-op)
```

**Migration exit**: COMMIT with no errors. Steps 1–3 affect zero rows.

---

### Scenario C — Dev/test database with NULL-org agents

**Setup**: A database containing one or more users who have agents with
`organizationId = NULL`.

**How to create this fixture** (for local testing):
```sql
-- 1. Insert a test user
INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
VALUES ('test-user-0d', 'testuser0d@example.com', 'Test User', NOW(), NOW());

-- 2. Insert a NULL-org agent owned by this user
INSERT INTO "Agent" (id, name, "userId", "organizationId", "createdAt", "updatedAt")
VALUES ('test-agent-0d', 'Test Agent', 'test-user-0d', NULL, NOW(), NOW());
```

**Expected result after migration**:
```sql
-- 1. A personal org was created
SELECT id, name, slug FROM "Organization" WHERE slug = 'personal-test-user-0d';
-- Expected: 1 row — name = "Test User's Workspace", slug = "personal-test-user-0d"

-- 2. The user is an OWNER of that org
SELECT role FROM "OrganizationMember"
WHERE "userId" = 'test-user-0d'
  AND "organizationId" = (SELECT id FROM "Organization" WHERE slug = 'personal-test-user-0d');
-- Expected: OWNER

-- 3. The agent now has a non-NULL organizationId
SELECT "organizationId" FROM "Agent" WHERE id = 'test-agent-0d';
-- Expected: (the id of the personal org above)

-- 4. No NULL-org agents remain
SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL;
-- Expected: 0
```

---

### Scenario D — Idempotency (re-running the migration)

**Setup**: Run the migration twice against a database that had NULL-org agents
in Scenario C. The second run should be a no-op.

**Expected behavior**:
- Step 1: `ON CONFLICT (slug) DO NOTHING` — org already exists, 0 rows inserted.
- Step 2: `ON CONFLICT ("userId", "organizationId") DO NOTHING` — member already
  exists, 0 rows inserted.
- Step 3: `UPDATE` affects 0 rows (no NULL-org agents remain).
- Step 4: Sanity check passes (COUNT = 0).
- Migration exits with COMMIT, no errors.

---

### Scenario E — Multiple users with NULL-org agents

**Setup**: Three users, each with one or more NULL-org agents.

**Expected result after migration**:
- Three `Organization` rows created (one per user), all with unique slugs.
- Three `OrganizationMember` rows created, all with `role = OWNER`.
- All agents updated to their respective owner's personal org.
- `SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL` = 0.

---

### Scenario F — Orphaned agent (userId = NULL, organizationId = NULL)

**Setup**: An `Agent` row with both `userId = NULL` and `organizationId = NULL`.

**Expected behavior**: The migration **fails** with:
```
Phase 0d backfill incomplete: 1 Agent row(s) still have organizationId = NULL.
These agents likely have userId = NULL (orphaned).
```

**Why this is intentional**: An orphaned agent (no owner, no org) cannot be
auto-assigned. It indicates a data integrity problem requiring manual review.
The operator must either delete the orphaned agent or assign it to an org before
re-running the migration.

---

## How to Run Locally

```bash
# 1. Set up a local PostgreSQL (Docker recommended)
docker run -d --name pg-0d-test \
  -e POSTGRES_PASSWORD=test \
  -p 5433:5432 \
  postgres:16

# 2. Point to local DB
export DATABASE_URL="postgresql://postgres:test@localhost:5433/agent_studio_test"
export DIRECT_URL="$DATABASE_URL"

# 3. Apply all migrations including Phase 0d
pnpm prisma migrate deploy

# 4. Run verification queries (Scenario A or Scenario C with fixture)
```

---

## CI Verification

On every PR with the `e2e` label, CI runs `pnpm prisma migrate deploy` against
a fresh PostgreSQL container. The Phase 0d migration must:
1. Apply without error (Scenario A — fresh DB, no agents).
2. Not break subsequent migration steps.
3. Not break E2E tests that follow.

The "Run Prisma migrations" CI step is the automated gate for this migration.

---

## Post-Deploy Verification (Production)

After merging and Railway deploys:

1. Open Railway → Postgres → Query tab.
2. Run the three verification queries:

```sql
-- Must be 0
SELECT COUNT(*) FROM "Agent" WHERE "organizationId" IS NULL;

-- Must be > 0 (at least 1 personal org exists from HAL-8 hotfix)
SELECT COUNT(*) FROM "Organization";

-- Must be > 0
SELECT COUNT(*) FROM "OrganizationMember" WHERE role = 'OWNER';
```

If all three pass, Phase 0d is complete.
