# Faza 2 — Performance: Implementation Plan v2

> Generisano: 2026-05-07  
> **v2 — Revidiran nakon dublje analize koda. Ispravlja 5 kritičnih propusta iz v1.**  
> Cilj: Pipeline od ~15 minuta svesti na ~6-11 minuta. Nikad ne gubiti rezultate.

---

## Šta je novo u v2 (vs v1)

| # | Problem koji v1 nije pokrio | Impakt |
|---|----------------------------|--------|
| 1 | `stepOutputs.push()` je poziciono-osjetljiv — ne smije se pozivati iz paralelne egzekucije | **BLOCKER** — bez ovog, `buildSummary` i `pr_generation` bi imali pogrešan mapping |
| 2 | BLOCK-u parallelnom modu zahtijeva posebnu logiku — ko poziva `onStepComplete` vs `saveStepOutput` | **BLOCKER** — bez ovog, retry na BLOCKed pipeline bi mogao preskočiti gate step |
| 3 | `runFeedbackIteration()` nema `AbortSignal` parametar | **ZNAČAJAN** — cancel ne stopira feedback loop (do 15 min blokiran) |
| 4 | `testAC` u TEST_STEP feedback loopu nema pipeline cancel signal | **UMJEREN** — cancel ne stopira test re-run unutar loopa |
| 5 | Node.js v22.22.0 → `AbortSignal.any()` dostupan | **POBOLJŠANJE** — čišća implementacija cancel propagacije |

---

## 1. Status taska po IMPROVEMENT-PLAN-2026.md

| Task | Status |
|------|--------|
| **2.1** Paralelni sub-agenti | ❌ NIJE URAĐENO — 3 prompta |
| **2.2** Incremental DB Save | ✅ VEĆ URAĐENO |
| **2.3** Cancel propagacija do sub-agenata | ❌ NIJE URAĐENO — 2 prompta |
| **2.4** `conversationId` na `AgentCallLog` | ✅ VEĆ URAĐENO |

**Ukupno preostalo: 5 prompta + 1 za tsc/vitest/push = 6 prompta**

---

## 2. Pipeline dependency graf — finalna analiza

```
new-feature (9 koraka):
  project_context → ecc-planner → ecc-tdd-guide → ecc-implementer
  → sandbox_verify → static_analysis
  → [ecc-code-reviewer ║ ecc-security-reviewer]  ← JEDINA parallel prilike
  → pr_generation

bug-fix (8 koraka):
  project_context → ecc-tdd-guide → ecc-implementer
  → sandbox_verify → static_analysis
  → [ecc-code-reviewer ║ ecc-security-reviewer]  ← JEDINA parallel prilike
  → pr_generation

refactor, api-design, code-review, security-audit, performance, documentation:
  → sve single-gate ili sekvencijalne zavisnosti → nema paralelizacije
```

### Zašto NE paralelizovati ostale stepove:

- **ecc-planner + ecc-tdd-guide (PLANNING_STEPS)**: Oba pišu u `architecturePlan` string akumulatorom (`+=`). TDD guide logički ovisi o plannerovoj arhitekturi. Sekvencijalno.
- **static_analysis → gate steps**: `static_analysis` može triggerovati feedback loop koji mijenja `lastImplOutput`. Gate stepovi moraju čitati finalnu verziju implementacije. Sekvencijalno.
- **security-audit pipeline** (`ecc-security-reviewer → ecc-security-engineer`): `ecc-security-engineer` ovisi o security reviewer outputu. Sekvencijalno.

---

## 3. Task 2.1 — Paralelni Gate Steps (Revidirani dizajn)

### 3.1 Kritični problemi sa shared mutable state

Trenutni sekvencijalni loop koristi ove **zajednički mutabilne varijable** koje se moraju zaštititi:

```typescript
// MORA ostati izvan paralelne egzekucije:
let totalInputTokens: number;       // += na svakom stepu
let totalOutputTokens: number;      // += na svakom stepu
const stepOutputs: string[];        // .push() — poziciono-osjetljiv!
const contextParts: string[];       // .push() — poziciono-osjetljiv!
const stepMetricsMap: Record<number, StepMetric>;  // [stepIdx] = ...

// MOŽE biti pozvan iz paralelne egzekucije (različiti DB zapisi):
onStepComplete(stepIdx, output)     // piše u različite DB redove
```

#### Zašto je `stepOutputs.push()` kritičan:

`buildSummary()` (linija 1522):
```typescript
const sections = outputs.map((out, i) => {
  const stepId = pipeline[i] ?? `step-${i}`;  // ← pozicija mora odgovarati!
```

`pr_generation` (linija 605-610):
```typescript
for (let i = 0; i < stepIdx; i++) {
  stepOutputMap[pipeline[i]] = stepOutputs[i];  // ← indeks mora biti ispravan!
}
```

