# PLAN: Agent Evals / Testing Framework

> Status: COMPLETED ✅
> Priority: HIGH
> Actual complexity: 20 files, ~3900 LOC, 100 new unit tests (5 test files)
> Completed: 2026-03-17 (Phases 1–5, all committed and pushed)
> Dependencies: Vercel AI SDK v6 (`ai/test`), Prisma, existing runtime engine

---

## 1. PROBLEM STATEMENT

When a developer modifies an agent's flow, system prompt, or knowledge base, there is currently
no automated way to verify the agent still produces correct responses. Testing is entirely manual:
open chat, type a question, visually inspect the answer. This does not scale and makes regressions
invisible.

**Goal:** A built-in evaluation framework that lets users define test suites with structured
assertions, run them against agents, and track results over time.

---

## 2. INDUSTRY STANDARDS & RESEARCH

### 2.1 Evaluation Approaches (Layered Strategy)

Industry best practice uses a layered evaluation strategy — deterministic checks first, then
semantic/LLM-based evaluation only when needed:

| Layer | Type | Cost | Reliability |
|-------|------|------|-------------|
| 1 | Deterministic | Free | 100% reproducible |
| 2 | Semantic similarity | ~$0.001/eval | ~95% reproducible |
| 3 | LLM-as-Judge | ~$0.01/eval | ~85% reproducible |

### 2.2 Assertion Types (Inspired by Promptfoo + OpenAI Evals)

**Deterministic assertions (Layer 1):**
- `exact_match` — output equals expected string exactly
- `contains` — output contains substring
- `icontains` — case-insensitive contains
- `not_contains` — output must NOT contain string
- `regex` — output matches regex pattern
- `starts_with` — output starts with string
- `json_valid` — output is valid JSON
- `json_schema` — output matches Zod/JSON schema
- `latency` — response time under threshold (ms)

**Semantic assertions (Layer 2):**
- `semantic_similarity` — cosine similarity between output embedding and reference embedding, with configurable threshold (default 0.8)

**LLM-as-Judge assertions (Layer 3):**
- `llm_rubric` — LLM evaluates output against custom criteria (0.0–1.0 score)
- `kb_faithfulness` — LLM checks if output is grounded in retrieved KB context (no hallucination)
- `relevance` — LLM checks if output actually addresses the input question

### 2.3 LLM-as-Judge Scoring Rubric

Based on industry standard (OpenAI Evals, Promptfoo, Evidently AI):

```
Score 1.0: Response is fully correct, complete, and well-formed
Score 0.8: Mostly correct with minor omissions that don't affect usefulness
Score 0.5: Partially correct but has significant gaps or errors
Score 0.2: Mostly incorrect, misses key information
Score 0.0: Completely wrong, off-topic, or harmful
```

Passing threshold: configurable per assertion, default ≥ 0.7.

### 2.4 Vercel AI SDK v6 Testing Integration

The AI SDK provides `MockLanguageModelV3` and `MockEmbeddingModelV3` from `ai/test` for
deterministic unit testing. Our eval system uses the REAL model (not mocks) because we're testing
the agent's actual behavior in production conditions — mocks are for unit tests, evals are for
integration/acceptance testing.

### 2.5 Key Design Principles

1. **Test the full pipeline** — send message through `/api/agents/[agentId]/chat`, not just the AI model
2. **Non-destructive** — evals create temporary conversations, cleaned up after run
3. **Idempotent** — same test suite produces same deterministic assertions (LLM-graded may vary)
4. **Progressive** — start with deterministic checks, add LLM-graded only when needed
5. **Track regression** — store every run, compare scores across time

---

## 3. DATA MODEL

### 3.1 New Prisma Models

