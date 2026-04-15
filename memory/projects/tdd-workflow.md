# TDD Workflow Pipeline

**Status:** Active, working as of 2026-04-15
**Type:** Multi-agent SDLC orchestration

## Architecture

```
User request
    ↓
TDD Guide Agent          (gpt-4o-mini)   → produces: tdd_spec
    ↓
Code Generation Agent    (gpt-4.1)       → produces: generatedCode
    ↓
Sandbox Verify node                      → checks: forbidden patterns, empty vars
    ↓
Code Reviewer Agent      (gpt-4.1-mini)  → produces: review + score
```

## Variable Flow

| Variable | Set by | Used by |
|----------|--------|---------|
| `user_story` | caller / inputMapping | Code Gen prompt |
| `tdd_spec` | TDD Guide Agent | Code Gen (as `adr_output`) |
| `adr_output` | inputMapping → tdd_spec | Code Gen internal template |
| `tech_stack` | inputMapping or default | Code Gen prompt |
| `coding_standards` | inputMapping or default | Code Gen prompt |
| `generatedCode` | Code Gen outputVariable | Sandbox + Code Reviewer |
| `pr_gate_feedback` | Code Reviewer or retry | Code Gen retry prompt |

## Known Issues Fixed

1. **claude-sonnet-4-6 on Railway** — no ANTHROPIC_API_KEY → switched to gpt-4.1
2. **silent catch block** — handler didn't write to outputVariable on error → now writes `[AI_ERROR]`
3. **systemPrompt ignored** — handler reads only `node.data.prompt`, not `node.data.systemPrompt`

## Testing

Run end-to-end from the agent chat UI:
- Input: any user story
- Expected: TDD Guide → Code Gen (files generated) → Sandbox (PASS or issues) → Reviewer (score)
- Watch for `[AI_ERROR]` prefix — means model/key problem
