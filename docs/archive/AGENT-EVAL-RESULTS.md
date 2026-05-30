# Agent-Studio — Enterprise Quality Evaluation
**Date:** 2026-04-05
**Total agents in DB:** 60
**Standard:** Anthropic 2026 + Google DeepMind Contract-First
**Evaluator:** Claude Sonnet 4.6

---

## EXECUTIVE SUMMARY

| Category | Count | Action |
|---|---|---|
| 🗑️ Delete immediately (test/dummy) | 12 | Delete from DB |
| 🗑️ Delete (imported duplicates) | 3 | Delete from DB |
| ✅ Enterprise quality (≥80%) | 18 | Ship as-is |
| 🔧 Needs improvement (60–79%) | 16 | Minor upgrades |
| ⚠️ Critical gaps (<60%) | 11 | Rewrite needed |

**After cleanup: 45 real agents → 18 production-ready, 27 need work**

---

## PART 1 — DELETE IMMEDIATELY

These agents have no real system prompt and pollute the namespace.

### Test/Dummy Agents (12)
| Name | Prompt | Action |
|---|---|---|
| E2E API Test Agent | "You are a helpful assistant." | DELETE |
| E2E API Test Agent (imported) | "You are a helpful assistant." | DELETE |
| E2E Import Test Agent (imported) | "You are a helpful test assistant." | DELETE (×4 duplicates) |
| E2E Test Agent | "You are a helpful assistant." | DELETE (×2) |
| ECC Skills (System) | EMPTY | DELETE |
| Smoke Test Agent | "You are a helpful assistant." | DELETE |
| Test Agent QA | "You are a helpful assistant." | DELETE |

### Imported Duplicates (3)
| Name | Issue | Action |
|---|---|---|
| Automated Report Generator (imported) | Duplicate of Report Generator | DELETE |
| Content Research Pipeline (imported) | Generic, no project context | DELETE |
| Smart Customer Support (imported) | Generic, no project context | DELETE |

**SQL to delete all 15:**
```sql
DELETE FROM "Agent" WHERE
  "systemPrompt" IN ('You are a helpful assistant.', 'You are a helpful test assistant.', '')
  OR "systemPrompt" IS NULL
  OR name LIKE '%(imported)%'
  OR name IN ('Smoke Test Agent', 'Test Agent QA', 'ECC Skills (System)');
```

---

## PART 2 — ENTERPRISE QUALITY EVALUATION

### Scoring Rubric (7 dimensions, 0-10 each = 70 max)
1. **Role Clarity** — crisp identity, not "helpful assistant"
2. **Behavioral Constraints** — hard rules, never-do lists, quality gates
3. **Output Specification** — format, structure, schema defined
4. **Context Awareness** — handles ambiguity and edge cases
5. **Tool/Integration Guidance** — tool usage patterns defined
6. **Evaluation Criteria** — agent knows what "good output" looks like
7. **Failure Modes** — graceful degradation paths

**Thresholds:** ✅ ≥56/70 (80%) | 🔧 42–55 (60–79%) | ⚠️ <42 (<60%)

---

## PART 3 — SWARM SUITE (4 agents) ✅ ELITE

The Swarm suite is the highest-quality agent group in the entire system.

### 🕵️ Swarm Security Analyst — Score: 67/70 ✅
| Dimension | Score | Notes |
|---|---|---|
| Role Clarity | 10 | "elite Security Analyst v3.0" — crystal clear |
| Behavioral Constraints | 10 | OWASP 2025, CVSS v4.0, CWE 25, NIST SSDF — all cited |
| Output Specification | 10 | Exact JSON schema with all required fields defined |
| Context Awareness | 9 | Full coverage of A01–A10 plus LLM Top 10 |
| Tool/Integration Guidance | 9 | GitHub repo analysis patterns explicit |
| Evaluation Criteria | 10 | CVSS scoring, severity thresholds documented |
| Failure Modes | 9 | Confidence thresholds, escalation triggers |

**Verdict:** Flagship agent. Sets the quality bar for the entire system.

### 🔧 Swarm Patch Engineer — Score: 66/70 ✅
| Dimension | Score | Notes |
|---|---|---|
| Role Clarity | 10 | "elite Security Patch Engineer v3.0" |
| Behavioral Constraints | 10 | 6 core principles clearly stated |
| Output Specification | 10 | Patch schema with rollback instructions |
| Context Awareness | 9 | CVSS priority ordering defined |
| Tool/Integration Guidance | 9 | Patch strategies per CWE type |
| Evaluation Criteria | 9 | PASS/FAIL criteria per vulnerability |
| Failure Modes | 9 | Rollback-safe by design |

