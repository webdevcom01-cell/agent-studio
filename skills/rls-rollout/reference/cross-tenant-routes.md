# Cross-tenant routes registry

This document lists every route, job, and code path that requires special
handling under RLS — either because it operates across tenant boundaries by
design, or because it lacks an authenticated user context.

Generated from forensic analysis of agent-studio. Updated by audit.sh STEP 1.

---

## 1. Public routes (no authenticated user)

These accept anonymous requests. RLS context must be resolved server-side
from the agent record or other authoritative source.

### `/api/agents/[agentId]/chat`

- **Auth**: None (public path in `src/middleware.ts:33`)
- **Tenant resolution**: Server fetches `Agent` via `prismaAdmin`, reads
  `agent.organizationId`, checks `agent.isPublic === true`
- **RLS context**: Set after agent lookup, before any downstream queries
- **Handler pattern**:
  ```typescript
  const agent = await prismaAdmin.agent.findUnique({ where: { id }, select: { organizationId, isPublic } });
  if (!agent?.isPublic) return 403;
  return runWithTenant({ organizationId: agent.organizationId, userId: "public-anonymous", isAdmin: false }, () => handler());
  ```

### `/api/agents/[agentId]/trigger/[webhookId]`

- **Auth**: HMAC signature on payload (not session)
- **Tenant resolution**: Via `WebhookConfig.agent.organizationId`
- **Special**: Validate HMAC BEFORE setting context to avoid timing-based org enumeration

### `/embed/*`

- **Auth**: None (public iframe widget)
- **Tenant resolution**: From URL parameter or signed embed token

### `/api/a2a/*` (Agent-to-Agent protocol)

- **Auth**: Signed agent identity
- **Tenant resolution**: From the calling agent's resolved org after signature verification

---

## 2. Admin routes (cross-tenant by design)

These bypass RLS via `admin_user` connection or admin client. Triggered when
`ADMIN_USER_IDS` env var matches the requesting user's ID.

| Route | Purpose | DB role |
|-------|---------|---------|
| `/api/admin/flags` | Feature flag management across all orgs | admin_user |
| `/api/admin/jobs` | BullMQ job inspection | admin_user |
| `/api/admin/stats` | Cross-tenant analytics | admin_user |

Wrapper: `withAdminBypass()` (PLAN-V2 §4.3)

---

## 3. GDPR endpoints (cross-org user data)

A user may have data in multiple orgs. GDPR endpoints must read across all
orgs the user is a member of.

| Route | Purpose | DB role |
|-------|---------|---------|
| `/api/user/export` | GDPR data export | admin_user (scoped by userId) |
| `/api/user/account` | GDPR account deletion | admin_user |

Wrapper: `withUserExport()` (PLAN-V2 §6.1)

Key point: filter every query by `userId` explicitly since RLS is bypassed.

---

## 4. BullMQ workers — per-job tenancy

### Tenant-scoped jobs (9 of 11) — use `runWithTenant()`

| Job name | Tenant resolution |
|----------|-------------------|
| `flow.execute` | from `agentId` in payload |
| `eval.run` | from `agentId` |
| `webhook.execute` | from `webhookConfigId → agentId` |
| `webhook.retry` | from `webhookConfigId → agentId` |
| `kb.ingest` | from `knowledgeBaseId → agentId` |
| `pipeline.run` | from `agentId` |
| `heartbeat.run` | from `agentId` |
| `mcp.flow.run` | from `agentId` |
| `managed.task.run` | from `agentId` |

### Cross-tenant jobs (2 of 11) — use admin client

| Job name | Why cross-tenant |
|----------|------------------|
| `budget.monthly.reset` | Resets budgets for ALL orgs each month |
| `governance.timeout` | Audits stale approvals across orgs |

Implementation:
```typescript
const CROSS_TENANT_JOBS = ["budget.monthly.reset", "governance.timeout"];
if (CROSS_TENANT_JOBS.includes(job.name)) {
  // Use prismaAdmin, no per-job context
  await handlers[job.name](job.data);
} else {
  const orgId = await resolveOrgForJob(job);
  await runWithTenant({ organizationId: orgId, userId: "worker-system", isAdmin: false }, () => handlers[job.name](job.data));
}
```

