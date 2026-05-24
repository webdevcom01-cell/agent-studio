# ADR-0001: AgentCard RLS Classification (TENANT_INDIRECT via EXISTS)

**Date:** 2026-05-24
**Status:** Accepted

## Context

`AgentCard` has no `organizationId` column (confirmed: `prisma/schema.prisma` line 675–682).
It is a strict 1:1 with `Agent` via `agentId String @unique`, with `onDelete: Cascade`.

The Phase 1 cutover runbook (`docs/rls-phase-1-cutover-runbook.md` §2.3) classifies
`AgentCard` as `TENANT_DIRECT`, which is the standard 4-policy template used for
migrations #1–#11 — all of which have an `organizationId` column that RLS policies
can reference directly. `AgentCard` does not satisfy that precondition.

Additionally, `AgentCard` has an `isPublic` field used for A2A cross-org discovery.
Public cards must remain readable without an org context (e.g. `prismaRead` queries
from unauthenticated A2A endpoints). This is the same pattern flagged for `Agent`
and `Template` in §3.3 of the runbook.

## Decision

Implement `AgentCard` RLS as **TENANT_INDIRECT**: SELECT policy uses
`"isPublic" = true OR EXISTS (SELECT 1 FROM "Agent" WHERE id = agentId AND organizationId = current_setting(...))`;
INSERT/UPDATE/DELETE use the EXISTS clause only.

No `organizationId` column is added to `AgentCard`.

## Consequences

**Good:**
- No schema migration or Prisma model change required.
- `agentId @unique` means the EXISTS subquery is a single-row PK lookup — O(1), no index needed.
- Public cards remain readable cross-org without org context (A2A discovery works immediately).

**Bad:**
- Doc drift: runbook §2.3 still lists `AgentCard` as `TENANT_DIRECT` — must be corrected (Korak 2).
- Introduces a second RLS classification pattern in Phase 1; future readers must understand both.
- Gap until Migration #14: `AgentCard` includes inside `prismaRead.agent.findMany` (discover route)
  run without `current_org_id` set; private cards return `null` for the `agentCard` include until
  Agent gets `withOrgContext` in #14. Callers already handle `agentCard: null` gracefully.

**Neutral:**
- `upsertAgentCard` (the only direct write) is wrapped in `withAdminBypass` — consistent with
  other fire-and-forget system writes; relies on `DATABASE_URL` BYPASSRLS (same assumption
  as tech-debt #6).

## Alternatives considered

**Option A — Add `organizationId` to `AgentCard`:** Would align with TENANT_DIRECT template
and eliminate the subquery. Rejected because `AgentCard:Agent` is 1:1 with a UNIQUE FK;
denormalizing `organizationId` adds a redundant column with no query benefit, and requires
a backfill migration plus Prisma schema change for a table that has zero independent access
patterns — every read already goes through the parent `Agent`.
