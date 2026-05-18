# Skill 2 — RLS Rollout: Pre-Implementation Analysis

**Date**: 2026-05-18
**Author**: Claude (audit + research synthesis)
**Status**: Draft for user review
**Scope**: Full schema (all 60 Prisma models) RLS rollout for agent-studio
**Target**: Build `skills/rls-rollout/` skill that automates audit → plan → migrate → verify lifecycle

---

## 0. Executive Summary

### Big Finding

**RLS is NOT a greenfield project — it is half-built and dormant.** Two migrations already enable RLS on 8 of 60 models. A `withOrgContext()` helper exists at `src/lib/db/rls-middleware.ts` but **is never called in production code**. The DDL is in place; the application layer never sets the session variable. Net effect: policies are inert because `current_setting('app.current_org_id')` is always empty, and the `postgres` superuser bypasses everything anyway.

### Decision the user must make first

There are **three viable architectural paths** for completing the rollout. Each has different tradeoffs on safety, speed, and code surface area. The plan downstream depends entirely on which one the user picks. The full comparison is in §6.

### Sizing

| Dimension | Number |
|-----------|--------|
| Total Prisma models | 60 |
| Models needing RLS policy | 49 (TENANT_DIRECT + TENANT_INDIRECT + USER_OWNED) |
| Models already covered | 8 (Agent + Flow + KnowledgeBase + WebhookConfig + EvalSuite + AgentSkillPermission + EvalRun + EvalResult) |
| Models needing new policies | 41 |
| Models needing schema changes (organizationId backfill) | 5 (AuditLog, AgentCallLog, PipelineMemory, WebhookDeadLetter, ModelPerformanceStat) |
| Models intentionally GLOBAL (no RLS) | 5 (User, VerificationToken, Skill, Organization, PipelineTemplate) |
| Production code call sites needing `withOrgContext` wrapper | ~200+ (every org-scoped route + 11 BullMQ job handlers + 7 cron routes + 22 raw SQL sites) |
| Composite indexes to add for performance | ~49 (one per RLS-enabled table) |

### Risk Level

**HIGH.** A misconfigured RLS rollout has three failure modes, all bad:

1. **Lockout** — empty result sets for legitimate users; product appears broken
2. **Silent data leak** — overly permissive policy lets tenant A see tenant B's data
3. **Performance collapse** — queries that took 10ms now take 1000ms+ without composite indexes

Mitigations from research: composite indexes with `tenant_id` as leading column reduce RLS overhead from **120ms to 1.2ms** at 1M rows. Without them RLS is 2 orders of magnitude slower.

---

## 1. Current State Assessment

### 1.1 Database stack (confirmed)

| Item | Value | Source |
|------|-------|--------|
| Postgres version (local) | 16 | `docker-compose.yml:81` (`pgvector/pgvector:pg16`) |
| Postgres version (Railway prod) | Unconfirmed — likely 16, not pinned in repo | Railway-managed |
| Extensions | `vector` (pgvector) | `schema.prisma:11`, `prisma/migrations/0_init/migration.sql:5` |
| Connection pooling | None today — `DATABASE_URL == DIRECT_URL` | `.env`, `schema.prisma:10` |
| Prisma version | 6.19.3 | `package.json` |
| Driver adapter | `@prisma/adapter-pg@^6.19.3` installed, **not wired** | `src/lib/prisma.ts` uses plain `new PrismaClient()` |
| Read replica | Optional via `DATABASE_READ_URL`, fallback to primary | `src/lib/prisma.ts:23-29` |
| Client instantiation | Singleton, `globalThis`-cached | `src/lib/prisma.ts:13` |
| Migrations | Prisma Migrate (`prisma/migrations/`) | Standard |

**Implication**: With no PgBouncer in *transaction* pooling mode, `SET LOCAL` and `set_config(..., true)` work as expected — value scoped to current transaction or session. If PgBouncer is added later in transaction mode, every RLS-scoped query MUST run inside `$transaction()`.

### 1.2 Authentication and tenant context flow

