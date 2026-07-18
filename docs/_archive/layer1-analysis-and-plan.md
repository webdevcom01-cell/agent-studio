# Agent Studio — Layer 1: Detaljna Analiza i Implementation Plan

> Datum: 2026-05-07  
> Scope: Sloj 1 — Kritične funkcionalnosti bez kojih Agent Studio nije produkt  
> Metodologija: Deep codebase audit (221 template, 80+ API ruta, 20+ lib modula)

---

## EXECUTIVE SUMMARY

Duboka analiza koda otkrila je iznenađujuće nalaze: **infrastruktura je daleko naprednija nego što se čini na površini**, ali postoje **3 kritična prekida u lancu** koji sprečavaju Layer 1 od funkcionisanja end-to-end.

Dobra vijest: ne gradimo od nule. Gradimo mostove između sistema koji već postoje.

---

## ANALIZA POSTOJEĆEG STANJA

### Funkcionalnost 1: GitHub/GitLab Trigger Integracija

#### Što postoji (✅)

| Komponenta | Fajl | Status |
|-----------|------|--------|
| Webhook izvršenje | `src/lib/webhooks/execute.ts` | ✅ Production-ready |
| HMAC-SHA256 verifikacija | `src/lib/webhooks/verify.ts` | ✅ Implementirano |
| GitHub PR preset | `src/lib/webhooks/presets.ts` (GITHUB_PR) | ✅ Kompletan |
| Async BullMQ dispatch | `src/lib/webhooks/execute.ts` (asyncExecution) | ✅ Implementirano |
| Idempotency + rate limit | `src/lib/webhooks/execute.ts` | ✅ 60 req/min |
| Javni trigger endpoint | `POST /api/agents/[agentId]/trigger/[webhookId]` | ✅ Postoji |
| Webhook trigger handler | `src/lib/runtime/handlers/webhook-trigger-handler.ts` | ✅ Postoji |
| Issue-level dedup | `issueKeyTemplate` field na WebhookConfig | ✅ Postoji |
| GitHub/GitLab header prepoznavanje | `execute.ts` (extractEventType) | ✅ Implementirano |

#### Što NEDOSTAJE (❌) — Kritični prekidi

**PREKID #1 — Webhook → Pipeline most ne postoji**

Webhooks triggiraju *Flows* (konverzacijski AI), NOT *Pipeline Runs* (SDLC pipeline).  
Kad GitHub pošalje `pull_request` event na `/api/agents/[id]/trigger/[webhookId]`:
- Webhook handler injektuje varijable u flow kontext ✅  
- Flow se izvršava (chat-like execution) ✅  
- **Ali: nikada se ne poziva `createPipelineRun()`** ❌  
- **Nema veze između WebhookExecution i PipelineRun** ❌

```
GitHub PR opened
      ↓
POST /api/agents/[id]/trigger/[webhookId]    ← postoji
      ↓
executeWebhookTrigger()                      ← postoji  
      ↓
executeFlow()                                ← ← ← ide ovdje (POGREŠNO za SDLC)
      
      ↓ ← OVAJ MOST NE POSTOJI
      
createPipelineRun({ taskDescription: pr_title, repoUrl })  ← nedostaje
      ↓
addPipelineRunJob()                          ← postoji
```

**PREKID #2 — PipelineRun nema traceability natrag na WebhookExecution**

`PipelineRun` model nema `webhookExecutionId` polje. Ako pipeline padne, ne možeš naći koji GitHub event ga je pokrenuo.

**PREKID #3 — Nema UI setup wizard-a**

Korisnik ne zna:
- Koji URL da unese u GitHub Webhook Settings
- Koji secret da koristi
- Koje events da selektuje
- Šta se dešava kad PR bude otvoren

---

### Funkcionalnost 2: Webhook Sistem

#### Što postoji (✅)

Webhook infrastruktura je **izvanredno napravljena**:

- Signature verification (HMAC-SHA256, Standard Webhooks spec)
- Idempotency keys + issue-level deduplication  
- Rate limiting (60 req/min per webhook)
- BullMQ async execution (returns 202, flow runs in worker)
- Dead letter queue + retry with exponential backoff
- Replay support (resend stored payload)
- Event filters (npr. samo `pull_request` events)
- Body/header mappings (JSONPath → flow variables)
- Provider presets: GitHub, GitHub PR, Stripe, Slack, Generic
- Execution history tracking

#### Što NEDOSTAJE (❌)