**Pravilo**: `stepOutputs.push()` i `contextParts.push()` se NIKAD ne pozivaju iz unutrašnjosti paralelne egzekucije. Helper funkcija samo vraća rezultate. Caller vrši push u originalnom redoslijedu.

### 3.2 BLOCK logika u paralelnom modu

#### Problem:
Trenutna sekvencijalna logika (linija 885-900) za BLOCK:
```typescript
if (gateDecision === "BLOCK") {
  await saveStepOutput(runId, stepIdx, stepOutput);  // ← samo za UI prikaz
  // NE poziva onStepComplete → currentStep ostaje na gate step
  throw new Error(`Gate step "${stepId}" blocked...`);
}
```
`onStepComplete` se poziva tek na liniji 1330, nakon što BLOCK nije detektovan. BLOCK sprječava `onStepComplete`, što znači da `currentStep` ostaje na gate step indeksu i retry ponovo pokreće taj gate step.

#### Rješenje za paralelni BLOCK:
```
Scenario A: oba APPROVE
  → push oba outputa u stepOutputs/contextParts (u redoslijedu pipeline indeksa)
  → pozovi onStepComplete za oba (u bilo kom redoslijedu, različiti DB redovi)
  → nastavi na pr_generation ✅

Scenario B: jedan BLOCK, drugi APPROVE
  → za BLOCKed: pozovi saveStepOutput (prikaz u UI)
  → za APPROVE: pozovi saveStepOutput (prikaz u UI)  
  → NE pozivaj onStepComplete ni za jednog
  → currentStep ostaje na prvom gate step indeksu
  → retry pokreće oba gate stepa ponovo ✅

Scenario C: oba BLOCK
  → saveStepOutput za oba
  → NE pozivaj onStepComplete
  → baci kombinovani Error sa oba obrazloženja ✅

Scenario D: jedan baci Exception (provider error, timeout)
  → za uspješnog: saveStepOutput (ne onStepComplete)
  → za neuspješnog: logovati grešku
  → baci grešku → pipeline FAILED → retry od prvog gate step indeksa ✅
```

**Ključna odluka**: `onStepComplete` se poziva iz callera (ne iz helpera), i samo ako su SVI gate stepovi završili sa APPROVE/REQUEST_CHANGES.

### 3.3 Arhitektura implementacije

#### Nova funkcija: `runSingleGateStep()`

Izdvaja logiku linija 837-900 iz for-loopa. Prima sve potrebne parametre, vraća rezultat. Ne mutira nikakvu zajedničku varijablu.

```typescript
interface GateStepResult {
  stepId: string;
  stepIdx: number;
  output: string;           // JSON stringificirani review output
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  blocked: boolean;
  blockError?: string;      // Tekst za grešku ako je blocked
  stepMetric: StepMetric;
}

async function runSingleGateStep(params: {
  stepId: string;
  stepIdx: number;
  pipeline: string[];
  contextParts: string[];   // read-only snapshot — ne mutirati!
  architecturePlan: string;
  codeContext: string;      // svaki step dobija sopstveni RAG
  taskDescription: string;
  resolvedModelId: string;
  stepModelOverrides: Record<string, string>;
  agentId: string;
  runId: string;
  useSmartRouting: boolean;
  adaptiveStatsCache: Map<StepPhase, AdaptiveStat[]>;
  pipelineSpan: Span;
  abortSignal: AbortSignal; // pipeline-level signal (uključuje cancel + timeout)
  codebaseReady: boolean;
}): Promise<GateStepResult>
```

**Šta ova funkcija radi**:
1. Poziva `resolveStepModelAdaptive` (čita `adaptiveStatsCache` — read-only, thread-safe)
2. Kreira OTel `stepSpan` sa `parentContext: pipelineSpan.traceContext`
3. Pravi RAG search (`searchCodebase` — read-only na vector DB)
4. Gradi `contextDoc` iz `contextParts` (read-only)
5. Poziva `generateObject` sa `gateSchema` i `abortSignal`
6. Detektuje BLOCK odluku iz JSON outputa
7. Poziva `fireSdkLearnHook` (fire-and-forget, non-blocking)
8. Poziva `recordTokenUsage` i `recordChatLatency`
9. Zatvara OTel `stepSpan`
10. **NE mutira**: `stepOutputs`, `contextParts`, `totalInputTokens`, `stepMetricsMap`
11. **NE poziva**: `onStepComplete`, `saveStepOutput`, `onProgress`
12. Vraća `GateStepResult` — caller odlučuje šta raditi

#### Nova funkcija: `runParallelGateSteps()`

