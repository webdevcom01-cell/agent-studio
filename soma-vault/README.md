# SOMA Memory Vault

This is the human-readable memory layer for the SOMA marketing agent trio.

**Agents:** Trend Intelligence → Hook Writer → Content Repurposer

---

## What this vault is

SOMA agents learn over time. Every run, they write entries to their evolution logs and
update their instincts. This vault is where that memory lives in a format you can read,
edit, and reason about in Obsidian.

The Agent Studio KnowledgeBase system reads from and writes to these same paths.
Opening this vault in Obsidian gives you a live view into what your agents know.

---

## Folder structure

```
soma-vault/
├── agents/
│   ├── trend-intelligence/
│   │   ├── instincts.md         ← Learned signal patterns, source priorities
│   │   └── evo-log.md           ← One entry per scan run
│   ├── hook-writer/
│   │   ├── instincts.md         ← Per-platform hook patterns, scoring notes
│   │   ├── winners-log.md       ← HOT hooks (score ≥ 17) — style reference
│   │   └── evo-log.md           ← One entry per hook generation run
│   └── content-repurposer/
│       ├── instincts.md         ← Platform adaptation rules, common mistakes
│       ├── format-templates.md  ← High-performing content structures per platform
│       └── evo-log.md           ← One entry per repurpose run
├── shared/
│   └── niche-glossary.md        ← Shared terminology agents can reference
└── system/
    ├── config.md                ← Agent IDs, model config, platform scope
    └── soma-rules.md            ← Core SOMA architecture principles
```

---

## How agents use this vault

**Reading (before generating):**
- Each agent's Node 1 is `kb_search` — it pulls from instincts and reference files
- The content is injected into the prompt via `{{kb_context}}`
- Agents apply these patterns before generating any output

**Writing (after generating):**
- Trend Intelligence: appends to `trend-intelligence/evo-log`
- Hook Writer: appends to `hook-writer/evo-log` + adds to `winners-log` if score ≥ 17
- Content Repurposer: appends to `content-repurposer/evo-log`

---

## Human workflow

**Review runs:** Open evo-log files to see what agents produced and whether quality is improving.

**Update instincts:** If you notice a pattern the agent keeps getting wrong, add an
"Instinct" entry to the relevant instincts.md file. The agent will pick it up on next run.

**Update format-templates:** After a piece performs well on a platform, add its structure
to `content-repurposer/format-templates.md`. The agent will use it as reference.

**Curate winners-log:** You can manually add a winning hook to `hook-writer/winners-log.md`
even if the agent scored it below 17 — your judgment overrides the score threshold.

---

## Agent IDs (Agent Studio)

| Agent | ID |
|-------|----|
| Trend Intelligence | c1777723587797ch65fqcudn |
| Hook Writer | c17777235878091qa78qw27c |
| Content Repurposer | c1777723587821zymz38ug0j |

---

## To trigger a run

Send to Trend Intelligence agent:
```
scan trends now
```

Or with a specific niche:
```
{ "niche": "AI agent building", "platform": "LinkedIn" }
```
