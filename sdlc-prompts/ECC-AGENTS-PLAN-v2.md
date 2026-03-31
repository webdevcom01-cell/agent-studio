# ECC Agents — Implementation Plan v2
**Date:** 2026-03-31
**Status:** PLAN (pending approval)
**Author:** Claude Opus 4.6
**Supersedes:** ECC-AGENTS-PLAN.md (v1 — had 12 identified gaps)

---

## Changes from v1

### Critical Gaps Found in v1 Review

| # | Gap | Severity | Fix in v2 |
|---|-----|----------|-----------|
| 1 | **"PR Gate Pipeline" incomplete** — Orchestrator references 3 parallel gates (Security Scanner + Code Quality + Risk Assessment) but v1 only covered 2. No "Risk Assessment" agent exists. | CRITICAL | Added Risk Assessment agent OR merged into Reality Checker scope |
| 2 | **"Swarm Security Analyst" missing** — Orchestrator Phase 2 says "Swarm Security Analyst reviews architecture" in parallel. This is architecture-level security, NOT code-level OWASP. No agent covers this. | HIGH | Security Engineer (was Phase C) promoted to Phase A for architecture security |
| 3 | **No agent-as-tool wiring plan** — Creating agents is step 1, but the plan never described HOW agents connect to each other. Agent-as-tool requires `enableAgentTools: true` on ai_response nodes in Flow Builder. | CRITICAL | Added Phase D: Flow Builder wiring |
| 4 | **SDLC Orchestrator prompt not updated** — After creating new agents, the Orchestrator needs a PATCH to reference them as callable tools. Without this, Orchestrator can't actually invoke them. | CRITICAL | Added as explicit step after Phase A |
| 5 | **Output format compatibility undefined** — Security Reviewer must output in format Deploy Decision can parse (critical/high/medium/low counts). Code Reviewer similarly. No interop spec defined. | HIGH | Added "Interop Protocol" section |
| 6 | **Python Reviewer contradiction** — Listed in both "NOT Created" table AND Phase C. Confusing. | LOW | Fixed: removed from "NOT Created" table |
| 7 | **No Knowledge Base strategy** — 22 agents with no shared context about agent-studio conventions. `.claude/rules/` files contain project rules but aren't in any KB. | MEDIUM | Added KB strategy section |
| 8 | **Doc Updater scope unclear** — Orchestrator says "generates changelogs" but ECC prompt only covers docs/codemaps. Need changelog + CLAUDE.md generation explicitly. | MEDIUM | Expanded Doc Updater prompt scope |
| 9 | **Pipeline orchestrator Flow templates ignored** — v1 said "use Flow Builder" for 4 pipeline orchestrators but never listed creating those flows as a task. | LOW | Added as Phase D task |
| 10 | **Naming convention undefined** — "Code Reviewer" vs "ECC Code Reviewer" vs "SDLC Code Reviewer"? No decision. | LOW | Added naming convention |
| 11 | **isPublic flag not addressed** — Should new agents be visible in the marketplace? | LOW | Added: isPublic = true for all |
| 12 | **Category field bug** — `category: 'developer_agents'` returned null in previous session. API doesn't recognize this value. | LOW | Use `category: null` + rely on tags |

---

## Context

29 ECC agents exist as JSON templates in `src/data/ecc-agent-templates.json`.
7 SDLC Pipeline agents are live in production (23/23 tests passed).

This plan creates the remaining agents needed to complete the ecosystem, wire them together
via agent-as-tool in Flow Builder, and establish interop protocols so agents can pass data
to each other reliably.

---

## Naming Convention

All new agents follow this pattern:
- **Pipeline agents** (called by Orchestrator): `[Function] Agent` — e.g., "Code Reviewer Agent", "Security Reviewer Agent"
- **Standalone dev tools** (used independently): `[Function] [Specialty]` — e.g., "Build Error Resolver", "Database Reviewer"
- NO "ECC" prefix — they're integrated into agent-studio, the ECC origin is tracked via tags
- Tag `ecc-origin` on all ECC-derived agents for traceability

