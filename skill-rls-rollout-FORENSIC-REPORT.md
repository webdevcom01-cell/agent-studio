# Skill 2 RLS Rollout — Forensic Analysis Report

**Date**: 2026-05-18
**Verifier**: Independent forensic agent (separate context from plan author)
**Target documents**:
- `skill-rls-rollout-ANALYSIS.md`
- `skill-rls-rollout-PLAN.md`
- `skill-rls-rollout-PLAN-REVIEW.md`
**Verdict**: Plan is directionally correct BUT contains 12 factual hallucinations and missed 18 critical gaps. **Cannot proceed to skill build without 1-2 days of plan revisions.**

---

## 1. Executive Summary — 6 biggest issues found

1. **`withOrgContext` is fundamentally broken (CRITICAL).** The existing helper at `src/lib/db/rls-middleware.ts:67-75` does NOT wrap in `$transaction`. It calls `$executeRawUnsafe` then `fn(client)` separately. With Postgres connection pooling, the `set_config` and the subsequent query may run on different connections. The session variable evaporates. Plan's §1.1 and §6.2 both assume this works correctly — it doesn't.

2. **GDPR endpoints `/api/user/export` and `/api/user/account` were never mentioned in the plan.** Both do cross-tenant scans. Under RLS, they will silently return empty data — a compliance regression that won't surface in testing if QA doesn't think to verify.

3. **Admin routes (`/api/admin/flags`, `/admin/jobs`, `/admin/stats`) and `ADMIN_USER_IDS` envvar at `src/lib/api/auth-guard.ts:208` are cross-tenant by design.** The plan never discusses them. They will silently 500 under RLS.

4. **CI uses `pnpm db:push`, not `prisma migrate deploy`.** RLS migrations are NEVER applied in the CI test database. The plan's STEP 4 staging verification assumes migrations land — they don't, even today.

5. **A pre-existing latent bug in `src/lib/knowledge/search.ts:201`**: `SET LOCAL hnsw.ef_search` runs OUTSIDE a transaction. Same root cause as `withOrgContext`. Should be fixed in the same workstream.

6. **Hallucination: "60 models"** — actual count from `grep -c "^model " prisma/schema.prisma` is **61**. The analysis doc handwaves this as "whitespace artifact" but that's wrong.

---

## 2. Hallucinations identified (claims in plan that are WRONG)

| # | Hallucination | Where | Reality | Severity |
|---|---------------|-------|---------|----------|
| HAL-1 | `withOrgContext` wraps in `$transaction` | ANALYSIS §1.3 code sample | Does NOT use `$transaction`. Calls `$executeRawUnsafe` then `fn(client)` separately | CRITICAL |
| HAL-2 | "60 Prisma models" | All three docs | Actual: 61 | LOW |
| HAL-3 | "22 raw SQL sites" / "21 raw SQL sites" | PLAN §8 R7, REVIEW Error 1 | Correct: **22 files, 70 statements** | LOW |
| HAL-4 | "11 BullMQ handlers" without per-handler tenancy analysis | ANALYSIS §0 | 11 confirmed, but `budget.monthly.reset` + `governance.timeout` are explicitly cross-tenant | MEDIUM |
| HAL-5 | "7 cron routes" | ANALYSIS §0 | Actual: **10 routes** use `CRON_SECRET` auth (7 in `cron/` + 3 more: `/evals/scheduled`, `/skills/evolve`, `/ecc/ingest-skills`) | MEDIUM |
| HAL-6 | "9+ `$transaction` sites" | ANALYSIS, REVIEW | Actual: **14 across 12 files** | LOW |
| HAL-7 | Production deploys to Railway only | ANALYSIS §1.1, PLAN §10 | Code references **Vercel Cron** in middleware (line 54) + `maxDuration` exports = Vercel hints. Codebase is dual-target | MEDIUM |
| HAL-8 | Existing NULL policy "lets any user see all NULL agents" — diagnosis incomplete | ANALYSIS §1.4 item 1 | Bug is real, but `current_setting('app.current_org_id', true)` returns NULL (not '') when never set since PG 14. The `IS DISTINCT FROM ''` check is brittle | MEDIUM |
| HAL-9 | `pgvector` queries don't use session config today | ANALYSIS implicit | `src/lib/knowledge/search.ts:201` uses `SET LOCAL hnsw.ef_search` — outside transaction, so it's a latent bug | HIGH |
| HAL-10 | Tests will mostly break under RLS | PLAN §10 implicit | 299 test files exist, mostly mocked Prisma. Unit tests safe. Only E2E (Playwright) at risk | LOW (good news) |
| HAL-11 | `RLS_ENFORCEMENT_ENABLED` env var exists | PLAN §6 STEP 0 | Doesn't exist anywhere in repo. STEP 0 pre-flight would always fail | MEDIUM |
| HAL-12 | NextAuth `signIn` callback would extend existing callback | PLAN §4.1 | No `signIn` callback exists in `src/lib/auth.ts`. Plan must add it from scratch | LOW |