```prisma
model EvalSuite {
  id          String       @id @default(cuid())
  name        String
  description String?
  agentId     String
  agent       Agent        @relation(fields: [agentId], references: [id], onDelete: Cascade)
  testCases   EvalTestCase[]
  runs        EvalRun[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([agentId])
}

model EvalTestCase {
  id          String     @id @default(cuid())
  suiteId     String
  suite       EvalSuite  @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  label       String                          // Human-readable test name
  input       String                          // User message to send
  assertions  Json                            // EvalAssertion[] — see schema below
  tags        String[]   @default([])         // Categorization (e.g. "greeting", "rag", "edge-case")
  order       Int        @default(0)          // Display order
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  results     EvalResult[]

  @@index([suiteId])
}

model EvalRun {
  id            String       @id @default(cuid())
  suiteId       String
  suite         EvalSuite    @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  status        EvalRunStatus @default(PENDING)
  totalCases    Int          @default(0)
  passedCases   Int          @default(0)
  failedCases   Int          @default(0)
  score         Float?                        // Overall pass rate (0.0–1.0)
  durationMs    Int?                          // Total wall-clock time
  triggeredBy   String?                       // "manual" | "deploy" | "schedule"
  results       EvalResult[]
  errorMessage  String?
  createdAt     DateTime     @default(now())
  completedAt   DateTime?

  @@index([suiteId])
  @@index([suiteId, createdAt])
}

model EvalResult {
  id            String       @id @default(cuid())
  runId         String
  run           EvalRun      @relation(fields: [runId], references: [id], onDelete: Cascade)
  testCaseId    String
  testCase      EvalTestCase @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  status        EvalResultStatus @default(PENDING)
  agentOutput   String?                       // The actual agent response
  assertions    Json                          // AssertionResult[] — each assertion's pass/fail + detail
  score         Float?                        // Average assertion score for this case
  latencyMs     Int?                          // Response time
  tokensUsed    Json?                         // { input, output }
  errorMessage  String?
  createdAt     DateTime     @default(now())

  @@index([runId])
  @@index([testCaseId])
}

enum EvalRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum EvalResultStatus {
  PENDING
  PASSED
  FAILED
  ERROR
  SKIPPED
}
```

### 3.2 Assertion Schema (Zod)

```typescript
// src/lib/evals/schemas.ts

const EvalAssertionSchema = z.discriminatedUnion("type", [
  // Layer 1: Deterministic
  z.object({ type: z.literal("exact_match"),    value: z.string() }),
  z.object({ type: z.literal("contains"),       value: z.string() }),
  z.object({ type: z.literal("icontains"),      value: z.string() }),
  z.object({ type: z.literal("not_contains"),   value: z.string() }),
  z.object({ type: z.literal("regex"),          value: z.string() }),
  z.object({ type: z.literal("starts_with"),    value: z.string() }),
  z.object({ type: z.literal("json_valid") }),
  z.object({ type: z.literal("latency"),        threshold: z.number() }),

  // Layer 2: Semantic
  z.object({ type: z.literal("semantic_similarity"), value: z.string(), threshold: z.number().default(0.8) }),

  // Layer 3: LLM-as-Judge
  z.object({ type: z.literal("llm_rubric"),      rubric: z.string(), threshold: z.number().default(0.7) }),
  z.object({ type: z.literal("kb_faithfulness"), threshold: z.number().default(0.7) }),
  z.object({ type: z.literal("relevance"),       threshold: z.number().default(0.7) }),
]);

const AssertionResultSchema = z.object({
  type:    z.string(),
  passed:  z.boolean(),
  score:   z.number().min(0).max(1),
  message: z.string(),           // Human-readable explanation
  details: z.record(z.unknown()).optional(), // LLM judge reasoning, similarity score, etc.
});
```

---

## 4. IMPLEMENTATION PHASES

### Phase 1: Core Engine + Deterministic Assertions (~5 files)

