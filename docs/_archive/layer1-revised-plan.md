# Layer 1 — Revidirana Analiza i Implementacioni Plan v2

> Datum: 2026-05-07  
> Status: Revizija originalnog plana — pronađeni kritični problemi koji bi blokirali implementaciju  
> Metodologija: Duboki code audit — verify.ts, pipeline-manager.ts, queue/index.ts, schema.prisma, meta-orchestrator.ts, git-integration.ts, rate-limit-config.ts

---

## ŠTA JE ORIGINALNI PLAN PROPUSTIO — KRITIČNI NALAZI

Originalni plan je bio konceptualno ispravan, ali previdjeo je 9 konkretnih tehničkih problema koji bi blokirali ili srušili implementaciju. Ovdje su, redom po težini:

---

### 🔴 BLOCKER #1 — GitHub Signature Format Mismatch

**Problem:** Originalni plan predviđa reupotrebu `verifyWebhookSignature()` iz `verify.ts` za GitHub webhooke. **To ne radi.**

GitHub šalje:
```
x-hub-signature-256: sha256=abc123def456...  (hex digest)
```

Naš `verifyWebhookSignature()` očekuje Standard Webhooks format:
```
x-webhook-id: msg_xxx
x-webhook-timestamp: 1234567890
x-webhook-signature: v1,base64encodedhmac==
```

Ova dva formata su potpuno različita. Pokušaj verifikacije GitHub eventa sa postojećim kôdom **uvijek vraća `valid: false`**.

**Rješenje:** Dodati `verifyGitHubSignature()` u `verify.ts`:
```typescript
export function verifyGitHubSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string
): WebhookVerifyResult {
  const sigHeader = getHeader(headers, "x-hub-signature-256");
  if (!sigHeader) return { valid: false, error: "Missing x-hub-signature-256" };
  
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  
  try {
    if (timingSafeEqual(Buffer.from(sigHeader), Buffer.from(expected))) {
      return { valid: true };
    }
  } catch { /* length mismatch */ }
  
  return { valid: false, error: "GitHub signature mismatch" };
}
```

---

### 🔴 BLOCKER #2 — GitLab Koristi Plaintext Token, Ne HMAC

**Problem:** GitLab ne koristi HMAC. GitLab šalje:
```
X-Gitlab-Token: <plaintext_secret>
```

Ovo je jednostavna string usporedba, ne kriptografska verifikacija. Nema `x-webhook-*` headera, nema timestampa, nema base64.

**Rješenje:** Dodati `verifyGitLabToken()` u `verify.ts`:
```typescript
export function verifyGitLabToken(
  headers: Record<string, string | string[] | undefined>,
  secret: string
): WebhookVerifyResult {
  const token = getHeader(headers, "x-gitlab-token");
  if (!token) return { valid: false, error: "Missing X-Gitlab-Token header" };
  
  // Timing-safe comparison prevents timing attacks even on plaintext tokens
  try {
    if (timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      return { valid: true };
    }
  } catch { /* length mismatch */ }
  
  return { valid: false, error: "GitLab token mismatch" };
}
```

---

### 🔴 BLOCKER #3 — WebhookConfig Nema `signatureProvider` Polje

**Problem:** Kad nova ruta primi request, kako zna koji verifikator da koristi? GitHub ili GitLab?  
WebhookConfig schema nema polje koje bi to označavalo. Bez toga, ruta ne zna da li:
- Traži `x-hub-signature-256` (GitHub)
- Traži `X-Gitlab-Token` (GitLab)
- Traži Standard Webhooks format

**Rješenje:** Dodati `signatureProvider` u WebhookConfig:
```prisma
model WebhookConfig {
  // ... postojeća polja ...
  
  /// Which signature scheme this webhook uses for inbound verification.
  /// "standard" = Standard Webhooks spec (default, existing behaviour)
  /// "github"   = x-hub-signature-256: sha256=<hex>
  /// "gitlab"   = X-Gitlab-Token: <plaintext>
  signatureProvider  String  @default("standard")
  
  /// When true, this webhook config is used for SDLC pipeline triggering
  /// (routes to pipeline-trigger endpoint, not flow execution endpoint)
  isPipelineTrigger  Boolean @default(false)
}
```

---

### 🟠 KRITIČNO #4 — PipelineRun Nedostaju 5 Novih Polja (Schema Gap)

