# Skill 2 RLS Rollout — Plan Self-Review (Zero-Tolerance Hallucination Check)

**Date**: 2026-05-18
**Reviewer**: Claude (reviewing own plan)
**Target**: `skill-rls-rollout-PLAN.md`
**Verdict**: Plan is sound but has 6 items needing user clarification + 2 items needing code-level verification before STEP 1 of implementation.

---

## ✅ VERIFIED — facts grounded in real artifacts

| Claim in plan | Evidence | Status |
|--------------|----------|--------|
| 60 Prisma models | Counted manually from schema.prisma | ✅ |
| Existing RLS on 8 tables (Agent + 7 cascaded) | Read both migration files | ✅ |
| `withOrgContext` exists in `src/lib/db/rls-middleware.ts` | Direct file read | ✅ |
| `withOrgContext` has 0 production call sites | grep returned empty | ✅ |
| Session JWT contains only `{ user: { id, onboardingCompleted } }` | Read `src/types/next-auth.d.ts` | ✅ |
| Singleton Prisma client, no $extends | Read `src/lib/prisma.ts` | ✅ |
| Postgres 16 + pgvector in local | `docker-compose.yml:81` | ✅ |
| Prisma 6.19.3 + adapter-pg installed but not wired | `package.json` + `src/lib/prisma.ts` | ✅ |
| `$transaction` used in 9+ sites | grep result | ✅ |
| 22 raw SQL sites | grep result (plan says "22+", consistent with discovery) | ✅ |
| `$use` removed in Prisma 6 | Prisma release notes + discovery agent note | ✅ |
| `$extends` GA since 4.16.0 | Prisma blog post | ✅ |
| `disable-model-invocation` field syntax | Anthropic Skill docs 2026 | ✅ |
| 500-line SKILL.md body guideline | Anthropic Skill docs 2026 | ✅ |
| Composite indexes reduce RLS overhead from 120ms→1.2ms | 2026 benchmark articles | ✅ |
| `current_setting('app.current_org_id', true)` syntax | PostgreSQL 16 docs | ✅ |
| `SET LOCAL` + `set_config(..., true)` are equivalent for txn-scoped vars | PG docs | ✅ |
| `CREATE POLICY ... TO role` syntax | PG docs | ✅ |

---

## ⚠️ NEEDS CODE-LEVEL VERIFICATION before STEP 1

### Issue 1 — `CREATE INDEX CONCURRENTLY` inside Prisma migration

**Concern**: Prisma migrations don't have an explicit "disable transaction" directive. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction.

**What I need to verify**:
- Does `prisma migrate deploy` wrap each `.sql` file in a single transaction?
- If yes, `CREATE INDEX CONCURRENTLY` will fail.
- Workaround: split index creation into a separate migration file, OR run indexes via a direct `psql` call outside of `prisma migrate deploy` (e.g., a manual deploy step).

**Action item**: Before STEP 1 of skill build, verify by reading Prisma docs and/or running a test migration. If CONCURRENTLY fails inside Prisma, the plan needs a tweak: split each migration into two files (a) policies, (b) indexes — apply policies via Prisma, apply indexes via direct psql.

### Issue 2 — Prisma `$extends` query method conflict with explicit `$transaction()`

**Concern**: From the Prisma RLS research:

> "Because the example extension wraps every query in a new batch transaction, explicitly running transactions with `$transaction()` may not work as intended. In a future version of Prisma Client, query extensions will have access to information about whether they are run inside a transaction, and when this is available, the example will be updated to work for queries run inside explicit transactions."

**What this means for us**: The `$extends` pattern I proposed in §4.3 of the plan will conflict with 9+ existing `$transaction()` sites in `src/`. Specifically, when code calls `prisma.$transaction(async tx => { ... })`, the `tx` client is a different proxy than `prisma`, and the extension may or may not propagate.

**Action item**: Test the extension against `src/app/api/agents/[agentId]/flow/route.ts:119` (one of the existing `$transaction` sites) BEFORE rolling out broadly. If conflict confirmed, fallback pattern is the AsyncLocalStorage approach where context is read INSIDE the transaction callback by the calling code itself.

---

## 🟡 ASSUMED — user needs to confirm

