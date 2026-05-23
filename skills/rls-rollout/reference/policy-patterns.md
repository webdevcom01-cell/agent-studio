# Policy Patterns — When to Use Each Template

Quick reference for choosing the right SQL template for a given model.
Templates are in `skills/rls-rollout/templates/`.

---

## Decision tree

```
Does the table have an `organizationId` column?
├─ YES → Is there an `isPublic` column?
│        ├─ YES → tenant-direct-public.sql.template
│        └─ NO  → tenant-direct.sql.template
│
└─ NO  → Is it in GLOBAL_MODELS?
          ├─ YES → No template — skip RLS
          └─ NO  → Is it in USER_OWNED_MODELS?
                    ├─ YES → user-owned.sql.template
                    └─ NO  → Is it AMBIGUOUS?
                              ├─ YES → ambiguous-schema-additions.sql.template → then tenant-direct
                              └─ NO  → tenant-indirect.sql.template (with correct FK chain)
```

---

## tenant-direct.sql.template

**Use for:** Models with a direct `organizationId String` column that do NOT have `isPublic`.

**Phase 1 tables:** AgentPermissionGrant, ApprovalPolicy, CompanyMission, Department, Goal,
HeartbeatConfig, HeartbeatContext, HeartbeatRun, Invitation, OrganizationMember, PolicyDecision

**Placeholders to fill:**

| Placeholder | Example |
|-------------|---------|
| `{{TABLE_NAME}}` | `CompanyMission` |
| `{{table_lower}}` | `companymission` |

**Generates:**
- Composite index: `(organizationId, id)`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
- Grants to `app_user` and `admin_user`
- 4 policies (SELECT/INSERT/UPDATE/DELETE) using `current_setting('app.current_org_id', true)`
- Commented rollback SQL

**Important:**
- `admin_user` has BYPASSRLS — no policy needed for admin operations
- Policies are FOR `app_user` role only
- `FORCE ROW LEVEL SECURITY` means the table owner also obeys policies (defense in depth)

---

## tenant-direct-public.sql.template

**Use for:** Models with `organizationId` AND `isPublic` flag (marketplace cross-org reads).

**Phase 1 tables:** Agent, Template

**Additional behavior:**
- SELECT allows: own org rows OR `isPublic = true` (cross-org marketplace reads)
- INSERT/UPDATE/DELETE remain strict: own org only
- Adds a second index: `(isPublic, updatedAt DESC) WHERE isPublic = true`

**Placeholders:** Same as `tenant-direct.sql.template`.

**Watch out for:**
- AgentCard also has `isPublic` but is TENANT_INDIRECT (agentId, not organizationId). The agent's
  org controls visibility. Consider applying the public-read pattern at the Agent policy level instead.

---

## tenant-indirect.sql.template

**Use for:** Models without `organizationId` that reach it via a FK chain.

**Phase 2 tables:** All 36 TENANT_INDIRECT models.

**Placeholders to fill:**

| Placeholder | Example (Flow) | Example (KBChunk) |
|-------------|---------------|-------------------|
| `{{TABLE_NAME}}` | `Flow` | `KBChunk` |
| `{{table_lower}}` | `flow` | `kbchunk` |
| `{{FK_COLUMN}}` | `agentId` | `sourceId` |
| `{{PARENT_TABLE}}` | `Agent` | `KBSource` |
| `{{PARENT_TENANT_COL}}` | `organizationId` | `knowledgeBaseId` (chain continues) |

**For deep FK chains (KBChunk, FlowVersion, etc.):**
The template uses a single-level EXISTS subquery. For multi-hop chains, you have two options:
1. Use a materialized `organizationId` column (not nullable) — avoids runtime multi-hop
2. Write a nested EXISTS — verify performance with `EXPLAIN ANALYZE` before applying

**Performance critical:**
- The EXISTS/IN subquery is re-evaluated **per row**
- Without an index on `{{FK_COLUMN}}`, expect 10-100× slowdown on large tables
- Template declares the index; verify it's used: `EXPLAIN (ANALYZE, BUFFERS) SELECT ...`

---

## user-owned.sql.template

**Use for:** Models scoped to a user, not an organization (USER_OWNED classification).

**Phase 3 tables:** ApiKey, CLIGeneration, GoogleOAuthToken, MCPServer

**Session variable:** `app.current_user_id` (set alongside `app.current_org_id` in `withOrgContext`)

**Placeholders:**

| Placeholder | Example |
|-------------|---------|
| `{{TABLE_NAME}}` | `ApiKey` |
| `{{table_lower}}` | `apikey` |

**Note on CLIGeneration:**
CLIGeneration has both `userId` and `mcpServerId`. The `mcpServerId` FK points to MCPServer,
which is also USER_OWNED. The user policy on CLIGeneration is sufficient — no org context needed.

---

## ambiguous-schema-additions.sql.template

**Use for:** AMBIGUOUS models that need `organizationId` added before RLS.

**Phase 4 tables:** AuditLog

**Two-migration approach:**
1. Apply `ambiguous-schema-additions.sql.template` → adds `organizationId`, backfills, makes NOT NULL
2. Apply `tenant-direct.sql.template` → enables RLS with policies

**Placeholders:**

| Placeholder | Example (AuditLog) |
|-------------|-------------------|
| `{{TABLE_NAME}}` | `AuditLog` |
| `{{table_lower}}` | `auditlog` |
| `{{FK_FOR_BACKFILL}}` | `userId` |
| `{{JOIN_TABLE}}` | `OrganizationMember` |
| `{{JOIN_ON}}` | `om."userId" = t."userId"` |

**Backfill risk:**
- AuditLog rows for users who belong to multiple orgs will be assigned to their OLDEST org
- System-generated rows with NULL userId cannot be backfilled — handle separately

---

## helper-functions.sql.template

**Use for:** One-time setup before enabling RLS on ANY table.

**Run once:** Apply before Phase 1 migrations. Idempotent (`CREATE OR REPLACE`).

**Functions created:**
- `current_org_id()` — safe wrapper around `current_setting('app.current_org_id', true)`
- `current_user_id()` — safe wrapper around `current_setting('app.current_user_id', true)`
- `is_org_member(org_id TEXT)` — membership check (not used in base policies, available for future)

**Why functions?**
- `current_setting('app.current_org_id', true)` returns `''` (empty string) when not set, not NULL
- Inline `current_setting` calls would silently match rows where `organizationId = ''` if there are any
- `NULLIF(current_setting(...), '')` in the function ensures deny-by-default when no context is set

---

## Special cases

### OrganizationMember (Phase 1 — enable LAST)

The `helper-functions.sql.template` creates `is_org_member()` which queries `OrganizationMember`.
Enable RLS on `OrganizationMember` LAST among Phase 1 tables to avoid a bootstrap catch-22:
  - Before `app_user` role is set in session, `is_org_member()` would return false
  - But `is_org_member()` is not used in base policies — it's for future use
  - Still, apply `OrganizationMember` RLS last as a precaution

### KBChunk + hnsw.ef_search (Phase 2)

Before enabling RLS on `KBChunk`, verify that `SET LOCAL hnsw.ef_search` in `src/lib/knowledge/search.ts`
is wrapped in a `$transaction`. If not, the `SET LOCAL` will affect a different connection than
the `SELECT` query after RLS enforcement is active. See PLAN-V2.md §4.5.

### Account + Session (GLOBAL — no RLS)

NextAuth's PrismaAdapter queries `Account` and `Session` directly using the database connection string.
Do NOT enable RLS on these tables. The adapter does not set `app.current_org_id`.
