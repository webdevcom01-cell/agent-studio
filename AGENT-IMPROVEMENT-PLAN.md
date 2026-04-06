# Agent Studio — Agent Improvement Plan

**Datum:** 6. april 2026.
**Osnova:** Forenzička analiza SDLC pipeline-a (URL shortener task) + industrija standardi (Anthropic, Google, GitHub — april 2026.)

---

## Rezime problema

SDLC pipeline je ispravno orkestiran (Product Discovery → Architecture → Code Gen → PR Gate → CI/CD → Deploy), ali Code Generation Agent je pao na PR Gate dva puta sa skorovima 43 i 48 od 100. Glavni razlog: agenti nemaju pristup projektnim konvencijama, retry ne donosi nove informacije, i ne postoji deterministička verifikacija pre LLM ocene.

---

## FAZA 1: Project Context Node

**Problem:** Code Gen agent generiše generički Next.js kod jer ne zna za `@/generated/prisma`, zabranu `any` tipova, `logger` umesto `console.log`, API response format `{ success, data/error }`.

**Rešenje:** Novi node tip `project_context` koji čita projektne fajlove i ubacuje ih u kontekst za downstream agente.

### Šta treba implementirati

**1.1 — Novi NodeType: `project_context`**

Fajlovi za kreiranje/izmenu:
- `src/types/index.ts` — dodaj `'project_context'` u NodeType union
- `src/lib/validators/flow-content.ts` — dodaj u NODE_TYPES niz
- `src/lib/runtime/handlers/project-context-handler.ts` — novi handler
- `src/lib/runtime/handlers/index.ts` — registruj handler
- `src/components/builder/nodes/project-context-node.tsx` — UI komponenta
- `src/components/builder/flow-builder.tsx` — registruj u NODE_TYPES mapu
- `src/components/builder/node-picker.tsx` — dodaj u picker
- `src/components/builder/property-panel.tsx` — property editor
- `src/lib/runtime/handlers/__tests__/project-context-handler.test.ts` — testovi

Handler logika:
```
1. Čita `node.data.contextFiles` (niz putanja, npr. ["CLAUDE.md", ".claude/rules/*.md"])
2. Za svaki fajl: čita sadržaj iz Knowledge Base ili iz file sistema
3. Spaja sve u jedan string sa jasnim sekcijama
4. Postavlja rezultat u `updatedVariables.projectContext`
5. Downstream agenti (Code Gen, PR Gate) čitaju `{{projectContext}}` iz varijabli
```

Node data schema:
```typescript
{
  contextFiles: string[];       // putanje do fajlova sa konvencijama
  contextLabel: string;         // npr. "TypeScript Rules" — za debug
  maxTokens?: number;           // limit koliko konteksta ubaciti (default: 4000)
  outputVariable: string;       // default: "projectContext"
}
```

**1.2 — Integracija sa Code Gen promptom**

U SDLC pipeline flow-u, `project_context` node se stavlja ISPRED `ai_response` node-a koji pokreće Code Generation. System prompt Code Gen agenta treba da sadrži:

```
You MUST follow these project conventions:
{{projectContext}}
```

**1.3 — Integracija sa PR Gate promptom**

PR Gate agent takođe dobija `{{projectContext}}` da bi mogao da proverava konvencije koje su specifične za projekat — ne samo generičke best practices.

### Testovi

- Happy path: handler čita 3 fajla, postavlja varijablu
- Prazan contextFiles niz: vraća prazan string, ne puca
- Fajl ne postoji: loguje warning, preskače, nastavlja sa ostalim

---

## FAZA 2: Sandbox Execution Node

**Problem:** Code Gen kreira kod koji nikad nije pokrenut. TypeScript greške, pogrešni importi, sintaksne greške — sve ovo se otkriva tek u PR Gate (koji je LLM, ne kompajler). LLM ocenjuje kod na osnovu "izgleda", ne na osnovu toga da li se kompajlira.

