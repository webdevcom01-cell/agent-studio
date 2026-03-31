# ECC Agents — Implementation Plan
**Date:** 2026-03-31
**Status:** PLAN (pending approval)
**Author:** Claude Opus 4.6

---

## Context

The 29 ECC (everything-claude-code) agents currently exist **only as JSON templates** in
`src/data/ecc-agent-templates.json`. They are not live agents in the Railway production database.

The 7 SDLC Pipeline agents we built in the previous session ARE live:
- 🎯 SDLC Pipeline Orchestrator
- 📋 Product Discovery Agent
- 🏗️ Architecture Decision Agent
- 💻 Code Generation Agent (Opus)
- 🚀 CI/CD Pipeline Generator
- ✅ Deploy Decision Agent
- 📊 Performance Regression Detector

This plan covers which ECC agents to create as live agents, in what priority order, and with
what prompt strategy. The goal is to expand the agent ecosystem so the SDLC pipeline can call
specialized agents as tools, and developers can use ECC agents standalone.

---

## Decision Framework

For each ECC agent, three questions:
1. **Does the SDLC pipeline reference it?** → CRITICAL if yes
2. **Is it specific to a language we don't use?** → SKIP (Go, generic Python reviewers)
3. **Do we already have a better version?** → SKIP (Architect, Meta-Orchestrator)

---

## Priority Classification: All 29 Agents

### 🔴 SKIP — Already Replaced or Out of Scope
| Agent | Reason |
|-------|--------|
| `ecc-architect` | Replaced by our Architecture Decision Agent (better, XML structured, 2026 patterns) |
| `ecc-meta-orchestrator` | Replaced by our SDLC Pipeline Orchestrator |
| `ecc-chief-of-staff` | Communication triage — not relevant to dev workflow |
| `ecc-go-reviewer` | Go-specific, agent-studio is TypeScript |
| `ecc-go-build-resolver` | Go-specific |
| `ecc-performance-benchmarker` | Replaced by our Performance Regression Detector |
| `ecc-tdd-pipeline` | Pipeline orchestrator — better as a Flow in Flow Builder, not standalone agent |
| `ecc-full-dev-workflow` | Pipeline orchestrator — same, use Flow Builder |
| `ecc-security-audit` | Pipeline orchestrator — use Flow Builder |
| `ecc-code-review-pipeline` | Pipeline orchestrator — use Flow Builder |

**10 agents skipped** — keeping 19 for potential creation.

---

## Phase A — Pipeline Critical (4 agents) 🚨

These agents are directly referenced by name in the SDLC Pipeline Orchestrator's
`<pipeline_context>` section or are needed for the pipeline to function correctly.

### A1. Doc Updater
- **Model:** `claude-haiku-4-5-20251001`
- **Why CRITICAL:** Explicitly referenced in SDLC Orchestrator `<pipeline_context>` as Phase 3b
  ("Doc Updater generates changelogs and updates CLAUDE.md")
- **Prompt strategy:** Upgrade to XML format, add `<pipeline_context>` explaining SDLC role
- **Tags:** documentation, codemap, haiku
- **Priority:** #1 — create first

### A2. Code Reviewer
- **Model:** `claude-sonnet-4-6`
- **Why CRITICAL:** Natural quality gate after Code Generation Agent. Referenced in multiple
  ECC pipeline flows. SDLC Orchestrator should call it at Phase 3 (code review).
- **Prompt strategy:** Upgrade to XML format with CRITICAL/HIGH/MEDIUM/LOW severity levels intact
- **Tags:** code-review, quality, security

### A3. TDD Guide
- **Model:** `claude-sonnet-4-6`
- **Why CRITICAL:** RED→GREEN→REFACTOR cycle. Fits between Product Discovery and Code Generation
  in the pipeline. Ensures tests are written before implementation.
- **Prompt strategy:** XML upgrade, add acceptance criteria handoff from Product Discovery
- **Tags:** tdd, testing, quality

### A4. Security Reviewer
- **Model:** `claude-sonnet-4-6`
- **Why CRITICAL:** OWASP Top 10, security gates. The SDLC pipeline currently has no security
  specialist — Deploy Decision Agent checks scores but doesn't do the actual security review.
  Fills the gap between Code Generation and Deploy Decision.
- **Prompt strategy:** XML upgrade, emphasize integration with Deploy Decision gate (CRITICAL
  findings = automatic NO-GO)
- **Tags:** security, owasp, vulnerability

---

## Phase B — Dev Workflow Support (7 agents) 🟡