**Files:**
- `src/lib/evals/schemas.ts` — Zod schemas for assertions, test cases, results
- `src/lib/evals/assertions.ts` — Assertion evaluator engine (all Layer 1 assertions)
- `src/lib/evals/runner.ts` — Eval run orchestrator (iterate cases, call chat API, apply assertions)
- `src/lib/evals/__tests__/assertions.test.ts` — Unit tests for all deterministic assertions
- `src/lib/evals/__tests__/runner.test.ts` — Unit tests for runner logic

**Runner architecture:**
```
runEvalSuite(suiteId)
  ├── Load suite + test cases from DB
  ├── Create EvalRun record (status: RUNNING)
  ├── For each test case (sequential, to avoid rate limits):
  │   ├── Record start time
  │   ├── POST /api/agents/[agentId]/chat { message: testCase.input, stream: false }
  │   ├── Record latency
  │   ├── Apply each assertion → AssertionResult[]
  │   ├── Calculate case score (average of assertion scores)
  │   ├── Save EvalResult to DB
  │   └── Update run progress (passedCases/failedCases)
  ├── Calculate overall score
  ├── Update EvalRun (status: COMPLETED, score, durationMs)
  └── Return EvalRun with results
```

### Phase 2: Semantic + LLM-as-Judge Assertions (~3 files)

**Files:**
- `src/lib/evals/semantic.ts` — Embedding-based similarity (reuse `getEmbeddingModel()`)
- `src/lib/evals/llm-judge.ts` — LLM-as-Judge evaluator (uses `generateObject()` with scoring schema)
- `src/lib/evals/__tests__/llm-judge.test.ts` — Unit tests (mocked AI with `MockLanguageModelV3`)

**LLM Judge prompt template:**
```
You are an impartial judge evaluating an AI agent's response.

## Input
User question: {input}
Agent response: {output}
{kb_context if kb_faithfulness}

## Evaluation criteria
{rubric}

## Scoring
Rate the response on a scale of 0.0 to 1.0:
- 1.0: Fully meets all criteria
- 0.7: Acceptable with minor issues
- 0.3: Significant problems
- 0.0: Completely fails

Respond with JSON: { "score": number, "reasoning": string }
```

**Semantic similarity:** uses existing `getEmbeddingModel()` (OpenAI text-embedding-3-small)
to embed both the expected value and actual output, then compute cosine distance.

### Phase 3: API Routes (~4 files)

**Files:**
- `src/app/api/agents/[agentId]/evals/route.ts` — GET list suites, POST create suite
- `src/app/api/agents/[agentId]/evals/[suiteId]/route.ts` — GET, PATCH, DELETE suite
- `src/app/api/agents/[agentId]/evals/[suiteId]/cases/route.ts` — GET, POST, PUT, DELETE test cases
- `src/app/api/agents/[agentId]/evals/[suiteId]/run/route.ts` — POST trigger run, GET run history

**Key routes:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents/[agentId]/evals` | GET | List all eval suites for agent |
| `/api/agents/[agentId]/evals` | POST | Create new eval suite |
| `/api/agents/[agentId]/evals/[suiteId]` | GET | Get suite detail with test cases |
| `/api/agents/[agentId]/evals/[suiteId]` | PATCH | Update suite name/description |
| `/api/agents/[agentId]/evals/[suiteId]` | DELETE | Delete suite + cascading |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | GET | List test cases |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | POST | Add test case |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | PUT | Bulk update (reorder, edit) |
| `/api/agents/[agentId]/evals/[suiteId]/run` | POST | Trigger new eval run |
| `/api/agents/[agentId]/evals/[suiteId]/run` | GET | List run history with scores |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]` | GET | Full run detail + per-case results |

All routes use `requireAgentOwner()` auth guard.

### Phase 4: UI — Eval Management Page (~3 files)

**Files:**
- `src/app/evals/[agentId]/page.tsx` — Eval page (suites list, create suite dialog)
- `src/components/evals/eval-suite-editor.tsx` — Suite editor (test cases table, assertion builder)
- `src/components/evals/eval-results-view.tsx` — Run results (pass/fail table, score badges, trend chart)