**Rešenje:** Novi node tip `sandbox_verify` koji pokreće deterministične provere nad generisanim kodom pre nego što stigne do PR Gate.

### Šta treba implementirati

**2.1 — Novi NodeType: `sandbox_verify`**

Isti set fajlova kao u Fazi 1 (types, validators, handler, index, UI, tests).

Handler logika:
```
1. Čita `{{generatedCode}}` iz varijabli (output Code Gen agenta)
2. Piše fajlove u privremeni direktorijum
3. Pokreće provere po redu:
   a. tsc --noEmit (TypeScript kompilacija)
   b. eslint --quiet (lint provera)
   c. Regex provere za zabranjene patterne:
      - /@prisma\/client/ → FAIL ("Use @/generated/prisma")
      - /: any\b/ → FAIL ("No any types")
      - /console\.(log|error|warn)/ → FAIL ("Use logger")
4. Sakuplja sve greške u strukturiran output
5. Postavlja u updatedVariables:
   - sandboxResult: "PASS" | "FAIL"
   - sandboxErrors: string[] (lista grešaka)
   - sandboxSummary: string (human-readable)
```

Node data schema:
```typescript
{
  inputVariable: string;        // varijabla sa generisanim kodom
  checks: string[];             // ["typecheck", "lint", "forbidden_patterns"]
  forbiddenPatterns?: {         // custom regex provere
    pattern: string;
    message: string;
  }[];
  outputVariable: string;       // default: "sandboxResult"
}
```

**2.2 — Integracija u SDLC pipeline**

Redosled u flow-u:
```
Code Gen → sandbox_verify → [PASS] → PR Gate → CI/CD
                           → [FAIL] → Retry Code Gen sa sandboxErrors
```

Ovo znači da PR Gate nikad ne dobija kod koji se ne kompajlira. PR Gate se fokusira na subjektivne stvari: arhitektura, čitljivost, sigurnost.

### Testovi

- Kod sa `any` tipom: FAIL sa jasnom porukom
- Kod sa `@prisma/client`: FAIL sa ispravnim importom u poruci
- Čist kod: PASS
- Prazan input: FAIL gracefully

---

## FAZA 3: Typed Output Schemas

**Problem:** Code Gen agent vraća slobodan tekst (markdown sa code blokovima). PR Gate parsira taj tekst heuristički. Kad format varira između pokušaja, PR Gate može da propusti fajlove ili pogrešno parsira kod.

**Rešenje:** Definisati JSON schema za output svakog agenta u SDLC pipeline-u. Koristiti Vercel AI SDK structured output (`generateObject`) umesto `generateText`.

### Šta treba implementirati

**3.1 — Zod schemas za agent outpute**

Fajl: `src/lib/sdlc/schemas.ts`

```typescript
// Code Gen output
const CodeGenOutputSchema = z.object({
  files: z.array(z.object({
    path: z.string(),           // "src/app/api/urls/route.ts"
    content: z.string(),        // pun sadržaj fajla
    language: z.string(),       // "typescript"
    isNew: z.boolean(),         // true = novi fajl, false = izmena postojećeg
  })),
  dependencies: z.array(z.object({
    name: z.string(),           // "zod"
    version: z.string(),        // "^3.0.0"
    isDev: z.boolean(),
  })),
  envVariables: z.array(z.object({
    key: z.string(),            // "DATABASE_URL"
    description: z.string(),
    required: z.boolean(),
  })),
  prismaSchemaChanges: z.string().optional(), // ako ima schema izmena
  summary: z.string(),          // kratak opis šta je generisano
});

// PR Gate output
const PRGateOutputSchema = z.object({
  decision: z.enum(["APPROVE", "APPROVE_WITH_NOTES", "BLOCK"]),
  compositeScore: z.number().min(0).max(100),
  securityScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  issues: z.array(z.object({
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    category: z.enum(["security", "quality", "convention", "performance"]),
    file: z.string(),
    line: z.number().optional(),
    message: z.string(),
    fix: z.string(),            // KONKRETAN fix, ne dijagnoza
  })),
  summary: z.string(),
});
```

