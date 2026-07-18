# Faza 2 — Performance: Implementation Plan

> Generisano: 2026-05-07  
> Osnova: Duboka analiza koda završena u sesiji prije pisanja ovog plana.  
> Cilj: Pipeline od ~15 minuta svesti na ~6 minuta. Nikad ne gubiti rezultate.

---

## 1. Šta smo analizirali

### Fajlovi pregledani:
- `src/lib/sdlc/orchestrator.ts` (1532 linije) — kompletan
- `src/lib/ecc/meta-orchestrator.ts` — ROUTING_TABLE + pipeline routing
- `src/lib/queue/worker.ts` — `processPipelineRunJob` + BullMQ integracija
- `src/lib/runtime/handlers/parallel-streaming-handler.ts` — postojeća parallel infrastruktura
- `src/lib/agents/agent-tools.ts` — `savePartialResult` + `loadPartialResults`
- `prisma/schema.prisma` — AgentCallLog + Conversation modeli

---

## 2. Status po taskovima iz IMPROVEMENT-PLAN-2026.md

| Task | Opis | Status |
|------|------|--------|
| **2.1** | Paralelno izvršavanje sub-agenata | ❌ NIJE URAĐENO |
| **2.2** | Incremental DB Save po sub-agentu | ✅ **VEĆ URAĐENO** |
| **2.3** | Cancel propagacija do in-flight AI poziva | ❌ NIJE URAĐENO |
| **2.4** | `conversationId` na `AgentCallLog` | ✅ **VEĆ URAĐENO** |

### Detalji za ono što je već urađeno:

**Task 2.2** — `savePartialResult()` postoji u `agent-tools.ts` (linija 613). Koristi PostgreSQL `jsonb_set` za atomičan per-sub-agent write. `loadPartialResults()` (linija 539) čita pri resume-u i preskače COMPLETED sub-agente. Fingerprint = prvih 200 char user poruke. `partialResults Json?` kolona postoji na `Conversation` modelu.

**Task 2.4** — `conversationId String?` kolona sa `@@index([conversationId])` postoji na `AgentCallLog` modelu. `PipelineProgress` komponenta već filtrira po `conversationId` u SWR polling upitu.

---

## 3. Analiza pipeline dependency grafa

### ROUTING_TABLE (kompletna mapa):
```
new-feature:    project_context → ecc-planner → ecc-tdd-guide → ecc-implementer 
                → sandbox_verify → static_analysis 
                → ecc-code-reviewer → ecc-security-reviewer     ← PARALLEL prilike
                → pr_generation

bug-fix:        project_context → ecc-tdd-guide → ecc-implementer 
                → sandbox_verify → static_analysis 
                → ecc-code-reviewer → ecc-security-reviewer     ← PARALLEL prilike  
                → pr_generation

refactor:       project_context → ecc-planner → ecc-refactor-cleaner 
                → sandbox_verify → static_analysis 
                → ecc-code-reviewer                             ← samo jedan gate
                → pr_generation

security-audit: project_context → ecc-security-reviewer → ecc-security-engineer
                                                    ↑ sekvencijalna zavisnost!

code-review:    project_context → ecc-code-reviewer             ← samo jedan gate
documentation:  ecc-doc-updater                                 ← nema gate
performance:    ecc-performance-benchmarker → ecc-architect      ← nema gate
api-design:     ecc-planner → ecc-code-reviewer                 ← samo jedan gate
```

### Zaključak: Paralelizacija je relevantna samo za `new-feature` i `bug-fix` pipelines.

Oba su najvažniji i najduži pipeline — upravo gdje je ušteda najveća.

---

## 4. Task 2.1 — Paralelno izvršavanje GATE_STEPS (Detaljna analiza)

### Šta su GATE_STEPS:
```typescript
export const GATE_STEPS = new Set([
  "ecc-code-reviewer",    // CodeReviewOutputSchema → { decision, summary, ... }
  "ecc-security-reviewer", // SecurityReviewOutputSchema → { decision, summary }
]);
```

### Zašto su nezavisni:
- **Oba primaju**: isti `contextParts` (svi prethodni step outputi), iste RAG rezultate, isti `taskDescription`
- **Niko od njih ne čita output drugog** — output `ecc-code-reviewer` nikad nije u promtpu za `ecc-security-reviewer` i obratno
- **`pr_generation` čita oba**: gradi `stepOutputMap = Record<stepId, output>` iz svih prethodnih stepova (linije 605-610)

### Shared mutable state — kritična analiza:

| Varijabla | Tip pristupa | Rizik pri paralelizaciji | Rješenje |
|-----------|-------------|--------------------------|----------|
| `totalInputTokens` | Akumulacija | Race condition | Saberi NAKON `Promise.allSettled()` |
| `totalOutputTokens` | Akumulacija | Race condition | Saberi NAKON `Promise.allSettled()` |
| `contextParts.push()` | Array append | Redosljed nije garantovan | Push NAKON, u određenom redoslijedu |
| `stepOutputs[stepIdx]` | Različiti indeksi | Nema race (različiti key-evi) | Sigurno |
| `stepMetricsMap[stepId]` | Različiti key-evi | Nema race | Sigurno |
| `onStepComplete(stepIdx, output)` | DB write | Različiti stepIdx → različiti DB upisi | Sigurno |
| `onProgress(pct)` | Callback | Samo jedno smisleno (sredina) | Pozovi jednom sa midpoint |

### AbortController arhitektura:
Trenutno: svaki step kreira `new AbortController()` sa 5-min timer (linija 759).  
Za paralelizaciju: svaki gate step treba **sopstveni** AbortController, ali sve linkati na pipeline-level abort (za cancel propagaciju — Task 2.3).

### BLOCK logika pri paralelizaciji:
Oba reviewera mogu independently vratiti `decision === "BLOCK"`. Ako jedan ili oba blokiraju:
1. Sačekati da oba završe (ne abortovati drugog — skupo je i gubi izlaz)
2. Sgruppirati sve BLOCK odluke u jednu `Error` poruku
3. Baciti `Error` (pipeline se stopira, korisnik vidi oba izvještaja)

### Implementacioni pristup:

**Lokacija**: `src/lib/sdlc/orchestrator.ts`  
**Strategija**: Izvući helper funkciju `runParallelGateSteps()`, u glavnom `for` loopu detektovati grupu GATE_STEPS i preskočiti ih sa `stepIdx = lastGateIdx` nakon grupe.

```typescript
// Pseudokod u glavnoj petlji:
if (GATE_STEPS.has(stepId)) {
  // Skupi sve uzastopne GATE_STEPS
  const gateGroup = [{ id: stepId, idx: stepIdx }];
  let peek = stepIdx + 1;
  while (peek < pipeline.length && GATE_STEPS.has(pipeline[peek])) {
    gateGroup.push({ id: pipeline[peek], idx: peek });
    peek++;
  }

  if (gateGroup.length > 1) {
    // ── Paralelno izvršavanje ──────────────────────────────────
    const parallelResult = await runParallelGateSteps(gateGroup, sharedState, callbacks);
    
    // Merge u shared state (sigurno, oba su završila)
    totalInputTokens += parallelResult.inputTokens;
    totalOutputTokens += parallelResult.outputTokens;
    for (const [idx, output] of Object.entries(parallelResult.stepOutputs)) {
      stepOutputs[Number(idx)] = output;
      contextParts.push(`# Step ${Number(idx)+1} output (${pipeline[Number(idx)]})\n${output.slice(0, CONTEXT_SLICE_PER_STEP)}`);
    }
    Object.assign(stepMetricsMap, parallelResult.stepMetrics);
    
    // Baciti greške ako je neki gate BLOCK
    if (parallelResult.blocked) throw parallelResult.blockError;
    
    // Preskočiti ostale gate stepove (for loop radi ++, pa -1)
    stepIdx = peek - 1;
    continue; // na sljedeći stepIdx (koji je pr_generation)
  }
  // else: existing single-gate logic
}
```

**Helper funkcija `runParallelGateSteps()`** (nova, ~80 linija):
- Prima: `gateGroup[]`, `contextParts`, `architecturePlan`, `codeContext`, `resolvedModelId`, `agentId`, `runId`, `pipelineSpan`, `onStepComplete`, `onProgress`
- Pokreće: `Promise.allSettled(gateGroup.map(g => runSingleGateStep(g, ...)))`
- `runSingleGateStep`: izdvojena logika trenutnih linija 837-900 iz for-loopa
- Vraća: `{ stepOutputs, inputTokens, outputTokens, stepMetrics, blocked, blockError }`

### Ukupna ušteda vremena:
- Trenutno: `ecc-code-reviewer` (≤5 min) + `ecc-security-reviewer` (≤5 min) = do 10 min sekvencijalno
- Nakon: max(oba) = do 5 min paralelno
- **Realna ušteda: 2-4 minuta** na svakom `new-feature` i `bug-fix` run-u

---

## 5. Task 2.3 — Cancel Propagacija (Detaljna analiza)

### Trenutno stanje:
```typescript
// Linija 477 — provjera IZMEĐU stepova:
if (await isCancelled()) {
  return { cancelled: true, ... };
}

