# ECC Integration — everything-claude-code

## What is ECC?

`everything-claude-code` (GitHub: affaan-m/everything-claude-code) is an advanced orchestration
framework for Claude Code: 25 specialized agents, 108+ skill modules, 57 slash commands,
15+ hook event types, language-specific rules, and an instinct-based continuous learning system.

**Architecture decision:** ECC integrates as a MODULE inside agent-studio (`src/lib/ecc/`),
NOT as a separate project or fork. Agent-studio already has 80%+ of the needed infrastructure.

## ECC → Agent Studio Component Mapping

| ECC Component          | Studio Equivalent                    | Integration Action                    |
|------------------------|--------------------------------------|---------------------------------------|
| 25 Agent definitions   | Agent Templates (221 existing)       | Import as new "Developer Agents" category |
| 108+ SKILL.md files    | Knowledge Base (RAG pipeline)        | Ingest into shared KB + new Skill model |
| 57 slash commands      | CLI Generator / Flow Templates       | Map to flow triggers + API routes     |
| Hook system (15+ types)| Webhook system (existing)            | Extend webhook events + new hook middleware |
| Rules (language-specific)| Agent system prompts               | Embed in agent template configs       |
| Instinct system        | NEW — continuous learning            | New Instinct model + Learn node + /evolve API |
| .clauderc config       | Agent settings JSON                  | Map to agent metadata fields          |

## ECC Agent Roster (29 agents)

Model routing per ECC spec:
- **Opus** (complex reasoning): planner, architect, chief-of-staff, meta-orchestrator
- **Sonnet** (balanced): code-reviewer, tdd-guide, security-reviewer, debugger, refactor-planner, api-designer, performance-optimizer
- **Haiku** (fast): doc-updater, refactor-cleaner, test-writer, commit-message-writer, changelog-generator

All 29 agents imported as Studio templates in `src/data/ecc-agent-templates.json` with:
- YAML frontmatter → JSON config (name, description, model, tools, skills)
- Agent Card endpoint: `GET /api/agents/[agentId]/card.json` (Google A2A v0.3 spec)
- Linked to shared ECC Skills KB automatically

## ECC Skill Structure

Each skill is a `SKILL.md` with YAML frontmatter:
```yaml
---
name: skill-name
version: "1.0.0"
description: "What this skill does"
inputs:
  - name: param1
    type: string
    required: true
outputs:
  - name: result
    type: string
tags: [typescript, testing, security]
category: development
language: typescript
---
# Skill content (Markdown)
Instructions, examples, patterns...
```

Skills are stored in the `Skill` Prisma model AND vectorized into the Knowledge Base for RAG retrieval. The ECC Skills MCP server exposes them via MCP protocol.

## ECC File Structure

```
src/lib/ecc/
  ├── index.ts                        # Barrel exports, feature flag check
  ├── feature-flag.ts                 # isECCEnabled() + isECCEnabledForAgent()
  ├── skill-parser.ts                 # Parse SKILL.md YAML frontmatter
  ├── skill-ingest.ts                 # Ingest ECC skills into Skill model + KB vectorization
  ├── meta-orchestrator.ts            # Autonomous agent routing (LLM classification)
  ├── instinct-engine.ts              # Pattern extraction + confidence scoring
  ├── obsidian-adapter.ts             # Stub for future Obsidian integration
  └── types.ts                        # ECC-specific TypeScript interfaces

src/data/
  └── ecc-agent-templates.json        # 29 ECC agent templates

src/app/skills/page.tsx               # Skill Browser UI
src/app/api/ecc/ingest-skills/route.ts # POST — async bulk skill ingestion
src/app/api/ecc/card/[agentId]/route.ts # GET — Agent Card (A2A v0.3)
src/app/api/skills/evolve/route.ts    # POST — instinct → skill promotion

services/ecc-skills-mcp/              # Separate Railway service
  ├── main.py                         # Python FastMCP server
  ├── requirements.txt, railway.toml, Dockerfile

scripts/
  ├── import-ecc-agents.mjs           # One-time agent import script
  └── import-ecc-skills.mjs           # One-time skill import script
```

---

## ECC Implementation — Completed Phases

All 10 phases implemented and deployed to production.

### Phase 0: Prisma Schema Foundation
Models added: AgentExecution, Skill, AgentSkillPermission, Instinct, AuditLog.
See `.claude/docs/prisma-models.md` for full schema definitions.
Agent model extended with: executions, skillPermissions, instincts, eccEnabled.

