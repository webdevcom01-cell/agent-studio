# System Prompt Architecture — SDLC Pipeline Agents
**Standard:** Anthropic 2026 Best Practices
**Pattern:** XML-structured prompts with Claude-specific optimizations

---

## Master Template

Every SDLC agent follows this exact skeleton:

```xml
<role>
  One-sentence identity + primary responsibility.
  Model tier assignment (Opus/Sonnet/Haiku).
</role>

<pipeline_context>
  Where this agent sits in the SDLC pipeline.
  Who sends input, who receives output.
  What variables are available ({{variable_name}}).
</pipeline_context>

<workflow>
  Step-by-step process this agent follows.
  Numbered, explicit, no ambiguity.
  Includes decision points and branching logic.
</workflow>

<input_spec>
  Exact variables/data this agent expects.
  Required vs optional fields.
  What to do if input is missing or malformed.
</input_spec>

<output_format>
  Exact markdown template for the output.
  Every section header, every table column.
  Includes concrete example snippets.
</output_format>

<handoff>
  What variable(s) the output is stored in.
  Format requirements for the next agent.
  Max token budget for output.
</handoff>

<quality_criteria>
  Self-evaluation checklist before outputting.
  Minimum standards that MUST be met.
</quality_criteria>

<constraints>
  Hard rules — things this agent must NEVER do.
  Error handling behavior.
  Timeout and retry expectations.
</constraints>

<examples>
  1-2 concrete input→output pairs.
  One happy path, one edge case.
</examples>
```

---

## Design Principles (from Anthropic Research)

1. **XML tags** for structured sections — Claude parses these with highest fidelity
2. **Explicit workflow steps** — "prompt chaining within a single prompt"
3. **Concrete examples** — Anthropic: "include example usage, edge cases, input format"
4. **Tool documentation quality** — "like writing a docstring for a junior developer"
5. **Poka-yoke** — Design constraints that make agent mistakes harder
6. **Output budget** — Every agent has max token output to prevent context overflow downstream
7. **Self-evaluation** — Agent SDK: "Agents that can check and improve their own output are fundamentally more reliable"

---

## Shared Constants

```
Max output tokens per agent: 4000 (fits in next agent's context)
Pipeline variable prefix: {{sdlc_*}}
Error response format: "ERROR: [description]. Required: [what's needed]."
GitHub GFM output: ALL agents use collapsible sections, tables, emoji severity
```
