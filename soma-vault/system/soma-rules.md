# SOMA Architecture Rules
*Self-Organizing Microagent Architecture*

---

## Core Principles

1. **Single responsibility** — each agent does exactly one thing. No agent researches AND writes.
2. **Max 3 nodes** — if a flow needs a 4th node, split into two agents.
3. **A2A handoff** — agents chain via call_agent. Output of one is input of next.
4. **Memory-first** — every agent reads instincts before generating. No cold starts.
5. **Evo-log always** — every agent writes a log entry after every run, no exceptions.

## Error Handling

- Input validation runs first in every agent — halt before wasting LLM calls
- Vague inputs → error code + halt (VAGUE_INPUT, MISSING_TREND, MISSING_HOOK)
- Low confidence → flag, generate anyway, let human decide
- Missing KB data → proceed without, note [no instincts yet] — never block

## Quality Gates

Every agent has a self-check (`<quality_gate>`) that runs before sending output.
If a check fails, the agent revises before sending — not after.

## Human-in-the-loop

Content Repurposer output goes to **human review queue**.
Human decides what to publish, when, and in what order.
Agents do not post autonomously.

## Evolution Pattern

```
instinct file:     situation → mistake → fix
winners-log:       date | hook | score | platform
format-templates:  platform → structure → notes
evo-log:           date | input | output_summary | quality_flags
```
