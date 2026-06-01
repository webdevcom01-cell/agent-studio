# Flow templates — safe-agent-builder

All code here is the function-node body style AgentStack uses: it reads `variables`, and the value
is returned with `return`. Replace `{{PLACEHOLDERS}}` per agent. Every validator/emitter is plain
ES5-ish JS that runs in the sandbox (no external imports).

> Before going live: save the code to a file and run `node --check`, plus a tiny harness
> (`new Function("variables", code)` + a couple of sample payloads) to confirm it behaves. This is
> cheap insurance against a typo that a syntax check alone won't catch.

## ⚠️ Gotcha: reading variables that may be objects/arrays (learned the hard way)
A `web_search` node's output (and several other nodes') arrives in `variables` as an **array/object**,
NOT a string. `String(someArray)` returns `"[object Object],[object Object]"` — the URLs/fields are
GONE, so any `indexOf` / substring check against it silently fails. The validator still "runs" and
returns a verdict, so the bug is invisible: a grounding check that should PASS will **falsely BLOCK
every single time**. (This exact bug made a freshly-built scanner block 100% of grounded trends.)

**Always coerce with this helper before substring-matching any variable you didn't produce as a
string yourself** — search results, sub-agent outputs, KB context, mapped inputs:
```js
function asText(x){ if (typeof x === "string") return x; try { return JSON.stringify(x); } catch(e){ return String(x); } }
// then, e.g.:
var sr = asText(variables.search_results).toLowerCase();   // URLs/fields now present and searchable
```
When you smoke-test, if a "grounding"/"present in X" check blocks unexpectedly, this is suspect #1 —
add a temporary debug that returns `sr.slice(0,300)` and confirm the field you're matching is actually
there in stringified form.

---

## 1b. Grounding check for research / web-search agents (proven pattern)
For an agent that PRODUCES a claim with a `source_url` from `web_search`, the strongest
anti-hallucination check is: the cited source must actually appear in `search_results`. This blocks a
model that invents a plausible-but-ungrounded URL.
```js
var srRaw = variables.search_results;
var sr = (typeof srRaw === "string") ? srRaw : (function(){ try { return JSON.stringify(srRaw); } catch(e){ return String(srRaw); } })();
sr = (sr || "").toLowerCase();
var src = String((p.trend || p.result || {}).source_url || "").trim();
if (!sr || sr.length < 20) {
  v.push({ field: "all", rule: "no_search_results", detail: "search_results empty — cannot ground", severity: "error" });
} else if (src) {
  var dom = src.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  if (dom && sr.indexOf(dom) === -1) {
    v.push({ field: "source", rule: "source_not_in_results", detail: "domain '" + dom + "' not in search_results — possible fabrication", severity: "error" });
  }
}
```
Note the `srRaw` coercion — without it (using `String(srRaw)`), `search_results` stringifies to
`[object Object]` and this check false-blocks everything. See the Gotcha above.

**Also stat-check the claim text** (the angle/summary the agent writes), not just the source. Any
`%` / `x` / `times` figure the model states must appear in `search_results`, else it's invented:
```js
var STAT = /\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*x\b|\d+(?:\.\d+)?\s*(?:times|fold)\b/gi;
var srNum = sr.replace(/\s+/g, "");               // sr already coerced + lowercased above
var claim = String(p.angle || p.summary || "").toLowerCase();
var seen = {};
(claim.match(STAT) || []).forEach(function(s){
  var n = s.replace(/\s+/g, "");
  if (srNum.indexOf(n) === -1 && !seen[n]) { seen[n] = 1;
    v.push({ field: "claim", rule: "stat_not_in_results", detail: "'" + s.trim() + "' not in results — possible fabrication", severity: "error" }); }
});
```

> **Honest limit (learned by debugging this exact check):** stat-traceability catches *invented*
> numbers — a figure that appears nowhere in the results. It does NOT catch a real number used in
> the *wrong context* (e.g. the model quotes a personal anecdote's "80%" while implying it's a
> survey-wide stat). The number is traceable, so the check passes; the *misattribution* is only
> visible to a human who reads the source. Deterministic gates guarantee grounded source + no
> invented figures; **context/accuracy of the claim is irreducibly a human-review job.** Don't
> oversell what the gate proves.

---

## 1. Validator (the heart — deterministic gate)

Parametrize: `CORE_FIELD` (the input that must exist, e.g. `trend_context` / `ticket` / `lead`),
`ITEMS_KEY` (the output array, e.g. `posts` / `results`), `EXPECTED_COUNT`, `BANNED` regex.

