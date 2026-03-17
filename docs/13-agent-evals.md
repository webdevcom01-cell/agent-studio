# Agent Evals — Testing Framework

Eval suites let you define structured test cases for your agents and run them automatically
to catch regressions before they reach production.

---

## Overview

Every agent can have multiple **eval suites**. Each suite contains **test cases** — pairs of
an input message and a set of **assertions** about what the agent's response should look like.
When you run a suite, Agent Studio sends each input through the real chat API, measures the
response, and evaluates every assertion. Results are stored and displayed as a pass rate with
a trend chart over time.

---

## 3-Layer Assertion Strategy

Assertions are organized in three layers, from cheapest/fastest to most powerful:

| Layer | Types | Cost | Speed |
|-------|-------|------|-------|
| **1 — Deterministic** | `exact_match`, `contains`, `icontains`, `not_contains`, `regex`, `starts_with`, `json_valid`, `latency` | Free | < 1ms |
| **2 — Semantic** | `semantic_similarity` | ~$0.001/eval | ~500ms |
| **3 — LLM-as-Judge** | `llm_rubric`, `kb_faithfulness`, `relevance` | ~$0.01/eval | ~3–8s |

**Recommendation:** start with Layer 1. Add Layer 2/3 only for cases where exact string
matching is too brittle (e.g. open-ended questions, RAG answers).

---

## Assertion Reference

### Layer 1 — Deterministic

| Assertion | Required field | Description |
|-----------|---------------|-------------|
| `exact_match` | `value` | Response must equal `value` exactly (case-sensitive) |
| `contains` | `value` | Response must contain `value` as a substring |
| `icontains` | `value` | Case-insensitive `contains` |
| `not_contains` | `value` | Response must NOT contain `value` |
| `regex` | `value` | Response must match the regex pattern in `value` |
| `starts_with` | `value` | Response must start with `value` |
| `json_valid` | — | Response must be valid JSON (any structure) |
| `latency` | `threshold` (ms) | Response time must be ≤ `threshold` milliseconds |

### Layer 2 — Semantic Similarity

| Assertion | Required fields | Description |
|-----------|----------------|-------------|
| `semantic_similarity` | `value`, `threshold` (0–1, default 0.8) | Embeds both the response and `value` using OpenAI text-embedding-3-small, computes cosine similarity. Passes if similarity ≥ threshold. |

**Use when:** you want to check meaning rather than exact wording. Example: assert the
response is semantically similar to "The capital of France is Paris" with threshold 0.75.

### Layer 3 — LLM-as-Judge

All Layer 3 assertions use an LLM (DeepSeek by default) to score the response from 0.0 to 1.0.
They pass when the score ≥ the configured threshold (default 0.7).

| Assertion | Required fields | Description |
|-----------|----------------|-------------|
| `llm_rubric` | `rubric` (string), `threshold` | Custom criteria — you describe what a good response looks like. The LLM scores how well the agent meets those criteria. |
| `kb_faithfulness` | `threshold` | Checks that the agent's response is grounded in the knowledge base context — detects hallucination. Requires the agent to have a KB. |
| `relevance` | `threshold` | Checks that the response actually addresses the user's input question. |

**Example rubric:** `"The response must greet the user by name, confirm their booking
reference number, and offer further assistance. It must be polite and under 100 words."`

---

## Scores

Each assertion produces a score from 0.0 to 1.0:
- Deterministic: 1.0 (pass) or 0.0 (fail)
- Semantic: the raw cosine similarity value
- LLM-as-Judge: the LLM's score

The **test case score** is the average across all its assertions.
The **suite run score** is the average across all test case scores.

A score ≥ 0.7 is considered a pass for LLM-based assertions (configurable via `threshold`).

---

## Creating a Suite

1. Open an agent and click **Evals** (FlaskConical icon) in the top toolbar or agent card.
2. Click **+ Create Suite**.
3. Give it a name and optional description.
4. Toggle **Run on deploy** if you want this suite to auto-run every time the flow is deployed.
5. Click **Create Suite**.

### Adding Test Cases

Inside the suite, click **+ Add Test Case**:
1. Enter a **label** (human-readable name, e.g. "Greeting — en")
2. Enter the **input message** (what the user sends)
3. Add one or more **assertions** using the assertion builder
4. Optionally add **tags** (e.g. `rag`, `greeting`, `edge-case`) for grouping

---

## Running Evals

Click **Run Evals** in the top-right of the suite. Agent Studio will:
1. Create an `EvalRun` record
2. Send each test case input to the agent's chat API (non-streaming, isolated conversation)
3. Evaluate all assertions
4. Display results in the **Results** tab

> ⚠️ Only one run can be active per suite at a time. Starting a run while another is in
> progress returns a 409 error.

---

## Results View

The **Results** tab shows:
- **Summary stats:** overall score, passed, failed, total duration
- **Pass-rate bar:** visual percentage
- **Trend chart:** score over the last 10 runs (recharts line chart)
- **Per-case rows:** expandable to see agent output, each assertion's pass/fail status and score
- **Run history table:** date, triggered by, score, passed/failed/total, duration

The `triggeredBy` column shows `manual`, `deploy`, or `schedule` so you can distinguish
automated runs from manual ones.

---

## Deploy-Triggered Evals

If a suite has **Run on deploy** enabled, it will auto-run every time the agent's flow is
successfully deployed (via the Deploy button in the Flow Builder). This happens in the
background — the deploy response is returned immediately without waiting for evals.

**To enable:** create or edit a suite and toggle "Run on deploy". A violet Rocket icon
appears next to the suite name in the sidebar.

You can also toggle it per-suite from the ⋮ dropdown menu → "Run on deploy / Disable auto-run on deploy".

---

## Limits

| Setting | Limit |
|---------|-------|
| Suites per agent | 20 |
| Test cases per suite | 50 |
| Assertions per test case | 20 |
| Concurrent runs per suite | 1 |

---

## Best Practices

**Start deterministic.** Cover happy paths with `contains` and `icontains` before reaching
for LLM-based assertions. Fast, free, and 100% reproducible.

**One assertion per concern.** Instead of one `llm_rubric` assertion that checks everything,
write separate assertions for tone, completeness, and accuracy. The score breakdown is more
useful for debugging.

**Set realistic thresholds.** LLM responses vary. A threshold of 0.85 for `semantic_similarity`
might fail on valid paraphrases. Start at 0.7–0.75 and tighten only if needed.

**Tag your test cases.** Use tags like `rag`, `greeting`, `edge-case`, `multilingual` to
group related cases. Useful when filtering failing cases after a run.

**Enable Run on deploy for regression suites.** Mark your core smoke-test suite with
"Run on deploy" so every deployment is automatically validated against key cases.

**Monitor the trend chart.** A steady decline in score over multiple deploys is a sign of
prompt drift or knowledge base degradation before users notice it.