// Linija 759-760 — per-step AbortController samo za timeout:
const ac = new AbortController();
const timeoutId = setTimeout(() => ac.abort(), STEP_TIMEOUT_MS);
// ac.signal se prosleđuje u generateObject/generateText
```

**Problem**: Ako korisnik klikne Cancel dok step radi, pipeline se ne stopira dok step ne završi (do 5 min).

### Implementacija:

**Pristup**: Pipeline-level `AbortController` + pozadinski poller.

```typescript
// Na vrhu runPipeline():
const pipelineAC = new AbortController();
let pollerActive = true;

// Background poller — ne blokira, provjera svake 2s
const cancelPoller = (async () => {
  while (pollerActive && !pipelineAC.signal.aborted) {
    await new Promise<void>(r => setTimeout(r, 2000));
    if (await isCancelled()) {
      pipelineAC.abort("user_cancel");
      break;
    }
  }
})();

// U finally bloku runPipeline():
pollerActive = false;
await cancelPoller; // zatvori gracefully
```

**Svaki step AbortController se linkuje na pipeline:**
```typescript
const ac = new AbortController();
// Link: kad pipeline abort → step abort
const onPipelineAbort = () => ac.abort(pipelineAC.signal.reason);
pipelineAC.signal.addEventListener("abort", onPipelineAbort, { once: true });
const timeoutId = setTimeout(() => ac.abort("timeout"), STEP_TIMEOUT_MS);

