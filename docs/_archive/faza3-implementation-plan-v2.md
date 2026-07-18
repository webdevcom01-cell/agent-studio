# Faza 3 – Resilience: Implementation Plan v2

> **v2 razlike vs v1**: Sedam ispravki pronađenih u reviziji plana. Detalji na kraju dokumenta.

---

## Pregled Faze 3

**Cilj**: Sistem koji ne može da zaglavi — svaki problem ima automatski ili ručni izlaz.

### Tri zadatka

| Zadatak | Naziv | Prioritet |
|---------|-------|-----------|
| **3.1** | Stuck-run detekcija + Force-Resume | Kritičan |
| **3.2** | Per-step timeout (zamena flat 5 min) | Visok |
| **3.3** | AAIF 2026 OTel + feedback-loop trace propagacija | Visok |

---

## Analiza stanja (pre implementacije)

### 3.1 — Stuck-run gap

**Šta nedostaje:**

1. **`pipeline-manager.ts`** — nema `isRunStuck()`, `forceResetStuckRun()`, `PIPELINE_STUCK_THRESHOLD_MS` eksporta. Postoji `detectAndResetStalePipelineRuns()` (cron, 45 min), ali to nije korisno za UI check.

2. **`retry/route.ts`** — prihvata samo `FAILED | CANCELLED`. Status `RUNNING` vraća 409. Nema `forceResume` flag.

3. **`worker.ts` — KRITIČAN BUG** — `processPipelineRunJob` ne proverava status runa pre nego što pozove `markPipelineRunning()`. Kada force-resetujemo RUNNING → FAILED pa enqueue-ujemo novi job, stari BullMQ job (zombie) može da se probudi i pozove `markPipelineRunning()` na novom PENDING runu, kvarajući stanje.

4. **`page.tsx` — UI interface** — `PipelineRun` interfejs nema `startedAt` ni `updatedAt`. Oba polja *jesu* u `SELECT_LIST_FIELDS` backend strani (već potvrđeno), ali UI ih ne vidi.

5. **`page.tsx` — nema "Nastavi" dugmeta** — korisnik ne može da nastavi zaglavljen run.

**Ključna odluka — `updatedAt` vs `startedAt`**:

- `startedAt` = kada je run počeo. **Pogrešno za stuck detekciju.** Pipeling koji traje 15 min bi bio označen kao "stuck" već u minutu 11, čak i ako aktivno radi.
- `updatedAt` = poslednji put kad je Prisma upisala u DB. `advancePipelineStep()` i `saveStepOutput()` oba trigguju Prisma auto-update ovog polja. **Ovo je tačan signal inaktivnosti.**

**Zaključak**: `isRunStuck()` mora koristiti `updatedAt`, ne `startedAt`.

---

### 3.2 — Per-step timeout gap

**Šta nedostaje:**

- `orchestrator.ts` ima `const STEP_TIMEOUT_MS = 5 * 60 * 1000` — flat za sve korake.
- Infrastructure koraci (lint/type-check) traju 1-2 min. Gate koraci 3 min. Test kork 5 min. Implementation 8 min.
- Flat 5 min: infra čeka previše, implementation se prekida prerano.

**Napomena o `agent-tools.ts`**:
- `AGENT_TIMEOUT_PROFILES` i `getTimeoutForAgent()` postoje, ali su za flow-engine sub-agent pozive — nije isti sistem. SDLC treba sopstvenu `getStepTimeoutMs(stepId)` u orchestratoru.

---

### 3.3 — OTel gap

**Šta nedostaje:**

1. **`orchestrator.ts` — `pipelineSpan`** ne sadrži AAIF 2026 obavezne atribute: `gen_ai.operation.name`, `gen_ai.agent.id`, `gen_ai.agent.name`.

2. **`orchestrator.ts` — `stepSpan`** ne sadrži: `gen_ai.operation.name`, `gen_ai.agent.id`.

3. **`feedback-loop.ts`** — nema ni jednog importa iz `tracer.ts` ili `types.ts`. Nema `feedbackSpan`. Feedback loop iteracije su nevidljive u tracing sistemu.