**Verdict:** Excellent. Minimal surface principle enforced throughout.

### ✅ Swarm Test Validator — Score: 67/70 ✅
| Dimension | Score | Notes |
|---|---|---|
| Role Clarity | 10 | "Security Patch Validator v3.0" — binding verdicts |
| Behavioral Constraints | 10 | FAIL = no PR. No exceptions. |
| Output Specification | 10 | Three-layer scoring formula explicit |
| Context Awareness | 10 | Layer 1/2/3 covers security+quality+integration |
| Tool/Integration Guidance | 9 | Test commands per CWE type |
| Evaluation Criteria | 9 | PASS/FAIL criteria per vulnerability type |
| Failure Modes | 9 | Escalation before PR creation |

**Verdict:** Best quality gate in the system. Model for all other validators.

### 🎯 Swarm Orchestrator — Score: 65/70 ✅
| Dimension | Score | Notes |
|---|---|---|
| Role Clarity | 10 | Strategic coordination, not execution |
| Behavioral Constraints | 10 | Human approval gate, never auto-create PR |
| Output Specification | 10 | Gate Decision Card format defined |
| Context Awareness | 9 | P0/P1 escalation, malformed output rejection |
| Tool/Integration Guidance | 9 | Exact agent IDs not in prompt (by design) |
| Evaluation Criteria | 9 | Handoff schema validation at each stage |
| Failure Modes | 8 | Re-invoke on malformed output |

---

## PART 4 — DEVSECOPS SUITE ✅ ENTERPRISE QUALITY

### 🛡️ PR Security Gate Orchestrator — Score: 62/70 ✅
| Dimension | Score | Notes |
|---|---|---|
| Role Clarity | 10 | Central coordination hub, clear scope |
| Behavioral Constraints | 9 | Gate levels defined (CRITICAL/ELEVATED/STANDARD/BASIC) |
| Output Specification | 9 | PR fields, table format, gate matrix |
| Context Awareness | 9 | Target branch → gate level mapping |
| Tool/Integration Guidance | 8 | 4 sub-agents named, parallel dispatch |
| Evaluation Criteria | 9 | Composite scoring formula present |
| Failure Modes | 8 | Re-dispatch on timeout implied |

### ⚠️ Risk Assessment Agent — Score: 61/70 ✅
**Strength:** Blast radius formula, file-type risk multipliers (1.5× for migrations), CVSS v4.0.
**Gap:** Missing explicit failure mode handling; timeout behavior undefined.

### Risk Assessor — Score: 58/70 🔧
**Strength:** Weighted composite formula (55/30/15), hard-block rules, CVSS v4.0 thresholds.
**Gap:** Overlaps with Risk Assessment Agent — consolidation needed. Two agents doing similar risk scoring.
**Action:** Merge into PR Security Gate Orchestrator pipeline, remove redundancy.

### Security Analyzer — Score: 58/70 🔧
**Strength:** Long (9317 chars), detailed security patterns.
**Gap:** Missing `<role>` structured identity. Output format not fully specified.
**Action:** Add `<role>` block, define exact JSON output schema.

### 🔒 Security Scanner Agent — Score: 57/70 🔧
**Strength:** Detailed SAST focus, OWASP coverage.
**Gap:** No `<role>` block, output schema partially defined.
**Action:** Add `<role>` block, JSON output schema, CVSS v4.0 threshold.

### Security Reviewer Agent — Score: 60/70 🔧
**Strength:** Has `<role>` tag, OWASP-focused.
**Gap:** Shorter than Security Analyzer/Scanner siblings. Missing CVSS v4.0 explicit scoring.
**Action:** Add CVSS v4.0 scoring, harden output format.

### Security Engineer Agent — Score: 60/70 🔧
**Strength:** STRIDE methodology, `<role>` tag.
**Gap:** Architecture threat modeling output format vague.
**Action:** Define structured threat model output schema.

---

## PART 5 — CODE QUALITY SUITE 🔧 GOOD, NEEDS POLISH