Originalni plan pominje `webhookExecutionId` ali **ne pominje sve što treba**. Kompletna lista polja koja nedostaju na `PipelineRun`:

```prisma
model PipelineRun {
  // ... sva postojeća polja ostaju nepromijenjene ...

  /// Idempotency key za webhook-triggered runove.
  /// Format: "github-{owner}/{repo}-{pr_number}-{head_sha}"
  /// Unique constraint sprečava duplikat pipeline za isti PR commit.
  webhookIdempotencyKey  String?  @unique

  /// ID WebhookExecution koji je triggirao ovaj run (null = manual)
  webhookExecutionId     String?

  /// Koji sistem je triggirao run: "manual" | "github" | "gitlab" | "api"
  triggerSource          String   @default("manual")

  /// Branch name iz PR payloada (npr. "feature/auth-flow")
  triggerBranch          String?

  /// PR/MR broj (za traceability i GitHub commit status API)
  triggerPrNumber        Int?
}
```

**Zašto `webhookIdempotencyKey` mora biti `@unique`?**  
Bez unique constraint, race condition može kreirati dva pipeline runa za isti GitHub PR event ako GitHub pošalje event dva puta (retry) ili ako dva worker-a obrade isti event paralelno.

---

### 🟠 KRITIČNO #5 — Rate Limit: Pipeline Limit je 5/min, Ne 60/min

**Problem:** Originalni plan nije uzeo u obzir rate limiting. `rate-limit-config.ts` definiše:

```typescript
"pipeline": { maxRequests: 5, windowMs: 60_000 },  // ← SAMO 5 po minuti!
"webhook":  { maxRequests: 60, windowMs: 60_000 },  // ← 60 po minuti
```

Aktivni repo može imati 10+ PR update eventa u minuti (squash commits, force pushes, itd.). Sa pipeline limitom od 5/min, **11. event bi dobio 429 Too Many Requests** i GitHub bi zaustavio slanje.

**Rješenje:** Dodati poseban limit za `pipeline:webhook` trigger:
```typescript
"pipeline:webhook": { maxRequests: 30, windowMs: 60_000 },
// 30/min = dovoljno za aktivne repove, ali sprečava abuse
```

Nova ruta koristiti ovaj limit umjesto generičkog `pipeline`.

---

### 🟠 KRITIČNO #6 — `analyzeTask` Poziva LLM za Svaki PR (Nepotrebno i Skupo)

**Problem:** Originalni plan predviđa da nova ruta poziva `analyzeTask(pr_title)` koji defaultno poziva LLM (~$0.001 po PR evenu). Za repo sa 100 PR-ova dnevno = $0.10/dan samo za klasifikaciju.

**Još važnije:** Za PR event, taskType je uvijek isti — `"code-review"`. Nema potrebe za LLM klasifikacijom.

**Rješenje:** Nova ruta ne poziva `analyzeTask`. Direktno koristi `pipelineOverride`:

```typescript
// U webhook-trigger/route.ts — za GitHub PR evente:
const pipeline = buildPipelineConfig(["project_context", "ecc-code-reviewer"]).map(s => s.id);
// taskType = "code-review", complexity = "simple"

const run = await createPipelineRun({
  taskDescription: buildTaskDescription(payload),
  taskType: "code-review",
  complexity: "simple",
  pipeline,
  // ...
});
```

Ovo eliminiše LLM poziv i ubrzava response za ~3-5 sekundi.

---

### 🟡 VAŽNO #7 — `SELECT_LIST_FIELDS` u `pipeline-manager.ts` Treba Ažuriranje

**Problem:** Kad dodamo nova polja na `PipelineRun`, ona **neće biti vraćena** u `listPipelineRuns()` jer `SELECT_LIST_FIELDS` je eksplicitan objekt sa `true/false` po polju. Nova polja defaultno nisu uključena.

**Posljedica:** UI nikad neće vidjeti `triggerSource`, `triggerBranch`, `triggerPrNumber` u listi runova.

**Rješenje:** Ažurirati `SELECT_LIST_FIELDS` da uključuje nova polja:
```typescript
const SELECT_LIST_FIELDS = {
  // ... postojeća polja ...
  webhookIdempotencyKey: true,
  triggerSource: true,
  triggerBranch: true,
  triggerPrNumber: true,
} as const;
```

I ažurirati `PipelineRun` TypeScript interface i `toRun()` helper da uključuju nova polja.