**UI Layout:**
```
/evals/[agentId]
├── Suite selector (tabs or sidebar)
├── Test cases table
│   ├── [Label] [Input message] [Assertions] [Last result] [Actions]
│   ├── Add Test Case button
│   └── Inline assertion builder (type selector + value field)
├── "Run Evals" button → triggers POST /run
├── Results panel (after run)
│   ├── Summary: 12/15 passed (80%) — 4.2s total
│   ├── Per-case results: ✅/❌ badge + agent output + assertion details
│   └── Expand to see LLM judge reasoning
└── Run history (collapsible)
    ├── Chart: score over time (recharts line chart)
    └── Table: date, score, passed/failed/total, duration
```

**Navigation:**
- Dashboard agent card: add "Evals" button (next to "Chat" and "Edit Flow")
- Flow builder: add "Evals" button in top toolbar

### Phase 5: Deploy-Triggered Evals (Optional, ~1 file)

**File:**
- `src/lib/evals/deploy-hook.ts` — Auto-run evals after flow deploy

After a successful flow deploy (via `/api/agents/[agentId]/flow/versions/[versionId]/deploy`),
automatically trigger the agent's default eval suite (if one is marked as `isDefault`).
Log results in EvalRun with `triggeredBy: "deploy"`.

If score drops below a configurable threshold, add a warning to the deploy response.

---

## 5. FILE TREE (Final)

```
src/
  lib/
    evals/
      schemas.ts              ← Zod schemas (assertions, test cases, results)
      assertions.ts           ← Deterministic assertion evaluators (Layer 1)
      semantic.ts             ← Semantic similarity evaluator (Layer 2)
      llm-judge.ts            ← LLM-as-Judge evaluators (Layer 3)
      runner.ts               ← Eval run orchestrator
      deploy-hook.ts          ← Optional: deploy-triggered evals
      __tests__/
        assertions.test.ts    ← Unit tests for deterministic assertions
        semantic.test.ts      ← Unit tests for semantic similarity
        llm-judge.test.ts     ← Unit tests for LLM judge (MockLanguageModelV3)
        runner.test.ts        ← Unit tests for runner logic

  app/
    evals/[agentId]/page.tsx  ← Eval management page

    api/agents/[agentId]/evals/
      route.ts                ← GET list, POST create suite
      [suiteId]/
        route.ts              ← GET, PATCH, DELETE suite
        cases/route.ts        ← GET, POST, PUT, DELETE test cases
        run/route.ts          ← POST trigger, GET history
        run/[runId]/route.ts  ← GET run detail

  components/
    evals/
      eval-suite-editor.tsx   ← Suite editor + test case table + assertion builder
      eval-results-view.tsx   ← Run results + trend chart
```

---

## 6. ASSERTION IMPLEMENTATION DETAIL

```typescript
// src/lib/evals/assertions.ts

interface AssertionContext {
  input: string;           // Original user message
  output: string;          // Agent response
  latencyMs: number;       // Response time
  kbContext?: string;       // Retrieved KB context (if applicable)
}

async function evaluateAssertion(
  assertion: EvalAssertion,
  ctx: AssertionContext,
): Promise<AssertionResult> {
  switch (assertion.type) {
    case "exact_match":
      return { passed: ctx.output === assertion.value, score: ctx.output === assertion.value ? 1 : 0 };

    case "contains":
      return { passed: ctx.output.includes(assertion.value), score: ... };

    case "icontains":
      return { passed: ctx.output.toLowerCase().includes(assertion.value.toLowerCase()), score: ... };

    case "not_contains":
      return { passed: !ctx.output.includes(assertion.value), score: ... };

    case "regex":
      const re = new RegExp(assertion.value);
      return { passed: re.test(ctx.output), score: ... };

    case "latency":
      return { passed: ctx.latencyMs <= assertion.threshold, score: ... };

    case "semantic_similarity":
      return evaluateSemanticSimilarity(ctx.output, assertion.value, assertion.threshold);

    case "llm_rubric":
      return evaluateLLMRubric(ctx.input, ctx.output, assertion.rubric, assertion.threshold);

    case "kb_faithfulness":
      return evaluateKBFaithfulness(ctx.input, ctx.output, ctx.kbContext, assertion.threshold);

    case "relevance":
      return evaluateRelevance(ctx.input, ctx.output, assertion.threshold);
  }
}
```