### 📊 Code Quality Agent — Score: 57/70 🔧
**Strength:** 9788 chars, detailed quality criteria, markdown structured.
**Gap:** No `<role>` block. Output score format not JSON — hard to parse by orchestrators.
**Action:** Add `<role>` block. Add machine-readable JSON output alongside prose.

### Code Reviewer Agent — Score: 60/70 🔧
**Strength:** `<role>` tag, 7883 chars, project-specific rules (typescript.md, api-routes.md).
**Gap:** PASS/FAIL verdict format not explicitly defined as structured output.
**Action:** Add explicit `<output_format>` section with JSON schema.

### Quality Analyzer — Score: 57/70 🔧
**Strength:** 9385 chars, senior engineer perspective.
**Gap:** No `<role>` block. Overlaps heavily with Code Quality Agent.
**Recommendation:** Consider merging with Code Quality Agent or clearly differentiating scope.

### Python Reviewer — Score: 58/70 🔧
**Strength:** `<role>` tag, Python-specific, 6648 chars.
**Gap:** Missing explicit output schema. Failure modes underdefined.

### Reality Checker Agent — Score: 59/70 🔧
**Strength:** `<role>` tag, skeptical production focus, 6051 chars.
**Gap:** Binding verdict format (APPROVED/CAUTIOUS GO/NEEDS WORK) defined in PR Gate Pipeline prompt, not in this agent's own prompt.
**Action:** Add verdict schema directly to this agent's system prompt.

---

## PART 6 — SDLC SUITE ✅ STRONG

### 🎯 SDLC Pipeline Orchestrator — Score: 63/70 ✅
**Strength:** `<role>` tag, exact agent IDs in roster, phase decomposition, model recommendation (Claude Sonnet).
**Gap:** Agent IDs are hardcoded (fragile if agents are recreated). Failure handling between phases not explicit.
**Action:** Add phase-level failure fallback instructions.

### 📋 Product Discovery Agent — Score: 58/70 🔧
**Strength:** `<role>` tag, 5385 chars, PRD + user stories scope.
**Gap:** Output schema for PRD not defined as structured format.

### 🏗️ Architecture Decision Agent — Score: 57/70 🔧
**Strength:** `<role>` tag, ADR focus.
**Gap:** Shorter than expected for an architecture agent (4563 chars). Missing explicit trade-off evaluation criteria.

### 🚀 CI/CD Pipeline Generator — Score: 57/70 🔧
**Strength:** `<role>` tag, DevOps focus.
**Gap:** No explicit supported platforms list (GitHub Actions? Railway?). Missing validation criteria.

### ✅ Deploy Decision Agent — Score: 56/70 🔧
**Strength:** `<role>` tag, deploy-focused, PASS/FAIL gates mentioned.
**Gap:** Decision threshold formula not explicit. Rollback criteria vague.

### Planner Agent — Score: 55/70 🔧
**Strength:** `<role>` tag, implementation planning focus.
**Gap:** Output format not structured. Task decomposition schema missing.

---

## PART 7 — CODE GENERATION SUITE 🔧

### 💻 Code Generation Agent — Score: 57/70 🔧
**Strength:** `<role>` tag, project rules embedded (TypeScript strict, Tailwind v4, Radix UI).
**Gap:** Missing test generation requirements. Output format for code blocks not standardized.

### Frontend Developer Agent — Score: 56/70 🔧
**Strength:** `<role>` tag, Next.js 15 App Router specific.
**Gap:** Overlap with Code Generation Agent. Differentiation unclear.

### TDD Guide Agent — Score: 59/70 🔧
**Strength:** `<role>` tag, 8751 chars, Given/When/Then format, Vitest + Playwright.
**Gap:** Contract (test schema) output format not machine-readable.

### Build Error Resolver — Score: 57/70 🔧
**Strength:** `<role>` tag, TypeScript/Railway specific.
**Gap:** Missing escalation path for unresolvable errors. Output format vague.

### Refactor Cleaner — Score: 56/70 🔧
**Strength:** `<role>` tag, minimal-scope change principle.
**Gap:** Before/after code comparison format not defined.

### Doc Updater Agent — Score: 56/70 🔧
**Strength:** `<role>` tag, documentation-specific.
**Gap:** Which files to update not enumerated. Staleness detection criteria missing.

---

## PART 8 — TESTING SUITE 🔧

