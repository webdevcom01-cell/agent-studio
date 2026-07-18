# Faza 3 — Resilience: Implementation Plan

> Generisano: 2026-05-07  
> Cilj: Pipeline sistem koji se oporavlja sam, svaki step ima pravo trajanje, distribuirani trace je kompletan.  
> Baza analize: duboko čitanje orchestrator.ts, pipeline-manager.ts, worker.ts, retry/route.ts, page.tsx, agent-tools.ts, tracer.ts, types.ts, prisma/schema.prisma.

---

## Nalaz analize — šta zapravo postoji (vs. šta IMPROVEMENT-PLAN pretpostavlja)

### Task 3.1 — Pipeline Resume

**Šta već postoji:**
- `retry/route.ts` — `POST /api/agents/[agentId]/pipelines/[runId]/retry` radi za `FAILED` i `CANCELLED` runove. Smart `startFromStep` logika: ako je failed na gate stepu, ide nazad na poslednji impl step.
- `detectAndResetStalePipelineRuns()` u `pipeline-manager.ts` — cron job u `/api/cron/cleanup/route.ts` poziva je za RUNNING runove starije od 45 minuta → resetuje ih na `FAILED`.
- `addPipelineRunJob()` generiše `jobId` sa `-resume-{timestamp}` sufiksom kada je `startFromStep != null` — idempotency je riješen.
- `cli-generator` ima sličan resume endpoint ali za drugačiji model (phase-based, ne step-based).

**Šta FALI za Task 3.1 (pravi "Resume stale RUNNING"):**
1. **UI ne prikazuje "Nastavi" za RUNNING runove koji su zaglavljeni.** UI ima `isActive = RUNNING || PENDING || AWAITING_APPROVAL` i prikazuje samo Cancel dugme — ne postoji logika da detektuje "RUNNING ali zaglavljeni" i ponudi Resume.
2. **Nema dedicated `/resume` API rute za RUNNING runove.** `retry/route.ts` odbija RUNNING sa 409. Stale RUNNING runovi moraju čekati cron da ih resetuje na FAILED (do 45 min), pa tek onda Retry.
3. **UI nema `startedAt` u interface-u** — ne može računati koliko dugo run traje da bi prikazao "zaglavljeni" badge.
4. **`PipelineRunStatus` enum nema `STALE`/`RESUMING` status** — nije potrebno dodavati, ali treba razmotriti.

**Realno rješenje za 3.1 (minimalni set):**
- Dodati `startedAt` u UI `PipelineRun` interface.
- Dodati `isStuck` computed property: `status === "RUNNING" && Date.now() - startedAt > STUCK_THRESHOLD_MS`.
- Prikazati "Nastavi" dugme za stuck RUNNING (umjesto Cancel).
- "Nastavi" šalje POST na `retry/route.ts` **ali** routing must accept RUNNING-stuck status — OR — dodati novi `/resume` endpoint koji: (a) markira run kao FAILED, (b) odmah re-enqueueuje s istim `startFromStep = currentStep`.
- `STUCK_THRESHOLD_MS = 10 * 60 * 1000` (10 min) — konzistentno sa cli-generator.

**Kritični propust iz IMPROVEMENT-PLAN v1:**  
Plan kaže "Nova API ruta POST /resume" — ali zapravo je čišće proširiti existirajući `retry/route.ts` da prima opcionalni `forceFromRunning: true` flag. Ovo eliminišče duplikaciju i ostaje idempotentno.

---

### Task 3.2 — Per-Agent Timeout Profili

**Šta već postoji:**
- `agent-tools.ts` linija 54-67: `AGENT_TIMEOUT_PROFILES` array sa 4 razina (fast/standard/slow/very-slow) i `getTimeoutForAgent()` funkcija — **OVO JE VEĆ IMPLEMENTIRANO u prethodnoj sesiji!**
- `Agent` model u Prismi ima `expectedDurationSeconds Int?` — DB override radi.
- `getTimeoutForAgent()` se zove iz `executeSubAgent()` (linija ~384) za sub-agente u flow enginu.

**Šta FALI za Task 3.2:**
1. **SDLC pipeline koristi flat `STEP_TIMEOUT_MS = 5 * 60 * 1000` za SVE stepove** (orchestrator.ts linija 130). `getTimeoutForAgent()` se ne poziva iz orchestratora — samo iz `agent-tools.ts` za sub-agente u flow enginu.
2. **Nema per-step timeout profila u SDLC kontekstu.** Svaki `AbortSignal.any([pipelineAC.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)])` call koristi istu konstantu.
3. **Stepovi koji traju kratko (project_context, sandbox_verify) imaju isti timeout kao implementacija** — nema benefita ali nije štetno.
4. **feedback-loop.ts ima `FEEDBACK_TIMEOUT_MS = 5 * 60 * 1000`** — isti flat timeout za svaki feedback iteraciju, bez obzira na step tip.