---

## Interop Protocol — Agent Data Exchange

For the SDLC pipeline to work end-to-end, agents must output structured data that downstream
agents can parse. All Phase A agents MUST include these output anchors in their `<output_format>`:

### Security Reviewer → Deploy Decision Agent
```
## Security Summary
- CRITICAL: [count]
- HIGH: [count]
- MEDIUM: [count]
- LOW: [count]
- BLOCKING: [YES/NO]
```
Deploy Decision Agent parses these exact labels to apply its 30% Security weight.

### Code Reviewer → Deploy Decision Agent
```
## Code Quality Summary
- Score: [0-100]
- CRITICAL issues: [count]
- Test coverage: [estimated %]
- BLOCKING: [YES/NO]
```

### TDD Guide → Code Generation Agent
```
## Test Specification
- Test files: [list]
- Coverage target: [%]
- Key test cases: [list with Given/When/Then]
```

### Doc Updater → Pipeline Report
```
## Documentation Generated
- Files updated: [list]
- Changelog entries: [count]
- CLAUDE.md updated: [YES/NO]
```

### Security Engineer → Architecture Decision Agent (arch-level review)
```
## Architecture Security Review
- STRIDE threats identified: [count]
- Risk level: [LOW/MEDIUM/HIGH/CRITICAL]
- Mitigations required: [list]
- BLOCKING: [YES/NO]
```

---

## Priority Classification: All 29 Agents

### SKIP — Already Replaced or Out of Scope (9 agents)

| Agent | Reason |
|-------|--------|
| `ecc-architect` | Replaced by Architecture Decision Agent (2026 XML, better) |
| `ecc-meta-orchestrator` | Replaced by SDLC Pipeline Orchestrator |
| `ecc-chief-of-staff` | Communication triage — not dev workflow |
| `ecc-go-reviewer` | Go-specific, agent-studio is TypeScript |
| `ecc-go-build-resolver` | Go-specific |
| `ecc-performance-benchmarker` | Replaced by Performance Regression Detector |
| `ecc-tdd-pipeline` | → Flow Builder template (Phase D) |
| `ecc-full-dev-workflow` | → Flow Builder template (Phase D) |
| `ecc-security-audit` | → Flow Builder template (Phase D) |
| `ecc-code-review-pipeline` | → Flow Builder template (Phase D) |

Note: The 4 pipeline orchestrators are NOT skipped entirely — they become Flow Builder
starter flows in Phase D, using the live agents as agent-as-tool nodes.

---

## Phase A — Pipeline Critical (5 agents)

These agents are directly referenced in the SDLC Orchestrator's `<pipeline_context>` or
are required for the PR Gate Pipeline to function.

### A1. Doc Updater Agent
- **ECC source:** `ecc-doc-updater`
- **Model:** `claude-haiku-4-5-20251001`
- **Pipeline role:** Phase 3b — generates docs from Code Generation output
- **Why CRITICAL:** Explicitly in Orchestrator: "Doc Updater generates README/API docs"
- **Prompt strategy:** Full XML upgrade. Expand scope beyond ECC's docs/codemaps to include:
  - Changelog generation (SDLC Orchestrator expects this)
  - CLAUDE.md section updates (project context file)
  - API route documentation (80+ routes)
- **Interop output:** `## Documentation Generated` block (see Interop Protocol)
- **Tags:** `documentation`, `changelog`, `ecc-origin`

### A2. Code Reviewer Agent
- **ECC source:** `ecc-code-reviewer`
- **Model:** `claude-sonnet-4-6`
- **Pipeline role:** Phase 3 PR Gate — "Code Quality" gate
- **Why CRITICAL:** Part of the PR Gate Pipeline's 3 parallel reviewers
- **Prompt strategy:** Full XML upgrade. Add:
  - `<output_format>` with mandatory `## Code Quality Summary` block
  - Score 0-100 calculation formula
  - agent-studio specific rules from `.claude/rules/typescript.md`
  - BLOCKING = YES if any CRITICAL issue found