---

## 3. Critical gaps the plan completely missed

### Severity ranking — must address before any rollout

| Rank | Gap | Impact | Plan section affected |
|------|-----|--------|----------------------|
| **#1** | **`withOrgContext` broken helper** | RLS won't work at all without patching this first | ALL — prerequisite |
| **#2** | **GDPR endpoints `/api/user/export` and `/api/user/account`** | Silent compliance regression | §4 must add |
| **#3** | **Admin routes (`/api/admin/*`) + `ADMIN_USER_IDS`** | Admins silently locked out | §2 Decision 2 needs three-role architecture |
| **#4** | **Public chat endpoint `/api/agents/[agentId]/chat` has NO auth** | Plan never describes RLS context for anonymous traffic | §3 STEP 1 must add |
| **#5** | **`isPublic` flag on Agent/Template/AgentCard/PipelineTemplate** | Marketplace features break | §7 migration ordering, policy templates |
| **#6** | **CI uses `db:push` not `migrate deploy`** | RLS migrations never tested in CI | §5.1 must add CI fix |

### High severity — address before scaling

| Rank | Gap | Impact |
|------|-----|--------|
| #7 | Existing NULL policy on Agent leaks personal agents | Data leak (mitigated only by superuser bypass) |
| #8 | `SET LOCAL hnsw.ef_search` outside transaction | Pre-existing latent bug, same root cause |
| #9 | Multi-replica deployment (`numReplicas = 2`) amplifies pool issues | Stateful session vars even more fragile across replicas |
| #10 | Redis cache keys not org-namespaced (`CACHE_PREFIX` in cache-handler) | DB RLS insufficient if cache leaks |
| #11 | KBChunk, AgentMemory, AnalyticsEvent — highest-row-count tables, deferred to Phase 2 | Highest perf risk deferred |
| #12 | AuditLog backfill is non-trivial — `resourceType` polymorphic | Plan's "add organizationId + backfill" approach needs detail |

### Medium/Low severity

| # | Gap |
|---|-----|
| #13 | `Organization` has no `ownerId` — personal-org backfill must create OrganizationMember with OWNER role |
| #14 | `Template.isPublic` enables cross-org import (`/api/templates/import`) — policy must allow `isPublic=true` reads |
| #15 | Middleware doesn't pin `runtime = 'edge'` |
| #16 | `prisma/seed.ts` only seeds GLOBAL model — safe but should be documented |
| #17 | NextAuth `signIn` callback doesn't exist — plan must add |
| #18 | `RLS_ENFORCEMENT_ENABLED` env var must be added to `.env.example` |

---

## 4. Verification matrix — by claim block

### Block A — File existence and content