| Gap | Impact |
|-----|--------|
| Nema GitLab PR preset | Korisnici na GitLab nemaju ekvivalent GITHUB_PR preseta |
| Webhook → Pipeline bridge | Vidi Prekid #1 iznad |
| Nema PR label filter | Ne možeš triggirati samo za PRs sa "ready-for-review" labelom |
| Nema webhook health UI u SDLC dijelu | Korisnik ne vidi status GitHub konekcije na pipeline stranici |

---

### Funkcionalnost 3: Agent Template Biblioteka

#### Što postoji (✅)

| Komponenta | Status |
|-----------|--------|
| 221 agent template u 20 kategorija | ✅ Masivna biblioteka |
| `devsecops` kategorija (5 templates) | ✅ Orchestrator, Code Quality, Security, Test, PR Publisher |
| Template Gallery UI sa search/filter | ✅ Implementirano |
| Template API (CRUD + marketplace) | ✅ `/api/templates` |
| Import/Export sistem | ✅ Sa secret scrubbing i checksum |
| `Template` model u Prisma schemi | ✅ F7 — Clipmart |

#### Što NEDOSTAJE (❌) — Fundamentalni gap

**Templates su Agent templates, NE Pipeline templates.**

Trenutni template sadrži: `{ name, systemPrompt, description, category, tags }`  
Šta treba: `{ agents[], webhookConfig, pipelineSteps[], triggerRules, repoUrl }`

```typescript
// Što postoji — agent template
{
  name: "DevSecOps Orchestrator",
  systemPrompt: "Master orchestrator...",
  category: "devsecops"
}

// Što treba — pipeline template (ne postoji)  
{
  name: "Next.js SDLC Pipeline",
  description: "Full CI pipeline za Next.js projekte",
  agents: [
    { role: "orchestrator", templateId: "devsecops-orchestrator" },
    { role: "code-gen", templateId: "code-gen-agent" }
  ],
  webhookConfig: {
    preset: "github-pr",
    eventFilters: ["pull_request"],
    asyncExecution: true,
    issueKeyTemplate: "github-{{repo_full_name}}-{{pr_number}}-{{action}}"
  },
  pipelineSteps: ["analyze", "generate", "test", "review"],
  defaultSettings: {
    requireApproval: true,
    useSmartRouting: true
  }
}
```

Bez ovoga, korisnik koji dođe prvi put mora:
1. Ručno kreirati orchestrator agenta
2. Ručno kreirati code gen agenta  
3. Ručno konfigurisati webhook
4. Ručno unijeti SDLC korake
5. Ručno povratiti GitHub webhook URL

**Prosječno: 15-20 minuta setup. Sa template: < 2 minute.**

---

## IMPLEMENTACIONI PLAN — LAYER 1

### Prioritizacija

```
Prioritet A (blocker) → mora biti gotovo da Layer 1 funkcioniše
Prioritet B (critical) → bez ovoga UX je neprihvatljiv  
Prioritet C (important) → znatno poboljšava iskustvo
```

---

### FAZA 1: Webhook → Pipeline Most (Prioritet A)

**Trajanje: ~2 dana implementacije**

#### 1A. Schema migracija — dodati `webhookExecutionId` na PipelineRun

```prisma
model PipelineRun {
  // ... postojeća polja ...
  
  /// ID WebhookExecution koji je pokrenuo ovaj run (null = ručno pokretanje)
  webhookExecutionId  String?
  webhookExecution    WebhookExecution? @relation(fields: [webhookExecutionId], references: [id])
  
  /// Provider koji je triggirao run (github, gitlab, slack, manual)
  triggerSource       String  @default("manual")
  /// Branch name iz webhook payloada (npr. "feature/auth-flow")
  triggerBranch       String?
  /// PR number iz webhook payloada (za GitHub/GitLab)
  triggerPrNumber     Int?
}
```

**Fajlovi:**
- `prisma/schema.prisma` — dodati 4 polja na PipelineRun
- `prisma/migrations/` — nova migracija

#### 1B. Nova ruta: `POST /api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]`

Ovo je srce Layer 1. Javni endpoint koji:
1. Verifikuje HMAC potpis (isti kao postojeći webhook sistem)
2. Parsira GitHub/GitLab PR payload
3. Provjerava idempotency (isti PR ne smije triggirati dva puta)
4. Poziva `createPipelineRun()` sa PR kontekstom
5. Vraća 202 odmah