- **Interop output:** `## Code Quality Summary` block → Deploy Decision Agent
- **Tags:** `code-review`, `quality`, `pr-gate`, `ecc-origin`

### A3. TDD Guide Agent
- **ECC source:** `ecc-tdd-guide`
- **Model:** `claude-sonnet-4-6`
- **Pipeline role:** Pre-Phase 3 — writes test specs before Code Generation
- **Why CRITICAL:** Ensures tests-first approach. Product Discovery outputs acceptance criteria
  (Given/When/Then) → TDD Guide converts these to test specifications → Code Generation
  implements the code to pass those tests.
- **Prompt strategy:** Full XML upgrade. Add:
  - `<input_spec>` accepting PRD user stories with acceptance criteria
  - `<output_format>` with test file structure and Given/When/Then format
  - `<handoff>` to Code Generation Agent
- **Interop output:** `## Test Specification` block → Code Generation Agent
- **Tags:** `tdd`, `testing`, `quality`, `ecc-origin`

### A4. Security Reviewer Agent
- **ECC source:** `ecc-security-reviewer`
- **Model:** `claude-sonnet-4-6`
- **Pipeline role:** Phase 3 PR Gate — "Security Scanner" gate
- **Why CRITICAL:** Part of PR Gate Pipeline. OWASP Top 10, code-level vulnerability detection.
  Deploy Decision Agent's 30% Security weight depends on this agent's output.
- **Prompt strategy:** Full XML upgrade. Add:
  - `<output_format>` with mandatory `## Security Summary` block (CRITICAL/HIGH/MEDIUM/LOW counts)
  - BLOCKING logic: any CRITICAL = BLOCKING: YES
  - agent-studio specific checks: SSRF protection, CSRF, no eval()
- **Interop output:** `## Security Summary` block → Deploy Decision Agent
- **Tags:** `security`, `owasp`, `pr-gate`, `ecc-origin`

### A5. Security Engineer Agent (PROMOTED from v1 Phase C)
- **ECC source:** `ecc-security-engineer`
- **Model:** `claude-sonnet-4-6`
- **Pipeline role:** Phase 2 parallel — "Swarm Security Analyst reviews architecture"
- **Why CRITICAL (new in v2):** The Orchestrator explicitly says Phase 2 includes parallel
  architecture security review. Security Reviewer does CODE-level OWASP. Security Engineer
  does ARCHITECTURE-level STRIDE threat modeling. These are different roles:
  - Security Reviewer = "Is this code safe?" (Phase 3, code-level)
  - Security Engineer = "Is this architecture safe?" (Phase 2, design-level)
- **Prompt strategy:** Full XML upgrade. Add:
  - `<pipeline_context>` explaining Phase 2 architecture review role
  - `<input_spec>` accepting ADR from Architecture Decision Agent
  - STRIDE framework as primary analysis method
  - `<output_format>` with `## Architecture Security Review` block
- **Interop output:** `## Architecture Security Review` → Orchestrator (merge with ADR)
- **Tags:** `security`, `architecture`, `threat-modeling`, `ecc-origin`

---

## Phase A+ — Orchestrator Update

**After creating Phase A agents, BEFORE testing:**

1. **PATCH SDLC Orchestrator** system prompt to:
   - Update `<pipeline_context>` to name the actual agents that now exist
   - Add explicit agent names in each phase description
   - Reference the interop protocol output formats

2. **Enable agent-as-tool** on Orchestrator's ai_response node in Flow Builder:
   - Set `enableAgentTools: true`
   - This allows the Orchestrator to call Phase A agents as tools automatically

3. **Verify** the Orchestrator can see all Phase A agents via `/api/agents` list

---

## Phase B — Dev Workflow Support (6 agents)

High-value standalone agents. Lighter XML wrapper — no pipeline_context needed.