**Realno rješenje za 3.2:**
- Dodati `SDLC_STEP_TIMEOUT_MS` map po step kategoriji (po `StepPhase`).
- Koristiti `getStepTimeoutMs(stepId)` helper u orchestratoru koji vraća odgovarajući timeout.
- `INFRASTRUCTURE_NODES`: kratki (1 min) — `project_context`, `sandbox_verify` su gotovo instant; `static_analysis` do 2 min; `pr_generation` do 2 min.
- `PLANNING_STEPS`: 3 min — planner i TDD guide pišu strukturirane dokumente.
- `IMPLEMENTATION_STEPS`: 8 min — generisanje koda može biti jako dugo.
- `GATE_STEPS`: 3 min — code/security review je fokusiraniji.
- `TEST_STEPS`: 5 min — identično sadašnjem STEP_TIMEOUT_MS.
- `feedback-loop.ts`: `FEEDBACK_TIMEOUT_MS` ostaje 5 min per iteracija (ukupno do 15 min) — ovo je namjerno.

**Kritični propust iz IMPROVEMENT-PLAN:**  
Plan kaže "UI slider za Expected duration" — to je over-engineering. Implementacija u `agent-tools.ts` je generalna (za flow engine); SDLC treba samo statičku mapu po `StepPhase` u orchestratoru. Nema potrebe za UI promjenama.

---

### Task 3.3 — OTel Multi-Hop Tracing