---

### 🟡 VAŽNO #8 — `prUrl` Treba Biti Popunjen Pri Kreiranju (Ne Nakon)

**Problem:** `PipelineRun` već ima `prUrl` polje koje se trenutno popunjava **nakon** što git-integration kreira PR. Za webhook-triggered runove, `prUrl` je poznat odmah (iz GitHub payload-a).

**Rješenje:** Proslijediti `prUrl` u `createPipelineRun()`:

```typescript
// U CreatePipelineRunInput:
prUrl?: string;  // dodati

// U webhook-trigger/route.ts:
const run = await createPipelineRun({
  prUrl: payload.pull_request.html_url,  // ← odmah dostupno
  // ...
});
```

`pipeline-manager.ts` → `createPipelineRun()` → Prisma `data` object treba dodati `prUrl: input.prUrl ?? null`.

---

### 🟡 VAŽNO #9 — GitLab Payload Format Se Razlikuje od GitHub-a

Originalni plan tretira GitHub i GitLab jednako. Ali:

| Polje | GitHub PR payload | GitLab MR payload |
|-------|------------------|-------------------|
| Akcija | `$.action` (`"opened"`) | `$.object_attributes.action` (`"open"`) |
| Naslov | `$.pull_request.title` | `$.object_attributes.title` |
| URL | `$.pull_request.html_url` | `$.object_attributes.url` |
| Broj | `$.number` | `$.object_attributes.iid` |
| Draft | `$.pull_request.draft` | `$.object_attributes.draft` (bool) |
| Head SHA | `$.pull_request.head.sha` | `$.object_attributes.last_commit.id` |
| Repo URL | `$.repository.html_url` | `$.project.web_url` |
| Akcija "open" vs "opened" | `"opened"` | `"open"` |

Nova ruta mora imati dva parser-a: `parseGitHubPRPayload()` i `parseGitLabMRPayload()`.

---

## REVIDIRANA LISTA FAJLOVA — KOMPLETNA

### Novi fajlovi (kreirati)

```
src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts
src/lib/webhooks/pipeline-trigger.ts        ← helper za parsiranje + validaciju PR payloada
prisma/seed-pipeline-templates.ts            ← seed za builtin PipelineTemplate zapise
```

### Izmjeniti (postojeći fajlovi)

```
prisma/schema.prisma
  + signatureProvider   na WebhookConfig (String @default("standard"))
  + isPipelineTrigger   na WebhookConfig (Boolean @default(false))
  + webhookIdempotencyKey  na PipelineRun (String? @unique)
  + webhookExecutionId     na PipelineRun (String?)
  + triggerSource          na PipelineRun (String @default("manual"))
  + triggerBranch          na PipelineRun (String?)
  + triggerPrNumber        na PipelineRun (Int?)
  + PipelineTemplate       novi model
  (i nova migracija)

src/lib/webhooks/verify.ts
  + verifyGitHubSignature()   ← sha256=hex format
  + verifyGitLabToken()       ← X-Gitlab-Token plaintext

src/lib/webhooks/presets.ts
  + GITLAB_MR preset sa svim mappings i samplePayload

src/lib/sdlc/pipeline-manager.ts
  + prUrl u CreatePipelineRunInput interface
  + prUrl u createPipelineRun() data object
  + webhookIdempotencyKey, triggerSource, triggerBranch, triggerPrNumber u CreatePipelineRunInput
  + Sva nova polja u SELECT_LIST_FIELDS
  + Sva nova polja u PipelineRun TypeScript interface
  + Sva nova polja u toRun() helper function

src/lib/rate-limit-config.ts
  + "pipeline:webhook": { maxRequests: 30, windowMs: 60_000 }

src/app/api/agents/[agentId]/webhooks/route.ts
  + signatureProvider u CreateWebhookSchema (enum: standard | github | gitlab)
  + isPipelineTrigger u CreateWebhookSchema (boolean)

src/app/pipelines/[agentId]/page.tsx
  + triggerSource badge na svakom pipeline run redu
  + triggerBranch i triggerPrNumber display
  + Webhook status banner (opciono, Faza 3)
```

---

## REVIDOVANI IMPLEMENTACIONI PLAN — PO DANIMA

### Dan 1 — Schema + Verifikatori (Fundament)

