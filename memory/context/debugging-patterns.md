# Debugging Patterns — agent-studio

Lessons learned from real sessions. Read this before spending hours on forensics.

---

## 1. Silent AI failure → downstream "input variable is empty"

**Symptom:** `sandbox_verify` reports `FAIL: input variable is empty` even though the
Code Gen node "ran" and showed a message.

**Root cause:** `ai-response-handler.ts` catch block returned a fallback message but
set NO `updatedVariables` → `outputVariable` (e.g. `generatedCode`) stayed `undefined`.

**Why AI call failed:** `getModel("claude-sonnet-4-6")` throws if `ANTHROPIC_API_KEY`
is not set. That throw was swallowed silently.

**Fix (already in codebase):** catch block now writes `[AI_ERROR] ...` to `outputVariable`
so downstream nodes see a diagnostic value instead of `undefined`.

**Quick check:** look for `[AI_ERROR]` prefix in conversation output — root cause is in that string.

---

## 2. Model mismatch — Railway vs local

**Symptom:** Agent works locally, fails on Railway with silent error.

**Pattern:** Agent was built/tested with `claude-sonnet-4-6` but Railway does not have
`ANTHROPIC_API_KEY` set. Only `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` are guaranteed.

**Required keys on Railway:**
| Key | Required | Used for |
|-----|----------|---------|
| DEEPSEEK_API_KEY | ✅ Yes | default model |
| OPENAI_API_KEY | ✅ Yes | embeddings + GPT models |
| ANTHROPIC_API_KEY | ❌ Optional | Claude models only |

**Diagnostic script:** `scripts/diagnose-model-mismatch.ts`
Run it to see every agent's `agent.model` + every `ai_response` node model vs available keys.

**Fix script:** `scripts/fix-switch-to-openai.ts` — switches named agents to gpt-4.1 / gpt-4.1-mini.

---

## 3. ai-response-handler — how it actually works

Critical internal knowledge. The handler is NOT obvious from the UI.

```
node.data.prompt       ← ONLY field read as system message (line 68)
node.data.systemPrompt ← IGNORED completely by handler
node.data.model        ← model to use
node.data.outputVariable ← variable name to write response into
node.data.temperature  ← passed to generateText
node.data.maxTokens    ← passed as maxOutputTokens
```

**Message building for sub-agents (isNewConversation: true):**
- History is empty → messages = `[system prompt]` only
- NO user message is injected automatically
- Model receives system prompt + no question → returns empty/junk UNLESS the prompt
  itself contains the actual request (using `{{variable}}` template substitution)

**Correct pattern for sub-agent prompts:**
Put BOTH instructions AND the concrete input block (with `{{user_story}}`, `{{adr_output}}` etc.)
inside `node.data.prompt`. Do NOT split between prompt and systemPrompt.

---

## 4. resolveTemplate — blind substitution

`resolveTemplate("{{var}}", context.variables)` substitutes ALL `{{...}}` patterns.

- If `context.variables.var` is `undefined` → substitutes empty string `""`
- No warning, no error — silently empty
- This is how `sandbox_verify` ends up with empty input even when the node "ran"

**Before debugging flows:** verify all `{{var}}` placeholders in prompts actually
exist as keys in the agent's inputMapping or flow variables.

---

## 5. call_agent inputMapping — variable propagation

When Agent A calls Agent B via `call_agent` node, the `inputMapping` determines
what variables Sub-agent B receives in its context.

**Common mistake:** mapping to wrong variable names.
Example: Code Gen Agent internally uses `{{user_story}}` but caller maps `{{task}}` →
template substitutes `task` (which exists) but `user_story` stays empty.

**Check:** run `scripts/inspect-code-gen-flow.ts` (or equivalent) to see exactly
which `{{vars}}` a sub-agent's prompt uses, then verify caller's inputMapping matches.

---

## 6. TDD Workflow architecture (as of 2026-04)

```
[webhook / chat] → TDD Guide Agent → (tdd_spec) → Code Generation Agent
                                                  → (generatedCode) → Sandbox Verify
                                                                     → Code Reviewer Agent
```

- **TDD Guide Agent** model: `gpt-4o-mini` — produces `tdd_spec` variable
- **Code Generation Agent** model: `gpt-4.1` — reads `user_story`, `adr_output` (=tdd_spec), etc.
- **Code Reviewer Agent** model: `gpt-4.1-mini` — reviews output

Key variable names that must flow through:
`user_story`, `tdd_spec` (→ `adr_output` inside Code Gen), `generatedCode`, `tech_stack`, `coding_standards`

---

## 7. Diagnostic scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/inspect-code-gen-flow.ts` | Full flow dump: nodes, edges, variable names, prompt preview |
| `scripts/forensics-code-gen.ts` | Deep dive: full prompt, conversations, AgentExecution records |
| `scripts/diagnose-model-mismatch.ts` | Per-agent model vs available API keys |
| `scripts/fix-switch-to-openai.ts` | Switch named agents from Claude → GPT |
| `scripts/fix-switch-to-deepseek.ts` | Switch named agents → DeepSeek |

Run with: `npx tsx scripts/<name>.ts`
