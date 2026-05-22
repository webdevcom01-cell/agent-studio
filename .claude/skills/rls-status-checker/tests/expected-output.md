# Expected Output — dry-run mode

Reference fixture for `/rls-status-checker --dry-run` as of 2026-05-22.
Used for smoke-testing the skill after any changes to SKILL.md.

## How to use

1. Run `/rls-status-checker --dry-run`
2. Compare the Phase Tracking and Drift Alert tables to this fixture
3. System Health values will differ (replicaId, HEAD sha change per deploy) — that is expected
4. Phase statuses should match unless a phase was completed since this fixture was written

---

## Expected: Phase Tracking

| Phase | Description | Status | Evidence |
|-------|-------------|--------|----------|
| 0a | withOrgContext $transaction | ✅ live | ≥1 match rls-middleware.ts |
| 0a.5 | HAL-8 NULL exploit hotfix | ✅ live | commit e9fd740 in log |
| 0a.6 | Sentry SQLSTATE 42501 | ✅ live | ≥1 match sentry.server.config.ts |
| 0a.7 | Full CI fix | ❌ | 0 matches ci.yml |
| 0b | app_user + admin_user roles | 🟡 | --dry-run: DB not checked; git log has commit 407b8d3 |
| 0b.5 | Refactor 5 raw helpers | ❌ | 0/5 files use withOrgContext |
| 0c | JWT currentOrgId claim | ❌ | 0 matches next-auth.d.ts |
| 0d | Personal org backfill | 🟡 | --dry-run: DB not checked |
| 0e | SET LOCAL hnsw in tx | ✅ live | ≥1 match search.ts |
| 0f | RLS_ENFORCEMENT_ENABLED flag | ❌ | 0 matches feature-flags/ |

**Expected ✅ count: 4** (0a, 0a.5, 0a.6, 0e)
**Expected ❌ count: 4** (0a.7, 0b.5, 0c, 0f)
**Expected 🟡 count: 2** (0b, 0d — DB unverifiable in dry-run)

---

## Expected: Drift Alerts (dry-run)

| Check | Status | Detail |
|-------|--------|--------|
| Commit drift (git vs Railway) | ✅ or ⚠️ | depends on Railway health response |
| Migration drift | ⚠️ skipped | --dry-run |
| CI failures on main | ✅ none | (expected — update if CI is red) |

---

## Update instructions

When a phase moves from ❌ to ✅, update:
1. The row in the Phase Tracking table above
2. The expected ✅/❌/🟡 counts
3. Add a note: `# Updated YYYY-MM-DD — Phase Xb.Y completed (commit <sha>)`

Do NOT update System Health values — those are intentionally variable.