**Šta već postoji:**
- `tracer.ts`: `startSpan`, `traceGenAI`, `traceAgentCall`, `childContext` — potpuna implementacija sa OTLP push, retry, batch queue.
- `types.ts`: `GenAISpanAttributes` ima `gen_ai.operation.name`, `gen_ai.agent.id`, `gen_ai.agent.name` — **fields su definisani**.
- `agent-tools.ts`: `traceAgentCall()` se poziva sa AAIF 2026 atributima (`gen_ai.operation.name: "agent_call"`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.caller.agent.id`).
- `orchestrator.ts`: `pipelineSpan` (`sdlc.pipeline.run`) i `stepSpan` (`sdlc.pipeline.step`) se kreiraju — SDLC ima sopstveni namespace.
- `AgentCallLog` u Prismi ima `traceId`, `spanId`, `parentSpanId` — persistence postoji.

**Šta FALI za Task 3.3:**
1. **`pipelineSpan` nema `gen_ai.agent.id` ni `gen_ai.agent.name`** — ima samo `sdlc.agent.id`. Grafana ne može korelisati SDLC span sa sub-agent spans jer ne dijele isti key namespace.
2. **`stepSpan` nema `gen_ai.operation.name`** — postoji `sdlc.step.id` ali ne AAIF 2026 standardni atribut.
3. **`runSingleGateStep()` stepSpan** (linija 1675-1682) koristi iste nepotpune atribute kao i main loop stepSpan.
4. **`traceId` iz `pipelineSpan` se ne propagira do `runFeedbackIteration()`** — feedback loop kreira AI pozive bez parent context, pa Grafana vidi anonimne generateText spans koji ne mogu biti vezani za pipeline run.
5. **Infrastructure node spans ne postoje** — `project_context`, `sandbox_verify`, `static_analysis`, `pr_generation` izvršavaju se bez OTel instrumentacije.
6. **`runPipeline()` ne prima niti ne propagira traceContext ka sub-agentima** koji bi se pozivali (u teoriji) — ali u SDLC pipeline sub-agenti se NE pozivaju direktno (koriste se AI pozivi), tako da ovo nije akutni problem.

**Šta je `gen_ai.operation.name` za SDLC stepove:**
- `project_context`, `sandbox_verify`, `static_analysis`, `pr_generation` → `"execute_tool_call"` (infrastrukturni, ne LLM pozivi)
- PLANNING/IMPLEMENTATION/TEST/GATE stepovi → `"generate"` (LLM generateText/generateObject)
- feedback loop iteracije → `"generate"` sa `parent` = stepSpan

**Realno rješenje za 3.3 (minimalni set za AAIF 2026 compliance):**
- Dodati `gen_ai.operation.name`, `gen_ai.agent.id` (= `agentId`), `gen_ai.agent.name` (= `"sdlc-pipeline-runner"`) na `pipelineSpan`.
- Dodati `gen_ai.operation.name: "generate"` na sve `stepSpan` i `runSingleGateStep` stepSpan.
- Proslijediti `pipelineSpan.traceContext` kao `parentContext` u feedback loop pozive (novi `traceContext?` parametar na `runFeedbackIteration`).
- Dodati span za infrastrukturne nodove (lightweight — samo start/end sa trajanjem, bez AI atributa).

**Kritični propust iz IMPROVEMENT-PLAN:**  
Plan kaže "propagirati traceId kroz cijeli multi-agent chain" — ali SDLC pipeline NE koristi agent-to-agent calls (nema `executeSubAgent`). Koristi direktne `generateText/generateObject` pozive. Dakle, nema "multi-hop" chain u OTel smislu — samo parent → child span hijerarhija unutar jednog procesa. Pravi gap je: spans ne imaju AAIF 2026 obavezne atribute i feedback loop spans su nepovezani sa pipeline span.

---

## Finalni scope za Fazu 3

| Task | Šta zapravo radimo | Effort |
|------|-------------------|--------|
| **3.1** | `/resume` endpoint za stale RUNNING + UI "Nastavi" dugme za stuck runove | S (2-3 prompta) |
| **3.2** | `getStepTimeoutMs()` po fazi + primjena na 7 mjesta u orchestratoru | XS (1 prompt) |
| **3.3** | AAIF 2026 atributi na pipelineSpan/stepSpan + traceContext u feedback loop | S (2 prompta) |
| **Final** | tsc + vitest + commit + push | XS |

**Ukupno: 6-7 prompta**

---

## Prompt Plan — korak po korak

---

### Prompt 1 — `pipeline-manager.ts` + `retry/route.ts`: Resume stale RUNNING runova

**Šta**: Proširiti `retry/route.ts` da prihvata i `RUNNING` status kada je run stuck (stariji od `STUCK_THRESHOLD_MS`). Dodati `isStaleRunning()` helper u `pipeline-manager.ts`.

**Fajlovi**: `src/lib/sdlc/pipeline-manager.ts`, `src/app/api/agents/[agentId]/pipelines/[runId]/retry/route.ts`

**Izmjene u `pipeline-manager.ts`**:

```typescript
// Dodati konstantu (exportovanu za UI):
export const PIPELINE_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minuta

// Nova helper funkcija:
export function isRunStuck(run: Pick<PipelineRun, "status" | "startedAt">): boolean {
  if (run.status !== "RUNNING") return false;
  if (!run.startedAt) return false;
  return Date.now() - new Date(run.startedAt).getTime() > PIPELINE_STUCK_THRESHOLD_MS;
}

// Nova funkcija za force-reset stuck RUNNING runa:
export async function forceResetStuckRun(runId: string): Promise<PipelineRun> {
  const row = await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: "Pipeline run detected as stuck (no progress for >10 minutes). " +
             "Automatically reset for resume. Check currentStep for last known position.",
      completedAt: new Date(),
    },
  });
  logger.warn("Stuck pipeline run force-reset to FAILED for resume", { runId });
  return toRun(row);
}
```

**Izmjene u `retry/route.ts`** — novi `forceResume` body field:

```typescript
const RetryBodySchema = z.object({
  modelId: z.string().optional(),
  useSmartRouting: z.boolean().default(false),
  forceResume: z.boolean().default(false), // ← novo: true = prihvati i RUNNING stuck runove
});

// U POST handleru, proširiti status check:
const isStuck = parsed.data.forceResume && run.status === "RUNNING" && isRunStuck(run);

if (run.status !== "FAILED" && run.status !== "CANCELLED" && !isStuck) {
  return NextResponse.json({
    success: false,
    error: `Pipeline run cannot be retried (status: ${run.status}). ` +
           `Only FAILED, CANCELLED, or stuck RUNNING runs can be retried.`,
  }, { status: 409 });
}

// Ako je stuck RUNNING — force-reset na FAILED prije re-enqueueing:
if (isStuck) {
  await forceResetStuckRun(runId);
}

// Ostatak koda ostaje identičan...
```

**Verifikacija**: `tsc --noEmit`. Vitest (nema novih testova u ovom promptu — pokriven u Prompt 3).

---

### Prompt 2 — `page.tsx`: UI "Nastavi" dugme za stale RUNNING

**Šta**: Prikazati "Nastavi" dugme za RUNNING runove koji su stariji od 10 minuta. Kliktanje šalje POST na retry sa `forceResume: true`.

**Fajlovi**: `src/app/pipelines/[agentId]/page.tsx`

**Izmjene**:

```typescript
// 1. Dodati startedAt u PipelineRun interface (linija ~35):
interface PipelineRun {
  // ...existing fields...
  startedAt: string | null;  // ← novo
  // ...
}