**Prompt 1: Schema migracija**
```
Fajl: prisma/schema.prisma + nova migracija

Na WebhookConfig dodati:
  signatureProvider  String  @default("standard")  // "standard" | "github" | "gitlab"
  isPipelineTrigger  Boolean @default(false)

Na PipelineRun dodati:
  webhookIdempotencyKey  String?  @unique
  webhookExecutionId     String?
  triggerSource          String   @default("manual")
  triggerBranch          String?
  triggerPrNumber        Int?

Novi model:
  model PipelineTemplate {
    id           String   @id @default(cuid())
    slug         String   @unique
    name         String
    description  String?  @db.Text
    category     String
    icon         String
    agentSlugs   Json     @default("[]")
    webhookPreset String?
    webhookSettings Json  @default("{}")
    pipelineSteps   Json  @default("[]")
    pipelineDefaults Json @default("{}")
    setupGuide   String?  @db.Text
    isBuiltIn    Boolean  @default(false)
    usageCount   Int      @default(0)
    createdAt    DateTime @default(now())
    updatedAt    DateTime @updatedAt
    @@index([category])
    @@index([isBuiltIn])
  }

Pokrenuti: npx prisma migrate dev --name layer1-pipeline-trigger
```

**Prompt 2: Verifikatori za GitHub i GitLab**
```
Fajl: src/lib/webhooks/verify.ts

Dodati dvije nove export funkcije:

1. verifyGitHubSignature(rawBody, headers, secret): WebhookVerifyResult
   - Traži header: x-hub-signature-256
   - Format: "sha256=<hex_hmac_sha256>"
   - Kreira HMAC: createHmac("sha256", secret).update(rawBody).digest("hex")
   - Poredi timing-safe
   - NE provjerava timestamp (GitHub ne šalje timestamp header)

2. verifyGitLabToken(headers, secret): WebhookVerifyResult
   - Traži header: x-gitlab-token
   - Plaintext poređenje timing-safe
   - NE provjerava HMAC (GitLab ne potpisuje tijelo requesta)

Postojeća verifyWebhookSignature() ostaje nepromijenjena (Standard Webhooks spec).
```

---

### Dan 2 — Pipeline Manager + Rate Limit + Presets

**Prompt 3: pipeline-manager.ts ažuriranje**
```
Fajl: src/lib/sdlc/pipeline-manager.ts

1. Proširiti CreatePipelineRunInput interface:
   + prUrl?: string
   + webhookIdempotencyKey?: string
   + webhookExecutionId?: string
   + triggerSource?: string  // default: "manual"
   + triggerBranch?: string
   + triggerPrNumber?: number

2. Ažurirati createPipelineRun() data object da uključuje nova polja:
   prUrl: input.prUrl ?? null,
   webhookIdempotencyKey: input.webhookIdempotencyKey ?? null,
   webhookExecutionId: input.webhookExecutionId ?? null,
   triggerSource: input.triggerSource ?? "manual",
   triggerBranch: input.triggerBranch ?? null,
   triggerPrNumber: input.triggerPrNumber ?? null,

3. Ažurirati PipelineRun TypeScript interface (dodati sva nova polja)

4. Ažurirati toRun() helper (mapirati nova polja)

5. Ažurirati SELECT_LIST_FIELDS (dodati sva nova polja sa true)

VAŽNO: ne mijenjati logiku, samo dodavati polja.
```

**Prompt 4: Rate limit + WebhookConfig schema + Presets**
```
Fajlovi:
  src/lib/rate-limit-config.ts — dodati "pipeline:webhook": { maxRequests: 30, windowMs: 60_000 }
  
  src/app/api/agents/[agentId]/webhooks/route.ts — proširiti CreateWebhookSchema:
    signatureProvider: z.enum(["standard", "github", "gitlab"]).default("standard")
    isPipelineTrigger: z.boolean().default(false)
    
  src/lib/webhooks/presets.ts — dodati GITLAB_MR preset:
    id: "gitlab-mr"
    name: "GitLab MR (Pipeline)"
    icon: "🦊"
    signatureNote: "GitLab koristi X-Gitlab-Token header (plaintext token, nije HMAC)"
    bodyMappings za: action, mr_number, mr_title, mr_url, head_sha, head_branch, base_branch, mr_author, repo_url, repo_full_name
    Mapirati na iste variableName kao GITHUB_PR preset radi kompatibilnosti
    eventFilters: ["Merge Request Hook"]
    samplePayload: GitLab MR event primjer
```

