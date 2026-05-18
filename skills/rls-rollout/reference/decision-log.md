# RLS Rollout — Decision Log

Append-only log of every architectural and operational decision made during
the RLS rollout. New entries go at the BOTTOM.

Format per entry:
- Date
- Phase
- Decision
- Rationale
- Outcome (filled in after observation)
- Decided by

---

## 2026-05-18 — Skill v1.0.0 initial release

- **Phase**: Pre-Phase 0
- **Decision**: Build RLS rollout skill following Path B (Pragmatic phased):
  skill generates SQL drafts, human applies migrations
- **Rationale**: User retains kill switch. Avoids skill making destructive
  decisions on production data.
- **Outcome**: (pending — see Phase 0 results)
- **Decided by**: @buky + forensic analysis

## 2026-05-18 — Three-role architecture

- **Phase**: Pre-Phase 0
- **Decision**: Use 3 DB roles instead of 2:
  - `postgres` — migrations only
  - `app_user` — tenant-scoped requests (no BYPASSRLS)
  - `admin_user` — cross-tenant operations (BYPASSRLS)
- **Rationale**: Forensic analysis found admin routes, GDPR endpoints, and 2
  BullMQ jobs are cross-tenant by design. Two-role architecture would silently
  break them.
- **Outcome**: (pending)
- **Decided by**: @buky based on forensic gaps #2 + #3

## 2026-05-18 — Personal org backfill (Option B)

- **Phase**: 0d
- **Decision**: Backfill personal Organization per user with NULL-org agents.
  Each user gets `org_personal_<userId>` + `OrganizationMember(role: OWNER)`.
- **Rationale**: Eliminates dual-tenancy code path. Removes existing data-leak
  bug (any user sees all NULL-org agents).
- **Outcome**: (pending)
- **Decided by**: @buky

## 2026-05-18 — Hybrid rollback (4 layers)

- **Phase**: All phases
- **Decision**: Implement 4-layer rollback:
  1. Feature flag `RLS_ENFORCEMENT_ENABLED=false` (no DB change)
  2. Per-table escape `RLS_DISABLED_TABLES=...`
  3. Migration revert via Prisma
  4. Nuclear `rollback.sh --nuclear` (manual SQL)
- **Rationale**: First two layers recover in seconds without deploy. Layers 3-4
  are for catastrophic failures.
- **Outcome**: (pending — will be exercised in staging)
- **Decided by**: @buky

## 2026-05-18 — isPublic marketplace clause

- **Phase**: Templates (affects Phase 1+2)
- **Decision**: SELECT policy on Agent, Template, AgentCard includes
  `OR "isPublic" = true` to preserve marketplace cross-tenant reads.
- **Rationale**: Forensic found `isPublic` flag enables cross-org browsing —
  e.g., `/api/agents/discover`. Strict policy would break the feature.
- **Outcome**: (pending — verified by `public-routes.test.ts`)
- **Decided by**: @buky based on forensic gap #5

## 2026-05-18 — `withOrgContext` patch as Phase 0a

- **Phase**: 0a
- **Decision**: Patch `src/lib/db/rls-middleware.ts` to wrap in `$transaction`
  BEFORE any other RLS work.
- **Rationale**: Forensic CRITICAL #1 — current helper sets session var
  outside transaction, will silently fail with pool connections.
- **Outcome**: (pending — verified by audit.sh check #10)
- **Decided by**: @buky

---

## Template for new entries

```
## YYYY-MM-DD — <decision title>

- **Phase**: <0a, 0b, 1, 2, ...>
- **Decision**: <what>
- **Rationale**: <why>
- **Outcome**: <observed result after deployment>
- **Decided by**: <human handle>
```