```typescript
interface ParallelGateResult {
  stepOutputs: Array<{ stepIdx: number; output: string }>;  // u originalnom redoslijedu
  inputTokens: number;
  outputTokens: number;
  stepMetrics: Record<number, StepMetric>;
  allApproved: boolean;
  blockErrors: string[];
}

async function runParallelGateSteps(
  gateGroup: Array<{ id: string; idx: number }>,
  sharedParams: GateStepSharedParams,
  callbacks: {
    onStepComplete: (stepIdx: number, output: string) => Promise<void>;
    onProgress: (pct: number) => Promise<void>;
    saveStepOutput: (runId: string, stepIdx: number, output: string) => Promise<void>;
  },
  pipelineAC: AbortController,     // za per-step timeout linking
  midpointPct: number,             // progress progress za tokom parallel-a
): Promise<ParallelGateResult>
```

**Implementacija**:
```typescript
async function runParallelGateSteps(...): Promise<ParallelGateResult> {
  // Svaki step dobija sopstveni per-step timeout AbortController
  // linkovan na pipeline-level signal:
  const perStepACs = gateGroup.map(() => new AbortController());
  const timeoutIds = perStepACs.map((ac, i) => {
    const timeoutSig = AbortSignal.timeout(STEP_TIMEOUT_MS);
    // AbortSignal.any() spaja oba signala — dostupno u Node 22+
    return; // vidi sekciju 4 za detalje
  });

  await onProgress(midpointPct);

  const settled = await Promise.allSettled(
    gateGroup.map((gate, i) =>
      runSingleGateStep({
        ...gate,
        ...sharedParams,
        abortSignal: AbortSignal.any([
          pipelineAC.signal,
          AbortSignal.timeout(STEP_TIMEOUT_MS),
        ]),
      })
    )
  );

  // Procesirati rezultate serijalno
  const outputsInOrder: Array<{ stepIdx: number; output: string }> = [];
  const stepMetrics: Record<number, StepMetric> = {};
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const blockErrors: string[] = [];
  const fulfilledResults: GateStepResult[] = [];

  for (let i = 0; i < settled.length; i++) {
    const gate = gateGroup[i];
    const result = settled[i];
    
    if (result.status === "fulfilled") {
      const r = result.value;
      outputsInOrder.push({ stepIdx: r.stepIdx, output: r.output });
      stepMetrics[r.stepIdx] = r.stepMetric;
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      if (r.blocked) blockErrors.push(r.blockError ?? `${gate.id} blocked`);
      else fulfilledResults.push(r);
    } else {
      // Rejected — provider error ili timeout
      blockErrors.push(`${gate.id} failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  }

  const allApproved = blockErrors.length === 0;

  if (allApproved) {
    // Sve APPROVE — pozovi onStepComplete za svaki (u redoslijedu gateGroup)
    for (const { stepIdx, output } of outputsInOrder) {
      await callbacks.onStepComplete(stepIdx, output);
    }
  } else {
    // Barem jedan BLOCK ili greška — saveStepOutput za prikaz u UI, ne onStepComplete
    for (const { stepIdx, output } of outputsInOrder) {
      await callbacks.saveStepOutput(runId, stepIdx, output);
    }
  }

  return { stepOutputs: outputsInOrder, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, stepMetrics, allApproved, blockErrors };
}
```

#### Izmjena u glavnoj `for` petlji:

```typescript
// Umjesto: if (GATE_STEPS.has(stepId)) { ... existing sequential logic }