| Item | Verdict | Evidence |
|------|---------|----------|
| Migration A path | ✅ CONFIRMED | 93 lines, only Agent table |
| Migration B path | ✅ CONFIRMED | 359 lines, 7 tables exactly as plan claimed |
| `rls-middleware.ts` exists | ✅ CONFIRMED | But helper is broken (HAL-1) |
| `prisma.ts` singleton | ✅ CONFIRMED | Plus undocumented `prismaRead` + `measureReplicationLag()` |
| `auth.ts` at exact path | ✅ CONFIRMED | 184 lines |
| 60 models | ❌ REFUTED | 61 |
| 9+ `$transaction` | ❌ REFUTED | 14 across 12 files |
| 22 raw SQL | ❌ AMBIGUOUS | 22 files / 70 statements |

### Block B — Prisma version

| Item | Verdict |
|------|---------|
| Prisma 6.19.3 | ✅ CONFIRMED |
| `$use` removed | ✅ CONFIRMED |
| `$extends` with `query.$allOperations` | 🟡 UNVERIFIABLE (no usage in repo) |
| `@prisma/adapter-pg` not wired | ✅ CONFIRMED |

### Block C — Postgres RLS specifics

| Item | Verdict |
|------|---------|
| `CREATE INDEX CONCURRENTLY` issue | 🟡 MOOT (existing migrations don't use it) |
| NULL policy bug | ✅ CONFIRMED (real data-leak) |
| No other session vars today | ❌ REFUTED (HAL-9 — pgvector uses SET LOCAL) |
| No tests set RLS context | ✅ CONFIRMED |
| pgvector + RLS untested | ✅ CONFIRMED gap |

### Block D — Auth and JWT

| Item | Verdict |
|------|---------|
| Session has only `{user: {id, onboardingCompleted}}` | ✅ CONFIRMED |
| Existing callbacks (jwt, session) | ✅ CONFIRMED + `signIn` missing |
| No switch-org endpoint | ✅ CONFIRMED |
| Middleware on edge | ❌ REFUTED (no `runtime = 'edge'` declaration) |

### Block E — Tests + CI

| Item | Verdict |
|------|---------|
| Test scripts in package.json | ✅ CONFIRMED |
| 299 test files | ✅ CONFIRMED |
| Tests would break under RLS | 🟡 NUANCED — only E2E at risk; unit tests are mocked |
| CI uses `pnpm db:push` not `prisma migrate deploy` | ✅ CONFIRMED (critical gap) |

### Block F — Operational

| Item | Verdict |
|------|---------|
| `RLS_ENFORCEMENT_ENABLED` exists | ❌ REFUTED |
| `prisma/seed.ts` exists | ✅ CONFIRMED — only seeds GLOBAL model |
| Dockerfile multi-stage with `migrate` stage | ✅ CONFIRMED |
| Railway with 2 replicas | ✅ CONFIRMED (amplifies session-var issue) |
| `CRON_SECRET` auth | ✅ CONFIRMED + Vercel Cron reference exists (HAL-7) |

### Block G — Schema details

| Item | Verdict |
|------|---------|
| 14 TENANT_DIRECT models | ✅ CONFIRMED |
| `Agent.organizationId` nullable | ✅ CONFIRMED |
| `Agent.userId` nullable | ✅ CONFIRMED |
| `AgentCallLog` cross-tenant fields | ✅ CONFIRMED |
| `AuditLog` no FK | ✅ CONFIRMED |
| `Organization` has no `ownerId` | ✅ CONFIRMED (gap #13) |

### Block H — Forgotten things (most damning)

| Item | Verdict |
|------|---------|
| GDPR endpoints | ❌ MAJOR GAP |
| Cross-tenant background jobs (`budget.monthly.reset`) | ❌ MAJOR GAP |
| Admin features + `ADMIN_USER_IDS` | ❌ MAJOR GAP |
| Public API / embed widgets / no-auth chat | ❌ MAJOR GAP |
| Marketplace / `isPublic` flag | ❌ MAJOR GAP |
| Redis tenant-namespacing audit | 🟡 PARTIAL (plan mentioned briefly) |

---

## 5. Recommended plan revisions — priority order

### Must-fix before any rollout (1-2 days work)

1. **Patch `withOrgContext` first as prerequisite, not as rollout step.** Add to plan as "Phase 0 prerequisite". Rewrite:
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

2. **Reconcile public/anonymous endpoints.** Plan §3 STEP 1 must include explicit handling for:
   - `/api/agents/[agentId]/chat` (public chat — resolve org from agent.organizationId or agent.userId)
   - `/api/agents/[agentId]/trigger/[webhookId]` (HMAC-validated webhook)
   - `/embed/*`, `/api/a2a/*`
   - Document: anonymous requests fetch the agent first (using admin role), then set org context, then use app_user

3. **Three-role architecture, not two.** Plan §2 Decision 2 must be:
   - `postgres` — migrations only
   - `app_user` — tenant-scoped requests
   - `admin_user` — BYPASSRLS, used when `ADMIN_USER_IDS` match
   - Optional `cron_user` — BYPASSRLS for cross-tenant jobs

4. **Add GDPR endpoint handling.** Plan §4 must add:
   - `/api/user/export` — use admin client, loop over user's org memberships, set context per org
   - `/api/user/account` — same pattern for deletion

5. **Add admin route handling.** Plan §4 must add:
   - `/api/admin/*` routes use `admin_user` client when `ADMIN_USER_IDS` envvar matches
   - Document explicit fall-through to `app_user` if admin check fails

6. **Fix CI.** Add to plan §5.1:
   ```yaml
   # .github/workflows/ci.yml — E2E job
   - run: pnpm prisma migrate deploy  # NEW — before pnpm db:push
   ```
   Plus add `RLS_ENFORCEMENT_ENABLED=false` to CI env so E2E tests run with flag off initially.

7. **Add `isPublic` policy clauses.** For Agent, Template, AgentCard, PipelineTemplate templates in plan §3 STEP 3:
   ```sql
   CREATE POLICY template_select ON "Template"
     FOR SELECT TO app_user
     USING (
       "organizationId" = current_setting('app.current_org_id', true)
       OR "isPublic" = true
     );
   ```

### Should-fix before scaling

8. **Personal org backfill must also create OrganizationMember.** Plan §0 Decision 3 default needs detail: when backfilling, create both `Organization` AND `OrganizationMember{userId, organizationId, role: 'OWNER'}`.

9. **Fix `SET LOCAL hnsw.ef_search`** in `src/lib/knowledge/search.ts:201` as part of same workstream. Same `$transaction()` wrap.

10. **Update all count numbers**: 60→61 models; 22 sites→22 files/70 statements; 9+→14 transactions across 12 files; 7 cron→10 cron-style.

11. **Add deploy-target reconciliation note.** Decide Railway-vs-Vercel cron. Update README accordingly.

12. **Add Redis tenant-namespacing audit** as parallel workstream (separate skill, future).

### Nice-to-have

13. Pin middleware runtime explicitly.
14. Add `RLS_ENFORCEMENT_ENABLED=false` to `.env.example`.
15. Re-verify `PipelineTemplate` classification.
16. Make Sentry monitoring a hard prerequisite in STEP 0.
17. Define `getRLSClient` helper concretely.

---

## 6. Updated risk register (additions to plan §8)

| ID | Risk (new from forensic) | Likelihood | Impact | Mitigation |
|----|--------------------------|------------|--------|------------|
| R13 | `withOrgContext` broken → RLS doesn't work after rollout | CERTAIN today | Critical | Patch helper first (revision #1) |
| R14 | GDPR endpoints silently return empty after RLS | High | Critical (compliance) | Admin-role escape hatch (#4) |
| R15 | Admin pages silently 500 | High | Critical (operability) | Three-role architecture (#3) |
| R16 | Public chat endpoint stops responding | High | High (user-facing) | Resolve org from agent record (#2) |
| R17 | Marketplace templates inaccessible | High | Medium | `isPublic` policy clauses (#7) |
| R18 | CI doesn't catch RLS regressions | Certain today | High | Add `migrate deploy` to CI (#6) |
| R19 | pgvector queries return wrong rows under RLS | Medium | High | Test explicitly in STEP 4 |
| R20 | Multi-replica session-var leakage | High under load | High | Mandatory `$transaction()` (covered by #1) |
| R21 | Redis cache cross-tenant leaks | Medium | High | Separate audit/workstream |
| R22 | Vercel vs Railway cron ambiguity | Low | Medium | Deploy-target reconciliation (#11) |

---

## 7. What the forensic agent verified that WAS correct

Plan is right about:
- Existing RLS migrations exist (Agent + 7 cascaded tables)
- Existing migrations are inert (app connects as superuser, bypassing RLS)
- Prisma 6 removed `$use`
- `$extends` is the way forward
- Tenant classifications for the 14 TENANT_DIRECT models
- Schema-change models (AuditLog, AgentCallLog, etc.)
- Hybrid rollback strategy is appropriate
- Single-skill structure with STEP 0-5 matches existing audit-verify pattern

Plan is also correct that this rollout is HIGH risk and worth 4-6 weeks if done properly.

---

## 8. Bottom line

The plan is **directionally correct** — the architecture, phased approach, and high-level decisions are sound. But the **detail layer has critical errors** that would cause production regressions:

- The starting point assumption (`withOrgContext` works) is false
- Three major code paths (GDPR, admin, public) are entirely unaccounted for
- CI doesn't enforce migrations the plan assumes are tested
- Number counts are mostly slightly off (cosmetic) but model count error (60 vs 61) is structural

**Time to incorporate findings**: 1-2 days of plan revisions.

**Cannot start STEP 1 (skill folder creation) until items 1-7 from §5 are addressed.** Items 8-12 can be done in parallel with skill build. Items 13-17 are pre-coding cleanup.

---

## Appendix — Files referenced

- `/Users/buda007/Desktop/agent-studio/src/lib/db/rls-middleware.ts` (broken helper, lines 67-75)
- `/Users/buda007/Desktop/agent-studio/src/lib/api/auth-guard.ts` (admin path, line 208)
- `/Users/buda007/Desktop/agent-studio/src/lib/gdpr/data-export.ts` (cross-tenant scan)
- `/Users/buda007/Desktop/agent-studio/src/lib/gdpr/account-deletion.ts`
- `/Users/buda007/Desktop/agent-studio/src/app/api/admin/` (cross-tenant admin routes)
- `/Users/buda007/Desktop/agent-studio/src/app/api/user/export/route.ts`
- `/Users/buda007/Desktop/agent-studio/src/app/api/user/account/route.ts`
- `/Users/buda007/Desktop/agent-studio/src/app/api/agents/[agentId]/chat/route.ts` (public, no auth)
- `/Users/buda007/Desktop/agent-studio/src/lib/knowledge/search.ts:201` (pre-existing SET LOCAL bug)
- `/Users/buda007/Desktop/agent-studio/.github/workflows/ci.yml` (db:push, not migrate deploy)
- `/Users/buda007/Desktop/agent-studio/railway.toml` (2 replicas)
- `/Users/buda007/Desktop/agent-studio/prisma/schema.prisma:119,679,1626` (isPublic flags)
- `/Users/buda007/Desktop/agent-studio/src/lib/queue/worker.ts` (11 handlers, 2 cross-tenant)
- `/Users/buda007/Desktop/agent-studio/src/types/next-auth.d.ts` (Session/JWT types — no currentOrgId)

**End of forensic report.**