4. **`FeedbackLoopInput` interfejs** — nema `parentTraceContext` polje, pa je nemoguće propagovati parent span kontekst.

5. **`static_analysis` infraSpan** — mora biti zatvoren PRE nego što počne feedback loop. Ako se zatvori posle, span pokrije ceo feedback loop koji logički nije deo infra koraka.

---

## Implementacioni plan

### Prompt 1 — Backend: stuck detekcija + force-resume + zombie guard

**Fajlovi:** `src/lib/sdlc/pipeline-manager.ts`, `src/app/api/agents/[agentId]/pipelines/[runId]/retry/route.ts`, `src/lib/queue/worker.ts`

---

#### `pipeline-manager.ts` — dodati na kraj fajla (pre zatvorene vitičaste zagrade modula)

```typescript
// ─── Stuck-run utilities ──────────────────────────────────────────────────────

/** Runs inactive longer than this are considered stuck */
export const PIPELINE_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Returns true if a RUNNING pipeline run has not written to the DB
 * in more than PIPELINE_STUCK_THRESHOLD_MS milliseconds.
 *
 * NOTE: Uses `updatedAt` (last Prisma write), NOT `startedAt` (pipeline begin).
 * `advancePipelineStep` and `saveStepOutput` both trigger Prisma's auto updatedAt,
 * so this accurately reflects whether the run is making progress.
 */
export function isRunStuck(run: { status: string; updatedAt: Date }): boolean {
  if (run.status !== "RUNNING") return false;
  return Date.now() - run.updatedAt.getTime() > PIPELINE_STUCK_THRESHOLD_MS;
}

/**
 * Force-resets a stuck RUNNING pipeline run to FAILED so it can be re-enqueued.
 * Adds a clear error message explaining why it was reset.
 */
export async function forceResetStuckRun(runId: string): Promise<void> {
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      error: "Run was stuck (no progress detected for over 10 minutes) and was force-reset.",
      completedAt: new Date(),
    },
  });
}
```

---

#### `retry/route.ts` — proširiti da prihvata `forceResume`

**Korak 1**: U body parsing sekciji (posle `startFromStep` destructure), dodati:

```typescript
const { startFromStep, forceResume = false } = await req.json();
```

**Korak 2**: Zameniti blok koji proverava dozvoljene statuse (trenutno vraća 409 za RUNNING):

```typescript
// BEFORE:
if (run.status !== "FAILED" && run.status !== "CANCELLED") {
  return NextResponse.json(
    { error: "Only FAILED or CANCELLED runs can be retried" },
    { status: 409 }
  );
}

// AFTER:
const isStuckRunning = run.status === "RUNNING" && isRunStuck(run);

if (run.status === "RUNNING" && !forceResume) {
  return NextResponse.json(
    { error: "Run is still active. Use forceResume: true to force-reset a stuck run." },
    { status: 409 }
  );
}

if (run.status === "RUNNING" && forceResume && !isStuckRunning) {
  return NextResponse.json(
    { error: "Run is RUNNING but not stuck yet. Cannot force-resume an active run." },
    { status: 409 }
  );
}

if (
  run.status !== "FAILED" &&
  run.status !== "CANCELLED" &&
  !(run.status === "RUNNING" && forceResume && isStuckRunning)
) {
  return NextResponse.json(
    { error: "Only FAILED, CANCELLED, or stuck RUNNING runs can be retried" },
    { status: 409 }
  );
}
```

**Korak 3**: Odmah posle gore navedene provjere, pre nego što se izračunava `startFromStep`, dodati:

```typescript
// Force-reset stuck RUNNING run to FAILED before re-enqueueing
if (run.status === "RUNNING" && forceResume && isStuckRunning) {
  await forceResetStuckRun(run.id);
}
```

**Korak 4**: Dodati import na vrhu fajla:

```typescript
import {
  isRunStuck,
  forceResetStuckRun,
  // ... ostali postojeći importi iz pipeline-manager
} from "@/lib/sdlc/pipeline-manager";
```

---

#### `worker.ts` — zombie job guard u `processPipelineRunJob`

Odmah posle `const run = await getPipelineRun(pipelineRunId);` i null-check, dodati:

```typescript
// Guard against zombie jobs: if a stuck RUNNING run was force-reset to FAILED
// and re-enqueued, the old BullMQ job may still be alive. If this job finds
// the run is no longer PENDING (e.g. it's already RUNNING from the new job),
// skip silently to avoid corrupting state.
if (run.status !== "PENDING") {
  logger.warn(
    { pipelineRunId, status: run.status },
    "processPipelineRunJob: run is not PENDING, skipping (possible zombie job)"
  );
  return { skipped: true, reason: `status was ${run.status}` };
}
```

---

### Prompt 2 — UI: stuck badge + Nastavi dugme

**Fajl:** `src/app/pipelines/[agentId]/page.tsx`

---

#### Korak 1: UI `PipelineRun` interfejs — dodati polja

```typescript
// BEFORE (otprilike linija 67-100):
interface PipelineRun {
  id: string;
  status: PipelineRunStatus;
  currentStep: string | null;
  // ...
  createdAt: string;
}

// AFTER — dodati startedAt i updatedAt:
interface PipelineRun {
  id: string;
  status: PipelineRunStatus;
  currentStep: string | null;
  // ... (sva postojeća polja ostaju)
  startedAt: string | null;   // kada je run počeo
  updatedAt: string;          // poslednji DB upis — koristimo za stuck detekciju
  createdAt: string;
}
```

---

#### Korak 2: Import `AlertCircle` — već postoji, koristiti ga

Pošto `AlertTriangle` nije importovan a `AlertCircle` jeste, koristiti `AlertCircle` za stuck badge. Alternativno, dodati `AlertTriangle` u postojeći import:

```typescript
// Opcija A — koristiti postojeći AlertCircle (bez promene importa):
import { ..., AlertCircle, ... } from "lucide-react";

// Opcija B — dodati AlertTriangle:
import { ..., AlertCircle, AlertTriangle, ... } from "lucide-react";
```

**Preporučeno**: Opcija B (AlertTriangle) — semantički jasniji za "upozorenje o zaglavljenom runu".

---

#### Korak 3: `isStuck` computed vrednost (na nivou run-a)

U delu gde se renderuje lista runova, dodati:

```typescript
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 min — mora biti konzistentno sa backend

// Za svaki run u listi:
const isStuck =
  run.status === "RUNNING" &&
  Date.now() - new Date(run.updatedAt).getTime() > STUCK_THRESHOLD_MS;
```

---

#### Korak 4: Status badge — dodati stuck varijantu

```typescript
// U getStatusBadge() ili ekvivalentnoj funkciji:
if (isStuck) {
  return (
    <Badge variant="outline" className="border-orange-500 text-orange-600">
      <AlertTriangle className="mr-1 h-3 w-3" />
      Zaglavljen
    </Badge>
  );
}
```

---

#### Korak 5: Cancel dugme — mora biti sakriveno za stuck runove

```typescript
// BEFORE:
{(run.status === "RUNNING" || run.status === "PENDING" || run.status === "AWAITING_APPROVAL") && (
  <Button onClick={() => handleCancel(run.id)}>Otkaži</Button>
)}

// AFTER — dodati !isStuck uslov:
{!isStuck && (run.status === "RUNNING" || run.status === "PENDING" || run.status === "AWAITING_APPROVAL") && (
  <Button onClick={() => handleCancel(run.id)}>Otkaži</Button>
)}
```

---

#### Korak 6: Nastavi dugme — za stuck runove

```typescript
// Prikazati UMESTO Cancel dugmeta kada je run stuck:
{isStuck && (
  <Button
    variant="outline"
    className="border-orange-500 text-orange-600 hover:bg-orange-50"
    onClick={() => handleForceResume(run.id)}
    disabled={isResuming === run.id}
  >
    {isResuming === run.id ? (
      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
    ) : (
      <AlertCircle className="mr-2 h-4 w-4" />
    )}
    Nastavi
  </Button>
)}
```

---

#### Korak 7: `handleForceResume` handler