### Phase 1: Import 29 ECC Agents as Templates
- New category "Developer Agents" in `src/lib/constants/agent-categories.ts`
- `src/data/ecc-agent-templates.json` — 29 templates, separate from existing 221
- Import script: `scripts/import-ecc-agents.mjs`
- Agent Card endpoint: `GET /api/agents/[agentId]/card.json` (A2A v0.3 JSON-LD)

### Phase 2: 60+ Skills → Knowledge Base + Skill Browser
- `scripts/import-ecc-skills.mjs` — parse SKILL.md → Skill model + KB vectorization
- `POST /api/ecc/ingest-skills` — **ASYNC** (not in startup path! Railway healthcheck = 120s)
- Protected by `CRON_SECRET` header
- Skill Browser: `src/app/skills/page.tsx` — search, faceted filters (language, category, agent)
- Railway: incremental re-ingest via Cron Service (daily)

### Phase 3: Meta-Orchestrator + Flow Templates
- Meta-Orchestrator agent based on ECC chief-of-staff
- 4 pre-built flow templates:
  1. **TDD Pipeline**: Planner → TDD Guide → parallel[Code Reviewer + Security] → end
  2. **Full Dev Workflow**: Planner → Architect → parallel[Backend+Security+Docs] → Reviewer → end
  3. **Security Audit**: Security Reviewer → parallel[OWASP + Secret scan + Deps] → Doc Updater → end
  4. **Code Review Pipeline**: Planner → parallel[Reviewer + language-specific] → summary → end
- Added to `src/data/starter-flows.ts`

### Phase 4: ECC Skills MCP Server — Separate Railway Service
- `services/ecc-skills-mcp/main.py` — Python FastMCP with 3 tools:
  - `get_skill(name)`, `search_skills(query, tag?)`, `list_skills(language?)`
- Deploy: Nixpacks Python, Port 8000, Private Networking ONLY
- Internal URL via `ECC_MCP_URL` env var
- MCP pool: min=5, max=20, HTTP/2, timeout tiers (2s/10s/30s)

### Phase 5: Continuous Learning + Instinct System
- "Learn" node in Flow Builder — extracts patterns from AgentExecution history
- Instinct storage: confidence 0.0-1.0, frequency counter, >0.85 → promote to KB skill
- `POST /api/skills/evolve` — AI clusters instincts, generates new SKILL.md
- Railway: evolve in Cron Service at 3AM daily

### Phase 6: Observability — OpenTelemetry + Metrics
- gen_ai.* semantic conventions (AAIF 2026)
- OTLP push exporter → Grafana Cloud
- Pino structured logging → Railway log drain

### Phase 7: Security Hardening
- Prompt injection defense: JSON Schema validation, output PII filtering
- RBAC enforcement via AgentSkillPermission
- Webhook HMAC-SHA256
- Audit log: all CRUD, executions, skill calls → AuditLog model

### Phase 8: Performance Testing & Optimization
- DB indexes: AgentExecution(agentId, status), Skill(slug, language), Instinct(agentId, confidence)
- Caching: skill metadata (10min), KB search (2min), agent card (5min)
- SLA targets: P95 <5s flow exec, P99 <2s KB search, P95 <100ms skill metadata

### Phase 9: Production Deploy + Obsidian Onboarding
- Feature flag: `ECC_ENABLED` env var for killswitch (defaults to `false`)
- 60 skills ingested and vectorized (255 KB chunks)
- Rollback procedure: Railway rollback, DB snapshot, MCP rollback (RTO: <5 min)

---

## Claude Working Guidelines — ECC Module

1. **Always check feature flag**: wrap ECC code with `if (process.env.ECC_ENABLED !== 'false')` or per-agent `eccEnabled` field
2. **Schema changes**: run `pnpm db:push` after any Prisma schema modifications
3. **Async ingestion ONLY**: Never put skill ingestion in startup path (Railway healthcheck = 120s)
4. **Internal networking**: MCP server URL via `process.env.ECC_MCP_URL`, never hardcode. MCP path: `/mcp`
5. **Existing patterns**: follow the same patterns as existing code (Zod validation, SWR hooks, API route handlers)
6. **No new CSS frameworks**: Tailwind CSS v4 ONLY
7. **MCP pool awareness**: timeout tiers matter — metadata=2s, search=10s, compute=30s
8. **Push metrics, not pull**: Railway doesn't support Prometheus scrape. Use OTLP push exporter
9. **Separate MCP service**: ECC Skills MCP is a separate Railway service (Python), not embedded in Next.js
10. **Production URL**: configured per deployment (see Railway dashboard or env vars)
