---
name: safe-agent-builder
description: >
  Scaffolds a NEW AgentStack agent with a DETERMINISTIC quality gate and anti-hallucination
  input-guard baked in by default — not the prompt-only guardrails that LLMs ignore. Builds the
  full flow (kb_search → processor → function-validator → condition-gate → pass/error emitters →
  terminal message nodes), wires the KB, and smoke-tests BOTH the happy path and a deliberately
  bad input to prove the gate fails closed. Use this whenever the user wants to "create an agent",
  "scaffold an agent", "build a new agent", "napravi/kreiraj agenta", "dodaj agenta u pipeline",
  "set up an AgentStack agent", or wants an agent that "won't hallucinate", "blocks bad output",
  "has a quality gate", or "is production-safe" — even if they don't say "deterministic" or "gate".
  Prefer this over plain scaffolding when safety, anti-hallucination, or fail-closed behavior matters.
  Do NOT use for debugging an existing agent (use a debugger skill) or editing one field
  (use as_patch_node_field directly).
---

# Safe Agent Builder

## Why this skill exists (read this first — it's the whole point)

Most agent scaffolding puts quality rules **in the prompt**: "NEVER fabricate stats", "emit
MALFORMED_PAYLOAD if input is missing". **LLMs ignore these when they 'want to help.'** Proven the
hard way: given an empty brief, a Hook Writer agent *invented a fake trend* and produced 5 posts
that passed every prompt-level check and reached the review queue. The prompt said "block bad
input" — the model fabricated instead.

The fix is **deterministic enforcement**: a `function` node (real code, runs every time) decides
PASS/BLOCK, a `condition` node routes, and a terminal `message` node surfaces the verdict. Code
doesn't get talked out of its rules. This skill builds that structure by default.

## The four non-negotiable rules (everything below serves these)

1. **Quality enforcement lives in a `function` validator, never only in the prompt.** The prompt
   guides; the validator decides. If a rule matters, it must be checkable in code.
2. **Every branch ends in a `message` node.** Only `ai_response`, `message`, and `call_agent`
   nodes emit output; `function` and `condition` emit nothing. Whatever runs last and emits is
   what surfaces. A branch ending on a `function` node silently leaks the raw upstream output.
3. **Guard the INPUT, not just the output.** Gates catch bad *format* and fabricated *numbers* but
   not a fabricated *topic*. So the validator must reject an empty / "N/A" / missing core input and
   a wrong item count — otherwise the LLM invents one and everything downstream faithfully spreads it.
4. **Fail closed.** A BLOCKED payload must lack the shape a downstream consumer saves/acts on, so a
   block is inert by construction (not "saved anyway").

## The standard safe-agent flow

```
kb_search ─→ [web_search?] ─→ processor (ai_response, → payload var)
                                   │
                              validator (function: parse + input-guard + format + banned + stat-trace)
                                   │   returns "PASS" or JSON [{rule,detail,severity:"error"|"warning"}]
                                   │
                                gate (condition: validator_result == "PASS")
                       ┌───────────┴────────────┐
                   PASS │                        │ ELSE
                pass-emitter (function:      error-emitter (function:
                 compute warning flags)       {status:"BLOCKED",violations,warnings})
                       │                        │
            [call_agent → downstream?]          │
                       │                        │
              pass-msg (message {{final}})  fail-msg (message {{error}})
```

Both leaves are `message` nodes (rule 2). On PASS with a downstream agent, the `call_agent` sits
between the emitter and `pass-msg` so the deepest agent's result bubbles up last.

## Workflow

Set up a task list, then:

### 1 — Collect the spec
Ask (one `AskUserQuestion` call): pipeline role (standalone / receives / sends / middle), model
(default `claude-sonnet-4-6`), web search (yes/no), and the **core input field** the agent must
receive (e.g. `trend`, `ticket`, `lead`) — this is what the input-guard protects. Derive a slug.

### 2 — Generate the processor prompt
Single `ai_response` processor. The prompt still states the quality rules (it helps the model aim
right) AND defines the exact output shape. But it does NOT carry enforcement alone — the validator
does. Keep CONFIDENCE + DATE conventions. Read `references/flow-templates.md` → "Processor prompt".

### 3 — Build the flow WITH the gate
This is the differentiator. Read `references/flow-templates.md` for the exact node + edge JSON and
the **validator code template** (parametrized by the core field, item count, banned list). Build:
kb_search → [web_search] → processor → validator → gate → {pass-emitter → [call_agent] → pass-msg}
/ {error-emitter → fail-msg}. Use `as_update_flow` (structural). **Back up first** with
`as_inspect_flow`.