```
Browser request
   ↓
src/middleware.ts (edge)
   - Public-path allowlist (chat, embed, webhooks, cron, MCP proxy)
   - CSRF same-origin check
   - Session cookie OR x-api-key (presence only)
   - DOES NOT resolve organizationId
   ↓
Route handler
   ↓
requireAuth(req)  →  { userId, apiKeyId, scopes }
   - DOES NOT include organizationId
   ↓
[For org-scoped routes]
requireOrgMember(orgId, req)
   - orgId from URL path param (e.g. /api/orgs/[orgId]/...)
   - Looks up OrganizationMember by (userId, orgId)
   - Returns { userId, organizationId, role }
   ↓
[For agent-scoped routes]
requireAgentOwner(agentId, req)
   - Fetches Agent.userId + Agent.organizationId
   - Accepts if user owns directly OR is OrganizationMember of agent.org
   - Returns { agentId }  ← does NOT return organizationId
   ↓
Prisma query — singleton client, no extensions
```

**Critical gap**: `currentOrgId` is NOT carried in JWT. Multi-org users select org via URL. There is no ambient per-request "current org". This means a JWT-based RLS approach (Supabase-style `auth.uid()`) is NOT viable here without a JWT schema change.

### 1.3 Existing RLS work (partial, inert)

#### Migration A: `prisma/migrations/20240108000000_enable_rls/migration.sql`

Enables RLS on `Agent` only. Establishes session-variable pattern:

```sql
ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Agent" OWNER TO postgres;

CREATE POLICY agent_select_policy ON "Agent"
FOR SELECT
USING (
  "organizationId" = current_setting('app.current_org_id', true)
  OR (
    "organizationId" IS NULL
    AND current_setting('app.current_org_id', true) IS DISTINCT FROM ''
  )
);
-- Same pattern for INSERT, UPDATE, DELETE
```

#### Migration B: `prisma/migrations/20260517000000_rls_agent_cascaded_tables/migration.sql` (359 lines)

Adds policies to 7 agent-cascaded tables: `Flow`, `KnowledgeBase`, `WebhookConfig`, `EvalSuite`, `AgentSkillPermission`, `EvalRun`, `EvalResult`. Pattern uses subquery:

```sql
CREATE POLICY flow_select_policy ON "Flow"
FOR SELECT
USING (
  "agentId" IN (
    SELECT id FROM "Agent" WHERE
      "organizationId" = current_setting('app.current_org_id', true)
      OR ("organizationId" IS NULL AND current_setting('app.current_org_id', true) IS DISTINCT FROM '')
  )
);
```

#### Application helper: `src/lib/db/rls-middleware.ts`

```typescript
export async function withOrgContext<T>(
  client: PrismaClient,
  orgId: string,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return fn(tx as PrismaClient);
  });
}
```

**Usage in production code**: ZERO (only test file references it).

### 1.4 The 4 known bugs in the existing RLS work

1. **`Agent.organizationId IS NULL` policy allows ANY session to see ALL personal agents.** The policy says `organizationId IS NULL AND current_setting IS DISTINCT FROM ''` — that condition is true for every authenticated session, regardless of which user. Personal agents should require `userId = current_setting('app.current_user_id')`.
2. **No explicit `ALTER ROLE ... BYPASSRLS`** — relies on `postgres` being superuser. Migrations may fail in environments where the connected role doesn't have superuser. Should be explicit and documented.
3. **`FORCE ROW LEVEL SECURITY` on Agent + table owner = postgres** + postgres is superuser → policies bypassed unless we use a non-superuser application role. Currently the app connects as `postgres` (verified from `.env`), so even with FORCE, policies don't apply to the app.
4. **`withOrgContext` is dead code in production** — the production app NEVER sets the session variable, so all the policies that check `current_setting('app.current_org_id')` evaluate against empty string and reject all rows. The only reason the app works today is that the app connects as `postgres` superuser, which bypasses RLS entirely.

**Summary**: The existing RLS migrations are a "security theater" today — they exist but enforce nothing.

---