try {
  // ... existing generateObject/generateText calls with abortSignal: ac.signal
} finally {
  clearTimeout(timeoutId);
  pipelineAC.signal.removeEventListener("abort", onPipelineAbort);
}
```

**Distinkcija u catch bloku** (linija 917):
```typescript
} catch (err) {
  const reason = ac.signal.reason;
  if (reason === "user_cancel") {
    // Pipeline cancelled by user — clean exit
    pipelineSucceeded = true; // da se ne markira kao FAILED
    return { cancelled: true, ... };
  }
  if (reason === "timeout" || (err instanceof Error && err.name === "AbortError")) {
    throw new Error(`Pipeline step ${stepIdx} (${stepId}) timed out after ${STEP_TIMEOUT_MS/1000}s`);
  }
  throw err;
}
```

### Ukupna ušteda:
- Trenutno: cancel → čekanje do 5 min da korak završi
- Nakon: cancel → abort signal u <2s, AI call se stopira odmah
- **Token ušteda: ~80% za pipelines gdje se cancel rano**

---

## 6. Prompt plan — korak po korak

### Prerequisiti:
- Nema schema migracija — oba taskaova su samo `orchestrator.ts` izmjene
- Nema API izmjena
- Nema UI izmjena

---

### Prompt 1 — Refaktorisanje gate step logike u helper

**Šta**: Iz glavnog `for` loopa u `orchestrator.ts` izvući gate step logiku u zasebnu async funkciju `runSingleGateStep()`.  
**Razlog**: Task 2.1 zahtijeva da isti kod radi i sekvencijalno i paralelno. Ekstrakcija eliminišče duplikaciju.

**Fajlovi**:
- `src/lib/sdlc/orchestrator.ts`

**Šta radi nova funkcija**:
```typescript
async function runSingleGateStep(params: {
  stepId: string;
  stepIdx: number;
  pipeline: string[];
  contextParts: string[];
  architecturePlan: string;
  codeContext: string;
  taskDescription: string;
  resolvedModelId: string;
  stepModelOverrides: Record<string, string>;
  agentId: string;
  runId: string;
  pipelineSpan: Span;
  useSmartRouting: boolean;
  adaptiveStatsCache: Map<...>;
  abortSignal: AbortSignal;
}): Promise<{
  output: string;
  inputTokens: number;
  outputTokens: number;
  blocked: boolean;
  blockError?: Error;
  stepMetric: StepMetric;
  durationMs: number;
}>
```

**Sadržaj**: Tačno logika linija 837–900 + 928–948 premještena u ovu funkciju.  
**Poziv iz for-loopa**: Ista sekvencijalna logika, samo sada: `const r = await runSingleGateStep({...})`.

**Verifikacija**:
- `tsc --noEmit` mora proći
- Vitest: `pipeline` i `orchestrator` test suitevi moraju biti zeleni

---

### Prompt 2 — `runParallelGateSteps()` + integracija u for-loop

**Šta**: Implementirati paralelno izvršavanje uzastopnih GATE_STEPS.

**Fajlovi**:
- `src/lib/sdlc/orchestrator.ts`

**Nova funkcija `runParallelGateSteps()`**:
```typescript
async function runParallelGateSteps(
  gateGroup: Array<{ id: string; idx: number }>,
  params: { contextParts, architecturePlan, codeContext, ... },
  callbacks: { onStepComplete, onProgress },
): Promise<{
  stepOutputs: Record<number, string>;
  inputTokens: number;
  outputTokens: number;
  stepMetrics: Record<string, StepMetric>;
  blocked: boolean;
  blockError?: Error;
}>
```

**Logika**:
1. `Promise.allSettled(gateGroup.map(g => runSingleGateStep({...g, abortSignal: ac.signal})))`
2. Za svaki `fulfilled`: prikupi output, tokens, metrike, `await onStepComplete(g.idx, output)`
3. Za svaki `rejected`: logovati grešku, tretirati kao BLOCK (safe-fail)
4. Detektovati BLOCK odluke, skupiti u jedan Error
5. `await onProgress(midpointPct)`
6. Returnuti merge rezultate

**Izmjena u for-loopu**:
```typescript
if (GATE_STEPS.has(stepId)) {
  const gateGroup = collectConsecutiveGateSteps(stepIdx, pipeline);
  if (gateGroup.length > 1) {
    const result = await runParallelGateSteps(gateGroup, ...);
    // merge, advance stepIdx, continue
  } else {
    const result = await runSingleGateStep({...}); // single gate, unchanged behaviour
    // existing post-step logic
  }
}
```

**Verifikacija**:
- `tsc --noEmit`
- Vitest mora biti zelen
- Ručni test: kreirati `new-feature` pipeline run, pratiti logove — oba `ecc-code-reviewer` i `ecc-security-reviewer` trebaju početi skoro istovremeno

---

### Prompt 3 — Cancel propagacija (Task 2.3)

**Šta**: Dodati pipeline-level `AbortController` + pozadinski poller koji abort-uje kad korisnik cancelluje.

**Fajlovi**:
- `src/lib/sdlc/orchestrator.ts`

**Izmjene**:
1. Na vrhu `runPipeline()` — kreirati `pipelineAC` + pokrenuti async poller
2. U `runSingleGateStep()` i u svim ostalim step tipovima — linkati `pipelineAC.signal → stepAC`
3. U `catch(err)` bloku — razlikovati `user_cancel` vs `timeout` vs ostale greške
4. U `finally` bloku `runPipeline()` — stopirati poller

**Kritično**: `pipelineAC.signal` listener mora biti `{ once: true }` da se ne akumuliraju. Ili alternatino, koristiti `AbortSignal.any([pipelineAC.signal, timeoutSignal])` ako je Node.js 20+.

**Provjera Node.js verzije**:
```bash
grep -r '"node"' /sessions/.../package.json | head -5
```

**Verifikacija**:
- `tsc --noEmit`
- Vitest
- Ručni test: pokrenuti pipeline, kliknuti Cancel, provjeriti da logovi pokazuju `user_cancel` abort u <3s

---

### Prompt 4 — tsc + vitest + commit + push

**Šta**: Finalni TypeScript check, vitest run, git commit sa opisnom porukom, push na `main`.

**Commit poruka format**:
```
feat(sdlc): Faza 2 Performance — parallel gate steps + cancel propagation

- orchestrator: runSingleGateStep() extracted from for-loop
- orchestrator: runParallelGateSteps() — ecc-code-reviewer + ecc-security-reviewer run in parallel
  on new-feature and bug-fix pipelines, saving 2-4 min per run
- orchestrator: pipeline-level AbortController with 2s cancel poller — user cancel
  propagates to in-flight AI calls in <2s instead of waiting up to 5 min
