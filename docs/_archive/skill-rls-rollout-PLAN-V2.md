# Skill 2 — RLS Rollout: Implementation Plan v2

**Date**: 2026-05-18
**Author**: Claude
**Status**: Draft for user review (incorporates forensic findings)
**Supersedes**: `skill-rls-rollout-PLAN.md` (v1)
**Required pre-reads**:
- `skill-rls-rollout-ANALYSIS.md` (project state assessment)
- `skill-rls-rollout-FORENSIC-REPORT.md` (12 hallucinations + 18 gaps identified in v1)

---

## 0. Changelog from v1

Major changes incorporated from forensic report:

| Change | Section affected |
|--------|------------------|
| ❗ **Added Phase 0 prerequisite: patch broken `withOrgContext`** | §3, §4 (new) |
| ❗ **Three-role DB architecture** (postgres + app_user + admin_user), not two | §1, §6 |
| ❗ **New §5: Public/anonymous endpoint handling** | §5 (new) |
| ❗ **New §6: GDPR + admin endpoint handling** | §6 (new) |
| ❗ **`isPublic` policy clauses** for marketplace | §8 templates |
| ❗ **CI fix**: add `prisma migrate deploy` to `.github/workflows/ci.yml` | §11 |
| Updated count numbers (61 models, 22 files/70 statements, 14 transactions/12 files, 10 cron routes) | throughout |
| Bundled `SET LOCAL hnsw.ef_search` fix into workstream | §4.5 |
| Vercel vs Railway cron reconciliation | §2.4 |
| Pin middleware runtime explicitly | §2.5 |
| `RLS_ENFORCEMENT_ENABLED` added to `.env.example` | §10.1 |
| Sentry monitoring as hard prerequisite in STEP 0 | §9 STEP 0 |
| `getRLSClient` helper defined concretely | §12.3 |
| Personal org backfill creates `OrganizationMember{role: 'OWNER'}` | §4.3 |
| Multi-replica deployment risk addressed (mandatory `$transaction`) | §4.1 |

What did NOT change:
- Path B (Pragmatic phased) — skill generates SQL, human applies
- Hybrid rollback (4 layers)
- Single SKILL.md with STEP 0-5
- Phased rollout (TENANT_DIRECT → TENANT_INDIRECT → USER_OWNED → AMBIGUOUS)
- `disable-model-invocation: true` for the skill

---

## 1. Updated key numbers

| Item | v1 said | Reality | v2 uses |
|------|---------|---------|---------|
| Prisma models | 60 | 61 | **61** |
| Existing RLS coverage | 8 of 60 | 8 of 61 | **8 of 61** |
| TENANT_DIRECT | 14 | 14 | **14** |
| TENANT_INDIRECT | 35 | 35 | **35** |
| USER_OWNED | 5 | 5 | **5** |
| GLOBAL | 5 | 5 (User, VerificationToken, Skill, Organization, PipelineTemplate) | **5** |
| AMBIGUOUS | 2 | 2 + 1 newly discovered Template marketplace edge | **3** |
| Raw SQL "sites" | 22 | 22 files / 70 statements | **22 files / 70 statements** |
| `$transaction` use | 9+ | 14 across 12 files | **14 across 12 files** |
| Cron-style routes (use `CRON_SECRET`) | 7 | 10 | **10** |
| BullMQ handlers (11 total, 2 cross-tenant) | 11 | 11 (2 cross-tenant: `budget.monthly.reset`, `governance.timeout`) | **11 (2 cross-tenant)** |
| Anonymous public routes | not analyzed | 4 categories (chat, embed, webhook trigger, A2A) | **4 categories** |
| Admin routes | not analyzed | 3 (flags, jobs, stats) + `ADMIN_USER_IDS` envvar | **3 + envvar** |
| GDPR endpoints | not analyzed | 2 (user/export, user/account) | **2** |

---

## 2. Architectural decisions (revised)

### 2.1 Tenant context propagation: **Hybrid** (unchanged from v1)

JWT claim `currentOrgId` set on login + AsyncLocalStorage propagates within request scope. Workers and cron opt-in via explicit `runWithTenant()` calls.

### 2.2 Database role architecture: **THREE roles** (changed)

| Role | Privileges | Used by |
|------|------------|---------|
| `postgres` | Superuser, BYPASSRLS implicit | Migration runner only (`prisma migrate deploy`) |
| `app_user` | SELECT/INSERT/UPDATE/DELETE on app tables, NO bypass | All authenticated user-context requests |
| `admin_user` | SELECT/INSERT/UPDATE/DELETE, **BYPASSRLS** | Admin routes when `ADMIN_USER_IDS` matches; GDPR endpoints; cross-tenant background jobs (`budget.monthly.reset`); cron routes that explicitly need cross-tenant access |

**Rationale**: Forensic analysis showed admin paths, GDPR endpoints, and 2 BullMQ handlers are intentionally cross-tenant. Two-role architecture would silently break them. Three-role is the minimum that preserves existing functionality.

### 2.3 NULL org on personal agents: **Option B — backfill personal Organization** (unchanged)