## 2. 60 Models — Tenancy Classification

Full inventory from discovery scan (see appendix B for line numbers). Summary counts:

| Classification | Count | RLS strategy |
|----------------|-------|--------------|
| `TENANT_DIRECT` (has `organizationId`) | 14 | Direct policy: `organizationId = current_setting(...)` |
| `TENANT_INDIRECT` (FK to TENANT_DIRECT) | 35 | Subquery via parent table |
| `USER_OWNED` (has `userId`, no org) | 5 | User-scoped: `userId = current_setting('app.current_user_id')` |
| `GLOBAL` (platform-wide, no tenant) | 5 | No RLS — explicit `BYPASSRLS` or no `ENABLE` |
| `AMBIGUOUS` (needs decision) | 2 | Schema change required (add `organizationId` column) |

### Detailed table (TOC for plan)

**TENANT_DIRECT (14)**: Agent, CompanyMission, Goal, HeartbeatConfig, HeartbeatContext, HeartbeatRun, Department, AgentPermissionGrant, OrganizationMember, Invitation, Template, ApprovalPolicy, PolicyDecision + Organization (root).

**TENANT_INDIRECT (35)**: ManagedAgentTask, PipelineRun, PipelineMemory*, AgentSdkSession, Flow†, KnowledgeBase†, KBSource, KBChunk (pgvector), AnalyticsEvent, Conversation, Message, AgentMCPServer, FlowVersion, FlowDeployment, AgentCard, HumanApprovalRequest, AgentCallLog**, AgentMemory (pgvector), FlowSchedule, ScheduledExecution, WebhookConfig†, WebhookExecution, WebhookDeadLetter*, EvalSuite†, EvalTestCase, EvalRun†, EvalResult†, AgentExecution, AgentSkillPermission†, Instinct, FlowTrace, AgentGoalLink, AgentBudget, CostEvent, BudgetAlert.

  * = needs schema change (no proper FK relation declared)
  † = already covered in Migration B
  ** = cross-tenant by design (caller/callee may differ)

**USER_OWNED (5)**: ApiKey, Account, Session, MCPServer, GoogleOAuthToken, CLIGeneration (6 if counting CLIGeneration separately).

**GLOBAL (5)**: User, VerificationToken, Skill, Organization, PipelineTemplate.

**AMBIGUOUS (2)**: AuditLog (no FK to tenant), ModelPerformanceStat (mixes global + per-agent rows).

### Models requiring SCHEMA CHANGES before RLS

| Model | Issue | Recommended fix |
|-------|-------|-----------------|
| AuditLog | No tenant column; resourceType/resourceId polymorphic | Add nullable `organizationId String?` + backfill via resourceType → resource table → org |
| AgentCallLog | Cross-tenant by design (caller in org A calls callee in org B) | Add `callerOrganizationId` + policy = callerOrganizationId |
| PipelineMemory | Has `agentId` field but no FK declared | Add FK relation to Agent (orphan field fix) |
| WebhookDeadLetter | Has `webhookConfigId` but no FK relation declared | Add FK to WebhookConfig |
| ModelPerformanceStat | `agentId` defaults to `""` for global aggregates | Decision: split into two tables (`GlobalStat` + `AgentStat`) OR add NULL handling |

---

## 3. 2026 Standards — Research Synthesis

### 3.1 Anthropic Skill Standards (verified May 2026)

| Aspect | Requirement |
|--------|-------------|
| File structure | `skills/<name>/SKILL.md` (required) + optional auxiliary files |
| Frontmatter — `name` | Max 64 chars, lowercase letters/numbers/hyphens only, no XML, no reserved words |
| Frontmatter — `description` | Max 1024 chars, non-empty, no XML. **This is the primary auto-invocation trigger** |
| Frontmatter — `disable-model-invocation` | Set `true` for risky operations (deployments, migrations). **Recommended for RLS rollout — high impact** |
| Frontmatter — `allowed-tools` | Restrict tool access. **Read-only for audit phase** (e.g., `[Read, Glob, Grep]`) |
| Body size | Under 500 lines for token efficiency. If larger, split into auxiliary files |
| Body style | Concise. State WHAT to do, not HOW or WHY |
| Side effects | Document them in description with explicit "Do NOT use for X" lines |
| Token cost | Each loaded skill stays in context across turns → every line is recurring cost |