```typescript
const [isResuming, setIsResuming] = useState<string | null>(null);

const handleForceResume = async (runId: string) => {
  setIsResuming(runId);
  try {
    const res = await fetch(
      `/api/agents/${agentId}/pipelines/${runId}/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceResume: true }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Greška pri nastavku runa");
      return;
    }
    toast.success("Run je nastavljen");
    // Osvežiti listu runova
    await fetchRuns();
  } catch (e) {
    toast.error("Greška pri nastavku runa");
  } finally {
    setIsResuming(null);
  }
};
```

---

### Prompt 3 — Orchestrator: per-step timeout

**Fajl:** `src/lib/sdlc/orchestrator.ts`

---

#### Korak 1: Zameniti flat konstantu sa `getStepTimeoutMs()`

```typescript
// UKLONITI:
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

// DODATI:
/**
 * Per-step timeout based on step category.
 * Infrastructure steps are fast (lint, type-check).
 * Gate steps need time for LLM decision.
 * Implementation steps need the most time.
 */
function getStepTimeoutMs(stepId: string): number {
  // Infrastructure / static analysis
  if (
    stepId === "static_analysis" ||
    stepId === "lint_check" ||
    stepId === "type_check"
  ) {
    return 2 * 60 * 1000; // 2 min
  }

  // Gate / review steps
  if (
    stepId === "architecture_review" ||
    stepId.includes("_gate") ||
    stepId.includes("_review") ||
    stepId.includes("_approval")
  ) {
    return 3 * 60 * 1000; // 3 min
  }

  // Planning steps
  if (
    stepId === "requirements_analysis" ||
    stepId === "architecture_planning" ||
    stepId.includes("_planning") ||
    stepId.includes("_analysis")
  ) {
    return 3 * 60 * 1000; // 3 min
  }

  // Test steps
  if (stepId.includes("test") || stepId === "test_execution") {
    return 5 * 60 * 1000; // 5 min
  }

  // Implementation steps (default — longest)
  return 8 * 60 * 1000; // 8 min
}
```

---

#### Korak 2: Zameniti sve pozive `STEP_TIMEOUT_MS` sa `getStepTimeoutMs(stepId)`

Traži sve instance `STEP_TIMEOUT_MS` u orchestrator.ts i zameni:

```typescript
// BEFORE:
AbortSignal.timeout(STEP_TIMEOUT_MS)

// AFTER:
AbortSignal.timeout(getStepTimeoutMs(step.id))
```

**Napomena**: Proveriti da li postoje i pozivi u obliku `{ timeout: STEP_TIMEOUT_MS }` — zameniti i njih.

Ukupno ~7 zamena. Proveriti svaku da se `step.id` ili `stepId` varijabla postoji u scope-u.

---

### Prompt 4 — OTel: AAIF 2026 atributi + feedback-loop trace

**Fajlovi:** `src/lib/sdlc/orchestrator.ts`, `src/lib/sdlc/feedback-loop.ts`

---

#### `orchestrator.ts` — pipelineSpan atributi

```typescript
// BEFORE — postojeći atributi:
const pipelineSpan = startSpan("sdlc.pipeline", {
  "sdlc.run.id": run.id,
  "sdlc.agent.id": agentId,
  "sdlc.pipeline.step_count": pipeline.steps.length,
});

// AFTER — dodati AAIF 2026 obavezne atribute:
const pipelineSpan = startSpan("sdlc.pipeline", {
  "sdlc.run.id": run.id,
  "sdlc.agent.id": agentId,
  "sdlc.pipeline.step_count": pipeline.steps.length,
  // AAIF 2026 required:
  "gen_ai.operation.name": "sdlc.pipeline",
  "gen_ai.agent.id": agentId,
  "gen_ai.agent.name": agent.name ?? agentId,
});
```

---

#### `orchestrator.ts` — stepSpan atributi

```typescript
// BEFORE:
const stepSpan = startSpan(`sdlc.step.${step.id}`, {
  "sdlc.step.id": step.id,
  "sdlc.step.index": stepIndex,
  "sdlc.step.phase": step.phase,
  "gen_ai.request.model": modelId,
});