High-value agents that complement the SDLC pipeline and provide standalone value for
day-to-day development on the agent-studio codebase.

### B1. Build Error Resolver
- **Model:** `claude-sonnet-4-6`
- **Why:** TypeScript/ESLint errors are common in agent-studio. No `any`, no `@ts-ignore` rules
  mean this agent has clear constraints to work within. Saves time on CI failures.
- **Prompt strategy:** Use ECC prompt as-is (well-scoped), add `<constraints>` noting this is
  TypeScript strict mode, pnpm, Next.js 15, no `any` types ever
- **Tags:** build, typescript, errors

### B2. Database Reviewer
- **Model:** `claude-sonnet-4-6`
- **Why:** agent-studio is PostgreSQL/Prisma/pgvector heavy. 36 models, HNSW indexes, cascade
  deletes — a specialist is valuable. Unique to our stack.
- **Prompt strategy:** XML format, add pgvector/HNSW context, Supabase constraints, Prisma v6
- **Tags:** database, postgresql, prisma, pgvector

### B3. Frontend Developer
- **Model:** `claude-sonnet-4-6`
- **Why:** React/Next.js/Tailwind is the entire frontend stack. This agent knows the right
  patterns — Server Components by default, SWR for fetching, no inline styles. Directly aligned
  with `ui-components.md` rules.
- **Prompt strategy:** XML format, inject agent-studio UI rules directly into `<constraints>`
- **Tags:** react, nextjs, tailwind, frontend

### B4. E2E Runner
- **Model:** `claude-sonnet-4-6`
- **Why:** agent-studio has 10 Playwright spec files. E2E tests are part of the CI/CD pipeline.
  This agent can generate new E2E specs and fix flaky tests.
- **Prompt strategy:** Use ECC prompt, add Playwright Page Object Model pattern from existing
  `e2e/pages/` structure
- **Tags:** playwright, e2e, testing

### B5. Refactor Cleaner
- **Model:** `claude-sonnet-4-6`
- **Why:** Large codebase (55 node handlers, 179 test files, 36 Prisma models). Dead code
  accumulates. This agent does surgical cleanup safely.
- **Prompt strategy:** Use ECC prompt, add note about never touching `src/generated/`
- **Tags:** refactoring, cleanup, dead-code

### B6. Planner
- **Model:** `claude-sonnet-4-6` ← **Downgrade from Opus**
- **Why:** Opus is expensive. The Planner's job (implementation plans, dependency mapping) is
  well within Sonnet's capability. Reserve Opus for Code Generation where reasoning depth matters.
- **Prompt strategy:** Use ECC prompt with XML wrapper
- **Tags:** planning, architecture, implementation

### B7. Reality Checker
- **Model:** `claude-haiku-4-5-20251001`
- **Why:** Fast, cheap gatekeeper. "Default: NEEDS WORK" philosophy complements Deploy Decision
  Agent. Can be called before human approval in the pipeline. Zero-cost skepticism.