**Decision for our skill**: Use `disable-model-invocation: true` because RLS migrations are high-stakes. Use phased structure: AUDIT phase has read-only `allowed-tools`, MIGRATE phase needs write access.

### 3.2 PostgreSQL 16 RLS Best Practices (2026)

| Practice | Detail |
|----------|--------|
| `ENABLE ROW LEVEL SECURITY` | Required. Without `FORCE`, table owner bypasses policies — known footgun |
| `FORCE ROW LEVEL SECURITY` | **Critical**. Forces table owner to obey policies. Required for defense-in-depth |
| Application role | Should NOT be superuser, should NOT have BYPASSRLS. Use `postgres` only for migrations |
| Service role for cron/workers | Has `BYPASSRLS` attribute. Cron and BullMQ workers do cross-tenant scans by design |
| Tenant context | Session variables via `set_config('app.current_org_id', value, true)` — third param `true` = LOCAL to transaction |
| Policy combination | Default OR (permissive). Use `AS RESTRICTIVE` for AND-combined policies |
| `SET LOCAL` mandatory | If using PgBouncer in transaction mode — value resets when txn ends |
| Performance | Without composite indexes: 100x slower. With `(tenant_id, ...)` composite: 2-4% overhead |
| SQL injection in policies | Never reference user-supplied input in policy expression — only session variables |

### 3.3 Prisma + RLS Integration Patterns (2026)

| Pattern | Status | Notes |
|---------|--------|-------|
| `$use` middleware | **REMOVED in Prisma 6** | Don't use — won't work |
| `$extends` client extension | GA since 4.16.0 (June 2023) | Modern way, **recommended** |
| Per-request client | Recommended | Each HTTP request gets its own extended client with session data |
| Transaction wrapping | Required | `SET LOCAL` only works inside transaction |
| Official Prisma RLS example | EXISTS at `prisma-client-extensions/row-level-security` | **WARNING: Marked "not production-ready"** by Prisma team |
| Community libraries | `cerebruminc/yates`, `kltk/prisma-extension-rls` | Production-tested third-party |
| AsyncLocalStorage pattern | Recommended for context propagation | Similar to `nestjs-cls`, avoids prop-drilling tenant ID |
| Known issue | `$extends` query method conflicts with explicit `$transaction()` | Current footgun — extension wraps queries in batch txn |
| Workaround for transactions | Pass tenant context into `$transaction(async (tx) => {...})` explicitly | Manual but reliable |

### 3.4 RLS Performance Benchmarks (2026)

| Scenario | Latency | Source |
|----------|---------|--------|
| RLS + composite index `(tenant_id, ...)` | 0.3-1.2 ms per query at 1-50M rows | Multiple 2026 benchmarks |
| RLS WITHOUT composite index | 120-2400 ms per query | Same |
| `SET LOCAL` overhead | <0.1 ms | Negligible |
| Overall RLS overhead with proper indexes | 2-4% | Production-grade |

**Implication for our project**: We MUST add composite indexes BEFORE enabling RLS, or queries will time out in production. This is a separate phase in the plan.

---

## 4. Architectural Decisions Required

### Decision 1 — Tenant context propagation strategy

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. JWT claim `currentOrgId`** + "switch org" endpoint | Single source of truth, ambient context | Requires NextAuth callback changes, "default org" UX | RECOMMENDED — cleaner long-term |
| **B. Per-request `withOrgContext()` wrapper** in every route | No JWT changes | 200+ call sites to update | Faster to ship, more surface area |
| **C. AsyncLocalStorage middleware** | Ambient context without JWT | New abstraction, harder to test | Best technical fit but slower to ship |

**My recommendation**: **Hybrid A+C** — JWT carries `currentOrgId` (set on login/switch), AsyncLocalStorage propagates it within request scope so workers/cron can opt in.

