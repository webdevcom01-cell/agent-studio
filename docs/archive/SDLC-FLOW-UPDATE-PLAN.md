# SDLC Flow Update Plan — Integracija Faza 1-6

**Datum:** 6. april 2026.
**Preduslov:** Sve 6 faza iz AGENT-IMPROVEMENT-PLAN.md su implementirane i pushnuty.
**Cilj:** Povezati nove node tipove (`project_context`, `sandbox_verify`, typed schemas, escalating retry, A2A cards, MCP enforcement) sa postojećim SDLC pipeline-om.

---

## Trenutno stanje

Postoje 3 sloja koja treba ažurirati:

1. **Starter Flows** (`src/data/starter-flows.ts`) — pre-built flow šabloni koji koriste stare node tipove
2. **ECC Agent Templates** (`src/data/ecc-agent-templates.json`) — 29 agentskih definicija bez outputSchema konfiguracije
3. **SDLC Orchestrator Prompt** (`sdlc-prompts/01-sdlc-orchestrator.md`) — system prompt koji ne referencira nove node tipove

---

## KORAK 1: Ažuriranje Starter Flows

**Fajl:** `src/data/starter-flows.ts`

### 1.1 — ecc-tdd-pipeline

Trenutno: `Planner → TDD Guide → parallel(Code Review + Security Review)`

Novo:
```
project_context → Planner → TDD Guide → Code Gen (outputSchema: CodeGenOutput)
  → sandbox_verify → [passed] → parallel(Code Review + Security Review) (outputSchema: PRGateOutput)
                    → [failed] → retry (enableEscalation: true) → Code Gen
```

Konkretne izmene:
- Dodaj `project_context` node na početak flow-a sa:
  - `contextFiles: ["CLAUDE.md", ".claude/rules/*.md"]`
  - `outputVariable: "projectContext"`
- Dodaj `sandbox_verify` node posle Code Gen-a sa:
  - `checks: ["typecheck", "lint", "forbidden_patterns"]`
  - `inputVariable: "generatedCode"`
- Uključi `outputSchema: "CodeGenOutput"` na Code Gen ai_response node-u
- Uključi `outputSchema: "PRGateOutput"` na Code Review ai_response node-u
- Zameni standardni retry sa `enableEscalation: true` retry node-om
  - `failureVariable: "sandboxResult"`
  - `failureValues: ["FAIL"]`

### 1.2 — ecc-code-review-pipeline

Trenutno: Structured code review workflow bez verifikacije.

Novo:
```
project_context → Code Review (outputSchema: PRGateOutput)
  → condition (decision === "BLOCK") → [true] → human_approval → retry
                                      → [false] → end
```

Konkretne izmene:
- Dodaj `project_context` node na početak
- Dodaj `outputSchema: "PRGateOutput"` na Code Review ai_response
- Dodaj `condition` node koji čita `prGateResult.decision`
- Ako BLOCK → human_approval node za manuelni pregled

### 1.3 — devsecops-orchestrator

Trenutno: Full DevSecOps pipeline sa risk aggregation.

Novo:
```
project_context → Architecture → parallel(Security Engineer + Code Gen)
  → sandbox_verify → [passed] → parallel(Code Review + Security Review + Reality Checker)
                    → [failed] → retry (escalating) → Code Gen
  → aggregate (risk scores) → Deploy Decision → human_approval
```

Konkretne izmene:
- Dodaj `project_context` na početak
- Dodaj `sandbox_verify` posle Code Gen
- Uključi typed schemas na svim ai_response node-ovima
- Uključi `enableEscalation` na retry node-ovima
- Dodaj `inputSchema` / `outputSchema` na call_agent i mcp_tool node-ove

### 1.4 — NOVI: sdlc-full-pipeline

Kreirati potpuno novi starter flow koji implementira kompletan SDLC pipeline iz `01-sdlc-orchestrator.md` sa svim Faza 1-6 poboljšanjima:

```
project_context
  → Phase 1: Product Discovery (ai_response, outputSchema: ProductDiscoveryOutput)
  → Phase 2: parallel(
      Architecture (ai_response, outputSchema: ArchitectureOutput),
      Security Engineer (ai_response),
      TDD Guide (ai_response)
    )
  → Phase 3: Code Gen (ai_response, outputSchema: CodeGenOutput)
    → sandbox_verify → [passed] → parallel(
        Code Review (outputSchema: PRGateOutput),
        Security Review (outputSchema: PRGateOutput),
        Reality Checker
      )
    → [failed] → retry (enableEscalation, max 2)
  → Phase 4: CI/CD Generator (ai_response)
  → Phase 5: Deploy Decision → human_approval
  → Phase 6: Performance Monitor (opciono)
```

Ovaj flow koristi SVE nove node tipove i služi kao referentna implementacija.

---

## KORAK 2: Ažuriranje ECC Agent Templates

**Fajl:** `src/data/ecc-agent-templates.json`

### 2.1 — Dodati outputSchema konfiguraciju

Za svaki ECC agent template koji generiše strukturiran output, dodati `defaultOutputSchema` polje:

| Agent | outputSchema |
|-------|-------------|
| `ecc-planner` | (ostaviti bez — output je nestrukturiran plan) |
| `ecc-architect` | `"ArchitectureOutput"` (novo — dodati u schemas.ts) |
| `ecc-code-reviewer` | `"PRGateOutput"` |
| `ecc-security-reviewer` | `"PRGateOutput"` |
| `ecc-security-engineer` | (ostaviti bez — output je STRIDE narativ) |
| `ecc-tdd-guide` | (ostaviti bez — output je test specifikacija) |
| `ecc-doc-updater` | (ostaviti bez — output je markdown) |
| `ecc-reality-checker` | `"PRGateOutput"` |

### 2.2 — Dodati contextRequired flag

Za agente koji trebaju projektni kontekst:

| Agent | contextRequired |
|-------|----------------|
| `ecc-code-reviewer` | `true` |
| `ecc-security-reviewer` | `true` |
| `ecc-reality-checker` | `true` |
| Ostali | `false` |

Ovo govori orchestratoru da pre poziva ovog agenta mora da ubaci `project_context` node.

### 2.3 — Nova schema u schemas.ts

Dodati u `src/lib/sdlc/schemas.ts`:

```typescript
const ArchitectureOutputSchema = z.object({
  techStack: z.array(z.object({
    category: z.string(),
    choice: z.string(),
    justification: z.string(),
  })),
  systemDesign: z.string(),
  databaseSchema: z.string().optional(),
  apiDesign: z.string().optional(),
  securityConsiderations: z.array(z.string()),
  deploymentStrategy: z.string(),
  summary: z.string(),
});
```

Registrovati u SCHEMA_REGISTRY.

---

## KORAK 3: Ažuriranje SDLC Orchestrator Prompta

**Fajl:** `sdlc-prompts/01-sdlc-orchestrator.md`

### 3.1 — Dodati sekciju o novim node tipovima

Na kraj system prompta dodati:

```markdown
## Pipeline Node Types

When building execution plans, use these specialized nodes:

### project_context
- Place at the START of every pipeline
- contextFiles: ["CLAUDE.md", ".claude/rules/*.md"]
- Provides {{projectContext}} to all downstream agents

### sandbox_verify
- Place AFTER Code Generation, BEFORE PR Gate
- checks: ["typecheck", "lint", "forbidden_patterns"]
- Routes to "passed" or "failed" handle
- On failure: retry with escalating context

### Typed Output Schemas
- Code Generation agents: outputSchema = "CodeGenOutput"
- Review agents: outputSchema = "PRGateOutput"
- Architecture agents: outputSchema = "ArchitectureOutput"
- Ensures structured, parseable output between agents

### Escalating Retry
- Use retry node with enableEscalation: true
- Attempt 1: PR Gate fix fields + projectContext
- Attempt 2: Above + sandbox errors + few-shot examples
- Max 2 retries, then PAUSE and report to user
```

### 3.2 — Ažurirati Phase 3 opis

Trenutni Phase 3 ne uključuje sandbox verifikaciju. Ažurirati:

```markdown
### Phase 3 — Code Generation + Verification + PR Gate

1. Code Generation Agent generates code (outputSchema: CodeGenOutput)
2. sandbox_verify runs deterministic checks:
   - TypeScript compilation (tsc --noEmit)
   - ESLint
   - Forbidden patterns (@prisma/client, any types, console.log)
3. If sandbox FAILS → retry with escalating context (max 2x)
4. If sandbox PASSES → PR Gate (parallel):
   - Code Reviewer: score ≥ 70/100
   - Security Reviewer: zero CRITICAL/HIGH
   - Reality Checker: all must-have stories addressed
5. If PR Gate BLOCKS → retry Code Gen with fix fields (max 2x)
6. 2x FAIL on either gate → PAUSE, report to user
```

---

## KORAK 4: Meta-Orchestrator Update

**Fajl:** `src/lib/ecc/meta-orchestrator.ts`

### 4.1 — Ažurirati ROUTING_TABLE

Dodati `project_context` i `sandbox_verify` u pipelines za relevantne task tipove:

```typescript
const ROUTING_TABLE: Record<string, string[]> = {
  "new-feature": ["project_context", "ecc-planner", "ecc-tdd-guide", "sandbox_verify", "ecc-code-reviewer"],
  "bug-fix": ["project_context", "ecc-tdd-guide", "sandbox_verify", "ecc-code-reviewer", "ecc-security-reviewer"],
  "security-audit": ["project_context", "ecc-security-reviewer", "ecc-security-engineer"],
  "code-review": ["project_context", "ecc-code-reviewer"],
  "architecture": ["ecc-architect", "ecc-planner"],
  "refactor": ["project_context", "ecc-planner", "sandbox_verify", "ecc-code-reviewer"],
  // ostali task tipovi ostaju isti
};
```

### 4.2 — Dodati schema-aware routing

Kad meta-orchestrator kreira pipeline, za svaki agent koji ima `defaultOutputSchema`, automatski konfiguriše `outputSchema` na odgovarajućem ai_response node-u.

---

## KORAK 5: A2A Agent Cards za SDLC Agente

### 5.1 — Ažurirati ECC agent templates

Za svaki ECC agent dodati `isPublic: true` flag (ili ostaviti default false za interne agente). Javni agenti dobijaju automatski Agent Card na `/.well-known/agent-cards`.

### 5.2 — Skills za Agent Cards

Svaki ECC agent template treba da ima `skills` polje koje opisuje njegove sposobnosti za A2A discovery:

```json
{
  "id": "ecc-code-reviewer",
  "skills": [
    {
      "id": "code-review",
      "name": "Code Quality Review",
      "description": "Reviews code for quality, security, and convention compliance",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ]
}
```

---

## Redosled implementacije

| Korak | Zavisnosti | Procenjen effort |
|-------|-----------|-------------------|
| 1. Starter Flows | Nema | 2-3 dana |
| 2. ECC Agent Templates | Korak 1 (da testiramo) | 1 dan |
| 3. Orchestrator Prompt | Koraci 1-2 | 0.5 dana |
| 4. Meta-Orchestrator | Koraci 1-3 | 1 dan |
| 5. A2A Agent Cards | Korak 2 | 0.5 dana |

**Ukupno: 5-6 dana rada**

---

## Verifikacija

Kad se sve implementira, pokrenuti URL shortener task ponovo sa istim promptom:
```
Build a simple URL shortener. Next.js 15, Prisma, PostgreSQL.
```

Očekivani rezultat:
- Code Gen agent **neće** koristiti `@prisma/client` (jer ima projectContext)
- sandbox_verify **uhvata** TypeScript greške pre PR Gate (deterministički)
- PR Gate daje **konkretne fix-ove**, ne dijagnoze
- Retry šalje **eskalirajući kontekst** sa primerima koda
- Output je **strukturiran JSON** (CodeGenOutput), ne markdown

Ako pipeline prođe bez PAUSE na prvom pokušaju — uspeli smo.

---

## Reference

- [AGENT-IMPROVEMENT-PLAN.md](./AGENT-IMPROVEMENT-PLAN.md) — Tehničke detalje Faza 1-6
- [SDLC-AGENTS-PLAN.md](./SDLC-AGENTS-PLAN.md) — Originalni SDLC arhitektura plan
- [01-sdlc-orchestrator.md](./sdlc-prompts/01-sdlc-orchestrator.md) — Orchestrator system prompt