---

### Dan 3 — Srce: Webhook → Pipeline Ruta

**Prompt 5: `src/lib/webhooks/pipeline-trigger.ts` (novi helper)**
```
Novi fajl: src/lib/webhooks/pipeline-trigger.ts

Sadržaj:

export interface PRContext {
  provider: "github" | "gitlab";
  prNumber: number;
  prTitle: string;
  prUrl: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  repoUrl: string;
  repoFullName: string;
  author: string;
  isDraft: boolean;
  action: string;  // "opened" | "synchronize" | "reopened" etc.
}

export function parseGitHubPRPayload(body: unknown): PRContext | null
  // Parsira $.action, $.pull_request.*, $.repository.*
  // Returns null ako nije valid PR payload

export function parseGitLabMRPayload(body: unknown): PRContext | null
  // Parsira $.object_attributes.*, $.project.*
  // Normalizira action: "open" → "opened", "update" → "synchronize"

export function buildTaskDescription(ctx: PRContext): string
  // Vraća: "Code review PR #42: {title} ({author}, {headBranch} → {baseBranch})"

export function buildIdempotencyKey(ctx: PRContext): string
  // Vraća: "{provider}-{repoFullName}-{prNumber}-{headSha}"
  // Garantuje unique key po PR commit-u

export function isActionRelevant(action: string): boolean
  // True za: opened, synchronize, reopened
  // False za: closed, merged, labeled, unlabeled, itd.
```

**Prompt 6: Nova pipeline trigger ruta**
```
Novi fajl:
  src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts

Endpoint: POST /api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]
Auth: JAVNI endpoint (bez session), auth putem signature verifikacije

export const maxDuration = 30;  // samo enqueue — ne čekamo pipeline da završi

Logika:

1. Učitaj WebhookConfig iz DB (provjeri enabled + isPipelineTrigger)
   - 404 ako ne postoji ili nije isPipelineTrigger=true
   
2. Verifikuj signature prema signatureProvider:
   - "github" → verifyGitHubSignature()
   - "gitlab" → verifyGitLabToken()
   - "standard" → verifyWebhookSignature()
   - 400 na grešku
   
3. Parsiraj payload prema provideru:
   - Odredi provider iz webhookConfig.signatureProvider
   - "github" → parseGitHubPRPayload()
   - "gitlab" → parseGitLabMRPayload()
   - 400 ako parsing ne uspije
   
4. Provjeri isPipelineTrigger=true (safety check)

5. Filtriraj nebitne akcije:
   - !isActionRelevant(ctx.action) → vrati 200 { skipped: true }
   - ctx.isDraft → vrati 200 { skipped: true, reason: "Draft PR" }

6. Idempotency provjera (race condition safe):
   const key = buildIdempotencyKey(ctx)
   const existing = await prisma.pipelineRun.findUnique({
     where: { webhookIdempotencyKey: key },
     select: { id: true, status: true }
   })
   Ako postoji → 409 { skipped: true, existingRunId: existing.id }

7. Rate limit: getEndpointLimit("pipeline:webhook")

8. Pripremi pipeline bez LLM analize:
   const pipeline = ["project_context", "ecc-code-reviewer"]
   // ili buildPipelineConfig(["project_context", "ecc-code-reviewer"]).map(s => s.id)

9. createPipelineRun({
     taskDescription: buildTaskDescription(ctx),
     taskType: "code-review",
     complexity: "simple",
     pipeline,
     agentId,
     userId: null,                        // nema korisnika (webhook triggered)
     repoUrl: ctx.repoUrl,
     prUrl: ctx.prUrl,                    // odmah dostupno!
     webhookIdempotencyKey: key,
     triggerSource: ctx.provider,
     triggerBranch: ctx.headBranch,
     triggerPrNumber: ctx.prNumber,
   })

10. addPipelineRunJob({ pipelineRunId: run.id, agentId, repoUrl: ctx.repoUrl })

11. Odgovori 202 odmah:
    { success: true, pipelineRunId: run.id, queued: true }

applySecurityHeaders() na sve response-e.
```

---

### Dan 4 — UI Ažuriranja