**3.2 — Izmena ai-response-handler-a**

Kad node ima `node.data.outputSchema` definisan, handler koristi `generateObject` umesto `generateText`:

```typescript
if (node.data.outputSchema) {
  const { object } = await generateObject({
    model,
    schema: resolveSchema(node.data.outputSchema),
    prompt: resolvedPrompt,
  });
  // object je već type-safe
}
```

**3.3 — Validacija između faza**

Svaki node u pipeline-u validira input koji dobija od prethodnog node-a:
```
Code Gen (outputSchema: CodeGenOutput)
  → sandbox_verify (očekuje CodeGenOutput.files)
  → PR Gate (outputSchema: PRGateOutput, input: CodeGenOutput)
```

Ako validacija failuje, flow se zaustavlja sa jasnom greškom umesto da propagira bad data.

### Testovi

- Code Gen sa outputSchema: vraća valid JSON, ne markdown
- Invalid output (missing files field): Zod validation error, flow se zaustavlja
- PR Gate sa fix poljem: svaka issue ima konkretan fix

---

## FAZA 4: Specifičan Feedback Loop

**Problem:** Kad PR Gate blokira, retry Code Gen dobija dijagnozu ("fix imports") ali ne dobija recept ("promeni X u Y"). Score raste sa 43 na 48 jer agent pogađa šta treba — umesto da zna.

**Rešenje:** PR Gate output (iz Faze 3) sadrži `fix` polje za svaku issue. Retry mehanizam konstruiše prompt sa svim fix-ovima kao konkretnim instrukcijama.

### Šta treba implementirati

**4.1 — Retry node unapređenje**

Postojeći `retry` handler treba proširiti da podržava "escalating context" — svaki retry dodaje više informacija.

Izmena u: `src/lib/runtime/handlers/retry-handler.ts`

Nova logika:
```
Retry 1:
  - Original prompt
  - PR Gate issues sa fix poljima
  - projectContext (iz Faze 1)

Retry 2:
  - Sve od Retry 1
  + sandboxErrors (iz Faze 2)
  + Primer ispravnog koda iz projekta (few-shot examples)
  + Eksplicitna lista: "Ove greške si napravio, evo tačno kako izgleda ispravan kod"
```

**4.2 — Few-shot examples iz Knowledge Base**

Dodaj mogućnost da `project_context` node (iz Faze 1) učita i primere koda iz Knowledge Base — ne samo pravila, nego i 2-3 konkretna API route fajla koja služe kao referenca.

Node data proširenje:
```typescript
{
  contextFiles: string[],
  exampleFiles?: string[],      // ["src/app/api/agents/route.ts", "src/app/api/health/route.ts"]
  maxExamples?: number,         // default: 3
}
```

### Testovi

- Retry 1 prompt sadrži PR Gate fix-ove
- Retry 2 prompt sadrži sandbox greške + primere koda
- Retry bez grešaka: standardni retry bez dodatnog konteksta

---

## FAZA 5: A2A Agent Cards

**Problem:** Agent Studio ima A2A protokol i marketplace, ali agenti nemaju standardizovane Agent Cards po Google A2A v0.3 specifikaciji. Ovo otežava discovery i interoperabilnost sa eksternim sistemima.

**Rešenje:** Svaki agent objavljuje Agent Card na well-known URL-u.

### Šta treba implementirati

**5.1 — Agent Card API ruta**

Fajl: `src/app/api/agents/[agentId]/.well-known/agent-card.json/route.ts`

Ili alternativno (jednostavnije):
Fajl: `src/app/api/a2a/[agentId]/agent-card/route.ts`