### Decision 2 — Database role architecture

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A. Single `postgres` superuser** (status quo) | App uses postgres role → bypasses RLS → RLS is "security theater" | NO — defeats the purpose |
| **B. Dedicated `app_user` role + postgres for migrations** | App runs as non-superuser; cron/workers also use app_user (no bypass needed since they set context manually); postgres used only for `prisma migrate deploy` | RECOMMENDED |
| **C. Three-role split: `app_user` + `cron_user` (BYPASSRLS) + `postgres`** | Cron explicitly bypasses; everyone else respects RLS | Most secure but more env config |

**My recommendation**: **Option B** with explicit `BYPASSRLS` only for `prisma migrate deploy` runs. Cron sets context using `Organization.id` from the row being processed.

### Decision 3 — NULL organizationId on Agent (personal agents)

The existing migration's NULL handling is buggy (any user sees all personal agents). Options:

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A. Add `app.current_user_id` session var + extend policy** | Personal agents visible if `userId = current_user_id` | Cleanest fix |
| **B. Backfill: assign each user a default personal Org** | Eliminates NULL — all agents have organizationId | Bigger migration but simpler RLS |
| **C. Forbid NULL via NOT NULL constraint + backfill** | Forces all agents into an org | Cleanest data model |

**My recommendation**: **Option B** — create a "personal" org per user during signup, backfill existing NULLs. Eliminates the dual-tenancy code path entirely.

### Decision 4 — Skill structure (single phase vs multi-phase)

| Option | Description | Recommendation |
|--------|-------------|----------------|
| **A. One mega-skill** | Single `skills/rls-rollout/SKILL.md` does everything | Too large, fails Anthropic 500-line guideline |
| **B. Phased skill family** | `skills/rls-audit/` (read-only) + `skills/rls-migrate/` (write) + `skills/rls-verify/` (test) | Better separation, smaller token cost per invocation |
| **C. Single skill with STEP 0-N sections** (like audit-verify) | One SKILL.md, gated steps | Matches existing audit-verify pattern |

**My recommendation**: **Option C** — matches the project's existing `audit-verify` skill pattern. STEP 0 (validate prerequisites) → STEP 1 (audit) → STEP 2 (plan) → STEP 3 (migrate) → STEP 4 (verify). With `disable-model-invocation: true` to prevent accidental triggering.

### Decision 5 — Rollback strategy (user said "hybrid")

The user already chose hybrid. Concrete implementation:

| Layer | Mechanism | Trigger |
|-------|-----------|---------|
| **Layer 1: Feature flag** | `RLS_ENFORCEMENT_ENABLED` env var. When `false`, app uses `postgres` superuser (bypasses RLS). When `true`, uses `app_user`. | Change env in Railway → restart (~30s) |
| **Layer 2: Per-table escape hatch** | `RLS_DISABLED_TABLES=KBChunk,KBSource` env var. App connects as superuser ONLY for these tables. | For targeted rollback when one table breaks |
| **Layer 3: Migration revert** | Prisma migration that drops policies + `DISABLE ROW LEVEL SECURITY`. Git revert + `prisma migrate deploy`. | Nuclear option — ~5 min |
| **Layer 4: Documented manual SQL** | Runbook with copy-paste SQL to disable RLS table-by-table without git/deploy | Last resort if app down |

---

## 5. Phased Rollout Approach (high-level)