if (GATE_STEPS.has(stepId)) {
  // Skupi sve uzastopne GATE_STEPS od trenutnog indeksa
  const gateGroup: Array<{ id: string; idx: number }> = [{ id: stepId, idx: stepIdx }];
  let peek = stepIdx + 1;
  while (peek < pipeline.length && GATE_STEPS.has(pipeline[peek])) {
    gateGroup.push({ id: pipeline[peek], idx: peek });
    peek++;
  }

  let stepOutput: string; // za fallback sekvencijalnog single-gate (nije promjenjen)

  if (gateGroup.length > 1) {
    // ── PARALELNO izvršavanje ─────────────────────────────────────
    const midPct = Math.min(5 + Math.floor(((stepIdx + 0.5) / pipeline.length) * 85), 90);
    const parallelResult = await runParallelGateSteps(gateGroup, sharedParams, callbacks, pipelineAC, midPct);

    // Merge u shared state — SERIJSKI, u originalnom pipeline redoslijedu:
    totalInputTokens += parallelResult.inputTokens;
    totalOutputTokens += parallelResult.outputTokens;
    Object.assign(stepMetricsMap, parallelResult.stepMetrics);

    for (const { stepIdx: gIdx, output } of parallelResult.stepOutputs) {
      stepOutputs.push(output); // ← uvijek u redoslijedu gateGroup, koji je u redoslijedu pipeline-a
      contextParts.push(`# Step ${gIdx + 1} output (${pipeline[gIdx]})\n${output.slice(0, CONTEXT_SLICE_PER_STEP)}`);
    }

    // Ako je blokiran — baci grešku (pipeline se stopira)
    if (!parallelResult.allApproved) {
      throw new Error(
        `Gate step(s) blocked pipeline execution.\n${parallelResult.blockErrors.join("\n")}`
      );
    }

    // Preskočiti ostale gate stepove (for loop radi ++, pa peek-1)
    stepIdx = peek - 1;
    await onProgress(Math.min(5 + Math.floor((peek / pipeline.length) * 85), 90));
    continue; // → sljedeći korak (pr_generation)

  } else {
    // ── Sekvencijalno (single gate) — nepromjenjena logika ─────────
    // ... postojeći kod linija 837-926 ...
  }
}
```

---

## 4. Task 2.3 — Cancel Propagacija (Revidirani dizajn)

### 4.1 Node.js v22 — `AbortSignal.any()` dostupan

Provjera: `node --version` → **v22.22.0** ✅  
`AbortSignal.any([sig1, sig2])` — vraća signal koji se abort-uje čim BILO KOJI od ulaznih signala se abort-uje.

Ovo eliminiše potrebu za ručnim `addEventListener` + `removeEventListener` pattern-om iz v1 plana.

### 4.2 Propušteni AbortSignal pozivi — kompletan popis

Iz v1 plana:
- ✅ Svaki step's `ac = new AbortController()` → linkovati na `pipelineAC`
- ✅ Svaki step's `testAC` u TEST_STEP feedback loopu (linija 1218)

**Novo iz v2 analize** — propušteno u v1:
- ❌ `runFeedbackIteration()` u `feedback-loop.ts` — kreira **sopstveni** `ac` sa `FEEDBACK_TIMEOUT_MS = 5 min` i nema parametar za externi signal
- ❌ `runFeedbackIteration()` pozivi u `static_analysis` bloku (linija 524-538)
- ❌ `runFeedbackIteration()` pozivi u IMPL_STEP real-exec loopu (linija 1024-1037)  
- ❌ `runFeedbackIteration()` pozivi u TEST_STEP feedback loopu (linija 1163-1175)

**Bez ove izmjene**: cancel signal ne stopira feedback loop koji može trajati do `3 × FEEDBACK_TIMEOUT_MS = 15 minuta`.

### 4.3 Izmjene u `feedback-loop.ts`

```typescript
// TRENUTNO:
export async function runFeedbackIteration(
  input: FeedbackLoopInput,
  systemPrompt: string,
): Promise<FeedbackLoopResult>

// NAKON IZMJENE:
export async function runFeedbackIteration(
  input: FeedbackLoopInput,
  systemPrompt: string,
  externalSignal?: AbortSignal,  // ← novi opcioni parametar
): Promise<FeedbackLoopResult> {
  // ...
  const internalAC = new AbortController();
  const timeoutId = setTimeout(() => internalAC.abort("timeout"), FEEDBACK_TIMEOUT_MS);

  // Kombinovati interni timeout + externi pipeline signal:
  const combinedSignal = externalSignal
    ? AbortSignal.any([internalAC.signal, externalSignal])
    : internalAC.signal;

  try {
    const result = await generateText({
      model,
      system: systemPrompt,
      prompt,
      maxOutputTokens: 8192,
      abortSignal: combinedSignal,  // ← koristiti kombinirani signal
    });
    // ...
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const isUserCancel = externalSignal?.aborted;
      // Razlikovati timeout vs user cancel u log poruci:
      logger.error(`feedback-loop: revision ${isUserCancel ? "cancelled by user" : "timed out"}`, ...);
      // Rezultat je isti — return false success — ali sa tačnijim logom
    }
    // ...
  }
}
```

**Backward compatible**: `externalSignal` je opcioni → svi postojeći pozivi rade nepromijenjeno.

### 4.4 Izmjene u `orchestrator.ts`

#### Na vrhu `runPipeline()`:

```typescript
// ── Pipeline-level cancel signal ──────────────────────────────────
// Background poller koji prati korisnikov cancel zahtjev i abort-uje
// sve in-flight AI pozive u roku od 2s od korisnikovog klika.
const pipelineAC = new AbortController();
let pollerActive = true;

// Pokrenuti poller kao fire-and-forget — ne awaita se
const cancelPollerDone = (async () => {
  while (pollerActive && !pipelineAC.signal.aborted) {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    if (!pollerActive) break;
    try {
      if (await isCancelled()) {
        pipelineAC.abort("user_cancel");
        logger.info("Pipeline: cancel signal propagated to in-flight steps", { runId });
        break;
      }
    } catch {
      // isCancelled ne smije srušiti poller
    }
  }
})();