### B1. Build Error Resolver
- **ECC source:** `ecc-build-error-resolver`
- **Model:** `claude-sonnet-4-6`
- **Prompt strategy:** ECC prompt + `<constraints>` block with:
  - TypeScript strict, no `any`, no `@ts-ignore` (from `.claude/rules/typescript.md`)
  - pnpm only, Next.js 15, Prisma v6
  - Never modify `src/generated/` or `prisma/migrations/`
- **Tags:** `build`, `typescript`, `errors`, `ecc-origin`

### B2. Database Reviewer
- **ECC source:** `ecc-database-reviewer`
- **Model:** `claude-sonnet-4-6`
- **Prompt strategy:** XML wrapper with:
  - pgvector 0.8.0 specifics (HNSW m=16, ef_construction=64, cosine distance)
  - Supabase constraints, port 6543/5432
  - 36 Prisma models awareness
  - Cascade delete verification checklist
- **Tags:** `database`, `postgresql`, `prisma`, `pgvector`, `ecc-origin`

### B3. Frontend Developer Agent
- **ECC source:** `ecc-frontend-developer`
- **Model:** `claude-sonnet-4-6`
- **Prompt strategy:** XML wrapper injecting full `.claude/rules/ui-components.md`:
  - Tailwind CSS v4 ONLY, no inline styles
  - Radix UI + lucide-react icons only
  - cva for variants, cn() for class merging
  - SWR for data fetching, Sonner for toasts
  - Server Components by default
- **Tags:** `react`, `nextjs`, `tailwind`, `frontend`, `ecc-origin`