**Prompt 7: Pipelines page — trigger info**
```
Fajl: src/app/pipelines/[agentId]/page.tsx

1. Proširiti PipelineRun interface za nova polja:
   triggerSource: string
   triggerBranch: string | null
   triggerPrNumber: number | null
   prUrl: string | null

2. U tabeli/listi pipeline runova, dodati trigger badge:
   - triggerSource === "github" → 🐙 PR #42 (link na prUrl ako postoji)
   - triggerSource === "gitlab" → 🦊 MR !42
   - triggerSource === "manual" → 🎮 Manual
   - triggerSource === "api" → ⚙️ API

3. Opciono prikazati triggerBranch kao dodatnu info ispod opisa task-a
```

**Prompt 8: WebhookConfig API + UI za pipeline trigger setup**
```
Fajlovi:
  src/app/api/agents/[agentId]/webhooks/route.ts
    - Uključiti signatureProvider i isPipelineTrigger u POST handler
    - Uključiti ih u GET response select

  src/app/api/pipeline-templates/route.ts (novi)
    - GET /api/pipeline-templates → lista builtin templates iz PipelineTemplate tabele
    - Pristup bez auth (javni, read-only)

  src/app/api/pipeline-templates/[slug]/deploy/route.ts (novi)
    - POST → kreira WebhookConfig sa ispravnim signatureProvider i isPipelineTrigger=true
    - Vraća { webhookUrl, webhookSecret (jednom!), setupInstructions }
    - Zahtijeva auth (requireAgentOwner)
```

---

### Dan 5 — Seed Data + Testovi + Commit

**Prompt 9: Seed pipeline templates**
```
Fajl: prisma/seed-pipeline-templates.ts

Kreirati 5 builtin PipelineTemplate zapisa:
1. "github-pr-review" — GitHub PR Code Review (provider: github)
2. "gitlab-mr-review" — GitLab MR Code Review (provider: gitlab)
3. "github-full-sdlc" — Full SDLC Pipeline od GitHub PR-a
4. "pr-review-only" — Samo code review, bez generate
5. "manual-sdlc" — Ručno pokretanje, bez webhook-a

Svaki sadrži:
- slug, name, description, category, icon
- agentSlugs: koje ECC agente koristiti
- webhookPreset: "github-pr" | "gitlab-mr" | null
- webhookSettings: { signatureProvider, isPipelineTrigger, asyncExecution, eventFilters }
- pipelineDefaults: { pipeline: [...], taskType, requireApproval }
- setupGuide: Markdown uputstvo za korisnika

Dodati seed poziv u prisma/seed.ts
```

**Prompt 10: Testovi + tsc + commit**
```
Fajlovi:
  src/lib/webhooks/pipeline-trigger.test.ts (novi)
    - parseGitHubPRPayload: valid payload → ctx, invalid → null
    - parseGitLabMRPayload: valid MR payload → ctx, normalizacija akcija
    - buildIdempotencyKey: deterministički output
    - isActionRelevant: opened/synchronize/reopened = true, closed/draft = false

  src/lib/webhooks/verify.test.ts (ažurirati)
    - verifyGitHubSignature: ispravan sha256= hex → valid
    - verifyGitHubSignature: pogrešan secret → invalid
    - verifyGitLabToken: ispravan token → valid
    - verifyGitLabToken: pogrešan token → invalid

Komande:
  npx tsc --noEmit
  npx vitest run --config ./vitest.config.ts
  git add -A
  git commit -m "feat: Layer 1 — webhook-to-pipeline bridge + GitHub/GitLab signature support"
  git push
```

---

## KOMPLETNA LISTA IZMJENA (Redosljed Dependency-a)

```
1. prisma/schema.prisma              ← sve schema promjene odjednom (1 migracija)
2. src/lib/webhooks/verify.ts        ← verifyGitHubSignature + verifyGitLabToken
3. src/lib/webhooks/presets.ts       ← GITLAB_MR preset
4. src/lib/sdlc/pipeline-manager.ts  ← nova polja u interface + createPipelineRun + SELECT_LIST_FIELDS
5. src/lib/rate-limit-config.ts      ← "pipeline:webhook" limit
6. src/app/api/agents/.../webhooks/route.ts  ← signatureProvider + isPipelineTrigger u schema
7. src/lib/webhooks/pipeline-trigger.ts      ← novi helper (parseri + builderi)
8. src/app/api/agents/.../pipelines/webhook-trigger/[webhookId]/route.ts  ← SRCE
9. src/app/api/pipeline-templates/route.ts   ← lista templates
10. src/app/api/pipeline-templates/[slug]/deploy/route.ts  ← deploy endpoint
11. src/app/pipelines/[agentId]/page.tsx     ← trigger badge u UI
12. prisma/seed-pipeline-templates.ts         ← seed data
13. src/lib/webhooks/pipeline-trigger.test.ts ← testovi
14. src/lib/webhooks/verify.test.ts (update)  ← testovi za nove funkcije
```

