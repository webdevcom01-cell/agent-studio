# Regression eval suite — exact, grounded contract

A deterministic gate stops bad output at runtime; an **eval suite** stops a bad *change* before it
ships. Give every agent a small golden set (≥1 PASS + ≥1 BLOCK) so any future edit that breaks the
gate is caught. This is the single highest-leverage "enterprise" addition after the gate itself.

> Everything below is verified against the agent-studio codebase (`src/lib/evals/schemas.ts` +
> `src/app/api/agents/[agentId]/evals/**`) and live behaviour — not assumed. If the platform you're
> on differs, re-verify the routes before using.

## Two ways to create/run — try the first, fall back to the second
1. **MCP tools** `as_create_eval_case` / `as_run_eval` — simplest, BUT they require the env var
   `AGENT_STUDIO_API_KEY` and return **HTTP 401 "Invalid or expired API key"** when it's missing/stale.
   If you hit 401, do NOT retry — switch to path 2.
2. **Authenticated app REST API** (auth = `requireAgentOwner`, i.e. the logged-in owner's session —
   e.g. via the browser tools). This always works for the agent's owner. Endpoints below.

**Verification works regardless via `as_list_evals` (DB-direct, no API key)** — use it to confirm the
suite exists and the run finished, even if you created everything through the REST path.

## REST contract (verified from route handlers + zod schemas)

**Create suite** — `POST /api/agents/{agentId}/evals`
```json
{ "name": "<1–255 chars>", "description": "<optional ≤1000>",
  "runOnDeploy": true,            // auto-run this suite on every flow deploy — recommended for regression
  "scheduleEnabled": false, "scheduleCron": "0 3 * * *" }   // optional scheduled runs
```
Returns the created suite (`data.id` = suiteId). Per-agent suite limit applies.

**Add a test case** — `POST /api/agents/{agentId}/evals/{suiteId}/cases`
Body = `EvalTestCaseInputSchema`:
```json
{ "label": "<1–255>", "input": "<the user message to send the agent>",
  "assertions": [ { "type": "contains", "value": "..." } ],   // 1–20 assertions
  "tags": [], "order": 0 }
```

**Run** — `POST /api/agents/{agentId}/evals/{suiteId}/run` — **empty body**. Requires ≥1 case (else
`422 "Cannot run an empty eval suite"`). Runs via the BullMQ worker; returns `runId`/`jobId`. (The
worker must be running — a dead worker means runs never complete.)

**Result** — `GET /api/agents/{agentId}/evals/{suiteId}/run/{runId}` → `{ totalCases, passed, failed,
score, results:[{input, actualOutput, passed, score}] }`. Or just confirm via `as_list_evals`
(`lastRunScore`, `lastRunStatus`).

## Assertion types available (verified — `EvalAssertionSchema`, a discriminated union on `type`)
- **Deterministic:** `exact_match`, `contains`, `icontains` (case-insensitive), `not_contains`,
  `regex`, `starts_with`, `json_valid` — all `{type, value}` except `json_valid` = `{type}` only.
- **Semantic / LLM-as-judge:** `semantic_similarity`, `llm_rubric`.
- **RAG / grounding:** `kb_faithfulness`, `rag_faithfulness`, `rag_context_precision`,
  `rag_answer_relevancy`, `relevance`.
- **Webhook:** `webhook_response_valid`, `webhook_payload_echoed`.

Start with deterministic (`contains` / `not_contains` / `json_valid`) — they're stable and free. Add
`llm_rubric` / `rag_faithfulness` only when you need semantic/grounding judgement.

## The golden set for a deterministic-gate agent (content-agnostic, stable)
The gate's two outcomes are stable strings, so assert on THEM, not on volatile content:

**BLOCK case (most important):**
- `label`: `"block-bad-input"`
- `input`: the same deliberately-bad input from your smoke test (`{}` / `{"x":"no core field"}` /
  a payload with the core field = `"N/A"`).
- `assertions`: `[{ "type": "contains", "value": "BLOCKED" }]`
  — the error-emitter always emits `{"status":"BLOCKED",...}`; if a future edit breaks the guard,
  this case fails.

**PASS case:**
- `label`: `"pass-valid-input"`
- `input`: a realistic valid input.
- `assertions`: `[{ "type": "not_contains", "value": "BLOCKED" }]`
  — a passed output is the real payload, never a BLOCKED verdict. Content-agnostic.

> ⚠️ **Gotcha (learned by running an eval live):** an eval grades the agent's WHOLE assistant message
> stream — that includes the `ai_response` processor's RAW output (the model usually wraps JSON in
> ```` ```json ```` fences) PLUS the final `message` node. So the combined text is NOT valid JSON,
> even though the agent's *final* message is. **Do NOT use `json_valid` / `exact_match` / `starts_with`
> on a gate-flow response** — they grade the whole stream and false-fail (we hit exactly this: a
> `json_valid` case failed while the agent was perfectly fine). Use `contains` / `not_contains` on
> stable markers (like `BLOCKED`) — they match anywhere in the stream. Note: `as_chat_with_agent`
> returns only the LAST message, so the agent *looks* clean there — the eval is stricter. Don't be fooled.

> **Agent type matters for the BLOCK case.** For **input-driven agents** (a payload decides pass vs
> block — e.g. a content/repurposer), the BLOCK case above is deterministic: feed bad input, expect
> `BLOCKED`. For **data-dependent agents** (a web-scanner whose outcome depends on live search results,
> not on the input) you can't force a BLOCK via input — instead assert on invariants true in BOTH
> outcomes: `{ "type": "not_contains", "value": "[object Object]" }` (never leaks an unstringified
> object) and `{ "type": "not_contains", "value": "AI_ERROR" }` (never leaks a raw error). Those are
> real regression guards that don't depend on what the web returned that minute.

## Procedure (what the skill does)
1. After smoke passes, build the two cases above from the smoke inputs you already have.
2. Create the suite (`runOnDeploy: true`), add both cases, run it — via MCP if available, else REST.
3. **Verify with `as_list_evals`**: confirm the suite shows `caseCount ≥ 2`, `lastRunStatus: COMPLETED`,
   and `lastRunScore` (ideally 1.0). A scaffold isn't "regression-safe" until this is green.
4. Report the suite id + score. Tell the user: this suite now re-runs on every deploy (`runOnDeploy`).