- **Prompt strategy:** Use ECC prompt, keep the strong personality (it's a feature)
- **Tags:** quality-gate, review, production-readiness

---

## Phase C — Specialist Tools (4 agents) 🟢

Valuable for specific scenarios, lower urgency. Create after Phase B is complete.

### C1. Security Engineer
- **Model:** `claude-sonnet-4-6`
- **Why:** More comprehensive than Security Reviewer — STRIDE threat modeling, secure
  architecture design. For major feature work.
- **Tags:** security, threat-modeling, architecture

### C2. Python Reviewer
- **Model:** `claude-sonnet-4-6`
- **Why:** agent-studio has Python services: `services/ecc-skills-mcp/` (FastMCP),
  `deal-flow-agent/` (FastAPI). Not the main stack but actively maintained.
- **Tags:** python, fastapi, review

### C3. API Tester
- **Model:** `claude-haiku-4-5-20251001`
- **Why:** agent-studio has 80+ API routes. Complement to the Evals framework — manual API
  testing vs automated evals. Haiku is fast and cheap enough for this.
- **Tags:** api, testing, endpoints

### C4. Accessibility Auditor
- **Model:** `claude-haiku-4-5-20251001`
- **Why:** WCAG 2.1 AA is a good standard to maintain. agent-studio has complex UI (flow editor,
  chat, KB management). Haiku for fast audits.
- **Tags:** accessibility, wcag, a11y

---

## Agents NOT Created (Remaining 5)

| Agent | Reason |
|-------|--------|
| `ecc-test-results-analyzer` | Evals framework already provides this (trend charts, per-case breakdowns) |
| `ecc-tool-evaluator` | Nice but low priority — CLAUDE.md already defines all approved tools |
| `ecc-workflow-optimizer` | Too generic, low direct value for agent-studio dev work |
| `ecc-evidence-collector` | Screenshot-obsessed QA is niche — use E2E Runner instead |
| `ecc-python-reviewer` | Only 2 Python services, can use generic Code Reviewer |

*(Note: `ecc-python-reviewer` is included in Phase C above for Python-specific depth — this line
refers to `ecc-test-results-analyzer`, `ecc-tool-evaluator`, `ecc-workflow-optimizer`,
`ecc-evidence-collector` being excluded)*

---

## Prompt Strategy

### Phase A agents — Full XML upgrade
These agents need to understand their place in the SDLC pipeline. Use the same XML format as
the 7 SDLC agents, including:
- `<role>` + `<pipeline_context>` (explain where they fit in the 6-phase pipeline)
- `<workflow>` with numbered steps
- `<output_format>` with required sections
- `<handoff>` explaining what the next agent expects
- `<constraints>` with agent-studio specific rules (TypeScript strict, no `any`, etc.)
- `<quality_criteria>` with pass/fail thresholds

### Phase B agents — Lightweight XML wrapper
ECC prompts are already well-written. Keep the core logic, add:
- `<role>` (short description)
- `<constraints>` (project-specific rules from `.claude/rules/`)
- `<output_format>` (consistent structure)
- NO need for full pipeline_context and handoff sections

### Phase C agents — Use ECC prompt as-is
Minimal changes. Just ensure the model is correct and tags are set.

---

## Model Budget Summary

| Phase | Agents | Models | Approx cost/call |
|-------|--------|--------|-----------------|
| A | 4 | 3× Sonnet + 1× Haiku | $0.003–$0.015 |
| B | 7 | 5× Sonnet + 2× Haiku | — |
| C | 4 | 2× Sonnet + 2× Haiku | — |
| **Total** | **15** | — | — |

Total new agents: **15** (out of 19 filtered candidates, 4 skipped as redundant)
Grand total with SDLC agents: **22 live agents**

---

## Execution Order

```
Phase A (immediate):
  1. Doc Updater (Haiku) ← fixes broken reference in SDLC Orchestrator
  2. Security Reviewer (Sonnet)
  3. Code Reviewer (Sonnet)
  4. TDD Guide (Sonnet)

Phase B (after A is tested):
  5. Build Error Resolver (Sonnet)
  6. Database Reviewer (Sonnet)
  7. Frontend Developer (Sonnet)
  8. Planner (Sonnet — downgraded from Opus)
  9. Reality Checker (Haiku)
  10. E2E Runner (Sonnet)
  11. Refactor Cleaner (Sonnet)

Phase C (after B is tested):
  12. Security Engineer (Sonnet)
  13. Python Reviewer (Sonnet)
  14. API Tester (Haiku)
  15. Accessibility Auditor (Haiku)
```

---

## Next Session Checklist

- [ ] Phase A: Write 4 system prompts (XML format for A1-A4)
- [ ] Phase A: Create 4 agents via POST /api/agents on Railway production
- [ ] Phase A: Verify Doc Updater is callable from SDLC Orchestrator pipeline_context
- [ ] Phase B: Write 7 system prompts (lightweight XML wrapper)
- [ ] Phase B: Create 7 agents on Railway
- [ ] Phase C: Write 4 prompts + create agents
- [ ] Integration: Add Phase A agents to SDLC Orchestrator's `<pipeline_context>` as callable tools
- [ ] Update: sdlc-prompts/TEST-RESULTS.md with new agent IDs

---

## Open Questions

1. **Should Doc Updater get full XML upgrade or ECC prompt as-is?**
   Recommendation: Full XML upgrade. It's in the critical pipeline path and should output
   consistent structured changelogs/CLAUDE.md updates that the next agent can parse.

2. **Planner model: Sonnet or Opus?**
   Recommendation: Sonnet. The Planner creates implementation plans but doesn't write code.
   Opus cost is better reserved for Code Generation where deep reasoning helps quality.

3. **Should pipeline orchestrators (ecc-tdd-pipeline, ecc-full-dev-workflow) be created as agents OR as Flow templates in Flow Builder?**
   Recommendation: Flow Builder. They're workflow definitions, not agents. They should be
   starter flows that use the live agents as agent-as-tool nodes.

4. **Phase B execution: all at once or one at a time?**
   Recommendation: All at once (7 POST calls via Chrome JS tool in one batch) — they're
   all independent, no dependencies between them.