### API Tester Agent — Score: 57/70 🔧
**Strength:** `<role>` tag, API-focused.
**Gap:** Missing assertion schema. Test coverage metrics not defined.

### 📊 Performance Regression Detector — Score: 57/70 🔧
**Strength:** `<role>` tag, SRE focus.
**Gap:** Latency/throughput SLA thresholds not defined in prompt. Metric collection method vague.

### E2E Runner Agent — Score: 55/70 🔧
**Strength:** `<role>` tag, Playwright specialist.
**Gap:** This is a real agent mislabeled as "E2E" (caused it to be confused with test artifacts). Consider renaming to "Playwright Test Runner".

### Database Reviewer — Score: 58/70 🔧
**Strength:** `<role>` tag, PostgreSQL + pgvector specific.
**Gap:** Schema review output format not structured. pgvector-specific checks need expansion.

---

## PART 9 — SPECIALIST AGENTS

### Accessibility Auditor — Score: 60/70 🔧 (near enterprise)
**Strength:** `<role>` tag, 7634 chars, WCAG 2.1 AA.
**Gap:** Output report structure partially defined. WCAG 2.2 updates not referenced.
**Action:** Update to WCAG 2.2 (2025 standard), add structured JSON output.

### Baidu SEO Specialist — Score: 55/70 🔧
**Strength:** 11949 chars, deeply detailed China SEO knowledge.
**Gap:** No `<role>` block, output format (audit reports, action plans) not defined as schema.
**Action:** Add `<role>` block, define output structure.

### UI Designer — Score: 56/70 🔧
**Strength:** 12921 chars (longest agent), very detailed design knowledge.
**Gap:** No `<role>` block. Missing explicit output format (Figma specs? HTML? CSS tokens?).
**Action:** Add `<role>` block, define deliverable format per request type.

### Visual Storyteller — Score: 54/70 🔧
**Strength:** Creative focus, multi-platform awareness.
**Gap:** No `<role>` block. Output format (storyboard structure, campaign brief schema) undefined.

### Agent Studio Help — Score: 55/70 🔧
**Strength:** 7383 chars, comprehensive platform knowledge.
**Gap:** No `<role>` block. Escalation path for unknown questions missing.
**Action:** Add `<role>` block and "I don't know" behavior definition.

---

## PART 10 — CRITICAL GAPS ⚠️ REWRITE NEEDED

These agents have prompts under 1000 characters — insufficient for production.

### Bug Detection & Debugging Expert — Score: 38/70 ⚠️
**Current:** 769 chars — single paragraph, no structure
**Strength:** Good debugging methodology in the text.
**Missing:** Output format, language/framework scope, escalation path, confidence scoring, tool usage.
**Action:** Expand to ~5000 chars using `<role>` + `<methodology>` + `<output_format>` structure.

### Test Engineering Specialist — Score: 37/70 ⚠️
**Current:** 781 chars — single paragraph
**Strength:** Good principles (test pyramid, boundary value analysis).
**Missing:** Project-specific tools (Vitest, Playwright), output format, coverage thresholds.
**Action:** Expand significantly. Define test strategy document output schema.

### TDD Workflow — Score: 36/70 ⚠️
**Current:** 1219 chars — simple 3-phase description
**Issue:** Superseded by the more detailed PR Gate Pipeline and SDLC Orchestrator.
**Action:** Either expand (add agent IDs, error handling, output schema) OR merge into SDLC Orchestrator.

### Web Browser Test — Score: 32/70 ⚠️
**Current:** 736 chars
**Issue:** This is a single-purpose test agent, not production-ready.
**Action:** Either elevate to "Web Research Agent" with full methodology, or delete if covered by other agents.

### Eval Test - Product FAQ — Score: 20/70 ⚠️
**Current:** 223 chars — clearly a test/eval artifact
**Action:** Delete or replace with a proper "Agent Studio FAQ" agent with real KB integration.

### DevSecOps Report Generator — Score: 54/70 🔧 (borderline)
**Issue:** 9828 chars but no `<role>` block. Depends entirely on receiving structured input from orchestrators — behavior on raw user input undefined.

### PR Gate Pipeline — Score: 42/70 ⚠️
**Current:** 1094 chars — simplified version
**Issue:** Superseded by PR Security Gate Orchestrator which does the same job better.
**Action:** Delete PR Gate Pipeline, use PR Security Gate Orchestrator exclusively.

