# RLS Phase 1 — Migration Playbook (before/after)

Reference pattern for routing tenant-scoped `prisma` queries through org context.
Canonical worked example: `src/app/api/agents/[agentId]/mcp/route.ts` (done).

## The rule

| Model class | Action | Helper |
|-------------|--------|--------|
| **TENANT** (one of the 48 RLS tables) on bare `prisma` | wrap | `withOrgContext(prisma, orgId, (tx) => tx.<model>...)` |
| **GLOBAL** (User, MCPServer, Skill, ApiKey, …) | leave as-is | — |
| legitimately **cross-tenant** (admin/GDPR/system) | wrap | `withAdminBypass((db) => db.<model>...)` |
| already inside `tx.` / `db.` callback | already done | — |

`orgId` source in API routes (already returned by the auth guards):
- `requireAgentOwner(agentId)` → `authResult.organizationId`
- `requireAuth()` → `authResult.organizationId`
- `requireOrgMember()` → `authResult.organizationId`

Use it **after** the `if (isAuthError(authResult)) return authResult;` guard.

## Before / after (the worked example)

Add the import:
```ts
import { withOrgContext } from "@/lib/db/rls-middleware";
```

**Before**
```ts
const agentMCPServers = await prisma.agentMCPServer.findMany({
  where: { agentId },
  include: { mcpServer: { select: { id: true, name: true, /* … */ } } },
});
```

**After**
```ts
const agentMCPServers = await withOrgContext(prisma, authResult.organizationId, (tx) =>
  tx.agentMCPServer.findMany({
    where: { agentId },
    include: { mcpServer: { select: { id: true, name: true, /* … */ } } },
  }),
);
```

Notes:
- Inside the callback use **`tx.`**, never `prisma.` (the outer client bypasses org context).
- A read-then-write guarded by an early `return` (e.g. find → 404 → delete) becomes
  **two** `withOrgContext` calls (one for the find, one for the write) so the `return`
  guard stays between them.
- GLOBAL tables in the same file (e.g. `prisma.mCPServer.findFirst({ where: { userId } })`)
  stay raw — they have no RLS and are already scoped by `userId`.

## Behaviour safety
While `RLS_ENFORCEMENT_ENABLED` is unset/false (and the app still connects as a
BYPASSRLS role), `withOrgContext` runs the callback on the plain client with **no**
behaviour change. These edits are therefore safe to land incrementally on `main`
without enabling enforcement.

## Verify each migrated file
```bash
f="<path>"
grep -c 'prisma\.<tenantAccessor>' "$f"   # want 0 (none left raw)
grep -c 'withOrgContext(prisma'      "$f"   # matches the count you wrapped
npx tsc --noEmit -p tsconfig.json | grep "$f"   # want no output
```

## Burn-down
Re-run the inventory after each batch; target **298 → 0**:
```bash
node /tmp/phase1.mjs   # (or the committed analysis script)
```

## Suggested batches (API zone, 97 sites)
1. `agents/[agentId]/*` simple CRUD (mcp ✅, memory, budget, schedules, traces, goals, knowledge/sources)
2. analytics routes (`analytics/route.ts`, `analytics/summary/route.ts`)
3. approvals, agent-calls, discover (mind `isPublic` on discover → may need admin/public handling)
Run the cross-tenant test suite after each batch.

## Gotcha: narrowing lost inside the `(tx) =>` closure
Wrapping a call in `withOrgContext(prisma, orgId, (tx) => ...)` moves the body into
a new closure. TypeScript drops **property-access** narrowing across that boundary,
so `obj.maybeNull.id` (valid after an earlier `if (!obj?.maybeNull) return` guard)
becomes `TS18047: possibly null`. Fix: hoist the value to a local `const` before the
wrap, then use the const inside:
```ts
const knowledgeBaseId = agent.knowledgeBase.id; // narrowed here
const source = await withOrgContext(prisma, authResult.organizationId, (tx) =>
  tx.kBSource.create({ data: { /* … */ knowledgeBaseId } }),
);
```