### 4 — Verify the structure (mandatory, grounded)
Re-`as_inspect_flow`. Confirm: validator code contains the input-guard (`missing_<field>` +
`wrong_count`), the gate routes on `== "PASS"`, BOTH branches terminate in a `message` node, edge
count is right. If anything is off, STOP and fix — do not proceed.

### 5 — Wire the KB
Create the KB (UI or script), seed it, `as_patch_node_field` the `kb_search` `knowledgeBaseId`,
poll embedding to `ready`. (KB lives at `/knowledge/<agentId>`, not under "Memory".)

### 6 — Smoke-test BOTH cases (this is what makes it trustworthy)
- **Happy path:** a valid input → expect PASS → output surfaces (or downstream runs).
- **Bad input (the critical one):** send the empty / "N/A" / malformed input → expect a clean
  BLOCKED from THIS agent's `fail-msg` (look for the agent's own `status:"BLOCKED"` + your
  `missing_<field>`/`wrong_count` rule), NOT fabricated content and NOT a leaked raw payload.
  If the bad input produces content → the guard isn't wired right; fix before declaring done.
- **If the happy path BLOCKS unexpectedly** (a valid input that should pass gets blocked): suspect a
  validator reading an object/array variable — e.g. a `web_search` output — with `String()` instead
  of `JSON.stringify`. It silently becomes `"[object Object]"` and any grounding/substring check
  false-blocks 100% of the time. Add a temp debug returning a snippet of that variable to confirm,
  then coerce with the `asText()` helper. See `references/flow-templates.md` → "Gotcha".

### 7 — Generate a regression eval suite (golden set)
The gate stops bad *output* at runtime; an eval suite stops a bad *change* before it ships — so every
agent gets a small golden set that fails loudly if a future edit breaks the gate. Build it from the
two smoke inputs you already have. **Read `references/evals.md` for the exact, verified API contract**
— it matters which path you use: the MCP tools `as_create_eval_case`/`as_run_eval` need
`AGENT_STUDIO_API_KEY` and return 401 when it's missing, so fall back to the authenticated app REST
API (`POST …/evals`, `…/evals/{id}/cases`, `…/evals/{id}/run`). Two stable, content-agnostic cases:
- **BLOCK** — the deliberately-bad input → assertion `{ "type": "contains", "value": "BLOCKED" }`.
- **PASS** — a valid input → assertions `{ "type": "not_contains", "value": "BLOCKED" }` + `{ "type": "json_valid" }`.
Create the suite with `runOnDeploy: true` (re-runs on every deploy). **Verify with `as_list_evals`**
(DB-direct, always works): `caseCount ≥ 2`, `lastRunStatus: COMPLETED`, ideally `lastRunScore: 1`.
Not regression-safe until that's green. (Assert on the gate *outcome* — `BLOCKED`/not — never on
volatile content, which would fail for the wrong reason.)

### 8 — Report
Summarize: agent id, model, node/edge count, KB ready, **both** smoke results (PASS surfaced,
BAD blocked), and the eval suite id + last score. A scaffold isn't "done" until the bad-input case
blocks AND the eval suite is green.

## Safe-change discipline (applies to every flow write here)
- `as_inspect_flow` → **backup to a file** before any change.
- Prefer reading the real value and editing it (anchor-replace / exact edit + diff) over retyping
  long prompts/code — retyping a 6000-char prompt is how silent corruption sneaks in.
- `node --check` + a tiny functional test on validator code before applying it live.
- `as_patch_node_field` for one field; `as_update_flow` only for structure (full replace, no undo).
- Re-inspect after, and smoke the exact case you care about — verify behavior, not just "applied".

## Pre-flight checklist (paste into the final report)
- [ ] Quality enforcement is in the `function` validator, not only the prompt.
- [ ] Validator has an input-guard: reject empty/"N/A"/missing core field + wrong item count.
- [ ] Validator checks banned phrases + stat-traceability (numbers trace to input/source).
- [ ] `condition` gate routes on `validator_result == "PASS"`.
- [ ] BOTH branches end in a `message` node (no branch ends on a `function`).
- [ ] `kb_search` bound to a real, embedded-`ready` KB (if memory is needed).
- [ ] Backup taken; structure re-inspected; happy-path PASSES and bad-input BLOCKS in smoke.
- [ ] Regression eval suite created (≥1 PASS + ≥1 BLOCK), `runOnDeploy: true`, last run COMPLETED — verified via `as_list_evals`.

## References
- `references/flow-templates.md` — exact node/edge JSON, the parametrized validator code (with
  input-guard, banned, stat-trace), the emitter + message node templates, and the processor prompt
  skeleton. Read it in step 2–3.
- `references/evals.md` — the verified eval-suite API contract (MCP vs authenticated REST, the exact
  request bodies, all assertion types, and the content-agnostic golden-set design). Read it in step 7.