```js
var raw = variables.{{PAYLOAD_VAR}} || "";           // e.g. agent_response
raw = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
var p;
try { p = JSON.parse(raw); }
catch (e) {
  var head = String(raw).slice(0, 80);
  // The agent may legitimately emit an error code as plain text — pass it through as an error.
  if (head.indexOf("BLOCKED:") === 0 || head.indexOf("MALFORMED_PAYLOAD:") === 0) {
    return JSON.stringify([{ field: "all", rule: "agent_error", detail: head, severity: "error" }]);
  }
  return JSON.stringify([{ field: "all", rule: "json_parse_error", detail: "cannot parse payload", severity: "error" }]);
}

var v = [];

// --- INPUT GUARD (rule 3): reject fabricated / absent core input ---
var core = (p.{{CORE_FIELD}} && (p.{{CORE_FIELD}}.title || p.{{CORE_FIELD}}.id || p.{{CORE_FIELD}})) || "";
var coreNorm = String(core).trim().toLowerCase();
if (!coreNorm || coreNorm === "n/a" || coreNorm === "na" || coreNorm === "none" || coreNorm === "unknown") {
  v.push({ field: "all", rule: "missing_{{CORE_FIELD}}", detail: "{{CORE_FIELD}} empty/N/A — fabricated or absent", severity: "error" });
}

var items = p.{{ITEMS_KEY}} || [];
if (!Array.isArray(items) || items.length !== {{EXPECTED_COUNT}}) {
  v.push({ field: "all", rule: "wrong_count", detail: (Array.isArray(items) ? items.length : 0) + "/{{EXPECTED_COUNT}}", severity: "error" });
}

// --- DETERMINISTIC CONTENT CHECKS ---
var BANNED = /\b(game[- ]?changer|game[- ]?changing|revolutionize|revolutionary|groundbreaking|paradigm shift|harness the power|unlock potential|enhance|enhances|enhanced|enhancing|boost|boosts|boosted|boosting|transform|transforms|transformed|transforming)\b/i;
// Exception: a banned verb followed by a measurable benefit is allowed ("boosted 40%").
var BANNED_OK = /\b(enhance\w*|boost\w*|transform\w*)\s+(?:by\s+)?\d+(?:\.\d+)?\s*(?:%|x|times|fold)/i;
var STAT = /\d+(?:\.\d+)?\s*[%x]|\d+(?:\.\d+)?\s*(?:times|fold)\b/gi;

// What numbers are allowed to appear: anything already in the core input + the angle/source.
var allowed = (JSON.stringify(p.{{CORE_FIELD}} || {}) + " " + (p.angle_used || p.angle || "")).toLowerCase().replace(/\s+/g, "");

for (var i = 0; i < items.length; i++) {
  var it = items[i];
  var id = it.platform || it.id || ("item" + i);
  // Flatten the item's text content (string or object of strings/arrays).
  var txt = "";
  var body = it.full_post != null ? it.full_post : it;
  if (typeof body === "string") { txt = body; }
  else if (body && typeof body === "object") {
    var parts = [];
    for (var k in body) { if (body.hasOwnProperty(k)) { var val = body[k]; if (typeof val === "string") parts.push(val); else if (Array.isArray(val)) parts.push(val.join(" ")); } }
    txt = parts.join(" ");
  }

  if (BANNED.test(txt) && !BANNED_OK.test(txt)) {
    var m = txt.match(BANNED);
    v.push({ field: id, rule: "banned_phrase", detail: (m ? m[0] : "?"), severity: "error" });
  }

  // Stat-traceability: a number in the output not present in the core input is a possible fabrication.
  var stats = (txt.toLowerCase().match(STAT) || []);
  for (var s = 0; s < stats.length; s++) {
    var nm = stats[s].replace(/\s+/g, "");
    if (allowed.indexOf(nm) === -1) {
      v.push({ field: id, rule: "stat_introduced", detail: stats[s].trim(), severity: "warning" }); // warning = surfaces as ⚠, does not block
    }
  }

  // --- ADD per-item format checks here (length limits, required sub-fields, verbatim opener, etc.) ---
}

// errors block; warnings do not.
var blocking = v.filter(function (x) { return x.severity !== "warning"; });
if (blocking.length === 0) return "PASS";
return JSON.stringify(v);
```

Notes:
- Keep `severity:"warning"` for soft signals (e.g. an introduced stat the reviewer should verify) —
  they surface as a ⚠ flag but don't block. Reserve `"error"` for things that must not pass.
- The validator returns the **string** `"PASS"` or a JSON array. The gate compares to `"PASS"`.

## 2. Gate (condition node)
```json
{ "id": "{{slug}}-gate", "type": "condition", "position": {"x":0,"y":660},
  "data": { "label": "Gate: Pass or Block",
    "branches": [ { "id": "branch-pass", "variable": "{{slug}}_gate_result", "operator": "equals", "value": "PASS" } ] } }
```
Edge `sourceHandle: "branch-pass"` → pass-emitter; edge `sourceHandle: "else"` → error-emitter.