Response format (A2A v0.3):
```json
{
  "name": "URL Shortener Agent",
  "description": "Creates and manages short URLs",
  "version": "1.0.0",
  "url": "https://agent-studio.up.railway.app/api/a2a/agent-id",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "shorten-url",
      "name": "Shorten URL",
      "description": "Creates a short URL from a long URL",
      "inputModes": ["text/plain"],
      "outputModes": ["application/json"]
    }
  ],
  "authentication": {
    "schemes": ["bearer"]
  }
}
```

**5.2 — Automatsko generisanje iz Prisma modela**

Agent Card se generiše automatski iz postojećih Agent podataka (name, description, systemPrompt) + flow node-ova (skills = input/output node-ovi).

**5.3 — Discovery endpoint**

Fajl: `src/app/.well-known/agent-cards/route.ts`

Vraća listu svih javnih agenata sa linkovima do njihovih Agent Cards. Ovo omogućava eksternim sistemima da otkriju sve agente na platformi.

### Testovi

- Agent Card vraća valid JSON po A2A v0.3 specifikaciji
- Agent bez opisa: polje description ima fallback vrednost
- Privatni agent: nije u discovery listi

---

## FAZA 6: MCP Enforcement Layer

**Problem:** Inter-agent komunikacija koristi natural language bez schema validacije. Agent A može da pošalje malformiran output agentu B, i B će pokušati da ga interpretira umesto da failuje brzo.

**Rešenje:** Koristiti MCP (koji već postoji u projektu) kao enforcement layer — svaki tool call se validira pre izvršenja.

### Šta treba implementirati

**6.1 — Schema validacija na mcp-tool-handler**

Izmena u: `src/lib/runtime/handlers/mcp-tool-handler.ts`

Dodati Zod validaciju za input/output svake tool operacije:
```
1. Pre tool call: validiraj input prema tool schema
2. Posle tool call: validiraj output prema expected schema
3. Ako validacija failuje: vrati strukturiranu grešku, ne propagiraj bad data
```

**6.2 — Inter-agent message validation**

Izmena u: `src/lib/runtime/handlers/call-agent-handler.ts`

Kad agent A pozove agenta B:
```
1. Proveri da B ima Agent Card sa definisanim input schema
2. Validiraj A-ov output prema B-ovom input schema
3. Ako ne odgovara: FAIL sa jasnom porukom ("Agent A output ne odgovara Agent B input schema")
```

### Testovi

- Valid input: tool call prolazi
- Invalid input: tool call se odbija sa jasnom greškom
- Missing schema: fallback na postojeće ponašanje (backward compatible)

---

## Redosled implementacije

| Faza | Zavisnosti | Procenjen effort | Uticaj |
|------|-----------|-------------------|--------|
| 1. Project Context | Nema | 1-2 dana | Kritičan — rešava root cause Code Gen failure |
| 2. Sandbox Verify | Faza 1 (kontekst za forbidden patterns) | 1-2 dana | Visok — deterministička verifikacija |
| 3. Typed Schemas | Nema (ali Faza 2 koristi schema) | 2-3 dana | Visok — eliminiše parsing greške |
| 4. Feedback Loop | Faze 1, 2, 3 | 1 dan | Srednji — poboljšava retry success rate |
| 5. A2A Agent Cards | Nema | 1 dan | Srednji — marketplace/discovery |
| 6. MCP Enforcement | Faza 3 (schemas) | 1-2 dana | Srednji — sprečava bad data propagation |

**Ukupno: 7-11 dana rada**

Faze 1 i 2 su kritične — one rešavaju tačno problem koji smo videli u URL shortener pipeline-u. Faza 3 je fundament za Faze 4 i 6. Faza 5 je nezavisna i može paralelno.

---

## Reference

- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic — Writing Effective Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic — Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Google — A2A Protocol v0.3](https://a2a-protocol.org/latest/specification/)
- [Google — Developer's Guide to AI Agent Protocols](https://developers.googleblog.com/developers-guide-to-ai-agent-protocols/)
- [GitHub — Multi-agent Workflows Often Fail](https://github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/)