```typescript
// src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts

export async function POST(request, { params }) {
  const { agentId, webhookId } = await params;
  
  // 1. Verifikuj HMAC (reuse existing verify.ts)
  const rawBody = await request.text();
  const verification = verifyWebhookSignature(rawBody, headers, secret);
  if (!verification.valid) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  
  // 2. Parsiraj payload
  const payload = JSON.parse(rawBody);
  const eventType = headers["x-github-event"] ?? headers["x-gitlab-event"];
  
  // Samo pull_request eventi
  if (eventType !== "pull_request") {
    return NextResponse.json({ skipped: true, reason: "Not a pull_request event" });
  }
  
  // Samo otvoreni/updated PRovi (ne closed/merged)
  if (!["opened", "synchronize", "reopened"].includes(payload.action)) {
    return NextResponse.json({ skipped: true, reason: `Action ${payload.action} not relevant` });
  }
  
  // Draft PRovi se preskačuju (konfigurabilan)
  if (payload.pull_request?.draft) {
    return NextResponse.json({ skipped: true, reason: "Draft PR skipped" });
  }
  
  // 3. Idempotency — isti PR + SHA ne smiju triggirati dva puta
  const idempotencyKey = `gh-pr-${payload.repository.full_name}-${payload.number}-${payload.pull_request.head.sha}`;
  const existing = await prisma.pipelineRun.findFirst({
    where: { webhookIdempotencyKey: idempotencyKey },
    select: { id: true, status: true }
  });
  if (existing) return NextResponse.json({ skipped: true, existingRunId: existing.id }, { status: 409 });
  
  // 4. Kreiraj pipeline run
  const taskDescription = buildTaskFromPR(payload); // "Review PR #42: feat: add auth flow (8 files changed)"
  
  const run = await createPipelineRun({
    taskDescription,
    agentId,
    repoUrl: payload.repository.html_url,
    webhookExecutionId: webhookExecId,
    triggerSource: "github",
    triggerBranch: payload.pull_request.head.ref,
    triggerPrNumber: payload.number,
  });
  
  await addPipelineRunJob({ pipelineRunId: run.id, agentId });
  
  return NextResponse.json({ success: true, pipelineRunId: run.id }, { status: 202 });
}
```

**Fajlovi koje treba kreirati/modificirati:**
- `src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts` — nova ruta
- `src/lib/sdlc/pipeline-manager.ts` — dodati `webhookExecutionId`, `triggerSource`, `triggerBranch`, `triggerPrNumber` u `createPipelineRun()`

#### 1C. GitLab PR Preset

```typescript
// src/lib/webhooks/presets.ts — dodati GITLAB_PR preset

const GITLAB_MR: WebhookPreset = {
  id: "gitlab-mr",
  name: "GitLab MR (DevSecOps)",
  icon: "🦊",
  description: "Merge request events za autonomni DevSecOps pipeline",
  bodyMappings: [
    { jsonPath: "$.object_attributes.action",     variableName: "action" },
    { jsonPath: "$.object_attributes.iid",         variableName: "mr_number" },
    { jsonPath: "$.object_attributes.title",       variableName: "mr_title" },
    { jsonPath: "$.object_attributes.url",         variableName: "mr_url" },
    { jsonPath: "$.object_attributes.source_branch", variableName: "head_branch" },
    { jsonPath: "$.object_attributes.target_branch", variableName: "base_branch" },
    { jsonPath: "$.object_attributes.last_commit.id", variableName: "head_sha" },
    { jsonPath: "$.project.web_url",              variableName: "repo_url" },
    { jsonPath: "$.project.path_with_namespace",  variableName: "repo_full_name" },
    { jsonPath: "$.user.username",                variableName: "mr_author" },
  ],
  headerMappings: [
    { headerName: "x-gitlab-event",     variableName: "gitlab_event" },
    { headerName: "x-gitlab-token",     variableName: "gitlab_token" },
  ],
  eventFilters: ["Merge Request Hook"],
  // ...
};
```

---

### FAZA 2: Pipeline Template Sistem (Prioritet A)

**Trajanje: ~3 dana implementacije**

#### 2A. PipelineTemplate model u Prisma schemi