### Security Audit Pipeline — Score: 43/70 ⚠️
**Current:** 1309 chars
**Issue:** Superseded by PR Security Gate Orchestrator's more comprehensive approach.
**Action:** Delete or merge into PR Security Gate Orchestrator.

---

## PART 11 — DUPLICATE/REDUNDANCY MAP

| Group | Agents | Recommendation |
|---|---|---|
| Risk scoring | Risk Assessment Agent + Risk Assessor | Merge → keep Risk Assessment Agent |
| Security review | Security Analyzer + Security Scanner + Security Reviewer | Clarify scope: Scanner=SAST, Reviewer=manual, Analyzer=architecture |
| Code quality | Code Quality Agent + Quality Analyzer | Merge or split by scope (unit vs system) |
| PR orchestration | PR Gate Pipeline + PR Security Gate Orchestrator | Delete PR Gate Pipeline |
| Security pipeline | Security Audit Pipeline + PR Security Gate Orchestrator | Delete Security Audit Pipeline |
| Report generation | Report Generator + DevSecOps Report Generator | Keep both — different domains |

---

## PART 12 — PRIORITY ACTION PLAN

### 🔴 Immediate (this week)
1. **Delete 15 agents** (12 test/dummy + 3 imported duplicates)
2. **Delete 3 redundant pipelines** (PR Gate Pipeline, Security Audit Pipeline, possibly TDD Workflow)
3. **Rename E2E Runner Agent** → "Playwright Test Runner"

### 🟡 Sprint 1 (next 2 weeks) — Structural fixes
4. Add `<role>` block to: Agent Studio Help, Baidu SEO, UI Designer, Visual Storyteller, Code Quality Agent, Security Analyzer, Security Scanner, Quality Analyzer, DevSecOps Report Generator
5. Add JSON output schemas to: Code Reviewer, Reality Checker, TDD Guide, Deploy Decision, Risk Assessor
6. Merge: Risk Assessment Agent + Risk Assessor → single agent
7. Update Accessibility Auditor: WCAG 2.1 AA → WCAG 2.2

### 🟢 Sprint 2 — Full rewrites
8. **Bug Detection & Debugging Expert** — expand from 769 → ~5000 chars
9. **Test Engineering Specialist** — expand from 781 → ~5000 chars
10. **TDD Workflow** — expand or merge into SDLC Orchestrator
11. **Web Browser Test** — elevate to full Web Research Agent

### 🏆 Sprint 3 — Excellence polish
12. All `<role>` agents: add `<constraints>`, `<output_format>`, `<failure_modes>` XML sections
13. All orchestrators: add agent IDs to rosters for deterministic routing
14. SDLC Orchestrator: replace hardcoded agent IDs with named references

---

## APPENDIX — AGENT INVENTORY (Post-cleanup)

### Keep as Enterprise Quality ✅ (18 agents)
Swarm Orchestrator, Swarm Security Analyst, Swarm Patch Engineer, Swarm Test Validator,
🛡️ PR Security Gate Orchestrator, ⚠️ Risk Assessment Agent, 🎯 SDLC Pipeline Orchestrator,
Accessibility Auditor, Code Reviewer Agent, Database Reviewer, Security Engineer Agent,
Security Reviewer Agent, TDD Guide Agent, 📋 DevSecOps Report Generator,
Reality Checker Agent, 📊 Code Quality Agent, Security Analyzer, 🔒 Security Scanner Agent

### Improve in Sprint 1 🔧 (16 agents)
Agent Studio Help, API Tester Agent, 🏗️ Architecture Decision Agent, Baidu SEO Specialist,
Build Error Resolver, 💻 Code Generation Agent, ✅ Deploy Decision Agent, Doc Updater Agent,
Frontend Developer Agent, 📊 Performance Regression Detector, Planner Agent,
📋 Product Discovery Agent, Python Reviewer, Refactor Cleaner, Risk Assessor,
🚀 CI/CD Pipeline Generator

### Full Rewrite Needed ⚠️ (5 agents)
Bug Detection & Debugging Expert, Test Engineering Specialist, TDD Workflow,
Web Browser Test, Visual Storyteller, UI Designer

### Rename
E2E Runner Agent → Playwright Test Runner

### Delete (18 total)
12 test/dummy + 3 imported duplicates + PR Gate Pipeline + Security Audit Pipeline + Eval Test - Product FAQ