For each existing user with NULL-org agents, create:
1. A new `Organization{name: "{user.email} Personal", plan: "FREE"}` 
2. An `OrganizationMember{userId, organizationId, role: "OWNER"}` (forensic gap #13 fix)
3. Update each personal `Agent.organizationId` to point to the new org
4. Drop the NULL handling from the existing Agent policy after backfill complete

### 2.4 Cron infrastructure: **Railway only** (decided)

Forensic found code references "Vercel Cron" in middleware comments. We will:
- Confirm with user that Railway cron-job runner is the source of truth (recommended)
- Remove "Vercel Cron" comments from `src/middleware.ts:54`
- Pin Railway as the deploy target in README

If user wants both: cron routes accept `CRON_SECRET` from either source; no change.

### 2.5 Middleware runtime: **Pin to edge explicitly**

Add `export const runtime = 'edge'` to `src/middleware.ts` (Next.js default but currently unpinned per forensic gap #15).

### 2.6 Skill structure: **Unchanged** — single SKILL.md, STEP 0-5

---

## 3. Phased rollout (revised)

| Phase | What | Why phase exists | Time |
|-------|------|------------------|------|
| **Phase 0a** | Patch `withOrgContext` to use `$transaction` | Forensic CRITICAL #1 — current helper is broken | 0.5 day |
| **Phase 0b** | Create `app_user` + `admin_user` DB roles | Prerequisite for any RLS enforcement | 0.5 day |
| **Phase 0c** | Wire `currentOrgId` JWT claim + AsyncLocalStorage + Prisma client extension | Application-side prerequisite | 1 day |
| **Phase 0d** | Personal org backfill migration | Eliminate NULL-org Agent rows | 1 day |
| **Phase 0e** | Fix `SET LOCAL hnsw.ef_search` in `search.ts` | Bundle pre-existing latent bug fix | 0.5 day |
| **Phase 0f** | Add `RLS_ENFORCEMENT_ENABLED` env flag + CI `migrate deploy` | Feature flag wiring + CI gate | 0.5 day |
| **Phase 1** | TENANT_DIRECT (14 models) — staging + production | Highest-value, lowest-complexity tables | 3-5 days |
| **Phase 2** | TENANT_INDIRECT (35 models) | Bulk of work, cascaded via FK | 1-1.5 weeks |
| **Phase 3** | USER_OWNED (5 models) | Simple `userId` policies | 2-3 days |
| **Phase 4** | AMBIGUOUS (2-3 models with schema changes) | Schema additions + backfill | 3-5 days |
| **Phase 5** | Cleanup, documentation, monitoring | Decommission flag once stable | 2-3 days |

**Total estimate**: 4-6 weeks for full schema. Phase 0 alone is ~4 days (prerequisites that can't be skipped).

---

## 4. Phase 0 — Prerequisites (NEW SECTION)

This section did not exist in v1. Forensic analysis revealed Phase 0 is non-negotiable.

### 4.1 Patch `withOrgContext` (Phase 0a, CRITICAL #1)

**File**: `src/lib/db/rls-middleware.ts`

**Current (broken)**:
```typescript
// Current implementation:
export async function withOrgContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (client: PrismaClient) => Promise<T>
): Promise<T> {
  await client.$executeRawUnsafe(
    `SELECT set_config('app.current_org_id', '${orgId}', true)`
  );
  return fn(client); // ← Different pool connection — session var lost
}
```

**Fixed**:
```typescript
export async function withOrgContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return fn(tx);
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 30000,
  });
}
```

**Why it must be first**:
- With pool connections + 2 replicas (per `railway.toml`), the session var EVAPORATES between `set_config` and `fn(client)` calls
- This bug exists today but masked by app connecting as superuser (bypass)
- After RLS rolls out with `app_user`, this would silently fail (empty results)

**Test plan**:
```typescript
// Add to src/lib/db/__tests__/rls-middleware.test.ts
test("session variable persists within transaction across queries", async () => {
  await withOrgContext(prisma, "test-org-123", async (tx) => {
    const before = await tx.$queryRaw`SELECT current_setting('app.current_org_id', true) AS val`;
    expect(before[0].val).toBe("test-org-123");
    
    await tx.agent.findMany();
    
    const after = await tx.$queryRaw`SELECT current_setting('app.current_org_id', true) AS val`;
    expect(after[0].val).toBe("test-org-123");
  });
});
```

### 4.2 Create database roles (Phase 0b)

**New migration**: `prisma/migrations/YYYYMMDD_create_rls_roles/migration.sql`

```sql
-- Phase 0b: Create app_user and admin_user roles for RLS
-- This migration is idempotent — safe to re-run

DO $$
BEGIN
  -- app_user: tenant-scoped operations (no BYPASSRLS)
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD :'APP_USER_PASSWORD' NOSUPERUSER NOBYPASSRLS;
  END IF;
  
  -- admin_user: cross-tenant operations (BYPASSRLS)
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'admin_user') THEN
    CREATE ROLE admin_user WITH LOGIN PASSWORD :'ADMIN_USER_PASSWORD' NOSUPERUSER BYPASSRLS;
  END IF;
END
$$;

-- Grant base privileges (table grants come per-table in Phase 1+ migrations)
GRANT CONNECT ON DATABASE current_database() TO app_user, admin_user;
GRANT USAGE ON SCHEMA public TO app_user, admin_user;

-- Future tables will need grants — set default for new tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, admin_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, admin_user;
```

**Railway env vars to add**:
```bash
APP_USER_PASSWORD=<generated_secret>
ADMIN_USER_PASSWORD=<generated_secret>
DATABASE_URL_APP_USER=postgresql://app_user:****@host:5432/db
DATABASE_URL_ADMIN_USER=postgresql://admin_user:****@host:5432/db
# DATABASE_URL stays as postgres for migrations
```

### 4.3 Application-side wiring (Phase 0c)

#### JWT claim — NextAuth callback updates

**File**: `src/lib/auth.ts` (add to existing callbacks, do NOT replace)

```typescript
callbacks: {
  jwt: async ({ token, user, trigger, session }) => {
    if (user) {
      // First sign-in: pick first org membership as default
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      });
      token.currentOrgId = membership?.organizationId ?? null;
    }
    
    // Handle "update" trigger for switch-org endpoint
    if (trigger === "update" && session?.currentOrgId) {
      // Verify user is member of the new org
      const member = await prisma.organizationMember.findUnique({
        where: { 
          userId_organizationId: { 
            userId: token.id as string, 
            organizationId: session.currentOrgId 
          } 
        },
      });
      if (member) {
        token.currentOrgId = session.currentOrgId;
      }
    }
    
    return token;
  },
  session: async ({ session, token }) => {
    if (token.currentOrgId) {
      session.user.currentOrgId = token.currentOrgId as string;
    }
    return session;
  },
},
```

**Type update**: `src/types/next-auth.d.ts`

```typescript
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      onboardingCompleted: boolean;
      currentOrgId: string | null;  // NEW
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    onboardingCompleted?: boolean;
    currentOrgId?: string | null;  // NEW
  }
}
```

**Switch-org endpoint** (NEW file): `src/app/api/users/switch-org/route.ts`

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const switchOrgSchema = z.object({ organizationId: z.string() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
  
  const body = switchOrgSchema.safeParse(await req.json());
  if (!body.success) return new NextResponse("Bad Request", { status: 400 });
  
  // CRITICAL: Server-side membership re-validation
  const member = await prisma.organizationMember.findUnique({
    where: { 
      userId_organizationId: { 
        userId: session.user.id, 
        organizationId: body.data.organizationId 
      } 
    },
  });
  
  if (!member) return new NextResponse("Forbidden", { status: 403 });
  
  // Returns a hint to the client to call session.update({ currentOrgId })
  return NextResponse.json({ ok: true, organizationId: body.data.organizationId });
}
```

#### AsyncLocalStorage context (NEW file)

**File**: `src/lib/db/tenant-context.ts`

```typescript
import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContext = {
  organizationId: string;
  userId: string;
  isAdmin: boolean;  // True when ADMIN_USER_IDS matches
};

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export const runWithTenant = <T>(ctx: TenantContext, fn: () => Promise<T>) =>
  tenantStorage.run(ctx, fn);

export const getTenantContext = (): TenantContext | undefined =>
  tenantStorage.getStore();

export const requireTenantContext = (): TenantContext => {
  const ctx = tenantStorage.getStore();
  if (!ctx) throw new Error("Tenant context not set — wrap call in runWithTenant()");
  return ctx;
};
```

#### Prisma client factory (NEW file)

**File**: `src/lib/db/clients.ts`

```typescript
import { PrismaClient, Prisma } from "@prisma/client";
import { getTenantContext } from "./tenant-context";

const globalForPrisma = globalThis as unknown as {
  prismaApp?: PrismaClient;
  prismaAdmin?: PrismaClient;
  prismaMigrate?: PrismaClient;
};

// app_user client — respects RLS, used for tenant-scoped requests
const baseApp = globalForPrisma.prismaApp ?? new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_APP_USER,
});

// admin_user client — BYPASSRLS, used for cross-tenant operations
const baseAdmin = globalForPrisma.prismaAdmin ?? new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL_ADMIN_USER,
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaApp = baseApp;
  globalForPrisma.prismaAdmin = baseAdmin;
}

// prismaApp: extended with auto-set tenant context
export const prismaApp = baseApp.$extends({
  query: {
    $allOperations: async ({ args, query, operation, model }) => {
      const ctx = getTenantContext();
      
      // Feature flag check
      if (process.env.RLS_ENFORCEMENT_ENABLED !== "true") {
        return query(args);
      }
      
      // No context → reject (defense-in-depth)
      if (!ctx) {
        throw new Error(`Prisma query without tenant context: ${model}.${operation}`);
      }
      
      // Admin bypasses
      if (ctx.isAdmin) {
        return query(args);  // app_user can't bypass, so use baseAdmin instead
      }
      
      // Wrap in transaction with set_config
      return baseApp.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ctx.organizationId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;
        return (tx as any)[model][operation](args);
      });
    },
  },
});