```prisma
// Nova model — ne miješati sa postojećim Template (to je za agent export)
model PipelineTemplate {
  id          String   @id @default(cuid())
  slug        String   @unique  // "nextjs-sdlc", "fastapi-sdlc", "react-frontend"
  name        String
  description String?  @db.Text
  category    String   // "web", "backend", "mobile", "data"
  icon        String   // emoji
  
  /// Lista agent template slug-ova koje treba kreirati
  agentTemplates  Json  // [{ role: "orchestrator", templateSlug: "devsecops-orchestrator" }]
  
  /// Webhook konfiguracija koja se automatski kreira
  webhookPreset   String?  // "github-pr" | "gitlab-mr" | null
  webhookSettings Json     @default("{}")
  
  /// Podrazumijevane pipeline postavke
  pipelineDefaults Json  // { requireApproval, useSmartRouting, steps[] }
  
  /// Uputstvo za setup (Markdown)
  setupGuide  String?  @db.Text
  
  isBuiltIn   Boolean  @default(false)
  usageCount  Int      @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([category])
  @@index([isBuiltIn])
}
```

#### 2B. Ugrađeni Pipeline Templates (seed data)

```typescript
// prisma/seed-pipeline-templates.ts

export const BUILTIN_PIPELINE_TEMPLATES = [
  {
    slug: "nextjs-sdlc-github",
    name: "Next.js SDLC Pipeline (GitHub)",
    description: "Potpuni CI pipeline za Next.js projekte. Automatski se pokreće na svaki GitHub PR — analizira kod, generiše testove, radi security scan i ostavlja review komentar.",
    category: "web",
    icon: "⚡",
    agentTemplates: [
      { role: "orchestrator", templateSlug: "devsecops-orchestrator" },
      { role: "code-gen", templateSlug: "code-quality-analyzer" },
      { role: "security", templateSlug: "security-scanner" },
      { role: "test", templateSlug: "test-intelligence-agent" },
      { role: "reviewer", templateSlug: "pr-review-publisher" },
    ],
    webhookPreset: "github-pr",
    webhookSettings: {
      asyncExecution: true,
      eventFilters: ["pull_request"],
      issueKeyTemplate: "github-{{repo_full_name}}-{{pr_number}}-{{head_sha}}",
    },
    pipelineDefaults: {
      requireApproval: false,
      useSmartRouting: true,
      skipDraftPRs: true,
    },
    setupGuide: `
## Setup (3 koraka, < 2 minute)

### Korak 1: Kopiraj Webhook URL
Nakon kreiranja pipeline-a, dobit ćeš jedinstveni webhook URL u formatu:
\`https://your-app.railway.app/api/agents/[id]/pipelines/webhook-trigger/[webhookId]\`

### Korak 2: Podesi GitHub Webhook
1. Idi na GitHub repo → Settings → Webhooks → Add webhook
2. **Payload URL**: Zalijepi tvoj webhook URL
3. **Content type**: application/json
4. **Secret**: Zalijepi secret koji ti je prikazan
5. **Events**: Odaberi "Pull requests"

### Korak 3: Test
Otvori test PR u svom repou. Za 30 sekundi trebao bi vidjeti pipeline run u Agent Studio.
    `,
    isBuiltIn: true,
  },
  {
    slug: "nextjs-sdlc-gitlab",
    name: "Next.js SDLC Pipeline (GitLab)",
    description: "Isti pipeline kao GitHub verzija, ali za GitLab Merge Requests.",
    category: "web",
    icon: "🦊",
    webhookPreset: "gitlab-mr",
    // ...
  },
  {
    slug: "pr-review-only",
    name: "PR Code Review (samo review)",
    description: "Lagani pipeline koji samo radi code review bez generisanja koda ili testova. Idealno za timove koji žele AI code review bez punog CI.",
    category: "review",
    icon: "👁️",
    agentTemplates: [
      { role: "reviewer", templateSlug: "code-quality-analyzer" },
    ],
    pipelineDefaults: {
      requireApproval: false,
      useSmartRouting: false,
    },
    isBuiltIn: true,
  },
  {
    slug: "security-scan-only",
    name: "Security Scan Pipeline",
    description: "Automatski security scan na svaki PR. OWASP Top 10, CVE detekcija, secret leakage.",
    category: "security",
    icon: "🔐",
    agentTemplates: [
      { role: "security", templateSlug: "security-scanner" },
    ],
    isBuiltIn: true,
  },
  {
    slug: "manual-sdlc",
    name: "Manual SDLC (bez webhook-a)",
    description: "Ručno pokreni SDLC pipeline. Bez GitHub integracije — idealno za testiranje ili ad-hoc taskove.",
    category: "manual",
    icon: "🎮",
    agentTemplates: [
      { role: "orchestrator", templateSlug: "devsecops-orchestrator" },
      { role: "code-gen", templateSlug: "code-quality-analyzer" },
    ],
    webhookPreset: null,
    pipelineDefaults: {
      requireApproval: true,
      useSmartRouting: true,
    },
    isBuiltIn: true,
  },
];
```

#### 2C. Pipeline Template API

```
GET  /api/pipeline-templates              — lista builtin + org templates
GET  /api/pipeline-templates/[slug]       — detalji + setup guide
POST /api/pipeline-templates/[slug]/deploy — one-click deploy
```

`POST /api/pipeline-templates/[slug]/deploy`:
1. Kreira sve potrebne agente (iz `agentTemplates[]`)
2. Kreira WebhookConfig (iz `webhookPreset`)
3. Generuje secret i vraća ga korisniku JEDANPUT
4. Vraća: `{ agents[], webhookUrl, webhookSecret, setupGuide }`

---

### FAZA 3: Setup Wizard UI (Prioritet B)

**Trajanje: ~2 dana implementacije**

#### 3A. "Novi Pipeline" flow (umjesto prazne stranice)

Kada korisnik dođe na `/pipelines`, umjesto prazne tabele:

```
┌─────────────────────────────────────────────────────────┐
│  Kako želiš da pokreneš pipeline?                       │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │  ⚡ GitHub PR       │  │  🎮 Ručno               │  │
│  │  Auto-trigger na   │  │  Unesi task opis        │  │
│  │  svaki Pull Request│  │  i pokreni odmah        │  │
│  │  [Preporučeno]     │  │                         │  │
│  └─────────────────────┘  └─────────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │  🦊 GitLab MR       │  │  ⏰ Scheduled           │  │
│  │  Merge Request      │  │  Cron trigger          │  │
│  │  integracija        │  │                         │  │
│  └─────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### 3B. GitHub Connect Wizard (3-step dialog)