| Assumption | Where | Action |
|-----------|-------|--------|
| Production Postgres is v16 | §1.1 of analysis | STEP 0 of skill will check; user can verify in Railway dashboard |
| Staging environment exists or can be created | §10 of plan | User confirmation needed |
| Env var name `RLS_ENFORCEMENT_ENABLED` is acceptable | §6.1 of plan | User can rename if preferred |
| Env var name `DATABASE_MIGRATE_URL` is acceptable | §6.1 of plan | User can rename |
| Personal-org backfill is the right approach (vs adding `app.current_user_id` session var) | Decision 3 default in plan §0 | User can override |
| ~3 weeks total timeline | §9 of plan | Depends on user availability; user can stretch |
| Plan does not need to address Vercel-deployed routes (Railway-only assumption) | §1.1 confirms Railway | Verify nothing deploys to Vercel |
| pgvector queries (KBChunk, AgentMemory) compatible with RLS | §8 risk register | Need a quick test in STEP 0.5 |

---

## ❌ INCONSISTENCIES & ERRORS found in own plan

### Error 1 — "21 raw SQL sites" vs "22 raw SQL sites"

In §8 risk register I said R7 affects "21 raw SQL sites" but discovery report and STEP 1 say "22+". Standardize on the discovery agent's count: **22 production raw SQL sites** (outside __tests__).

**Fix**: Edit plan to be consistent.

### Error 2 — `phase 0.5` mentioned but not defined

§8 mentions "phase 0.5 — fix the buggy NULL handling on Agent" but the phase list in analysis §5 doesn't have a 0.5. The numbering in analysis is `0, 1, 2, ..., 9` and in plan §9 it's `Pre-flight, Phase 1, Phase 2, ...`. The NULL Agent fix should be in **Pre-flight (Phase 0)** of the rollout, NOT a "0.5".

**Fix**: Rename "phase 0.5" to "Pre-flight subsection 0.4 — fix existing NULL-org policy bug on Agent" in plan §8.

### Error 3 — Test pseudocode references non-existent `getRLSClient` function

In §4 of plan, `cross-tenant.test.ts` pseudocode calls `getRLSClient(orgA.id)`. This function doesn't exist; need to define it as a test helper. Suggested:

```typescript
async function getRLSClient(orgId: string): Promise<PrismaClient> {
  const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_APP_USER });
  // Caller responsibility: wrap subsequent calls in runWithTenant({ organizationId: orgId, ... })
  return client;
}
```

**Fix**: Add `getRLSClient` definition to test infrastructure plan.

### Error 4 — Agent migration ordering implies REPLACEMENT of existing policy

In §7 of plan, Agent is ordered #8 with note "REPLACE old policy with new one that handles NULL via userId". But the user already picked **Option B (backfill personal org)** which eliminates NULL entirely. If we backfill, the NULL handling becomes moot.

**Fix**: Update §7 to clarify: Agent policy gets simplified after backfill, not "replaced for NULL handling". The replacement is for cleanliness, not correctness.

### Error 5 — `model-classifications.json` schema undefined

§3 STEP 1 references writing `model-classifications.json` but doesn't specify the JSON schema. Without a schema, the downstream `generate-migration.ts` script can't be reliably built.

**Fix**: Add JSON schema example to STEP 1 output spec:

```json
{
  "models": [
    {
      "name": "Agent",
      "tenancy": "TENANT_DIRECT",
      "tenantColumn": "organizationId",
      "userColumn": "userId",
      "nullable": { "organizationId": true, "userId": true },
      "existingRLS": true,
      "compositeIndexes": ["Agent_organizationId_id_idx"],
      "rawSQLSites": []
    }
  ]
}
```

### Error 6 — Cron BYPASSRLS strategy not fully reconciled

§2 Decision 2 default says "Option B — app_user (no BYPASSRLS) + postgres (migrations + cron BYPASSRLS)". But §4.6 of plan says cron has two options: "loop tenants OR bypass". Plan §4.6 contradicts §2 Decision 2.

**Fix**: Pick ONE. Recommendation: Default to BYPASSRLS via postgres connection (Decision 2), with per-job ability to override and loop tenants if needed (for jobs that want defense-in-depth).

---

## 🔴 SECURITY ITEMS the plan does NOT solve

### Security gap 1 — JWT not signed for tenant claim

If we add `currentOrgId` to JWT and the app trusts it, an attacker could craft a JWT (or modify it client-side) with a different `currentOrgId` and switch tenants without server-side validation.