// AFTER:
const stepSpan = startSpan(`sdlc.step.${step.id}`, {
  "sdlc.step.id": step.id,
  "sdlc.step.index": stepIndex,
  "sdlc.step.phase": step.phase,
  "gen_ai.request.model": modelId,
  // AAIF 2026 required:
  "gen_ai.operation.name": `sdlc.step.${step.phase}`,
  "gen_ai.agent.id": agentId,
});
```

---

#### `orchestrator.ts` — static_analysis infraSpan — zatvoriti PRE feedback loopa

**Ovo je kritično**: infraSpan mora biti zatvoren čim `runStaticAnalysis()` vrati rezultat, PRE nego što počnu feedback loop iteracije.

```typescript
// U INFRASTRUCTURE_NODES bloku:

// BEFORE (pogrešno — infraSpan pokrije ceo feedback loop):
const infraSpan = startSpan("sdlc.infra.static_analysis", { ... });
const staticResult = await runStaticAnalysis(...);
// ... feedback loop iteracije ...
infraSpan.end(); // ← prekasno

// AFTER (ispravno — infraSpan zatvoren odmah):
const infraSpan = startSpan("sdlc.infra.static_analysis", {
  "sdlc.step.id": step.id,
  "gen_ai.operation.name": "sdlc.infra.static_analysis",
  "gen_ai.agent.id": agentId,
});
let staticResult: StaticAnalysisResult;
try {
  staticResult = await runStaticAnalysis(/* args */);
} finally {
  infraSpan.end(); // ← zatvori odmah, pre feedback loopa
}

// Feedback loop iteracije počinju POSLE infraSpan.end():
for (let attempt = 0; attempt < maxAttempts; attempt++) {
  await runFeedbackIteration({
    ...feedbackInput,
    parentTraceContext: stepSpan.context(), // propagacija na feedback loop
  });
}
```

---

#### `feedback-loop.ts` — dodati tracer importove i feedbackSpan

**Korak 1**: Dodati importove na vrhu fajla (odmah posle postojećih importova):

```typescript
import type { TraceContext } from "@/lib/observability/types";
import { startSpan } from "@/lib/observability/tracer";
```

**Korak 2**: Proširiti `FeedbackLoopInput` interfejs:

```typescript
// BEFORE:
interface FeedbackLoopInput {
  taskDescription: string;
  architecturePlan: string;
  previousImplementation: string;
  testOutput: string;
  codebaseContext: string;
  agentId: string;
  modelId: string;
  attempt: number;
}

