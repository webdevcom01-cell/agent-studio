# SOMA — Self-Organizing Microagent Architecture

## Core
- Agent: 3 nodes, single responsibility
- Errors: LLM-judge <0.70 + self-check + human veto
- Instinct: situation→mistake→fix

## Evolution
- Trigger: same fix 4/5 → node
- Growth: 3→5 (20 runs ≥0.80 + 7d no run <0.50)
- Split: 5→2×3 agents | v1 fallback | structural: approval

## A2A
- Short (<30s): Request-Response | Long: Fire-and-Forget → Obsidian
- Depth: max 3

## Obsidian
- /agents/{name}: instincts, profile, evo-log
- /shared/global-instincts: ≥3 same → promoted
- /shared/errors-hall: failures (all read)
- Write: owner | Read: all | Delete: human only

## Autonomy
- Auto: read, instinct write, A2A, output
- Notify → health-log: global promote, shared write
- Approval: system prompt, new node, split, external API