## 3. Pass-emitter (function) — compute warning flags, keep payload
```js
var raw = variables.{{PAYLOAD_VAR}} || "";
try {
  var s = raw.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
  var p = JSON.parse(s);
  // (Optional) re-run the warning scan to attach quality_flags per item for the reviewer UI.
  // ... push {rule, detail, severity:"warning"} onto each item.quality_flags ...
  return JSON.stringify(p);
} catch (e) { return raw; }
```
Output variable: `{{slug}}_final`.

## 4. Error-emitter (function) — clean BLOCKED verdict
```js
var raw = variables.{{slug}}_gate_result || "[]";
var v; try { v = JSON.parse(raw); } catch (e) { v = []; }
var errors = v.filter(function (x) { return x.severity !== "warning"; });
var warnings = v.filter(function (x) { return x.severity === "warning"; });
return JSON.stringify({ status: "BLOCKED", agent: "{{agent_name}}", reason: "QUALITY_GATE_FAIL", violations: errors, warnings: warnings });
```
Output variable: `{{slug}}_error`.

## 5. Terminal message nodes (rule 2 — both branches MUST end here)
```json
{ "id": "{{slug}}-pass-msg", "type": "message", "position": {"x":0,"y":1140},
  "data": { "label": "Pass Output", "message": "{{" }}{{slug}}_final{{ "}}" } } }
{ "id": "{{slug}}-fail-msg", "type": "message", "position": {"x":400,"y":1140},
  "data": { "label": "Block Output", "message": "{{" }}{{slug}}_error{{ "}}" } } }
```
(The `message` value is the literal template string `{{slug}}_final` / `{{slug}}_error` wrapped in
double braces — write it as the engine's `{{variable}}` syntax.)

## 6. Edges (standard, no web_search, no downstream)
```json
[
 {"id":"e-kb-proc","source":"kb_search-{{slug}}","target":"{{slug}}-processor"},
 {"id":"e-proc-val","source":"{{slug}}-processor","target":"{{slug}}-validator"},
 {"id":"e-val-gate","source":"{{slug}}-validator","target":"{{slug}}-gate"},
 {"id":"e-gate-pass","source":"{{slug}}-gate","target":"{{slug}}-pass-emitter","sourceHandle":"branch-pass"},
 {"id":"e-gate-else","source":"{{slug}}-gate","target":"{{slug}}-error-emitter","sourceHandle":"else"},
 {"id":"e-pass-msg","source":"{{slug}}-pass-emitter","target":"{{slug}}-pass-msg"},
 {"id":"e-fail-msg","source":"{{slug}}-error-emitter","target":"{{slug}}-fail-msg"}
]
```
- Add `web_search` between `kb_search` and `processor` if needed (re-route those two edges).
- Pipeline (downstream): insert `call_agent-{{slug}}` between `pass-emitter` and `pass-msg`
  (edges `pass-emitter → call_agent` and `call_agent → pass-msg`), with
  `inputMapping:[{key:"last_message", value:"{{slug}}_final"}]` and a real `targetAgentId`.

## 7. Processor prompt skeleton
The prompt should aim the model right and define the exact output JSON — but remember enforcement
is the validator's job, so keep the prompt about *intent and shape*, not about being the safety net.
```
You are {{agent_name}}. Today is {{current_date}}.

## Role
{1–2 sentences: purpose, domain, what the output is for}
{If pipeline: "Pipeline: {upstream} → YOU → {downstream}"}

## Memory
{{kb_context}}

## Input
You receive JSON. The core field is `{{CORE_FIELD}}`. If it is missing or "N/A", do NOT invent one —
emit MALFORMED_PAYLOAD: missing {{CORE_FIELD}}. (The validator enforces this deterministically too.)

## Task
1. {domain step}
2. Produce exactly {{EXPECTED_COUNT}} items in `{{ITEMS_KEY}}`.
3. Every number must come from {{CORE_FIELD}} or the provided source — never invent statistics.

## Output (ONLY valid JSON)
{ "{{CORE_FIELD}}": {<passthrough>}, "{{ITEMS_KEY}}": [ ... {{EXPECTED_COUNT}} items ... ],
  "confidence": "...", "date": "{{current_date}}" }
```

## 8. Smoke inputs to use in step 6
- **Happy path:** a realistic valid payload with a real `{{CORE_FIELD}}` and enough data.
- **Bad input (must block):** `{}` or `{"note":"no core field"}` or a payload with
  `{{CORE_FIELD}}.title:"N/A"`. Expect: `{"status":"BLOCKED","agent":"{{agent_name}}",...,
  "violations":[{"rule":"missing_{{CORE_FIELD}}"...}]}` surfaced by `fail-msg`. If you instead see
  generated content, the guard is not wired — fix before declaring done.