### B4. Planner Agent
- **ECC source:** `ecc-planner`
- **Model:** `claude-sonnet-4-6` (downgraded from ECC's Opus)
- **Rationale:** Planning doesn't require Opus reasoning depth. Sonnet is sufficient for
  dependency mapping, task sequencing, and risk flagging. Save Opus budget for Code Generation.
- **Prompt strategy:** ECC prompt with XML wrapper
- **Tags:** `planning`, `implementation`, `ecc-origin`

### B5. Reality Checker Agent
- **ECC source:** `ecc-reality-checker`
- **Model:** `claude-haiku-4-5-20251001`
- **Special role:** Can serve as "Risk Assessment" in PR Gate Pipeline (the 3rd gate
  that was missing in v1). Its "Default: NEEDS WORK" personality is perfect for risk assessment.
- **Prompt strategy:** ECC prompt as-is + add `<output_format>` with risk assessment block:
  ```
  ## Risk Assessment
  - Production readiness: [NEEDS WORK / CAUTIOUS GO / APPROVED]
  - Risks identified: [count]
  - Missing: [list of gaps]
  ```
- **Tags:** `quality-gate`, `risk-assessment`, `pr-gate`, `ecc-origin`

### B6. E2E Runner Agent
- **ECC source:** `ecc-e2e-runner`
- **Model:** `claude-sonnet-4-6`
- **Prompt strategy:** ECC prompt + agent-studio specifics:
  - Playwright config at `e2e/`
  - Page Object Models at `e2e/pages/`
  - 10 existing spec files to reference
  - `data-testid` convention
- **Tags:** `playwright`, `e2e`, `testing`, `ecc-origin`

---

## Phase C — Specialist Tools (4 agents)

Use ECC prompts as-is with minimal changes.

### C1. Refactor Cleaner
- **ECC source:** `ecc-refactor-cleaner`
- **Model:** `claude-sonnet-4-6`
- **Added constraint:** Never touch `src/generated/`, `prisma/migrations/`, `node_modules/`
- **Tags:** `refactoring`, `cleanup`, `ecc-origin`

### C2. Python Reviewer
- **ECC source:** `ecc-python-reviewer`
- **Model:** `claude-sonnet-4-6`
- **Scope:** `services/ecc-skills-mcp/` (FastMCP) + `deal-flow-agent/` (FastAPI)
- **Tags:** `python`, `fastapi`, `review`, `ecc-origin`

### C3. API Tester Agent
- **ECC source:** `ecc-api-tester`
- **Model:** `claude-haiku-4-5-20251001`
- **Scope:** agent-studio's 80+ API routes
- **Tags:** `api`, `testing`, `endpoints`, `ecc-origin`

### C4. Accessibility Auditor Agent
- **ECC source:** `ecc-accessibility-auditor`
- **Model:** `claude-haiku-4-5-20251001`
- **Tags:** `accessibility`, `wcag`, `a11y`, `ecc-origin`

---

## Phase D — Flow Builder Integration

After all agents are created and individually tested, wire them together.

### D1. Enable Agent-as-Tool on SDLC Orchestrator
- Open Flow Builder for Orchestrator agent
- Set `enableAgentTools: true` on the main ai_response node
- Test that Orchestrator can see and call all Phase A agents

### D2. Create PR Gate Pipeline Flow Template
A starter flow template that runs 3 agents in parallel after Code Generation:
```
[Code Generation output]
    ├── Security Reviewer Agent (parallel)
    ├── Code Reviewer Agent (parallel)
    └── Reality Checker Agent (parallel, risk assessment role)
         ↓ (aggregate)
    [PR Gate Result: PASS/FAIL + details]
```
Add to `src/data/starter-flows.ts` as `"pr-gate-pipeline"`

### D3. Create TDD Workflow Flow Template
```
[Product Discovery output]
    → TDD Guide Agent (generates test specs)
    → Code Generation Agent (implements code to pass tests)
    → parallel[Code Reviewer + Security Reviewer]
    → Deploy Decision Agent
```
Add to `src/data/starter-flows.ts` as `"tdd-dev-workflow"`

### D4. Create Security Audit Flow Template
```
[Architecture Decision output]
    → Security Engineer Agent (STRIDE, architecture-level)
    → Code Generation Agent
    → Security Reviewer Agent (OWASP, code-level)
    → Deploy Decision Agent
```
Add to `src/data/starter-flows.ts` as `"security-first-pipeline"`

### D5. End-to-End Pipeline Test
Run a complete idea → deploy cycle through the SDLC Orchestrator:
- Input: "Build a bookmark manager with tags and search"
- Expected: All 6 phases execute, PR Gate runs, GO decision, docs generated
- Verify all interop protocol blocks are present and parseable

---

## Phase E — Knowledge Base (optional, after D)

### Shared "Agent Studio Standards" KB
Create a Knowledge Base containing:
- `.claude/rules/typescript.md` — TypeScript rules
- `.claude/rules/api-routes.md` — API route patterns
- `.claude/rules/ui-components.md` — UI component rules
- `.claude/rules/node-handlers.md` — Handler patterns

Attach this KB to: Code Reviewer, Build Error Resolver, Frontend Developer, Database Reviewer,
Code Generation Agent (the agents that need to know project conventions).

This avoids duplicating project rules in every agent's system prompt.

---

## Agents NOT Created (5 agents)

| Agent | Reason |
|-------|--------|
| `ecc-test-results-analyzer` | Evals framework provides trend charts and per-case breakdowns |
| `ecc-tool-evaluator` | Low priority — CLAUDE.md defines all approved tools |
| `ecc-workflow-optimizer` | Too generic for direct dev value |
| `ecc-evidence-collector` | Niche QA role — E2E Runner covers testing needs |
| `ecc-commit-message-writer`* | Not in ECC templates; Doc Updater covers changelog scope |

*Note: commit-message-writer is referenced in ECC documentation but doesn't exist in the
29 JSON templates. Changelog generation is assigned to Doc Updater Agent.

---

## Summary: Agent Counts

| Category | Count | Details |
|----------|-------|---------|
| Existing SDLC agents | 7 | Orchestrator, Product Discovery, Architecture, Code Gen, CI/CD, Deploy, Perf |
| Phase A (pipeline critical) | 5 | Doc Updater, Code Reviewer, TDD Guide, Security Reviewer, Security Engineer |
| Phase B (dev workflow) | 6 | Build Error Resolver, Database Reviewer, Frontend Dev, Planner, Reality Checker, E2E Runner |
| Phase C (specialist) | 4 | Refactor Cleaner, Python Reviewer, API Tester, Accessibility Auditor |
| **Total live agents** | **22** | |
| Skipped (replaced/out of scope) | 5 | test-results-analyzer, tool-evaluator, workflow-optimizer, evidence-collector |
| Converted to Flow templates | 4 | tdd-pipeline, full-dev-workflow, security-audit, code-review-pipeline |

Model distribution:
- Opus: 1 (Code Generation — existing)
- Sonnet: 16 (Orchestrator + 5 SDLC + Security Engineer + Code Reviewer + TDD Guide + Security Reviewer + Build Error + DB Reviewer + Frontend + Planner + E2E Runner + Refactor + Python Reviewer)
- Haiku: 5 (Doc Updater, Reality Checker, API Tester, Accessibility Auditor, Perf Regression*)

*Perf Regression Detector was created with Sonnet but could be downgraded to Haiku.

---

## Execution Order

```
Phase A — Pipeline Critical (immediate, this session)
  1. Doc Updater Agent (Haiku) ← fixes broken reference
  2. Code Reviewer Agent (Sonnet) ← PR Gate
  3. TDD Guide Agent (Sonnet) ← pre-Code-Gen
  4. Security Reviewer Agent (Sonnet) ← PR Gate
  5. Security Engineer Agent (Sonnet) ← Phase 2 architecture security

Phase A+ — Orchestrator Integration (same session, after A)
  6. PATCH Orchestrator system prompt with agent references
  7. Quick integration test: Orchestrator mentions agents by name

Phase B — Dev Workflow (next session)
  8-13. Create all 6 agents in batch (all independent)

Phase C — Specialist Tools (after B tested)
  14-17. Create all 4 agents in batch

Phase D — Flow Builder Wiring (after C)
  18. Enable agent-as-tool on Orchestrator
  19. Create PR Gate Pipeline starter flow
  20. Create TDD Workflow starter flow
  21. Create Security Audit starter flow
  22. End-to-end pipeline test

Phase E — Knowledge Base (optional)
  23. Create "Agent Studio Standards" KB
  24. Attach to relevant agents
```

---

## API Call Template

All agents created via the same pattern:

```javascript
// POST https://agent-studio-production-c43e.up.railway.app/api/agents
{
  "name": "[Agent Name]",
  "description": "[1-2 sentence description]",
  "systemPrompt": "[Full XML prompt]",
  "model": "claude-sonnet-4-6",  // or claude-haiku-4-5-20251001, claude-opus-4-6
  "tags": ["ecc-origin", "specific-tag-1", "specific-tag-2"],
  "isPublic": true
}
```

Note: `category` field omitted (returned null in previous session — known bug).

---

## Open Questions (Resolved from v1)

| Question | v1 Status | v2 Decision |
|----------|-----------|-------------|
| Doc Updater prompt format? | Open | **Full XML** — it's pipeline-critical |
| Planner: Sonnet or Opus? | Open | **Sonnet** — planning doesn't need Opus reasoning |
| Pipeline orchestrators: agents or flows? | Open | **Flow templates** in Phase D |
| Phase B: batch or sequential? | Open | **Batch** — all independent |
| Security Engineer: Phase A or C? | N/A (new) | **Phase A** — fills "Swarm Security Analyst" gap |
| Risk Assessment: new agent? | N/A (new) | **Reality Checker** in B5 covers this role |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent-as-tool doesn't see all agents | Medium | HIGH | Test after Phase A+ with explicit verification |
| Interop protocol formats not followed by agents | Medium | HIGH | Include examples in each prompt's `<examples>` section |
| Chrome JS tool timeout on batch creation | Low | LOW | Split into 2-3 calls per batch if needed |
| Agents produce good output independently but fail in pipeline | Medium | HIGH | Phase D end-to-end test catches this |
| Haiku agents produce lower quality for pipeline roles | Low | MEDIUM | Doc Updater and Reality Checker are scoped simply enough for Haiku |