// prismaAdmin: bare client, BYPASSRLS — use sparingly
export const prismaAdmin = baseAdmin;

// Legacy export — pointing to current Prisma for backward compat during migration
// TODO: deprecate after all call sites migrated
export const prisma = prismaApp;
```

**KNOWN LIMITATION**: The `$extends` pattern wraps every query in a NEW transaction. This conflicts with the 14 existing `$transaction()` call sites. For those, the calling code must use `prisma.$transaction(async (tx) => { ... })` pattern AND manually call `set_config` inside the tx callback.

**Mitigation**: Document the pattern + create a helper:
```typescript
export async function txWithTenant<T>(
  client: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${ctx.organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`;
    return fn(tx);
  });
}
```

Update each of the 14 `$transaction()` sites to use `txWithTenant` or manually call `set_config` inside.

#### Route wrapper for App Router (NEW file)

**File**: `src/lib/api/with-tenant.ts`

```typescript
import { auth } from "@/lib/auth";
import { prismaAdmin } from "@/lib/db/clients";
import { runWithTenant, type TenantContext } from "@/lib/db/tenant-context";
import { NextResponse } from "next/server";

export type RouteHandler = (req: Request, ctx: any) => Promise<Response>;

export function withTenant(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    let orgId = session.user.currentOrgId;
    
    // If no current org, try to resolve default
    if (!orgId) {
      const member = await prismaAdmin.organizationMember.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
      });
      orgId = member?.organizationId ?? null;
    }
    
    if (!orgId) return new NextResponse("No organization context", { status: 400 });
    
    // Check admin status
    const adminUserIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);
    const isAdmin = adminUserIds.includes(session.user.id);
    
    const tenantCtx: TenantContext = {
      organizationId: orgId,
      userId: session.user.id,
      isAdmin,
    };
    
    return runWithTenant(tenantCtx, () => handler(req, ctx));
  };
}

export function withAdminBypass(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const session = await auth();
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
    
    const adminUserIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean);
    if (!adminUserIds.includes(session.user.id)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    
    return runWithTenant({
      organizationId: "ADMIN", // Sentinel, never used by RLS (admin bypasses)
      userId: session.user.id,
      isAdmin: true,
    }, () => handler(req, ctx));
  };
}
```

### 4.4 Personal org backfill migration (Phase 0d)

**New migration**: `prisma/migrations/YYYYMMDD_backfill_personal_orgs/migration.sql`

```sql
-- Phase 0d: Backfill personal organizations for users with NULL-org agents

-- 1. Create personal org for each user who has at least one NULL-org agent
INSERT INTO "Organization" (id, name, slug, plan, "createdAt", "updatedAt")
SELECT 
  'org_personal_' || u.id,
  COALESCE(u.email, u.name, 'User') || ' (Personal)',
  'personal-' || LEFT(u.id, 8),
  'FREE'::"PlanTier",
  NOW(),
  NOW()
FROM "User" u
WHERE EXISTS (
  SELECT 1 FROM "Agent" a 
  WHERE a."userId" = u.id AND a."organizationId" IS NULL
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create OrganizationMember{role: OWNER} for each personal org
INSERT INTO "OrganizationMember" (id, "userId", "organizationId", role, "joinedAt", "createdAt", "updatedAt")
SELECT 
  'om_personal_' || u.id,
  u.id,
  'org_personal_' || u.id,
  'OWNER'::"OrgRole",
  NOW(),
  NOW(),
  NOW()
FROM "User" u
WHERE EXISTS (
  SELECT 1 FROM "Agent" a 
  WHERE a."userId" = u.id AND a."organizationId" IS NULL
)
ON CONFLICT (id) DO NOTHING;

-- 3. Update NULL-org agents to belong to their owner's personal org
UPDATE "Agent" 
SET "organizationId" = 'org_personal_' || "userId"
WHERE "organizationId" IS NULL AND "userId" IS NOT NULL;

-- 4. Verify no NULL-org agents remain (will fail if any do)
DO $$
DECLARE
  null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM "Agent" WHERE "organizationId" IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % NULL-org agents remain', null_count;
  END IF;
END
$$;

-- 5. Make organizationId NOT NULL going forward (forces app code to set it)
ALTER TABLE "Agent" ALTER COLUMN "organizationId" SET NOT NULL;
```

**Risks**:
- Agents with `userId IS NULL` AND `organizationId IS NULL` cannot be backfilled — must be deleted or assigned to a system org first. Check exists.
- Existing tests creating agents without `organizationId` will fail after this migration — see CI fix in §11.

### 4.5 Fix `SET LOCAL hnsw.ef_search` (Phase 0e, bundled bug fix)

**File**: `src/lib/knowledge/search.ts:201`

**Current (latent bug)**:
```typescript
await prisma.$executeRaw`SET LOCAL hnsw.ef_search = ${efSearch}`;
const results = await prisma.$queryRaw`SELECT ... FROM "KBChunk" ...`;
```

**Fixed**:
```typescript
const results = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL hnsw.ef_search = ${efSearch}`;
  return tx.$queryRaw`SELECT ... FROM "KBChunk" ...`;
});
```

Apply same pattern to other `SET LOCAL` callers if discovered during STEP 1 audit.

### 4.6 Feature flag wiring (Phase 0f)

**Add to `.env.example`**:
```bash
# Phase 0f — RLS Rollout
RLS_ENFORCEMENT_ENABLED=false
RLS_DISABLED_TABLES=
DATABASE_URL_APP_USER=postgresql://app_user:password@localhost:5432/dev
DATABASE_URL_ADMIN_USER=postgresql://admin_user:password@localhost:5432/dev
ADMIN_USER_IDS=
```

**Add to Railway prod env** (manual step):
```bash
RLS_ENFORCEMENT_ENABLED=false  # Will flip to true after staging passes
RLS_DISABLED_TABLES=
DATABASE_URL_APP_USER=<from Railway DB connection>
DATABASE_URL_ADMIN_USER=<from Railway DB connection>
ADMIN_USER_IDS=<comma-separated user IDs>
```

---

## 5. Public/anonymous endpoint handling (NEW SECTION — forensic gap #4)

Four categories of routes accept requests WITHOUT an authenticated user. Each needs explicit RLS context resolution.

### 5.1 Public chat: `/api/agents/[agentId]/chat`

**Strategy**: Resolve org from agent record using admin client, then set context for downstream queries.

```typescript
import { prismaAdmin } from "@/lib/db/clients";
import { runWithTenant } from "@/lib/db/tenant-context";