| Phase | What | Risk | Time estimate |
|-------|------|------|---------------|
| **0. Pre-flight** | DB role creation, env config, feature flag wiring, `currentOrgId` JWT claim | Low (no policy enforcement yet) | 2-3 days |
| **1. Audit & inventory** | Skill's STEP 1 runs: confirm 60 models, list policies needed, scan for raw SQL gaps | Zero (read-only) | 1 day |
| **2. Schema changes** | Add `organizationId` to AuditLog/AgentCallLog/PipelineMemory/WebhookDeadLetter/ModelPerformanceStat. Backfill personal org for NULL agents. Add composite indexes. | Medium (data migrations) | 3-5 days |
| **3. Code wrapping** | Wire `withOrgContext` into all route handlers + worker handlers + cron handlers + raw SQL sites | Medium (mechanical but ~200 sites) | 5-7 days |
| **4. Policy migration (TENANT_DIRECT first)** | Enable RLS + policies on 14 TENANT_DIRECT models. Deploy to staging. Feature flag OFF in prod. | Low (flag off) | 2 days |
| **5. Staging verification** | Cross-tenant test suite, performance benchmarks, soak test | Low | 2-3 days |
| **6. Production cutover — TENANT_DIRECT** | Flip `RLS_ENFORCEMENT_ENABLED=true` in prod. Monitor. | HIGH | 1 day + 48h monitoring |
| **7. Policy migration (TENANT_INDIRECT)** | Same flow for 35 cascaded models | Medium | 1 week |
| **8. Policy migration (USER_OWNED)** | Same flow for 5 user-scoped models | Low | 2-3 days |
| **9. Cleanup** | Remove dead `app_user` superuser fallback. Document final architecture. | Low | 1 day |

**Total estimate**: 4-6 weeks for full schema, OR 1-2 weeks for just TENANT_DIRECT subset first.

**The skill itself** automates phases 1, 4, 5, 7, 8 (audit + verify + per-phase migration). Phases 0, 2, 3, 6, 9 require human + skill collaboration (cannot fully automate).

---

## 6. Three Viable Paths (USER MUST CHOOSE)

### Path A — Conservative incremental ("Crawl")

- Build skill that ONLY audits + verifies. No migration automation.
- Human writes migrations manually using skill's plan output.
- Manual deployment per phase.
- **Pro**: Lowest risk. Skill is dead simple.
- **Con**: Slow. ~6-8 weeks total.

### Path B — Pragmatic phased ("Walk") **← RECOMMENDED**

- Skill audits + generates migration SQL + verifies, but DOES NOT auto-apply migrations.
- Human reviews each migration before `prisma migrate deploy`.
- Feature flag controls enforcement.
- **Pro**: Skill does heavy lifting. Human keeps the kill switch.
- **Con**: ~4-6 weeks total.

### Path C — Aggressive automation ("Run")

- Skill audits + generates + applies migrations + runs tests + ramps up flag.
- Skill can rollback on test failures.
- Requires staging environment.
- **Pro**: Fastest — 2-3 weeks.
- **Con**: Highest risk. Skill makes decisions that could lock users out.

**I recommend Path B.** Path A wastes the skill's value. Path C is too aggressive for first RLS rollout on production data.

---

## 7. Open Questions for User

Before I write the implementation plan, I need answers to:

1. **Path A / B / C?** (Default: B)
2. **Tenant context propagation: A (JWT) / B (per-request wrapper) / C (AsyncLocalStorage) / D (hybrid)?** (Default: D)
3. **Database role architecture: B (app_user + postgres) / C (three-role)?** (Default: B)
4. **NULL org fix: A (current_user_id session var) / B (personal org backfill) / C (NOT NULL constraint)?** (Default: B)
5. **Staging environment exists?** Yes / No / Will create one. (Determines phase 5 viability)
6. **Tolerance for backfill downtime?** None / <1min / 5-10min / 30min+. (Determines migration strategy for large tables like Message, KBChunk)
7. **Is Sentry actively monitored?** (RLS lockouts will surface as 500s — need someone watching)

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Production lockout (empty result sets, app appears broken) | Medium | Critical | Feature flag + staged rollout per table |
| R2 | Silent cross-tenant leak (wrong policy) | Low | Critical | Cross-tenant test suite in staging, audit migration before apply |
| R3 | Performance collapse on RLS-enabled tables | High | High | Composite indexes BEFORE enabling RLS (mandatory phase 2 step) |
| R4 | BullMQ worker failures (missing org context) | High | Medium | Audit all 11 job handlers in phase 3 |
| R5 | Cron job silent failures (missing BYPASSRLS) | Medium | Medium | Dedicated cron role with documented BYPASSRLS |
| R6 | Webhook receivers can't write (anonymous, no user context) | High | Medium | HMAC-validated webhook resolves org from WebhookConfig before context set |
| R7 | Raw SQL ($queryRaw) bypasses extension | High | High | Audit all 22 raw SQL sites in phase 3, wrap or add `set_config` explicitly |
| R8 | Prisma $extends conflicts with $transaction | Medium | Medium | Document pattern: tenant context passed into $transaction explicitly |
| R9 | Edge runtime (NextAuth middleware) can't run Prisma | Low | Low | Middleware doesn't query DB today; not a blocker |
| R10 | Cache invalidation issues (Redis caches keyed by user, not org) | Low | Medium | Audit Redis cache keys in phase 1 |
| R11 | NULL org on personal agents leaks across users | Critical (existing bug) | High | Fix in phase 2 (backfill personal org) |
| R12 | Migration takes too long on large tables (Message, KBChunk) | Medium | Medium | Use `CREATE INDEX CONCURRENTLY`, batch migrations off-hours |