// AFTER:
interface FeedbackLoopInput {
  taskDescription: string;
  architecturePlan: string;
  previousImplementation: string;
  testOutput: string;
  codebaseContext: string;
  agentId: string;
  modelId: string;
  attempt: number;
  parentTraceContext?: TraceContext; // propagacija od orchestrator step spana
}
```

**Korak 3**: U `runFeedbackIteration()`, dodati `feedbackSpan` sa obaveznim atributima i zatvoriti ga u `finally` blok:

```typescript
export async function runFeedbackIteration(
  input: FeedbackLoopInput,
  systemPrompt: string,
  externalSignal?: AbortSignal
): Promise<FeedbackLoopOutput> {
  // Pokrenuti span — vezan za parent ako je prosleđen
  const feedbackSpan = startSpan(
    `sdlc.feedback.attempt_${input.attempt}`,
    {
      "sdlc.feedback.attempt": input.attempt,
      "gen_ai.operation.name": "sdlc.feedback_loop",
      "gen_ai.agent.id": input.agentId,
      "gen_ai.request.model": input.modelId,
    },
    input.parentTraceContext // parent context iz orchestratora
  );

  try {
    // ... postojeći kod (generateText poziv itd.) ...

    return result;
  } catch (error) {
    feedbackSpan?.setAttribute("error", true);
    feedbackSpan?.setAttribute(
      "error.message",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  } finally {
    // KRITIČNO: zatvoriti span u finally bloku da ne curi
    // ni u happy path ni u catch path (AbortError, timeout, itd.)
    feedbackSpan?.end();
  }
}
```

**Napomena o `startSpan` signaturi sa parent contextom**: Proveriti da li `startSpan` u `tracer.ts` prihvata treći argument kao parent context. Ako ne, koristiti `childContext(parentTraceContext, () => startSpan(...))` patern koji već postoji u `tracer.ts`.

---

### Prompt 5 — Testovi

**Fajlovi:** `src/lib/sdlc/__tests__/pipeline-manager.test.ts` (novi ili proširiti postojeće), `src/lib/sdlc/__tests__/feedback-loop.test.ts` (novi ili proširiti)

---

#### Test 3.1 — `isRunStuck`

```typescript
describe("isRunStuck", () => {
  it("returns false for non-RUNNING status", () => {
    const run = { status: "FAILED", updatedAt: new Date(0) };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns false for RUNNING run updated recently", () => {
    const run = { status: "RUNNING", updatedAt: new Date() };
    expect(isRunStuck(run)).toBe(false);
  });

  it("returns true for RUNNING run with stale updatedAt", () => {
    const staleTime = new Date(Date.now() - 11 * 60 * 1000); // 11 min ago
    const run = { status: "RUNNING", updatedAt: staleTime };
    expect(isRunStuck(run)).toBe(true);
  });

  it("returns false exactly at threshold (boundary)", () => {
    const atThreshold = new Date(Date.now() - 10 * 60 * 1000 + 1000);
    const run = { status: "RUNNING", updatedAt: atThreshold };
    expect(isRunStuck(run)).toBe(false);
  });
});
```

---

#### Test 3.1 — zombie job guard

```typescript
describe("processPipelineRunJob — zombie guard", () => {
  it("skips processing if run is not PENDING", async () => {
    mockGetPipelineRun.mockResolvedValueOnce({
      id: "run-1",
      status: "RUNNING", // Već RUNNING — zombie scenario
    });

    const result = await processPipelineRunJob({ pipelineRunId: "run-1" });

    expect(result).toMatchObject({ skipped: true });
    expect(mockMarkPipelineRunning).not.toHaveBeenCalled();
  });
});
```

---

#### Test 3.3 — feedbackSpan zatvoren u finally

```typescript
describe("runFeedbackIteration — tracing", () => {
  it("closes feedbackSpan even when generateText throws", async () => {
    const mockSpan = { end: vi.fn(), setAttribute: vi.fn() };
    mockStartSpan.mockReturnValueOnce(mockSpan);
    mockGenerateText.mockRejectedValueOnce(new Error("AbortError"));

    await expect(
      runFeedbackIteration(mockInput, "system prompt")
    ).rejects.toThrow("AbortError");

    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it("closes feedbackSpan in happy path", async () => {
    const mockSpan = { end: vi.fn(), setAttribute: vi.fn() };
    mockStartSpan.mockReturnValueOnce(mockSpan);
    mockGenerateText.mockResolvedValueOnce({ text: "ok" });

    await runFeedbackIteration(mockInput, "system prompt");

    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });
});
```

---

### Prompt 6 — Verifikacija i commit

```bash
# 1. TypeScript check
npx tsc --noEmit 2>&1 | head -50

# 2. Pokrenuti sve testove
npx vitest run 2>&1 | tail -20

# 3. Ako sve prolazi, commit
git add -A
git commit -m "feat(faza3): stuck-run detection, per-step timeouts, AAIF 2026 OTel

Task 3.1: isRunStuck (updatedAt), forceResetStuckRun, PIPELINE_STUCK_THRESHOLD_MS
Task 3.1: retry/route.ts forceResume flag + stuck RUNNING acceptance
Task 3.1: worker.ts zombie job guard (status !== PENDING early return)
Task 3.1: UI stuck badge + Nastavi button + correct Cancel condition
Task 3.2: getStepTimeoutMs() replacing flat STEP_TIMEOUT_MS (7 substitutions)
Task 3.3: pipelineSpan + stepSpan AAIF 2026 gen_ai.* attributes
Task 3.3: feedback-loop.ts feedbackSpan with parent context propagation
Task 3.3: feedbackSpan.end() in finally block (no span leak on abort/error)
Task 3.3: static_analysis infraSpan closed before feedback loop iterations"

# 4. Push
git push origin main
```

---

## v2 ispravke vs v1

Ovo su sedam propusta pronađenih u reviziji v1 plana:

### Propust 1 — `startedAt` umesto `updatedAt` za stuck detekciju (KRITIČAN)

**v1**: Koristio `startedAt` za `isRunStuck()` i UI `isStuck` računanje.

**Problem**: Pipeline koji legitimno traje 15 min bi bio označen kao "stuck" u minutu 11 čak i ako aktivno upisuje u DB.

**v2**: Koristi `updatedAt` — tačan signal inaktivnosti. `advancePipelineStep()` i `saveStepOutput()` trigguju Prisma auto-update, pa `updatedAt` reflektuje poslednji stvarni progres.

**Dodatno**: `updatedAt` je u `SELECT_LIST_FIELDS` (potvrđeno u pipeline-manager.ts linija 218), ali NIJE u UI `PipelineRun` interfejsu — oba mesta moraju biti ažurirana.

---

### Propust 2 — zombie job guard nije bio u planu implementacije

**v1**: Pomenuo zombie job problem u sekciji "rizici" ali nije uključio guard u ni jedan Prompt.

**Problem**: Force-resume bi mogao pokvariti stanje novog runa ako stari BullMQ job "oživi".

**v2**: Guard dodat eksplicitno u Prompt 1 — odmah posle null-check u `processPipelineRunJob`, pre `markPipelineRunning()`.

---

### Propust 3 — `feedbackSpan` curi u catch path

**v1**: `feedbackSpan?.end()` samo u happy path.

**Problem**: Ako `generateText` baci grešku (AbortError, timeout), span nikad nije zatvoren → memorijski leak u tracing sistemu.

**v2**: `feedbackSpan?.end()` je u `finally` bloku koji već postoji u `runFeedbackIteration` — garantovano izvršavanje bez obzira na ishod.

---

### Propust 4 — `AlertTriangle` nije importovan u page.tsx

**v1**: Koristio `AlertTriangle` ikonu za stuck badge.

**Problem**: `AlertTriangle` nije u importu u page.tsx. `AlertCircle` jeste.

**v2**: Preporučuje Opciju B — eksplicitno dodati `AlertTriangle` u import listu. Alternativno Opcija A — koristiti postojeći `AlertCircle`.

---

### Propust 5 — Cancel dugme nije eksplicitno uslovljeno sa `!isStuck`

**v1**: Opisano u tekstu ali nije jasno prikazano u kodu.

**Problem**: Originalni uslov `run.status === "RUNNING"` ostaje tačan i za stuck runove, pa Cancel dugme bi se i dalje prikazivalo.

**v2**: Eksplicitno `!isStuck && (run.status === "RUNNING" || ...)` u kodu.

---

### Propust 6 — `infraSpan` za static_analysis zatvoren posle feedback loopa

**v1**: Pomenuo da infraSpan treba dodati ali nije specificirao *kada* se zatvara.

**Problem**: Ako se `infraSpan.end()` stavi na kraj INFRASTRUCTURE_NODES bloka, span bi pokrio sve feedback loop iteracije, što je logički netačno — infra span treba da reflektuje samo `runStaticAnalysis()` trajanje.

**v2**: Eksplicitno `try/finally { infraSpan.end() }` odmah oko `runStaticAnalysis()` poziva, pre feedback loop petlje.

---

### Propust 7 — tracer importovi nisu bili eksplicitni u Prompt 4

**v1**: Pretpostavljao da su importi dostupni u feedback-loop.ts.

**Problem**: feedback-loop.ts nema ni jedan import iz `tracer.ts` ili `types.ts`. Bez eksplicitnog navođenja, implementator bi naišao na compile error.

**v2**: Prompt 4 počinje sa eksplicitnim importima koje treba dodati na vrh fajla.

---

## Redosled izvršavanja

```
Prompt 1  →  pipeline-manager.ts + retry/route.ts + worker.ts
Prompt 2  →  page.tsx (UI)
Prompt 3  →  orchestrator.ts (timeouts)
Prompt 4  →  orchestrator.ts (OTel) + feedback-loop.ts
Prompt 5  →  testovi
Prompt 6  →  tsc + vitest + commit + push
```

**Procena vremena**: 3-4h za sve prompts.

**Zavisnosti**: Prompts 3 i 4 mogu ići paralelno (različiti delovi orchestratora). Prompts 1 i 2 mogu ići paralelno (backend vs UI). Prompt 5 i 6 moraju biti poslednji.