export async function POST(req: Request, { params }: { params: { agentId: string } }) {
  // 1. Resolve agent's org using admin client (bypasses RLS for this lookup)
  const agent = await prismaAdmin.agent.findUnique({
    where: { id: params.agentId },
    select: { id: true, organizationId: true, userId: true, isPublic: true },
  });
  
  if (!agent) return new Response("Not found", { status: 404 });
  if (!agent.isPublic) return new Response("Forbidden", { status: 403 });
  if (!agent.organizationId) return new Response("Misconfigured", { status: 500 });
  
  // 2. Set tenant context and run handler
  return runWithTenant(
    { 
      organizationId: agent.organizationId, 
      userId: "public-anonymous",  // Sentinel for anonymous
      isAdmin: false,
    },
    async () => {
      // Handler body — uses prismaApp, will respect RLS
      // ...
    }
  );
}
```

### 5.2 Webhook trigger: `/api/agents/[agentId]/trigger/[webhookId]`

Same pattern. Resolve agent org from `WebhookConfig.agent.organizationId` using admin client after HMAC verification.

### 5.3 Embed routes: `/embed/*`

Same pattern. Resolve from URL param.

### 5.4 A2A routes: `/api/a2a/*`

Verify signature first, then resolve agent's org.

---

## 6. GDPR + admin endpoint handling (NEW SECTION — forensic gaps #2, #3)

### 6.1 GDPR user export: `/api/user/export`

**File**: `src/lib/gdpr/data-export.ts` does cross-tenant scans. Must use admin client.

**Wrapper update**:
```typescript
// Route handler:
import { withAdminBypass } from "@/lib/api/with-tenant";

export const GET = withAdminBypass(async (req: Request) => {
  // Inside this handler, prismaApp can be used safely (admin context set)
  // Or directly use prismaAdmin for clarity
  const exportData = await collectUserData(session.user.id);
  return NextResponse.json(exportData);
});
```

**Important**: `withAdminBypass` requires the requesting user to be in `ADMIN_USER_IDS`. For GDPR, this is wrong — any user should be able to export THEIR OWN data.

**Better pattern**: New wrapper `withUserExport`:
```typescript
export function withUserExport(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const session = await auth();
    if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
    
    // User can export ONLY their own data — uses admin client but scoped to userId
    return runWithTenant({
      organizationId: "USER_EXPORT",  // Sentinel
      userId: session.user.id,
      isAdmin: true,  // Allow cross-org for this user's data
    }, () => handler(req, ctx));
  };
}
```

Update `data-export.ts` to filter by `userId` explicitly in every query (since RLS is bypassed).

### 6.2 GDPR account deletion: `/api/user/account`

Same `withUserExport` pattern. Plus: must delete data across all orgs the user belongs to.

### 6.3 Admin routes: `/api/admin/*`

Use `withAdminBypass`:
```typescript
import { withAdminBypass } from "@/lib/api/with-tenant";

// src/app/api/admin/flags/route.ts
export const GET = withAdminBypass(async (req: Request) => {
  // Full cross-tenant access
  const flags = await prismaAdmin.featureFlag.findMany();
  return NextResponse.json(flags);
});
```

---

## 7. BullMQ worker tenant context (revised from v1)

Of 11 handlers, 9 are tenant-scoped, 2 are cross-tenant:

### 7.1 Tenant-scoped handlers (9): wrap in `runWithTenant`

```typescript
// src/lib/queue/worker.ts
worker.on("active", async (job) => {
  if (CROSS_TENANT_JOBS.includes(job.name)) return;  // Handled below
  
  const orgId = await resolveOrgForJob(job);
  if (!orgId) throw new Error(`Cannot resolve org for job ${job.id}`);
  
  return runWithTenant(
    { organizationId: orgId, userId: "worker-system", isAdmin: false },
    () => handlers[job.name](job.data)
  );
});
```

### 7.2 Cross-tenant handlers (2): use admin client directly

```typescript
const CROSS_TENANT_JOBS = ["budget.monthly.reset", "governance.timeout"];

// In handler:
if (CROSS_TENANT_JOBS.includes(job.name)) {
  // Skip runWithTenant — handler uses prismaAdmin directly
  return runWithTenant(
    { organizationId: "SYSTEM", userId: "worker-system", isAdmin: true },
    () => handlers[job.name](job.data)
  );
}
```

`resolveOrgForJob` looks up by job type:
- `flow.execute`, `eval.run`, `webhook.execute`, `webhook.retry`, etc. → `Agent.organizationId` via `agentId`
- `kb.ingest` → via `knowledgeBase → agent → organizationId`
- `pipeline.run` → via `agentId`
- `heartbeat.run` → via `Agent.organizationId`
- `mcp.flow.run` → via `agentId`
- `managed.task.run` → via `agentId`

---

## 8. Policy templates (updated — added `isPublic` clauses)

### 8.1 TENANT_DIRECT template

```sql
-- Generated by skills/rls-rollout v2.0.0
-- Phase: 1 (TENANT_DIRECT)
-- Table: {{TABLE_NAME}}
-- Tenancy: organizationId column

-- 1. Add composite index if missing
CREATE INDEX IF NOT EXISTS "{{TABLE_NAME}}_organizationId_id_idx"
  ON "{{TABLE_NAME}}" ("organizationId", "id");

-- 2. Enable RLS
ALTER TABLE "{{TABLE_NAME}}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "{{TABLE_NAME}}" FORCE ROW LEVEL SECURITY;

-- 3. Grants (postgres remains owner; app_user is restricted)
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "{{TABLE_NAME}}" TO admin_user;

-- 4. Policies (admin_user has BYPASSRLS, doesn't need policies)
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_insert ON "{{TABLE_NAME}}"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_update ON "{{TABLE_NAME}}"
  FOR UPDATE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));

CREATE POLICY {{table_lower}}_delete ON "{{TABLE_NAME}}"
  FOR DELETE TO app_user
  USING ("organizationId" = current_setting('app.current_org_id', true));
```

### 8.2 TENANT_DIRECT with `isPublic` flag template (NEW — forensic gap #5)

For tables with `isPublic`: Agent, Template, AgentCard. Allows cross-tenant SELECT when row is public.

```sql
-- SELECT allows org members OR public rows
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING (
    "organizationId" = current_setting('app.current_org_id', true)
    OR "isPublic" = true
  );

-- INSERT/UPDATE/DELETE remain strict (only own org)
CREATE POLICY {{table_lower}}_insert ON "{{TABLE_NAME}}"
  FOR INSERT TO app_user
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true));
-- (etc.)
```

### 8.3 TENANT_INDIRECT template

```sql
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING (
    "{{FK_COLUMN}}" IN (
      SELECT id FROM "Agent"  -- or appropriate parent table
      WHERE "organizationId" = current_setting('app.current_org_id', true)
    )
  );
-- Same pattern for INSERT/UPDATE/DELETE
```

### 8.4 USER_OWNED template

```sql
CREATE POLICY {{table_lower}}_select ON "{{TABLE_NAME}}"
  FOR SELECT TO app_user
  USING ("userId" = current_setting('app.current_user_id', true));
```

---

## 9. Skill structure (updated)

### 9.1 Folder layout (same as v1)

```
skills/rls-rollout/
├── SKILL.md
├── README.md
├── scripts/
│   ├── audit.sh
│   ├── generate-migration.ts
│   ├── verify-staging.sh
│   ├── rollback.sh
│   └── ci-fix.sh                       # NEW — applies CI workflow patch
├── templates/
│   ├── policy-tenant-direct.sql.tpl
│   ├── policy-tenant-direct-with-public.sql.tpl  # NEW
│   ├── policy-tenant-indirect.sql.tpl
│   ├── policy-user-owned.sql.tpl
│   ├── policy-admin-bypass.sql.tpl     # NEW — for admin route audit
│   └── composite-index.sql.tpl
├── reference/
│   ├── model-classifications.json
│   ├── existing-policies.json
│   ├── decision-log.md
│   └── cross-tenant-routes.md          # NEW — public/admin/GDPR registry
└── tests/
    ├── cross-tenant.test.ts
    ├── public-routes.test.ts           # NEW — anonymous traffic verification
    ├── admin-routes.test.ts            # NEW — admin path verification
    ├── gdpr-export.test.ts             # NEW — user export still works
    ├── performance.test.ts
    └── lockout-recovery.test.ts
```

### 9.2 SKILL.md frontmatter (unchanged)

```yaml
---
name: rls-rollout
description: |
  Audit, plan, and orchestrate Row-Level Security (RLS) rollout for the
  agent-studio Postgres database. Phased approach: TENANT_DIRECT → TENANT_INDIRECT
  → USER_OWNED. Generates SQL but never auto-applies. Triggers: "rls audit",
  "enable rls", "tenant isolation", "rls migration", "rls rollout".
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Write
---
```

### 9.3 STEP 0 — Pre-flight check (updated)

Adds checks for forensic findings:

```bash
# STEP 0 expanded check list
1. Postgres version ≥ 14
2. pgvector extension present
3. Current DB role is NOT postgres in non-dev (warn)
4. RLS_ENFORCEMENT_ENABLED env var defined
5. app_user role exists (or instruct creation)
6. admin_user role exists (or instruct creation)        # NEW
7. ADMIN_USER_IDS env var defined (informational)       # NEW
8. Sentry actively configured + receiving events        # NEW
9. CI workflow runs `prisma migrate deploy`             # NEW
10. withOrgContext uses $transaction (not broken)       # NEW
11. SET LOCAL hnsw.ef_search wrapped in $transaction    # NEW
12. No NULL Agent.organizationId rows exist             # NEW (post-backfill)
13. /api/users/switch-org endpoint exists               # NEW
14. JWT type definition includes currentOrgId           # NEW
```

If any blocking check fails, STEP 0 prints exact remediation steps.

---

## 10. Feature flag wiring (updated)

### 10.1 Env vars

```bash
# .env.example additions
RLS_ENFORCEMENT_ENABLED=false       # Master switch
RLS_DISABLED_TABLES=                # Per-table escape hatch (CSV)
DATABASE_URL_APP_USER=...           # Tenant-scoped role
DATABASE_URL_ADMIN_USER=...         # Cross-tenant role
ADMIN_USER_IDS=                     # Comma-separated user IDs with admin access
```

### 10.2 Application logic

```typescript
// src/lib/db/clients.ts (already shown in §4.3)
// Flag check is inside Prisma extension — single source of truth
```

### 10.3 Per-table escape hatch

In Prisma extension:
```typescript
const disabledTables = (process.env.RLS_DISABLED_TABLES ?? "").split(",").filter(Boolean);
if (disabledTables.includes(model)) {
  return (baseAdmin as any)[model][operation](args);  // Bypass via admin
}
```

---

## 11. CI fixes (NEW SECTION — forensic gap #6)

### 11.1 `.github/workflows/ci.yml` — add migrate deploy

**Current (E2E job)**:
```yaml
- name: Set up database
  run: pnpm db:push
```

**Updated**:
```yaml
- name: Set up database (initial schema)
  run: pnpm prisma migrate deploy

- name: Push any pending schema changes (dev only)
  run: pnpm db:push --skip-generate
  if: false  # Disable in CI — migrations are the source of truth
```

### 11.2 Add RLS_ENFORCEMENT_ENABLED=false to CI env

```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
  DATABASE_URL_APP_USER: postgresql://app_user:test@localhost:5432/test_db
  DATABASE_URL_ADMIN_USER: postgresql://admin_user:test@localhost:5432/test_db
  RLS_ENFORCEMENT_ENABLED: "false"  # CI starts with flag OFF
  ADMIN_USER_IDS: "test-admin-1"
```

### 11.3 Pre-test step: create roles in CI DB

```yaml
- name: Create RLS roles
  run: |
    psql "$DATABASE_URL" -c "CREATE ROLE app_user LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS;"
    psql "$DATABASE_URL" -c "CREATE ROLE admin_user LOGIN PASSWORD 'test' NOSUPERUSER BYPASSRLS;"
    psql "$DATABASE_URL" -c "GRANT CONNECT ON DATABASE test_db TO app_user, admin_user;"
    psql "$DATABASE_URL" -c "GRANT USAGE ON SCHEMA public TO app_user, admin_user;"
```

### 11.4 New CI job: RLS verification (after Phase 4)

```yaml
rls-verification:
  needs: [e2e]
  runs-on: ubuntu-latest
  env:
    RLS_ENFORCEMENT_ENABLED: "true"  # This job runs WITH flag ON
  steps:
    - run: pnpm test -- skills/rls-rollout/tests/cross-tenant.test.ts
    - run: pnpm test -- skills/rls-rollout/tests/public-routes.test.ts
    - run: pnpm test -- skills/rls-rollout/tests/admin-routes.test.ts
    - run: pnpm test -- skills/rls-rollout/tests/gdpr-export.test.ts
```

---

## 12. Testing strategy (updated)

### 12.1 Tests are MOSTLY safe (forensic correction)

- 299 unit test files exist; almost all use `vi.mock("@/lib/prisma", ...)`
- Unit tests will NOT break under RLS — they don't hit a real DB
- E2E tests (Playwright) are the real risk — they hit a real DB
- New RLS-specific tests live in `skills/rls-rollout/tests/`

### 12.2 New test files required

| File | Purpose | Required by |
|------|---------|-------------|
| `cross-tenant.test.ts` | Cross-tenant data leak prevention | All phases |
| `public-routes.test.ts` | Anonymous traffic respects RLS via agent record | Phase 1 |
| `admin-routes.test.ts` | Admin routes bypass RLS correctly | Phase 1 |
| `gdpr-export.test.ts` | User export returns all user data across orgs | Phase 0 |
| `performance.test.ts` | <10% p95 regression on baseline queries | Phase 1 |
| `lockout-recovery.test.ts` | Feature flag flip recovers app | Phase 0 |
| `worker-tenant-context.test.ts` | BullMQ jobs set context correctly | Phase 0 |
| `cron-cross-tenant.test.ts` | `budget.monthly.reset` works across all orgs | Phase 0 |

### 12.3 `getRLSClient` helper (forensic gap #3 / REVIEW Error 3)

**File**: `skills/rls-rollout/tests/_helpers/get-rls-client.ts`

```typescript
import { PrismaClient } from "@prisma/client";

export async function getRLSClient(
  orgId: string,
  userId: string,
  isAdmin = false
): Promise<{
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  const url = isAdmin 
    ? process.env.DATABASE_URL_ADMIN_USER 
    : process.env.DATABASE_URL_APP_USER;
  
  const client = new PrismaClient({ datasourceUrl: url });
  
  // Wrap every query in a $transaction that sets context first
  // Caller responsibility: use client.$transaction(async (tx) => { ... })
  // We DON'T extend here — too risky for tests. Use txWithTenant instead.
  
  return {
    prisma: client,
    cleanup: async () => { await client.$disconnect(); },
  };
}
```

### 12.4 Cross-tenant test pseudocode (updated)

```typescript
import { getRLSClient } from "./_helpers/get-rls-client";
import { txWithTenant } from "@/lib/db/clients";

describe("RLS cross-tenant isolation", () => {
  let orgA: Organization, orgB: Organization;
  let agentA: Agent, agentB: Agent;
  let prismaA: PrismaClient, prismaB: PrismaClient;
  let cleanups: (() => Promise<void>)[] = [];
  
  beforeAll(async () => {
    // Setup uses admin client (bypasses RLS)
    const setup = await getRLSClient("setup", "system", true);
    cleanups.push(setup.cleanup);
    
    orgA = await setup.prisma.organization.create({ data: { name: "OrgA", slug: "orga" } });
    orgB = await setup.prisma.organization.create({ data: { name: "OrgB", slug: "orgb" } });
    
    agentA = await setup.prisma.agent.create({ 
      data: { name: "AgentA", organizationId: orgA.id, userId: "userA" } 
    });
    agentB = await setup.prisma.agent.create({ 
      data: { name: "AgentB", organizationId: orgB.id, userId: "userB" } 
    });
    
    // Create app_user clients
    const clientA = await getRLSClient(orgA.id, "userA");
    const clientB = await getRLSClient(orgB.id, "userB");
    prismaA = clientA.prisma;
    prismaB = clientB.prisma;
    cleanups.push(clientA.cleanup, clientB.cleanup);
  });
  
  afterAll(async () => {
    for (const fn of cleanups) await fn();
  });

  it("orgA cannot see orgB's agents", async () => {
    const ctx = { organizationId: orgA.id, userId: "userA", isAdmin: false };
    
    const agents = await txWithTenant(prismaA, ctx, async (tx) => {
      return tx.agent.findMany();
    });
    
    expect(agents.find((a) => a.id === agentB.id)).toBeUndefined();
    expect(agents.find((a) => a.id === agentA.id)).toBeDefined();
  });

  it("orgA cannot UPDATE orgB's agent", async () => {
    const ctx = { organizationId: orgA.id, userId: "userA", isAdmin: false };
    
    await expect(
      txWithTenant(prismaA, ctx, async (tx) => {
        return tx.agent.update({
          where: { id: agentB.id },
          data: { name: "pwned" },
        });
      })
    ).rejects.toThrow();  // Will throw "Record not found" because RLS hides it
  });
  
  // ... INSERT, DELETE, plus tests for every TENANT_INDIRECT table
});
```

### 12.5 Public chat test (NEW)

```typescript
describe("Public chat respects RLS via agent record", () => {
  it("public agent in orgA is accessible to anonymous users", async () => {
    const setup = await getRLSClient("setup", "system", true);
    const orgA = await setup.prisma.organization.create({ ... });
    const publicAgent = await setup.prisma.agent.create({
      data: { name: "Public", organizationId: orgA.id, isPublic: true }
    });
    
    // Anonymous request resolves agent.organizationId then sets context
    const response = await fetch(`/api/agents/${publicAgent.id}/chat`, {
      method: "POST",
      body: JSON.stringify({ message: "test" }),
    });
    
    expect(response.status).toBe(200);
  });
  
  it("non-public agent rejects anonymous requests", async () => {
    // ... isPublic: false case returns 403
  });
});
```

---

## 13. Production cutover runbook (updated)

Same 4-layer rollback as v1, plus new triggers:

### 13.1 Updated rollback triggers

| Trigger | Layer to use | Detection |
|---------|--------------|-----------|
| Sentry alert: "permission denied for table X" >5/min | Layer 1 (disable flag) | Auto via Sentry alert |
| Sentry alert: "Tenant context not set" >5/min | Layer 1 | Auto |
| User reports: "I can't see my agents" | Layer 1 | Manual |
| Admin panel returns 403 | Layer 2 (per-table escape) or revert admin route | Manual |
| Public chat returns empty responses | Layer 2 (RLS_DISABLED_TABLES=Agent) | Manual |
| GDPR export returns incomplete data | Layer 2 + investigate | Manual |
| BullMQ job failure rate >5% | Layer 1 + investigate worker context | Auto via metrics |
| p95 latency regression >25% | Layer 2 (escape hatch on hot tables) | Auto via Sentry |
| Specific table errors | Layer 2 (add table to RLS_DISABLED_TABLES) | Manual |

### 13.2 Per-table rollback example

If `KBChunk` queries return wrong results under RLS:
```bash
# Railway → agent-studio → Variables
RLS_DISABLED_TABLES=KBChunk,KBSource  # Causes Prisma extension to use admin client for these
# Save → Railway auto-redeploys
```

---

## 14. Open items remaining

| Item | Why open | Resolution |
|------|----------|-----------|
| Production Postgres version not pinned in repo | Railway-managed | STEP 0 will report; user confirms in Railway dashboard |
| Staging environment availability | User confirmation needed | Recommend Railway preview env or temp branch DB |
| Sentry monitoring SLA | Plan assumes someone watches Sentry | User confirms or assigns rotation |
| `ModelPerformanceStat` mixed global+per-agent rows | Schema ambiguity | Phase 4 decision: split table or BYPASSRLS for this table |
| `PipelineMemory` orphan agentId field (no FK) | Data integrity | Phase 4: add FK relation |
| `WebhookDeadLetter` orphan webhookConfigId | Data integrity | Phase 4: add FK relation |
| Redis cache cross-tenant audit | Separate workstream | Future skill (Skill 5?) |
| Vercel vs Railway cron decision | Code references both | User confirms Railway-only or both |

---

## 15. Estimated effort (updated)

| Phase | Skill work | App-side work | DB work | Verification |
|-------|------------|---------------|---------|--------------|
| Build skill (STEPs 0-5) | 2 days | — | — | — |
| Phase 0a (patch withOrgContext) | — | 0.5 day | — | 0.5 day |
| Phase 0b (create roles) | — | 0.5 day | 0.5 day | — |
| Phase 0c (JWT + AsyncLocalStorage + extension) | — | 1.5 days | — | 1 day |
| Phase 0d (personal org backfill) | — | 0.5 day | 1 day | 0.5 day |
| Phase 0e (SET LOCAL fix) | — | 0.5 day | — | 0.5 day |
| Phase 0f (env flag + CI fix) | — | 0.5 day | — | 0.5 day |
| Phase 1 (TENANT_DIRECT) | 0.5 day | 1 day | 0.5 day | 1.5 days |
| Phase 2 (TENANT_INDIRECT) | 0.5 day | 2 days | 1 day | 2 days |
| Phase 3 (USER_OWNED) | 0.5 day | 0.5 day | 0.5 day | 0.5 day |
| Phase 4 (AMBIGUOUS) | 0.5 day | 1 day | 1 day | 1 day |
| Cutover monitoring (cumulative) | — | — | — | 3 days |

**Total**: ~5-7 weeks with part-time focus, 3-4 weeks full-time.

---

## 16. What this plan explicitly DOES and DOES NOT do

### DOES:
- Generate SQL migration drafts for human review
- Generate JSON inventory of all 61 models with classifications
- Run cross-tenant isolation tests in staging
- Provide rollback runbook
- Audit existing RLS state
- Identify public/admin/GDPR routes requiring special handling
- Verify Phase 0 prerequisites are met before allowing Phase 1+

### DOES NOT:
- Auto-apply migrations
- Modify production application code (humans do this)
- Manage feature flags in Railway (humans do this)
- Handle multi-region deployment
- Manage backups
- Decide on `ModelPerformanceStat` schema split (human decides)
- Audit Redis cache keys (separate skill, future)
- Modify CI workflow file (provides patch, human merges)

---

## 17. Self-review checklist before STEP 1 build

- [ ] User confirms Phase 0 ordering and prerequisites
- [ ] User confirms three-role architecture
- [ ] User confirms hybrid tenant context approach (JWT + AsyncLocalStorage)
- [ ] User confirms personal-org backfill strategy
- [ ] User confirms `isPublic` semantics for marketplace
- [ ] User confirms staging environment exists or plan for one
- [ ] User confirms Sentry is monitored
- [ ] User decides Railway-vs-Vercel cron ambiguity
- [ ] User confirms ADMIN_USER_IDS list strategy
- [ ] All 12 forensic hallucinations addressed in this v2
- [ ] All 18 forensic gaps addressed (or explicitly deferred to future skill)

---

## 18. Next steps

1. **User reviews PLAN v2** and confirms or amends decisions in §17 checklist.
2. **If approved**: Build skill via STEP 0 (folder creation, SKILL.md, scripts/templates/tests).
3. **If amendments**: Iterate to v3.

**Expected time for v2 → STEP 1 build**: 30-60 minutes review + ~2 days for skill scaffolding.

---

## Appendix A — Diff summary v1 → v2

For someone who already read v1, key deltas:

| Section | v1 | v2 |
|---------|-----|-----|
| §1 numbers | 60 models, 22 sites, 9+ tx, 7 cron | **61 models, 22 files/70 statements, 14 tx/12 files, 10 cron** |
| §2.2 DB roles | 2 roles | **3 roles** |
| §3 phases | Phase 0 = pre-flight | **Phase 0 = 6 sub-phases (a-f) of prerequisites** |
| §4 | (didn't exist) | **NEW: Phase 0 prerequisites with code samples** |
| §5 | (didn't exist) | **NEW: Public/anonymous endpoint handling** |
| §6 | (didn't exist) | **NEW: GDPR + admin endpoint handling** |
| §8 templates | 3 templates | **5 templates (added `isPublic` + `admin-bypass`)** |
| §11 | (didn't exist) | **NEW: CI fixes section** |
| §12 tests | "tests will break" alarm | **Corrected: only E2E at risk; unit tests are mocked** |
| §13 rollback | 4 layers, basic triggers | **4 layers + 9 specific Sentry-based triggers** |

**End of PLAN v2.**