---

## RIZICI KOJI SU SADA ELIMINIRANI

| Rizik iz original plana | Status | Rješenje |
|------------------------|--------|----------|
| GitHub HMAC format mismatch | ✅ Riješeno | verifyGitHubSignature() |
| GitLab plaintext token | ✅ Riješeno | verifyGitLabToken() |
| WebhookConfig nema provider info | ✅ Riješeno | signatureProvider polje |
| Duplikat pipeline runovi | ✅ Riješeno | webhookIdempotencyKey @unique |
| Rate limit pre-low za webhook trigger | ✅ Riješeno | "pipeline:webhook" 30/min |
| LLM poziv za svaki PR | ✅ Riješeno | pipelineOverride, bez analyzeTask |
| Nova polja nevidljiva u list | ✅ Riješeno | SELECT_LIST_FIELDS update |
| prUrl popunjen kasno | ✅ Riješeno | prUrl u createPipelineRun |
| GitLab payload format razlika | ✅ Riješeno | parseGitLabMRPayload() |

---

## PREOSTALI RIZICI (prihvatljivi za Layer 1)

| Rizik | Vjerovatnoća | Impact | Odluka |
|-------|-------------|--------|--------|
| GITHUB_TOKEN je globalni env var (nije per-user) | Visoka | Nizak za sada | Prihvatiti — multi-tenant token management je Layer 3 |
| GitHub šalje event više puta (retry) | Visoka | Nizak | @unique constraint na webhookIdempotencyKey štiti |
| Railway timeout na `/pipelines/webhook-trigger` | Niska | Srednji | maxDuration=30, ruta samo enqueueuje — ne čeka |
| Korisnik izgubi webhook secret | Visoka | Srednji | Prikazati samo jednom, link na rotate endpoint |
| ECC agenti nisu u DB korisnika | Potrebno provjeriti | Visok | Vidjeti napomenu ispod |

### ⚠️ Napomena: ECC Agenti i Organizaciona Izolacija

ECC agenti (`ecc-planner`, `ecc-code-reviewer`, itd.) su referencisani kao string ID-evi u `ROUTING_TABLE`. Treba provjeriti da li su oni stvarni `Agent` DB zapisi vezani za konkretnog korisnika ili su globalni/builtin agenti. Ako su per-user, webhook-triggered pipeline mora koristiti `agentId` korisnika koji je postavio webhook, a ECC agenti moraju biti dostupni tom korisniku.

Ovu provjeru uraditi pri prvom testiranju.

---

## SAŽETAK: Plan v2 vs Plan v1

| | Plan v1 | Plan v2 |
|--|---------|---------|
| GitHub verifikacija | ❌ Reupotrebljava verify.ts (ne radi!) | ✅ Nova verifyGitHubSignature() |
| GitLab verifikacija | ❌ Nije razmatrana | ✅ Nova verifyGitLabToken() |
| Provider info na WebhookConfig | ❌ Nije predviđeno | ✅ signatureProvider + isPipelineTrigger |
| Idempotency | ❌ Aplikacijska logika bez DB constraint | ✅ @unique constraint |
| Rate limiting | ❌ Koristio bi pipeline limit (5/min) | ✅ Novi "pipeline:webhook" (30/min) |
| LLM troškovi | ❌ analyzeTask za svaki PR (~$0.001) | ✅ Nema LLM — direktan pipelineOverride |
| SELECT_LIST_FIELDS | ❌ Zaboravljeno | ✅ Eksplicitno ažurirano |
| prUrl timing | ❌ Kasnilo | ✅ Odmah pri createPipelineRun |
| GitLab payload | ❌ Ignorisana razlika | ✅ parseGitLabMRPayload() |
| Testovi za nove funkcije | ❌ Nije planirano | ✅ verify.test.ts + pipeline-trigger.test.ts |
| Broj dana | 5 dana | 5 dana (isti, ali redistributovano) |
