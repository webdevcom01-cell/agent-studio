# Incident — Chat 500 after `RLS_ENFORCEMENT_ENABLED=false` (2026-06-27)

## Summary
Turning the prod feature flag `RLS_ENFORCEMENT_ENABLED` from `true` → `false`
(plus redeploy) coincided with **all agent chat going down** (HTTP 500 for every
agent), even though `/api/health` stayed green. Reverting the flag to `true`
(plus redeploy) fully restored chat. Net user-facing downtime: a few minutes
during a controlled test.

## Timeline (UTC)
- ~15:43 — flag=`true`. Chat working (Content Creator produced real content).
- ~20:0x — flag flipped to `false` + redeploy. Chat returns 500 for **all**
  agents (Content Creator, Lead Scorer; both Claude and OpenAI models).
- 500s leave **no `AgentExecution` and no agent-call-log record** → failure is
  at the **route level, before flow execution begins**.
- `/api/health` green throughout (db ok, redis ok).
- ~20:16 — flag reverted to `true` + redeploy (replica f3e121e1 / deploy 53e287b6).
- ~20:18 — chat verified working again (Lead Scorer + Content Creator both
  returned normal HTTP 200; confirmed in Deploy Logs of 53e287b6).

## Root cause — UNKNOWN (earlier hypothesis refuted)
**Verified from code:**
- The only code that branches on `rls-enforcement` is `withOrgContext`
  (`src/lib/db/rls-middleware.ts`). grep confirms no other consumer.
  - flag **true**  → wraps `fn` in `client.$transaction(...)`.
  - flag **false** → runs `fn(client)` directly (no transaction).
- Route-level pre-execution path: `loadContext` → `withTenant` →
  `withOrgContext` (`src/lib/api/tenant-context.ts`).

**Earlier hypothesis (connection-pooler / prepared-statement) — REFUTED:**
Deploy Logs of 53e287b6 show the datasource is a **direct** connection:
`postgres.railway.internal:5432` (NOT pgbouncer / not a pooled endpoint).
So the "prepared statement already exists outside a transaction" mechanism does
**not** apply. The reason flag=false produced route-level 500s is therefore
**not yet explained.**

**Other facts from the working deploy's logs (53e287b6):**
- `39 migrations found` → `No pending migrations to apply.` (migrations clean —
  not a migration-state failure).
- Redis connected (proxy: `ballast.proxy.rlwy.net`). DB direct.
- nodeVersion `v20.20.2` (note: CLAUDE.md expects Node 22 — minor, builds fine).
- A Railway **platform incident** ("Deployments may be slow to go out") was
  active during this window — possible (unconfirmed) contributor to the
  flag=false deploy behaving badly.

**To actually diagnose:** open the **previous (flag=false) deployment's** Deploy
Logs (NOT the active one) and find the thrown error on a chat 500. Until then the
cause is genuinely undetermined — do not assert a mechanism.

## Resolution
Reverted `RLS_ENFORCEMENT_ENABLED` to `true`. Chat restored. Verified in logs.

## Decisions / operational rules
1. **Keep `RLS_ENFORCEMENT_ENABLED=true`.** Do not turn it off in prod without
   first capturing the flag=false deploy's error log — last time it took chat
   down for an unexplained reason.
2. **Not blocking for the real RLS cutover.** The cutover keeps the flag `true`
   (enforcement requires it) and only changes the DB role (`DATABASE_URL` →
   non-bypass `app_user`). It does not exercise the flag=false path.
3. The "turn the flag off to save transaction overhead" idea is **withdrawn**
   (unsafe for an unknown reason; and we never need it off).

## Side finding — Anthropic WORKS (earlier claim corrected)
Initially concluded "Anthropic does not work" from the execution-preview message
"I couldn't generate a response." **That was wrong.** Deploy Logs of 53e287b6
show:
- A `gen_ai.generate` span (22:18:31 CEST): `gen_ai.system: claude`,
  `request.model: claude-haiku-4-5-20251001`, `finish_reason: stop`, output
  tokens present → the Claude call **succeeded**.
- Startup warnings list Google/Groq/Mistral/Moonshot as "not set" but **NOT**
  Anthropic → `ANTHROPIC_API_KEY` **is set** on the service.
So Anthropic is functional. The agent-level "I couldn't generate a response" for
the test run is a separate flow/output-parsing quirk (the test prompt "PONG"
didn't match the JSON the Content Creator flow expects), not a model/key failure.
No production agent uses an Anthropic model regardless (all on `gpt-4.1-mini`).

## Pending (owner actions)
- [ ] Rotate the exposed `ANTHROPIC_API_KEY` for **security** (it is valid +
      exposed). Replacing it with a fresh key keeps Anthropic working; no
      production agent depends on it, so zero functional impact either way.
- [ ] (Optional) Open the previous flag=false deployment's Deploy Logs to find
      the real 500 cause, so the flag could one day be toggled safely.