**Mitigation needed**: After parsing JWT, the API layer MUST re-validate that `userId` has membership in `currentOrgId` via DB lookup. Cannot trust the JWT claim alone for RLS context.

**Add to plan**: §4.4 should state: `resolveCurrentOrg(auth, req)` must call DB to confirm membership.

### Security gap 2 — Switch-org endpoint needs CSRF protection

`/api/users/switch-org` mentioned but no auth/CSRF protection specified.

**Fix**: Use same auth path as other state-changing routes (POST with `requireAuth`, CSRF token, rate limit).

### Security gap 3 — Tenant context leak via error messages

If a query fails because of RLS (`permission denied for table X`), the error message may reveal whether a row EXISTS in another tenant ("row not found" vs "permission denied" gives signal). 

**Mitigation**: Wrap RLS errors in a generic 403 at the API layer.

### Security gap 4 — pgvector RLS not tested

KBChunk and AgentMemory use `vector` type + HNSW indexes. RLS policies on these tables MAY interact with the vector index in unexpected ways (the query optimizer may skip the index or return wrong results).

**Action item**: STEP 4 verification must explicitly include a pgvector query test under RLS.

---

## 📝 NON-BLOCKING SUGGESTIONS

1. **Migration naming convention**: Plan uses `YYYYMMDD_rls_phaseN_<classification>`. Suggest also including the table count in name: `20260601_rls_phase1_tenant_direct_14tables`. Helps audit log readability.

2. **Decision log format**: §1 mentions `reference/decision-log.md` as append-only. Suggest format:
```markdown
## 2026-06-01 — Phase 1 cutover
- **Decision**: Enabled RLS on 14 TENANT_DIRECT tables
- **Outcome**: All cross-tenant tests passed
- **Performance**: p95 +2.3% on baseline queries
- **Issues**: None
- **Decided by**: @buky
```

3. **Skill versioning**: Plan should pin `skills/rls-rollout/SKILL.md` to a version (`v1.0.0`) like `audit-verify` is `v1.0.1`. Allows future bumps without breaking references.

4. **Auto-rollback threshold**: §5 STEP 5 runbook lists triggers but skill doesn't auto-rollback. Could add an optional `--auto-rollback` flag for STEP 4 that watches Sentry for X minutes and reverts if thresholds exceeded. Out of scope for v1 but document as future enhancement.

5. **Documentation cross-references**: ANALYSIS doc references PLAN, PLAN references ANALYSIS. Suggest adding `skill-rls-rollout-INDEX.md` that lists all related docs (ANALYSIS, PLAN, PLAN-REVIEW, eventually SKILL.md README). Same pattern as audit-verify had.

---

## 🎯 RECOMMENDED REVISIONS to PLAN before STEP 1 build

In order of importance:

1. **HIGH**: Resolve `CREATE INDEX CONCURRENTLY` inside Prisma migration uncertainty (Issue 1). May change skill's migration file layout.
2. **HIGH**: Define `model-classifications.json` JSON schema (Error 5).
3. **HIGH**: Reconcile Cron BYPASSRLS strategy (Error 6).
4. **HIGH**: Add Security gap 1-4 mitigations to plan §4.
5. **MEDIUM**: Fix Agent migration "replacement" wording (Error 4).
6. **MEDIUM**: Test `$extends` + `$transaction` conflict in a sandbox before committing to extension pattern (Issue 2).
7. **LOW**: Standardize the "22 raw SQL sites" count (Error 1).
8. **LOW**: Rename "phase 0.5" to "Pre-flight 0.4" (Error 2).
9. **LOW**: Define `getRLSClient` helper in test infrastructure (Error 3).

---

## 📊 Final verdict

| Aspect | Score | Notes |
|--------|-------|-------|
| Factual grounding | 9/10 | Direct file reads, web research; 1 count discrepancy |
| Architectural soundness | 8/10 | Two open concerns (CONCURRENTLY, $extends+txn) |
| Completeness | 7/10 | Missing JWT validation, error sanitization, pgvector test |
| Risk identification | 9/10 | 12 risks logged; 4 security gaps caught in review |
| Actionability for STEP 1 build | 7/10 | Needs revisions above before coding starts |

**Overall**: Plan is **80% production-ready**. Cannot start STEP 1 (skill folder creation) until items 1-4 above are addressed. Items 5-9 are pre-coding cleanup.

**End of review.**