```
Step 1/3 — Odaberi template
  [Next.js SDLC] [FastAPI] [PR Review Only] [Security Scan] ...

Step 2/3 — Konekcija (automatski se radi deploy)
  Pipeline je kreiran! Evo tvojih kredencijala:
  
  Webhook URL:
  [https://app.railway.app/api/agents/abc/pipelines/webhook-trigger/xyz] [Copy]
  
  Webhook Secret:
  [whsec_xxxxxxxxxxxxxxxxxx] [Copy] ← prikazan SAMO jednom
  
  Instrukcije:
  1. Idi na GitHub repo → Settings → Webhooks
  2. Add webhook → zalijepi URL i secret
  3. Odaberi "Pull requests" events

Step 3/3 — Test konekcije
  [Pošalji test event] → Čekamo potvrdu od GitHub-a...
  ✅ Webhook primljen! Pipeline je spreman.
```

#### 3C. Pipeline Dashboard poboljšanja

Na stranici `/pipelines/[agentId]` dodati:

```
┌──────────────────────────────────────────────────────────┐
│ 🐙 GitHub konekcija: AKTIVNA                            │
│ Repo: octocat/Hello-World  |  Zadnji PR: #42 (2m ago)  │
│ [Webhook settings] [Promijeni repo]                     │
└──────────────────────────────────────────────────────────┘
```

Polje za prikaz source-a za svaki pipeline run:
```
[⚡ PR #42] feat: add auth flow — COMPLETED — 3m 12s
[🎮 Manual] Fix login bug — FAILED — 1m 05s  
[⚡ PR #41] refactor: clean up API — RUNNING...
```

---

### FAZA 4: Finalizacija i Testiranje (Prioritet C)

**Trajanje: ~1 dan**

#### 4A. PR Label Filter

Opcija u webhook konfiguraciji da se filtriraju PR-ovi po label-ama:
```typescript
// U webhook-trigger/route.ts
const allowedLabels = webhookConfig.prLabelFilter as string[]; // npr. ["ready-for-review", "ci-run"]
if (allowedLabels.length > 0) {
  const prLabels = payload.pull_request.labels.map(l => l.name);
  const hasAllowedLabel = allowedLabels.some(l => prLabels.includes(l));
  if (!hasAllowedLabel) return skip("PR nema dozvoljeni label");
}
```

#### 4B. Notifikacije