// Cleanup u finally bloku:
// pollerActive = false;
// await cancelPollerDone;
```

#### Svaki step koristi `AbortSignal.any()`:

```typescript
// UMJESTO:
const ac = new AbortController();
const timeoutId = setTimeout(() => ac.abort(), STEP_TIMEOUT_MS);
// abortSignal: ac.signal

// KORISTITI:
const stepSignal = AbortSignal.any([
  pipelineAC.signal,
  AbortSignal.timeout(STEP_TIMEOUT_MS),
]);
// abortSignal: stepSignal
// Nema potrebe za clearTimeout — AbortSignal.timeout se sam čisti
```

**Napomena**: `AbortSignal.timeout(ms)` je dostupan u Node 17.3+ i eliminišče potrebu za `setTimeout + clearTimeout`.

#### `testAC` u TEST_STEP feedback loopu:

```typescript
// UMJESTO (linija 1218-1219):
const testAC = new AbortController();
const testTimeoutId = setTimeout(() => testAC.abort(), STEP_TIMEOUT_MS);
// abortSignal: testAC.signal

// KORISTITI:
const testSignal = AbortSignal.any([
  pipelineAC.signal,
  AbortSignal.timeout(STEP_TIMEOUT_MS),
]);
// abortSignal: testSignal
```

#### Svi `runFeedbackIteration` pozivi primaju `pipelineAC.signal`:

```typescript
// static_analysis feedback loop (linija ~524):
const feedbackResult = await runFeedbackIteration(input, lastImplSystemPrompt, pipelineAC.signal);

// IMPL_STEP real-exec loop (linija ~1027):
const feedbackResult = await runFeedbackIteration(input, systemPrompt, pipelineAC.signal);

// TEST_STEP feedback loop (linija ~1163):
const feedbackResult = await runFeedbackIteration(input, lastImplSystemPrompt, pipelineAC.signal);
```

#### Cancel detection u catch bloku:

```typescript
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    if (pipelineAC.signal.aborted && pipelineAC.signal.reason === "user_cancel") {
      // Korisnik je kliknuo Cancel — clean exit, ne markovati kao FAILED
      logger.info("Pipeline: user cancel propagated to step", { runId, stepIdx, stepId });
      pipelineSucceeded = true; // sprječava "workspace preserved for post-mortem"
      return {
        finalOutput: buildSummary(stepOutputs, pipeline),
        stepCount: stepIdx,
        cancelled: true,
        totalInputTokens,
        totalOutputTokens,
        durationMs: Date.now() - startedAt,
        stepMetrics: stepMetricsMap,
        prUrl: undefined,
      };
    }
    // Timeout (nije user cancel)
    throw new Error(`Pipeline step ${stepIdx} (${stepId}) timed out after ${STEP_TIMEOUT_MS / 1000}s`);
  }
  throw err;
}
```

#### Finally blok cleanup:

```typescript
} finally {
  // Zaustaviti cancel poller
  pollerActive = false;
  await cancelPollerDone;

  // OTel span + workspace cleanup — nepromijenjeno
  pipelineSpan.setAttributes({ ... });
  pipelineSpan.end();
  if (cleanupWorkspace && pipelineSucceeded) { rmSync(workDir, ...); }
}
```

---

## 5. Prompt plan — korak po korak

### Prompt 1 — `runSingleGateStep()` ekstrakcija

**Šta**: Iz for-loopa izvući gate step egzekucijsku logiku u novu self-contained funkciju. Sekvencijalno ponašanje ostaje **identično** — samo refaktoring, nula promjena u logici.

**Fajlovi**: `src/lib/sdlc/orchestrator.ts`

**Precizno šta se premješta**:
- Linija 638-645: `phase` i `stepModelId` detekcija (samo za GATE_STEPS phase)
- Linija 648-657: OTel `stepSpan` kreacija
- Linija 673-694: RAG search (`codeContext`)
- Linija 710-753: Prompt assembly (`contextDoc`, promptSections)
- Linija 837-900: `generateObject` sa gate schemom + `generateText` fallback + BLOCK detekcija
- Linija 928-948: `fireSdkLearnHook`, `recordTokenUsage`, `recordChatLatency`
- Linija 1268-1288: `stepMetricsMap` popunjavanje + stepSpan.end()

**NE premještati** (ostaje u for-loopu):
- Linija 1291-1321: HITL approval checkpoint (nije relevantno za gate steps, ali za čistoću ostaje)
- Linija 1323-1337: `contextParts.push`, `stepOutputs.push`, `onStepComplete` — MORA ostati vani

**Vraća**: `GateStepResult` interface (definisati na vrhu fajla)

**Verifikacija**: `tsc --noEmit` mora proći. Vitest suite mora biti identičan kao prije.

---

### Prompt 2 — `runParallelGateSteps()` + for-loop integracija

**Šta**: Implementirati paralelno izvršavanje za grupe uzastopnih GATE_STEPS.

**Fajlovi**: `src/lib/sdlc/orchestrator.ts`

**Nova funkcija `runParallelGateSteps()`**:
- Prima `gateGroup`, shared params, callbacks, `pipelineAC`
- `Promise.allSettled(gateGroup.map(g => runSingleGateStep({..., abortSignal: AbortSignal.any([pipelineAC.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)])}))`
- Procesira rezultate serijalno (ne mutira shared state)
- **Ako allApproved**: poziva `onStepComplete` za svaki
- **Ako barem jedan BLOCK/failed**: poziva `saveStepOutput` za svaki (ne `onStepComplete`), skuplja greške
- Vraća `ParallelGateResult`

**Izmjena u for-loopu** (unutar `if (GATE_STEPS.has(stepId))`):
- Koristiti `collectConsecutiveGateSteps()` helper za skupljanje uzastopnih gate stepova
- Ako `gateGroup.length > 1`: pozvati `runParallelGateSteps()`, merge rezultata, `stepIdx = peek - 1`, `continue`
- Ako `gateGroup.length === 1`: pozvati `runSingleGateStep()`, sekvencijalna logika (kao i sad)

**Edge case — resume na gate stepu**:  
Ako je `startFromStep = 7` (security-reviewer — drugi gate step), `gateGroup = [{ id: "ecc-security-reviewer", idx: 7 }]` → dužina 1 → sekvencijalni path. ✅  
Ako je `startFromStep = 6` (code-reviewer — prvi gate step), `gateGroup = [6, 7]` → paralelni path. ✅

**Verifikacija**:
- `tsc --noEmit`
- Vitest
- Ručni log provjera: pokrenuti `new-feature` pipeline run, tražiti "Pipeline step starting" za `ecc-code-reviewer` i `ecc-security-reviewer` — trebaju početi u roku od 200ms jedno od drugog

---

### Prompt 3A — `feedback-loop.ts` — opcioni `externalSignal` parametar

**Šta**: Dodati opcioni `externalSignal?: AbortSignal` parametar na `runFeedbackIteration()`. Kombinovati interni timeout i externi signal sa `AbortSignal.any()`. Backward compatible.

**Fajlovi**: `src/lib/sdlc/feedback-loop.ts`

**Izmjene** (≈ 8 linija):
```typescript
// Potpis:
export async function runFeedbackIteration(
  input: FeedbackLoopInput,
  systemPrompt: string,
  externalSignal?: AbortSignal,
): Promise<FeedbackLoopResult>