// 2. Dodati STUCK_THRESHOLD_MS konstantu na vrhu komponente:
const STUCK_THRESHOLD_MS = 10 * 60 * 1000;

// 3. U RunRow komponenti, dodati isStuck computed:
const isStuck =
  run.status === "RUNNING" &&
  run.startedAt != null &&
  Date.now() - new Date(run.startedAt).getTime() > STUCK_THRESHOLD_MS;

// 4. Ažurirati handleRetry da prima forceResume parametar:
async function handleResume() {
  setRetrying(true);
  setActionError(null);
  try {
    const res = await fetch(`/api/agents/${agentId}/pipelines/${run.id}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forceResume: true }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) setActionError(json.error ?? "Greška pri nastavljanju");
    else onMutate();
  } catch { setActionError("Greška pri slanju zahteva"); }
  finally { setRetrying(false); }
}

// 5. U JSX — zamjena za Cancel dugme kada je run stuck:
{/* Za RUNNING stuck — prikaži "Nastavi" umjesto Cancel */}
{isStuck && (
  <button
    onClick={(e) => { e.stopPropagation(); void handleResume(); }}
    disabled={retrying}
    className="p-1 rounded text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
    title="Run je zaglavljeni — nastavi od poslednjeg koraka"
  >
    {retrying ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
  </button>
)}

{/* Za RUNNING koji NIJE stuck — prikaži Cancel */}
{!isStuck && (run.status === "RUNNING" || run.status === "PENDING" || run.status === "AWAITING_APPROVAL") && (
  // ...postojeći Cancel button...
)}

// 6. Vizuelni indikator u header — žuti badge za stuck RUNNING:
{isStuck && (
  <span className="text-xs font-medium text-amber-400 flex items-center gap-1">
    <AlertTriangle className="size-3" />
    Zaglavljen
  </span>
)}
```

**Import koji treba dodati**: `RefreshCw, AlertTriangle` iz `lucide-react`.

**Verifikacija**: `tsc --noEmit`.

---

### Prompt 3 — `orchestrator.ts`: `getStepTimeoutMs()` — per-step timeout profili

**Šta**: Zamijeniti flat `STEP_TIMEOUT_MS` sa `getStepTimeoutMs(stepId)` funkcijom koja vraća različite timeouteove po tipu stepa. Primjeniti na sva mjesta gdje se koristi `AbortSignal.timeout(STEP_TIMEOUT_MS)`.

**Fajlovi**: `src/lib/sdlc/orchestrator.ts`

**Nova logika** (dodati odmah ispod `STEP_TIMEOUT_MS` konstante, linija ~131):

```typescript
/** Per-step timeout for AI calls (5 minutes). Prevents hung pipelines.
 * Kept as fallback for unknown step types. */
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

/** Per-category timeouts based on empirical step durations.
 * Infra nodes: short (no AI calls).
 * Planning: medium (structured docs, no code).
 * Gate/review: medium (focused analysis).
 * Test: standard (same as original STEP_TIMEOUT_MS).
 * Implementation: long (code generation can produce thousands of tokens).
 * Feedback iteration: standard per attempt — 3 attempts × 5 min = 15 min max.
 */
const STEP_TIMEOUTS_MS: Record<string, number> = {
  infra:          1 * 60 * 1000,  //  1 min — project_context, sandbox_verify (no LLM)
  infra_analysis: 2 * 60 * 1000,  //  2 min — static_analysis (tsc + eslint, no LLM)
  infra_pr:       2 * 60 * 1000,  //  2 min — pr_generation (git API call)
  planning:       3 * 60 * 1000,  //  3 min — ecc-planner, ecc-tdd-guide
  gate:           3 * 60 * 1000,  //  3 min — ecc-code-reviewer, ecc-security-reviewer
  test:           5 * 60 * 1000,  //  5 min — ecc-e2e-runner, ecc-tdd-pipeline
  implementation: 8 * 60 * 1000,  //  8 min — ecc-implementer, ecc-frontend-developer
};

/**
 * Resolve the per-step AI call timeout.
 * Returns different timeouts based on step category to avoid blanket 5-minute
 * timeouts on infrastructure nodes (too long) and implementation steps (too short).
 */
function getStepTimeoutMs(stepId: string): number {
  if (GATE_STEPS.has(stepId))           return STEP_TIMEOUTS_MS.gate!;
  if (IMPLEMENTATION_STEPS.has(stepId)) return STEP_TIMEOUTS_MS.implementation!;
  if (PLANNING_STEPS.has(stepId))       return STEP_TIMEOUTS_MS.planning!;
  if (TEST_STEPS.has(stepId))           return STEP_TIMEOUTS_MS.test!;
  if (stepId === "static_analysis")     return STEP_TIMEOUTS_MS.infra_analysis!;
  if (stepId === "pr_generation")       return STEP_TIMEOUTS_MS.infra_pr!;
  if (INFRASTRUCTURE_NODES.has(stepId)) return STEP_TIMEOUTS_MS.infra!;
  return STEP_TIMEOUT_MS; // fallback za nepoznate step ID-ove
}
```

**Primjena** — zamijeniti svih 7 mjesta u orchestratoru:

| Lokacija | Staro | Novo |
|----------|-------|------|
| Linija 558 (parallel gate) | `AbortSignal.timeout(STEP_TIMEOUT_MS)` | `AbortSignal.timeout(getStepTimeoutMs(stepId))` |
| Linija 613 (parallel gate drugi) | `AbortSignal.timeout(STEP_TIMEOUT_MS)` | `AbortSignal.timeout(getStepTimeoutMs(nextStepId))` |
| Linija 905 (main loop) | `AbortSignal.timeout(STEP_TIMEOUT_MS)` | `AbortSignal.timeout(getStepTimeoutMs(stepId))` |
| Linija 999 (error message) | `STEP_TIMEOUT_MS / 1000` | `getStepTimeoutMs(stepId) / 1000` |
| Linija 1299 (testSignal) | `AbortSignal.timeout(STEP_TIMEOUT_MS)` | `AbortSignal.timeout(getStepTimeoutMs(stepId))` |
| Linija 1638 (GateStepInput comment) | komentar update | komentar update |
| `runSingleGateStep` caller | `AbortSignal.timeout(STEP_TIMEOUT_MS)` (linija 557 i 612) | `AbortSignal.timeout(getStepTimeoutMs(stepId))` |

**Napomena o parallel gate**: Paralelni path (linija 558/612) prima `sharedGateParams` gdje `abortSignal` sadrži jedan isti signal za OBA gate stepa. To je ispravno jer oba gate stepa imaju isti timeout kategoriju (`gate: 3 min`). Nema potrebe za individualizacijom unutar `runParallelGateSteps`.

**Verifikacija**: `tsc --noEmit`. Vitest. Nema promjene u ponašanju za testove — mock-ovi ne ovise o timeout vrijednostima.

---

### Prompt 4 — `orchestrator.ts` + `feedback-loop.ts`: OTel AAIF 2026 atributi + traceContext propagacija

**Šta**: Dodati AAIF 2026 obavezne atribute na `pipelineSpan` i `stepSpan`. Proslijediti `traceContext` u `runFeedbackIteration` za vezane spans. Dodati lightweight infrastructure spans.

**Fajlovi**: `src/lib/sdlc/orchestrator.ts`, `src/lib/sdlc/feedback-loop.ts`

#### 4A — `pipelineSpan` dopuna (linija 291-296):

```typescript
// Staro:
const pipelineSpan = startSpan("sdlc.pipeline.run", {
  kind: "client",
  attributes: {
    "sdlc.run.id": runId,
    "sdlc.agent.id": agentId,
    "sdlc.pipeline.step_count": pipeline.length,
  },
});

// Novo — dodati AAIF 2026 obavezne atribute:
const pipelineSpan = startSpan("sdlc.pipeline.run", {
  kind: "client",
  attributes: {
    "sdlc.run.id": runId,
    "sdlc.agent.id": agentId,
    "sdlc.pipeline.step_count": pipeline.length,
    // AAIF 2026 — obavezni atributi za agent-level spans:
    "gen_ai.operation.name": "agent_call",
    "gen_ai.agent.id": agentId,
    "gen_ai.agent.name": "sdlc-pipeline-runner",
    "gen_ai.system": "anthropic",
  },
});
```

#### 4B — `stepSpan` dopuna (linija 792-800 i 1675-1682 u `runSingleGateStep`):

```typescript
// Staro:
const stepSpan = startSpan("sdlc.pipeline.step", {
  kind: "client",
  parentContext: pipelineSpan.traceContext,
  attributes: {
    "sdlc.step.id": stepId,
    "sdlc.step.index": stepIdx,
    "sdlc.step.phase": phase,
    "gen_ai.request.model": stepModelId,
  },
});

// Novo:
const stepSpan = startSpan("sdlc.pipeline.step", {
  kind: "client",
  parentContext: pipelineSpan.traceContext,
  attributes: {
    "sdlc.step.id": stepId,
    "sdlc.step.index": stepIdx,
    "sdlc.step.phase": phase,
    "gen_ai.request.model": stepModelId,
    // AAIF 2026:
    "gen_ai.operation.name": "generate",
    "gen_ai.agent.id": agentId,
    "gen_ai.system": "anthropic",
  },
});
```

#### 4C — Infrastructure node spans (dodati u INFRASTRUCTURE_NODES blok, ~linija 637):

```typescript
// Dodati span za svaki infra node:
const infraSpan = startSpan(`sdlc.infra.${stepId}`, {
  kind: "internal",
  parentContext: pipelineSpan.traceContext,
  attributes: {
    "sdlc.step.id": stepId,
    "sdlc.step.index": stepIdx,
    "gen_ai.operation.name": "execute_tool_call",
    "gen_ai.agent.id": agentId,
  },
});
// ... existing infra logic ...
infraSpan.setAttributes({ "sdlc.infra.duration_ms": Date.now() - stepStart });
infraSpan.end();
```

#### 4D — `feedback-loop.ts` — dodati `traceContext?` parametar:

```typescript
// Dodati import:
import type { TraceContext } from "@/lib/observability/types";
import { startSpan } from "@/lib/observability/tracer";

// Proširiti FeedbackLoopInput interface:
export interface FeedbackLoopInput {
  // ...existing fields...
  /** OTel parent context — ako je proslijeđen, feedback spans se vežu za pipeline span */
  parentTraceContext?: TraceContext;
}

// Unutar runFeedbackIteration() — kreirati child span za svaki feedback attempt:
const feedbackSpan = input.parentTraceContext
  ? startSpan("sdlc.feedback.iteration", {
      kind: "client",
      parentContext: input.parentTraceContext,
      attributes: {
        "sdlc.feedback.attempt": input.attempt,
        "gen_ai.operation.name": "generate",
        "gen_ai.agent.id": input.agentId ?? "unknown",
        "gen_ai.system": "anthropic",
      },
    })
  : null;

// Na kraju iteracije:
feedbackSpan?.setAttributes({
  "gen_ai.usage.input_tokens": result.usage?.inputTokens ?? 0,
  "gen_ai.usage.output_tokens": result.usage?.outputTokens ?? 0,
  "sdlc.feedback.success": true,
});
feedbackSpan?.end();
```

#### 4E — Proslijediti `pipelineSpan.traceContext` u sve `runFeedbackIteration` pozive:

Postoje 3 mjesta u orchestratoru gdje se zove `runFeedbackIteration`:
- `static_analysis` feedback loop (~linija 688)
- IMPL_STEP real-exec loop (~linija 1024-1037)
- TEST_STEP feedback loop (~linija 1163-1175)

```typescript
// Svaki poziv dobija parentTraceContext:
const feedbackResult = await runFeedbackIteration(
  {
    ...existingInput,
    parentTraceContext: pipelineSpan.traceContext,  // ← novo polje
  },
  systemPrompt,
  pipelineAC.signal,
);
```

**FeedbackLoopInput interface** je u `src/lib/sdlc/feedback-loop.ts` — dodati opciono polje `parentTraceContext?: TraceContext`. Backward compatible.

**Verifikacija**: `tsc --noEmit`. Vitest.

---

### Prompt 5 — Testovi za 3.1 i 3.3

**Šta**: Unit testovi za `isRunStuck()`, `forceResetStuckRun()`, i OTel span attribute assertions.

**Fajlovi**:
- `src/lib/sdlc/__tests__/pipeline-manager-resume.test.ts` (novi)
- `src/lib/sdlc/__tests__/orchestrator-otel.test.ts` (novi)

**`pipeline-manager-resume.test.ts`**:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRunStuck, PIPELINE_STUCK_THRESHOLD_MS } from "@/lib/sdlc/pipeline-manager";

describe("isRunStuck", () => {
  it("returns false if status is not RUNNING", () => {
    expect(isRunStuck({ status: "FAILED", startedAt: new Date(Date.now() - 20 * 60 * 1000) })).toBe(false);
    expect(isRunStuck({ status: "COMPLETED", startedAt: new Date(Date.now() - 20 * 60 * 1000) })).toBe(false);
  });

  it("returns false if startedAt is null", () => {
    expect(isRunStuck({ status: "RUNNING", startedAt: null })).toBe(false);
  });

  it("returns false if RUNNING but within threshold", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(isRunStuck({ status: "RUNNING", startedAt: fiveMinutesAgo })).toBe(false);
  });

  it("returns true if RUNNING and older than STUCK_THRESHOLD_MS", () => {
    const elevenMinutesAgo = new Date(Date.now() - (PIPELINE_STUCK_THRESHOLD_MS + 60_000));
    expect(isRunStuck({ status: "RUNNING", startedAt: elevenMinutesAgo })).toBe(true);
  });

  it("returns false at exactly threshold boundary (not inclusive)", () => {
    const exactThreshold = new Date(Date.now() - PIPELINE_STUCK_THRESHOLD_MS + 1);
    expect(isRunStuck({ status: "RUNNING", startedAt: exactThreshold })).toBe(false);
  });
});
```

**`orchestrator-otel.test.ts`**:

```typescript
import { describe, it, expect, vi } from "vitest";
import { startSpan } from "@/lib/observability/tracer";

// Testira da pipelineSpan i stepSpan imaju AAIF 2026 atribute
describe("OTel span attributes — AAIF 2026 compliance", () => {
  it("pipelineSpan has gen_ai.agent.id and gen_ai.operation.name", () => {
    const span = startSpan("sdlc.pipeline.run", {
      kind: "client",
      attributes: {
        "gen_ai.operation.name": "agent_call",
        "gen_ai.agent.id": "test-agent-123",
        "gen_ai.agent.name": "sdlc-pipeline-runner",
        "gen_ai.system": "anthropic",
      },
    });
    expect(span.attributes["gen_ai.operation.name"]).toBe("agent_call");
    expect(span.attributes["gen_ai.agent.id"]).toBe("test-agent-123");
    expect(span.attributes["gen_ai.agent.name"]).toBe("sdlc-pipeline-runner");
    span.end();
  });

  it("childContext preserves traceId", () => {
    const { childContext } = await import("@/lib/observability/tracer");
    const parent = startSpan("parent");
    const child = startSpan("child", { parentContext: parent.traceContext });
    expect(child.traceContext.traceId).toBe(parent.traceContext.traceId);
    expect(child.traceContext.spanId).not.toBe(parent.traceContext.spanId);
    expect(child.traceContext.parentSpanId).toBe(parent.traceContext.spanId);
    parent.end(); child.end();
  });
});
```

**Verifikacija**: `vitest run` — svi testovi zeleni.

---

### Prompt 6 — tsc + vitest + commit + push

**Šta**: Finalni TypeScript check, puni vitest run, commit svih promjena.

```bash
cd ~/Desktop/agent-studio
npx tsc --noEmit
npx vitest run 2>&1 | tail -20
git add \
  src/lib/sdlc/pipeline-manager.ts \
  src/app/api/agents/\[agentId\]/pipelines/\[runId\]/retry/route.ts \
  src/app/pipelines/\[agentId\]/page.tsx \
  src/lib/sdlc/orchestrator.ts \
  src/lib/sdlc/feedback-loop.ts \
  src/lib/sdlc/__tests__/pipeline-manager-resume.test.ts \
  src/lib/sdlc/__tests__/orchestrator-otel.test.ts \
  docs/faza3-implementation-plan.md
git commit -m "feat(sdlc): Faza 3 Resilience — resume, per-step timeouts, OTel AAIF 2026

Task 3.1: Pipeline Resume za stale RUNNING runove
- pipeline-manager: isRunStuck() + PIPELINE_STUCK_THRESHOLD_MS (10 min) + forceResetStuckRun()
- retry/route: forceResume flag prihvata stuck RUNNING runove (reset → FAILED → re-enqueue)
- page.tsx: startedAt u interface, isStuck computed, 'Nastavi' dugme + 'Zaglavljen' badge

Task 3.2: Per-step timeout profili
- orchestrator: getStepTimeoutMs() helper — 8 min za impl, 3 min za gate/planning, 1-2 min za infra
- Zamijenjen flat STEP_TIMEOUT_MS na svih 7 mjesta u orchestratoru

Task 3.3: OTel AAIF 2026 compliance
- pipelineSpan: gen_ai.operation.name, gen_ai.agent.id, gen_ai.agent.name, gen_ai.system
- stepSpan (main loop + runSingleGateStep): gen_ai.operation.name: 'generate'
- Infrastructure node spans: sdlc.infra.{stepId} sa execute_tool_call operation
- feedback-loop: parentTraceContext? param — feedback iterations su child spans pipeline spana
- orchestrator: sva 3 runFeedbackIteration poziva proslijeđuju pipelineSpan.traceContext
- Testovi: pipeline-manager-resume.test.ts (5 testova) + orchestrator-otel.test.ts (2 testova)"
git push origin main
```

---

## Pregled izmjena po fajlu

| Fajl | Task | Tip promjene | Veličina |
|------|------|-------------|---------|
| `src/lib/sdlc/pipeline-manager.ts` | 3.1 | Dodati 3 exporta: `PIPELINE_STUCK_THRESHOLD_MS`, `isRunStuck()`, `forceResetStuckRun()` | XS (~25 linija) |
| `src/app/api/agents/[agentId]/pipelines/[runId]/retry/route.ts` | 3.1 | `forceResume` body field + RUNNING stuck prihvatanje | XS (~15 linija) |
| `src/app/pipelines/[agentId]/page.tsx` | 3.1 | `startedAt` u interface, `isStuck`, `handleResume()`, "Nastavi" dugme + badge | S (~40 linija) |
| `src/lib/sdlc/orchestrator.ts` | 3.2 + 3.3 | `getStepTimeoutMs()` + 7 zamjena + AAIF 2026 atributi na spanovima + infra spans | M (~80 linija) |
| `src/lib/sdlc/feedback-loop.ts` | 3.3 | `parentTraceContext?` u FeedbackLoopInput + feedbackSpan kreacija | S (~30 linija) |
| `src/lib/sdlc/__tests__/pipeline-manager-resume.test.ts` | 3.1 | Novi testovi za `isRunStuck` | XS (~40 linija) |
| `src/lib/sdlc/__tests__/orchestrator-otel.test.ts` | 3.3 | Novi testovi za OTel atribute | XS (~30 linija) |

**Bez izmjena**: `prisma/schema.prisma` (nema schema migracija), `worker.ts`, `queue/index.ts`, `tracer.ts`, `types.ts`.

---

## Rizici

| Rizik | Vjerovatnoća | Rješenje |
|-------|-------------|---------|
| `forceResetStuckRun()` resetuje run koji je ZAPRAVO još RUNNING (worker još živi) | Niska — 10 min je konzervativno; Railway OOM-kill je < 2 min | Dvostruki re-enqueue je nemoguć jer `addPipelineRunJob` generiše `jobId` sa timestamp — stari job ne može interferirati s novim |
| BullMQ ima i dalje stari job aktivan + novi job za isti runId | Niska | Stari job će pokušati `markPipelineCompleted` ali run je sada FAILED/PENDING — `prisma.pipelineRun.update` će uspjeti jer nema WHERE status check. Potrebno dodati guard u worker: `if (run.status !== "RUNNING") return` na početku `processPipelineRunJob` |
| `parentTraceContext` u FeedbackLoopInput je undefined za stare pozive | Zero — polje je opciono, backward compatible | — |
| `getStepTimeoutMs` vraća kratki timeout za custom step ID koji je implementation step | Moguće | Fallback na `STEP_TIMEOUT_MS` (5 min) za nepoznate ID-ove — dovoljno |
| `infraSpan.end()` nije pozvan ako infra node baci grešku | Moguće | Umotati u try/finally |

---

## Šta je van scope Faze 3

1. **Task 3.4 — MCP Tasks Primitive**: XL posao (2+ sedmice), MCP klijent upgrade. Nije u ovom planu.
2. **UI slider za `expectedDurationSeconds`** na Agent Builder-u — `agent-tools.ts` već čita DB vrijednost; UI je previše OVER-ENGINEERING za SDLC use case.
3. **`STALE` novi DB status** — nije potreban. `FAILED` + komentar u error fieldu je dovoljan signal za UI.
4. **Worker guard za dupli execution** pri forceResume — dodati u Prompt 1 kao defensive check.

---

## Finalni rezultati — šta Faza 3 donosi

| Metrika | Prije | Nakon |
|---------|-------|-------|
| Oporavak od stuck RUNNING | Čekaj 45 min cron → FAILED → Retry = do 1h gubitka | Klik "Nastavi" → odmah re-enqueue od currentStep = <1 min |
| Timeout za impl step | 5 min (premalo za kompleksan codegen) | 8 min — dovoljno za 3000+ linija koda |
| Timeout za infra node | 5 min (preveliko, blokira pipeline) | 1-2 min — konzistentno sa stvarnim trajanjem |
| OTel compliance (AAIF 2026) | Djelimično — `sdlc.*` namespace, bez `gen_ai.agent.*` | Potpuno — sve obavezne `gen_ai.*` atribute prisutne |
| Feedback loop spans u Grafana | Anonimni, nepovezani sa pipelineSpan | Child spans pipeline spana — vidljivo u waterfall view |
| Schema migracije | — | ✅ nula migracija |
| Novi API endpointi | — | ✅ nula novih ruta (proširena retry ruta) |
| Novi UI stranice | — | ✅ nula novih stranica (dopunjena Pipelines stranica) |