---

## 5. Cron routes — per-route tenancy decision

All 10 cron-style routes use `CRON_SECRET` auth. Each must decide between:

- **Loop tenants**: Iterate orgs, set context per iteration (defense-in-depth)
- **Admin bypass**: Use `admin_user` for entire job (simpler)

| Route | Recommended approach | Notes |
|-------|----------------------|-------|
| `/api/cron/trigger-scheduled-flows` | Loop tenants | Per-org schedule trigger |
| `/api/cron/evolve` | Admin bypass | Cross-org agent evolution |
| `/api/cron/budget-reset` | Admin bypass | Cross-org budget reset |
| `/api/cron/cleanup` | Admin bypass | Maintenance across orgs |
| `/api/cron/governance-timeout` | Admin bypass | Cross-org audit |
| `/api/cron/migrate-oauth-tokens` | Admin bypass | Migration utility |
| `/api/cron/migrate-webhook-secrets` | Admin bypass | Migration utility |
| `/api/evals/scheduled` | Loop tenants | Per-org eval runs |
| `/api/skills/evolve` | Admin bypass | Cross-org skill evolution |
| `/api/ecc/ingest-skills` | Admin bypass | Cross-org skill ingestion |

---

## 6. Marketplace / public-flagged resources

These models have `isPublic` flag enabling cross-org reads. Policies must
include `OR "isPublic" = true` in SELECT clause.

| Model | Public route consuming `isPublic` |
|-------|-----------------------------------|
| `Agent` | `/api/agents/discover` |
| `Template` | `/api/templates/import`, `/templates` (UI) |
| `AgentCard` | (rendered alongside Agent) |
| `PipelineTemplate` | GLOBAL — no RLS needed |

---

## 7. Raw SQL hotspots (22 files / 70 statements)

These bypass Prisma extensions and must explicitly set context. See
`reference/raw-sql-sites.txt` (generated by audit.sh STEP 1) for exact list.

High-risk files:
- `src/lib/knowledge/search.ts` — pgvector + keyword KB search
- `src/lib/memory/hot-cold-tier.ts` — AgentMemory queries
- `src/lib/ecc/skill-router.ts` — Skill marketplace
- `src/lib/knowledge/maintenance.ts` — KB maintenance
- `src/lib/scheduler/sync.ts` — FlowSchedule CRUD
- `src/lib/agents/agent-tools.ts` — Agent operations
- `src/app/api/agent-calls/stats/route.ts` — Aggregations
- `src/app/api/analytics/route.ts` — Analytics

Pattern for fixing each:
```typescript
// Before (bypasses RLS):
await prisma.$executeRaw`SET LOCAL hnsw.ef_search = ${k}`;
const results = await prisma.$queryRaw`SELECT ...`;

// After (correct):
const results = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL hnsw.ef_search = ${k}`;
  return tx.$queryRaw`SELECT ...`;
});
```

---

## 8. Verification checklist

After Phase 1 cutover, verify each category by running:

```bash
# Public routes — anonymous request to public agent should succeed
curl -X POST https://staging/api/agents/{public_agent_id}/chat \
  -d '{"message":"test"}'  # expect 200

# Admin routes — admin user can list flags across orgs
curl https://staging/api/admin/flags \
  -H "Cookie: session=admin_user_session"  # expect cross-org data

# GDPR export — user with multi-org data gets all of it
curl https://staging/api/user/export \
  -H "Cookie: session=multi_org_user_session"  # expect data from multiple orgs

# Cron — verify CRON_SECRET still works
curl -X POST https://staging/api/cron/trigger-scheduled-flows \
  -H "Authorization: Bearer $CRON_SECRET"  # expect job execution
```

---

## 9. Update procedure

When adding a new public/admin/cross-tenant route:

1. Add to this file under appropriate section
2. Update `audit.sh` if new pattern not detected by existing greps
3. Add a test in `tests/cross-tenant.test.ts` or `tests/public-routes.test.ts`
4. Document the tenant-resolution strategy

---

Last updated: 2026-05-18 (initial creation by skill v1.0.0)