---

## 7. SECURITY & PERFORMANCE

- **Rate limiting:** Max 50 test cases per suite, max 5 concurrent eval runs per user
- **Timeout:** 30s per test case (matches chat API timeout)
- **Cleanup:** Eval conversations are created with a special `isEval: true` flag and deleted after run
- **Cost control:** LLM-as-Judge uses the cheapest available model (deepseek-chat or gpt-4o-mini)
- **Auth:** All routes use `requireAgentOwner()` — users can only eval their own agents

---

## 8. MIGRATION CHECKLIST

1. [x] Add 4 new Prisma models + 2 enums to `schema.prisma`
2. [x] Run `pnpm db:push` to sync schema (done twice — once for Phase 1 models, once for Phase 5 `runOnDeploy` field)
3. [x] Add `EvalSuite[]` relation to Agent model
4. [x] Add `evals` link to dashboard agent card (FlaskConical icon, between Edit Flow and Chat)
5. [x] Add `/evals/*` to middleware public/protected path config
6. [x] Update CLAUDE.md with eval system documentation
7. [x] Update test count after writing unit tests (1144 tests, 104 files)

---

## 9. SUCCESS CRITERIA

- [x] User can create an eval suite with 10+ test cases in under 2 minutes
- [x] Deterministic assertions (contains, regex, exact_match) pass/fail in < 100ms per case
- [x] LLM-as-Judge assertions complete in < 10s per case
- [x] Full suite of 20 test cases runs in < 60s
- [x] Run history shows score trend over last 10 runs (recharts LineChart)
- [x] Deploy-triggered evals — suites with `runOnDeploy: true` auto-run after deploy (fire-and-forget)
- [x] Unit test coverage: 100 new tests across 5 test files (assertions×40, runner×15, semantic×15, llm-judge×20, deploy-hook×10)

## 10. WHAT WAS BUILT vs PLAN

### Deviations from plan (improvements):
- **Phase 5** extended beyond just the default suite: any suite can set `runOnDeploy: true` (more flexible than "default only")
- **`runOnDeploy` UI**: toggle in Create Suite dialog, Rocket icon in sidebar, dropdown toggle item, badge in detail header
- **`isDefault` mutex**: added (not in original plan) — clearing existing default when a new default is set
- **Concurrent run protection**: 409 when a run is already RUNNING for same suite
- **50-case limit per suite** (plan said 50, implemented as 50 ✓), **20-suite limit per agent** (plan said "max 5 concurrent runs", implemented as suite count limit instead)
- **`evals-route.test.ts`**: 27 API route tests added (not in original plan)

---

## 10. REFERENCES

- [OpenAI Evals Framework](https://github.com/openai/evals) — input/ideal pairs, model-graded evals
- [OpenAI Agent Evals Guide](https://platform.openai.com/docs/guides/agent-evals) — agent evaluation methodology
- [Promptfoo](https://github.com/promptfoo/promptfoo) — assertion types (contains, llm-rubric, similar, cost, latency)
- [LLM-as-a-Judge Guide](https://www.evidentlyai.com/llm-guide/llm-as-a-judge) — scoring rubrics, bias mitigation
- [Vercel AI SDK Testing](https://ai-sdk.dev/docs/ai-sdk-core/testing) — MockLanguageModelV3 for unit tests
- [Promptfoo Jest Integration](https://www.promptfoo.dev/docs/integrations/jest) — toMatchSemanticSimilarity, toPassLLMRubric