// Unutar funkcije:
const internalAC = new AbortController();
const timeoutId = setTimeout(() => internalAC.abort("timeout"), FEEDBACK_TIMEOUT_MS);
const combinedSignal = externalSignal
  ? AbortSignal.any([internalAC.signal, externalSignal])
  : internalAC.signal;
// ... koristiti combinedSignal umjesto ac.signal
```

**Verifikacija**: `tsc --noEmit`. Postojeći testovi moraju proći (potpis je backward compatible).

---

### Prompt 3B — `orchestrator.ts` — pipeline-level cancel poller

**Šta**: Dodati `pipelineAC` + cancel poller u `runPipeline()`. Sve `ac.signal` zamjeniti sa `AbortSignal.any([pipelineAC.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)])`. Sve `runFeedbackIteration` pozive proširiti sa `pipelineAC.signal`. Sve `testAC` zamjeniti sa `AbortSignal.any`.

**Fajlovi**: `src/lib/sdlc/orchestrator.ts`

**Izmjene** (≈ 35 linija netto):

1. Na vrhu `runPipeline()` body-a — kreirati `pipelineAC` + pokrenuti poller
2. U `finally` bloku — `pollerActive = false; await cancelPollerDone;`
3. Linija 759: `const ac = new AbortController()` + `setTimeout` → `const stepSignal = AbortSignal.any([pipelineAC.signal, AbortSignal.timeout(STEP_TIMEOUT_MS)])`
4. Linija 1218-1219: `testAC + setTimeout` → `AbortSignal.any(...)`
5. Svi `runFeedbackIteration(input, systemPrompt)` → `runFeedbackIteration(input, systemPrompt, pipelineAC.signal)`
6. U catch bloku linija 917: razlikovati `pipelineAC.signal.reason === "user_cancel"` vs timeout
7. Za `parallel` path u `runParallelGateSteps`: proslijediti `pipelineAC` (ne nov signal)

**Cleanup `clearTimeout`**: Svuda gdje je postojao `setTimeout + clearTimeout` pattern za step timeout, zamijeniti sa `AbortSignal.timeout()`. Ovo eliminišče potrebu za `clearTimeout` pozivima i `try/finally` za clearTimeout.

**Verifikacija**:
- `tsc --noEmit`
- Vitest
- Ručni test: pokrenuti pipeline run, kliknuti Cancel tokom `ecc-implementer` koraka — logovati bi trebao pokazati "cancel signal propagated" u roku od 3 sekunde

---

### Prompt 4 — Novi unit testovi

**Šta**: Dodati unit testove za ključne dijelove paralelne i cancel logike.

**Fajlovi**:
- `src/lib/sdlc/orchestrator-parallel.test.ts` (novi)
- `src/lib/sdlc/feedback-loop.test.ts` (ažurirati)

**Testovi za `orchestrator-parallel.test.ts`**:

```typescript
describe("collectConsecutiveGateSteps", () => {
  it("collects 2 consecutive gate steps", () => {
    const pipeline = ["project_context", "ecc-planner", "ecc-implementer", "sandbox_verify",
                      "static_analysis", "ecc-code-reviewer", "ecc-security-reviewer", "pr_generation"];
    const group = collectConsecutiveGateSteps(5, pipeline);
    expect(group).toHaveLength(2);
    expect(group[0]).toEqual({ id: "ecc-code-reviewer", idx: 5 });
    expect(group[1]).toEqual({ id: "ecc-security-reviewer", idx: 6 });
  });

  it("returns single-item group when next step is not gate", () => {
    const pipeline = ["ecc-planner", "ecc-code-reviewer", "pr_generation"];
    const group = collectConsecutiveGateSteps(1, pipeline);
    expect(group).toHaveLength(1);
  });
});