- Tasks 2.1 and 2.3 from IMPROVEMENT-PLAN-2026.md complete
```

---

## 7. Procjena troška (effort)

| Prompt | Opis | Procijenjena složenost |
|--------|------|----------------------|
| Prompt 1 | Ekstrakcija `runSingleGateStep()` | S — čist refactor, bez novih funkcionalnosti |
| Prompt 2 | `runParallelGateSteps()` + for-loop integracija | M — nova logika, više edge case-ova |
| Prompt 3 | Cancel propagacija | M — novi async pattern, treba paziti na cleanup |
| Prompt 4 | tsc + vitest + commit + push | XS |

**Ukupno**: 4 prompta, procijenjeno 2-3 sata kodiranja

---

## 8. Risk Assessment

### Risk 1: Promise.allSettled vs Promise.all (nizak)
**Problem**: `Promise.all` bi abort-ovao oba ako jedan padne. `Promise.allSettled` čeka oba.  
**Rješenje**: Koristiti `Promise.allSettled` — oba reviewera trebaju završiti da `pr_generation` ima oba outputa.

### Risk 2: Token akumulacija race condition (eliminisan)
**Problem**: `totalInputTokens +=` iz dva paralelna konteksta bi imao race condition.  
**Rješenje**: Akumulacija se radi samo NAKON `Promise.allSettled()` vraća — sekvencijalna operacija.

### Risk 3: contextParts redosljed (nizak)
**Problem**: Ako `ecc-security-reviewer` završi prije `ecc-code-reviewer`, kontekst će biti u drugačijem redoslijedu nego prije.  
**Rješenje**: Nakon `Promise.allSettled()`, pushati u contextParts **po originalnom stepIdx redoslijedu** (`gateGroup` je već sortirano). Ovo je deterministično.

### Risk 4: pipelineAC listener leak (nizak)
**Problem**: Svaki step dodaje listener na `pipelineAC.signal`. 9 stepova = 9 listenera.  
**Rješenje**: `{ once: true }` + explicit `removeEventListener` u `finally` bloku.

### Risk 5: Poller ne završi (nizak)
**Problem**: Async poller loop može ostati aktivan ako `runPipeline` baci error.  
**Rješenje**: `pollerActive = false` u `finally` bloku `runPipeline`.

### Risk 6: Provider rate limiting (srednji)
**Problem**: Dva simultana `generateObject` poziva na isti model mogu biti rate-limited.  
**Rješenje**: Vercel AI SDK automatski retry-uje na 429. Oba reviewera su kratki (review, ne generiranje koda) — u praksi rijetko hit rate limit.

---

## 9. Testing Strategy

### Unit testovi (vitest):
- Novi test file: `src/lib/sdlc/orchestrator-parallel.test.ts`
- Test 1: `collectConsecutiveGateSteps([..., "ecc-code-reviewer", "ecc-security-reviewer", "pr_generation"], 5)` → vraca grupu veličine 2
- Test 2: `runParallelGateSteps` sa mock `runSingleGateStep` — verifikuj da oba rade paralelno (Promise.allSettled spy)
- Test 3: Ako jedan gate step vrati BLOCK — `runParallelGateSteps` baciti Error koji sadrži oba decision teksta
- Test 4: Cancel poller — mock `isCancelled()` koji vrati true na 3. pozivu → `pipelineAC.signal.aborted === true` u <6s

### Integracijski test (ručni):
1. Kreirati `new-feature` pipeline run
2. Pratiti server logove — tražiti log linije "Pipeline step starting" za `ecc-code-reviewer` i `ecc-security-reviewer` — trebaju imati isti `stepStart` timestamp (±500ms)
3. Kliknuti Cancel tokom `ecc-implementer` step-a — log treba pokazati abort u <3s

---

## 10. Šta NEĆEMO raditi (van scope)

Na osnovu analize, sljedeće opcije iz IMPROVEMENT-PLAN-2026.md su van scope za Faza 2:

1. **Paralelizacija planning stepova** (ecc-planner + ecc-tdd-guide): Oba koriste output u `architecturePlan` koji je akumulativan string (`architecturePlan +=`). TDD guide može logično zavisiti od plannerove arhitekture. Ne paralelizovati.

2. **Paralelizacija static_analysis + gate steps**: `static_analysis` može triggerovati feedback loop koji mijenja `lastImplOutput` — gate steps moraju čitati finalni implementacijski output. Ne paralelizovati.

3. **BullMQ child jobs**: Svaki gate step kao poseban BullMQ job = overhead od DB upisa, deserijalizacije konteksta, novih worker slotova. Za samo 2 gate stepa u jednom pipeline-u, `Promise.allSettled` unutar jednog BullMQ job-a je ispravniji pristup.

4. **Opcija B iz plana** (prepisati u Flow Builder paralelni node): Veoma visok effort za skromnu dodatnu korist. Opcija A (orchestrator nivo) daje 100% te koristi za 10% napora.

---

## 11. Pregled — šta Faza 2 donosi

| Metrika | Prije | Nakon |
|---------|-------|-------|
| `new-feature` trajanje | ~15 min | ~10-11 min |
| `bug-fix` trajanje | ~12 min | ~8-9 min |
| Cancel response time | do 5 min | <3 sekunde |
| Crash recovery | ✅ (Faza 2.2 done) | ✅ |
| Conversation progress visibility | ✅ (Faza 1 done) | ✅ |

> **Napomena o trajanju**: 15→10 min redukcija dolazi isključivo od paralelnih gate stepova. Dalja redukcija (prema cilju od 6 min) bi zahtijevala brže modele ili kraće promtove, što je van scope.