Kad pipeline završi (COMPLETED ili FAILED), opciono poslati:
- GitHub commit status (`success`/`failure` check na PR commit-u)
- Webhook callback na konfigurisani URL
- (Buduće: Slack/email)

GitHub commit status API:
```typescript
// Dodati u git-integration.ts
async function setCommitStatus(owner, repo, sha, state, description, token) {
  await fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, description, context: "agent-studio/sdlc" })
  });
}
```

---

## PREGLED FAJLOVA ZA IZMJENU

### Novi fajlovi (kreirati)

```
src/app/api/agents/[agentId]/pipelines/webhook-trigger/
  └── [webhookId]/route.ts                          ← SRCE Layer 1

src/app/api/pipeline-templates/
  ├── route.ts                                      ← GET lista
  └── [slug]/
      ├── route.ts                                  ← GET detalji
      └── deploy/route.ts                          ← POST one-click deploy

src/components/pipelines/
  ├── pipeline-template-gallery.tsx                 ← Template odabir UI
  ├── github-connect-wizard.tsx                     ← 3-step wizard
  └── webhook-status-banner.tsx                     ← Status banner

prisma/seed-pipeline-templates.ts                   ← Seed script za builtin templates
```

### Modificirati (postojeći fajlovi)

```
prisma/schema.prisma
  + webhookExecutionId, triggerSource, triggerBranch, triggerPrNumber na PipelineRun
  + PipelineTemplate model (novi)

src/lib/sdlc/pipeline-manager.ts
  + webhookExecutionId, triggerSource, triggerBranch, triggerPrNumber u createPipelineRun()

src/lib/webhooks/presets.ts
  + GITLAB_MR preset

src/lib/sdlc/git-integration.ts
  + setCommitStatus() funkcija

src/app/(dashboard)/pipelines/[agentId]/page.tsx
  + Trigger source badge na svakom runu
  + Webhook status banner
  + "Novi pipeline" wizard umjesto praznog stanja
```

---

## PRIORITIZOVANI REDOSLJED IMPLEMENTACIJE

```
Dan 1:
  ✦ prisma/schema.prisma — schema promjene + migracija
  ✦ pipeline-manager.ts — novi parametri u createPipelineRun()
  ✦ webhook-trigger/route.ts — novi public endpoint

Dan 2:  
  ✦ presets.ts — GITLAB_MR preset
  ✦ pipeline-template sistem (schema + API + seed data)
  ✦ tsc --noEmit + vitest + commit

Dan 3:
  ✦ github-connect-wizard.tsx — UI wizard
  ✦ webhook-status-banner.tsx — status banner
  ✦ pipeline-template-gallery.tsx — template odabir

Dan 4:
  ✦ git-integration.ts — GitHub commit status
  ✦ PR label filter opcija
  ✦ End-to-end test (otvori PR → provjeri pipeline)
  ✦ Commit + push

Dan 5 (buffer):
  ✦ Bug fix i polish
  ✦ Dokumentacija za korisnika (setup guide)
```

---

## RIZICI I MITIGACIJA

| Rizik | Vjerovatnoća | Impact | Mitigacija |
|-------|-------------|--------|------------|
| Railway nema javni IP za GitHub webhooks | Niska | Visok | Railway ima javni URL — radi po default-u |
| HMAC verifikacija pukne kod GitLab-a | Srednja | Visok | GitLab koristi `X-Gitlab-Token` header (ne HMAC) — poseban flow |
| Duplikat pipeline run-ovi za brze PR updateove | Srednja | Srednji | Issue-level idempotency (`issueKeyTemplate`) već postoji |
| GitHub rate limit na commit status API | Niska | Nizak | Commit status je fire-and-forget, failure se loguje ali ne blokira |
| Korisnik izgubi webhook secret | Visoka | Srednji | Prikazati JEDNOM pri kreiranju, omogućiti rotate secret akciju |

---

## ZAKLJUČAK

Layer 1 nije "build from scratch" projekt. To je **3 kritična mosta**:

1. **Most 1**: Webhook → Pipeline Run (1 nova ruta, 2 promjene u existing kodu)
2. **Most 2**: Pipeline Templates (novi model + API + 5 builtin templates)  
3. **Most 3**: Setup Wizard UI (3 nove komponente)

Sa ovim mostovima, Agent Studio prelazi iz **"alat koji treba tehničko znanje"** u **"platform koji se postavi za 2 minute"** — što je preduslov za sva 3 sloja i ozbiljan product-market fit.