describe("runParallelGateSteps", () => {
  it("pushes outputs in original pipeline order, not completion order", async () => {
    // Mock: security-reviewer završi brže od code-reviewer
    // Verifikacija: stepOutputs[0] je uvijek code-reviewer output
  });

  it("calls onStepComplete for both when all approved", async () => {
    const onStepComplete = vi.fn().mockResolvedValue(undefined);
    // ... mock runSingleGateStep za oba APPROVE
    // Verifikacija: onStepComplete pozvan dvaput
  });

  it("calls saveStepOutput (not onStepComplete) when any gate blocks", async () => {
    const onStepComplete = vi.fn().mockResolvedValue(undefined);
    const saveStepOutput = vi.fn().mockResolvedValue(undefined);
    // ... mock: code-reviewer APPROVE, security-reviewer BLOCK
    // Verifikacija: onStepComplete nikad pozvan, saveStepOutput pozvan dvaput
  });

  it("returns blockErrors with messages from all failed gates", async () => {
    // Oba blockiraju — vrati oba error teksta u blockErrors array
  });
});
```

**Testovi za `feedback-loop.test.ts`** (dodati):
```typescript
it("respects externalSignal abort", async () => {
  const controller = new AbortController();
  controller.abort("test_cancel");
  // runFeedbackIteration sa abortiranim signalom treba odmah returnuti neuspjeh
  const result = await runFeedbackIteration(input, systemPrompt, controller.signal);
  expect(result.success).toBe(false);
});
```

**Verifikacija**: `vitest run` — svi testovi zeleni.

---

### Prompt 5 — tsc + vitest + commit + push

**Šta**: Finalni TypeScript check, vitest run, git commit, push na `main`.

**Provjere**:
```bash
cd /path/to/agent-studio
npx tsc --noEmit
npx vitest run --reporter=verbose 2>&1 | tail -30
git add src/lib/sdlc/orchestrator.ts src/lib/sdlc/feedback-loop.ts \
         src/lib/sdlc/orchestrator-parallel.test.ts \
         docs/faza2-implementation-plan-v2.md
git commit -m "feat(sdlc): Faza 2 Performance — parallel gate steps + full cancel propagation

Task 2.1: Parallel gate steps
- orchestrator: runSingleGateStep() extracted — gate step logic is self-contained
- orchestrator: runParallelGateSteps() — ecc-code-reviewer + ecc-security-reviewer
  run in parallel on new-feature/bug-fix pipelines (saves 2-4 min per run)
- Correct BLOCK handling: saveStepOutput (not onStepComplete) on any BLOCK,
  keeping currentStep at first gate idx so retry reruns full gate group
- stepOutputs.push() and contextParts.push() always happen serially in
  original pipeline order (never from within parallel execution)

Task 2.3: Full cancel propagation
- feedback-loop: runFeedbackIteration() accepts optional externalSignal (BC)
- orchestrator: pipeline-level AbortController + 2s cancel poller
- orchestrator: AbortSignal.any([pipelineAC, AbortSignal.timeout(ms)]) on all steps
- All 3 runFeedbackIteration call sites receive pipelineAC.signal
- testAC in TEST_STEP feedback loop also uses AbortSignal.any
- User cancel propagates to all in-flight AI calls in <3s