---

## 9. Skill Output Format (preview)

When user runs the skill, expected output structure:

```
[STEP 0] Pre-flight check
  ✓ Postgres version 16 confirmed
  ✓ pgvector extension present
  ✗ DATABASE_URL points to postgres superuser (warning)
  ✓ RLS_ENFORCEMENT_ENABLED feature flag exists
  ...

[STEP 1] Audit complete
  Total models: 60
  TENANT_DIRECT: 14
  TENANT_INDIRECT: 35
  USER_OWNED: 5
  GLOBAL: 5
  AMBIGUOUS: 2 (needs decision)
  
  Existing RLS: 8/60 models
  Schema changes needed: 5 models
  Composite indexes missing: 41
  Raw SQL sites needing review: 22

[STEP 2] Migration plan generated
  Output: prisma/migrations/draft/2026MMDD_rls_phase1_tenant_direct.sql
  Review the file before applying.

[STEP 3] (Requires confirmation) Apply migration
  Will run: prisma migrate dev --name rls_phase1_tenant_direct
  Continue? [yes/no]

[STEP 4] Verification
  ✓ All 14 TENANT_DIRECT tables have RLS enabled + FORCE
  ✓ All policies use set_config pattern (no user input)
  ✓ Composite indexes verified
  ✓ Cross-tenant test suite passed (10/10)
  ✓ Performance regression < 5% on baseline queries
```

---

## 10. Appendix A — Hallucination guard

This analysis was built from:
- Direct file reads of `prisma/schema.prisma`, both existing RLS migrations, `src/lib/db/rls-middleware.ts`, `src/lib/prisma.ts`, `src/lib/auth.ts`, `src/middleware.ts`, `src/lib/api/auth-guard.ts`, `docker-compose.yml`, `package.json`, `.env`
- 8 web searches against Anthropic docs, PostgreSQL docs, Prisma docs, AWS prescriptive guidance, multiple 2026 benchmark articles
- Counted models manually from schema.prisma (60 unique, grep gave 61 due to whitespace artifact)

**Known assumption**: Production Railway Postgres version is not pinned in repo — assumed v16 based on local dev. Will need to confirm in STEP 0 of the actual skill.

**Items I did NOT verify** (would require user help):
- Whether `RLS_ENFORCEMENT_ENABLED` feature flag is desired naming (vs `ENABLE_RLS` or similar)
- Whether staging environment currently exists
- Whether there's an SRE rotation actively watching Sentry
- Whether organization has a database backup/snapshot before each migration

---

## 11. Appendix B — Full model reference

See discovery scan output for the 60-model table with line numbers. Embedded summary above in §2. Full table available on request — moved to appendix to keep this doc under 500 lines.

---

## Next document

Once user picks Path A/B/C and decisions 1-4, I'll write `skill-rls-rollout-PLAN.md` with the concrete SKILL.md structure, scripts, and step-by-step migration sequence.

**End of analysis.**