Tasks 2.2 and 2.4 were already implemented in previous sessions."
git push origin main
```

---

## 6. Rizici — kompletan popis

### Kritični (moraju biti riješeni u implementaciji)

| Rizik | Rješenje |
|-------|----------|
| `stepOutputs.push()` iz paralelnog koda → pogrešan `pipeline[i]` mapping | **Helper ne smije mutirati stepOutputs** — sve pusheve radi caller serijalno |
| BLOCK u parallelnom modu → `onStepComplete` za jednog ali ne drugog → retry preskače gate | **Niko ne dobija `onStepComplete` ako je iko BLOCK** — `saveStepOutput` za sve |
| `pipelineAC.signal` listener leak (9 stepova × 1 listener) | `AbortSignal.any()` ne zahtijeva ručno uklanjanje listenera — nema leaka |
| Poller ostaje aktivan ako `runPipeline` baci error | `finally` blok: `pollerActive = false; await cancelPollerDone` |

### Umjereni

| Rizik | Rješenje |
|-------|----------|
| `searchCodebase` (RAG) pozvan 2× simultano | Read-only operacija na vector DB — thread-safe |
| `resolveStepModelAdaptive` pozvan 2× simultano | `adaptiveStatsCache` se samo čita, sortiran je na vrhu — thread-safe |
| Provider rate limiting pri 2× simultanim pozivima | Vercel AI SDK automatski retry na 429. Gate stepovi su kratki (review, ne codegen) |
| `AbortSignal.timeout()` dostupnost | Node 17.3+, projekt koristi v22 ✅ |
| `AbortSignal.any()` dostupnost | Node 20.3+, projekt koristi v22 ✅ |

### Niski

| Rizik | Rješenje |
|-------|----------|
| `runFeedbackIteration` sa `AbortError` iz external signala — pogriješan log | Provjera `externalSignal?.aborted` za tačan log message |
| `contextParts` redosljed pri parallelnom pushu | Push uvijek u `gateGroup` redoslijedu (koji je u pipeline indeks redoslijedu) |

---

## 7. Kompletan pregled uticaja po fajlu

| Fajl | Tip izmjene | Veličina promjene |
|------|------------|------------------|
| `src/lib/sdlc/orchestrator.ts` | Ekstrakcija + parallelizacija + cancel | L (~150 linija netto) |
| `src/lib/sdlc/feedback-loop.ts` | Dodati `externalSignal` parametar | XS (~10 linija) |
| `src/lib/sdlc/orchestrator-parallel.test.ts` | Novi test fajl | M (~80 linija) |
| `src/lib/sdlc/feedback-loop.test.ts` | Dodati 1 test | XS (~15 linija) |

**Bez izmjena**: `worker.ts`, `pipeline-manager.ts`, `schemas.ts`, `model-router.ts`, svi UI fajlovi, `prisma/schema.prisma`

---

## 8. Finalni rezultati — šta Faza 2 donosi

| Metrika | Prije | Nakon |
|---------|-------|-------|
| `new-feature` ukupno trajanje | ~15 min | ~10-11 min |
| `bug-fix` ukupno trajanje | ~12 min | ~8-9 min |
| Ušteda — gate steps | 0 | 2-4 min/run |
| Cancel response time (AI pozivi) | do 5 min | <3 sekunde |
| Cancel u feedback loopu | do 15 min (3×5min) | <3 sekunde |
| Crash recovery (conv resume) | ✅ urađeno | ✅ |
| Progress visibility | ✅ urađeno | ✅ |
| Nema schema migracija | — | ✅ |
| Nema API izmjena | — | ✅ |
| Nema UI izmjena | — | ✅ |

---

## 9. Šta je van scope Faze 2

Ove opcije su razmatrane i svjesno isključene:

1. **Paralelizacija PLANNING_STEPS** — obje pišu u isti `architecturePlan` akumulator, TDD guide logički ovisi o planu. Sekvencijalno.
2. **Paralelizacija static_analysis + gate steps** — static_analysis može promijeniti `lastImplOutput` kroz feedback loop. Gate stepovi moraju čitati finalnu verziju. Sekvencijalno.
3. **BullMQ child jobs za gate stepove** — nepotreban overhead za samo 2 koraka. `Promise.allSettled` unutar jednog BullMQ job-a je ispravniji pristup.
4. **Opcija B iz IMPROVEMENT-PLAN** (Flow Builder parallel nodes) — 10× veći effort za isti rezultat.
5. **Brži modeli** — van scope; zahtijeva A/B testiranje i nije performance issue implementacije.
