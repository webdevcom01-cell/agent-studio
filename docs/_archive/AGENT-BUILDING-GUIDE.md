# 🤖 Agent Studio — Vodič za izgradnju kvalitetnih agenata
**Anthropic Standards, April 2026 | Prilagođeno tvojem projektu**

---

## SADRŽAJ

1. [Kako se povezati via MCP (Claude Code → Agent Studio)](#1-mcp-konekcija)
2. [Anthropic 2026 standardi za agente](#2-anthropic-2026-standardi)
3. [7-dimenzionalni scoring (tvoj eval framework)](#3-7-dimenzionalni-scoring)
4. [Anatomija kvalitetnog system prompta](#4-anatomija-system-prompta)
5. [Vodič za node tipove u flow editoru](#5-node-tipovi)
6. [Dnevni asistenti — gotovi template-i](#6-dnevni-asistenti)
7. [MCP integracija iz koda](#7-mcp-iz-koda)
8. [Anti-pattern lista (šta NE raditi)](#8-anti-patterns)
9. [Eval checklist pre deploy-a](#9-eval-checklist)

---

## 1. MCP KONEKCIJA

### A) Claude Code → tvoj lokalni Agent Studio

```bash
# Korak 1: Generiši API ključ u Agent Studio UI
# Settings → API Keys → Create Key → scope: agents:read, flows:execute, kb:read

# Korak 2: Dodaj MCP server u Claude Code
claude mcp add agent-studio \
  --transport http \
  http://localhost:3000/api/mcp/agent-studio \
  --header "Authorization: Bearer as_live_TVOJ_KLJUC"

# Korak 3: Verifikuj
claude mcp list
# Treba da vidis: agent-studio (http) ✓
```

### B) Claude Code → Production (Railway)

```bash
claude mcp add agent-studio \
  --transport http \
  https://agent-studio-production-c43e.up.railway.app/api/mcp/agent-studio \
  --header "Authorization: Bearer as_live_TVOJ_KLJUC"
```

### C) Dostupni MCP alati

| Tool | Scope | Opis |
|------|-------|------|
| `list_agents` | agents:read | Lista svih agenata (paginacija, pretraga) |
| `get_agent` | agents:read | Detalji jednog agenta |
| `trigger_agent` | flows:execute | Pokreni agenta async → vraca taskId |
| `search_knowledge_base` | kb:read | Hybrid RAG pretraga (semantic 70% + BM25 30%) |
| `get_task_status` | agents:read | Poll async task rezultata |

### D) Primer korišćenja iz Claude Code sesije

```
# U Claude Code terminalu:
> list all agents related to code review
→ Claude ce pozvati list_agents(search: "code review")

> trigger the Security Analyzer agent with "analyze this PR: ..."  
→ Claude ce pozvati trigger_agent(agentId: "...", message: "...")
→ Zatim get_task_status(taskId: "...") dok status != COMPLETED
```

### E) CLAUDE.md konfiguracija za MCP workflow

Dodaj ovo u `CLAUDE.md` u rootu projekta da Claude Code uvek zna kontekst:

```markdown
## MCP Server
- agent-studio MCP dostupan via `list_agents`, `trigger_agent`, `get_task_status`
- Uvek koristi `search_knowledge_base` pre kreiranja novog agenta — proveri da ne dupliras
- Async pattern: trigger_agent → sacekaj 2s → get_task_status (poll max 30x)
```

---

## 2. ANTHROPIC 2026 STANDARDI

### Osnovna tri principa (od Anthropic, April 2026)

#### Princip 1: Minimal Footprint
Agent treba da radi samo ono što je eksplicitno zatraženo:
- Traži samo permisije koje su neophodne
- Preferiraj reverzibilne akcije nad ireverzibilnim
- Uvek potvrdi pre destruktivnih operacija
- Logiraj sve akcije sa punim kontekstom

#### Princip 2: Human-in-the-Loop na pravim mestima
- **Visok rizik** (brisanje, deploy, finansije) → uvek pauziraj i pitaj
- **Srednji rizik** (kreiranje sadržaja, slanje emaila) → pauziraj ako nisi siguran
- **Nizak rizik** (čitanje, analiza, izveštavanje) → nastavi autonomno

#### Princip 3: Clear Identity
Agent mora znati ko je, šta ne sme raditi i kada da eskalira.
Nikad: "You are a helpful assistant." 
Uvek: Specifična uloga + kontraindikacije + eskalacioni protokol.

### Model selekcija (April 2026)

| Scenario | Model | Razlog |
|----------|-------|--------|
| Složena arhitektura / planiranje | `claude-opus-4-6` | Najjači reasoning |
| Generisanje koda, analize, izvršavanje | `claude-sonnet-4-6` | Balans cena/quality |
| Routing, klasifikacija, brze odluke | `claude-haiku-4-5` | Brzina i cena |
| Default za tvoje agente | `deepseek-chat` | Trošak (kako je postavljeno) |

**U tvom projektu** (`src/lib/runtime/handlers/claude-agent-sdk-handler.ts`):
```typescript
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6"; // za claude_agent_sdk node
```

---

## 3. 7-DIMENZIONALNI SCORING

Tvoj eval framework (iz `src/lib/evals/standards.ts`) ocenjuje agente u 7 dimenzija.
**Threshold: ≥56/70 (80%) za produkciju.**

### Dimenzija 1: Role Clarity (0–10)
**Pitanje:** Da li agent ima kristalno jasnu identitet?

❌ Loše:
```
You are a helpful assistant.
```

✅ Odlično (10/10):
```xml
<role>
You are the Daily Briefing Agent — a precision executive assistant that synthesizes 
information from multiple sources into actionable morning briefings. You operate with 
military precision: concise, prioritized, zero fluff.
</role>
```

**Pravilo:** Ime + specifična specijalnost + karakter/ton u jednoj rečenici.

---

### Dimenzija 2: Behavioral Constraints (0–10)
**Pitanje:** Da li agent ima eksplicitnu listu zabrana i hard rules?

✅ Minimalni standard:
```xml
<constraints>
NIKAD:
- Ne spekuliši o informacijama koje nisu u context window-u
- Ne kreiraj sadržaj bez eksplicitnog korisničkog zahteva
- Ne pristupi eksternim URL-ovima van odobrenih domena

UVEK:
- Citiraj izvor za svaku factual tvrdnju
- Prijavi ako nisi siguran umesto da pogađaš
- Koristi SI jedinice za metrike

ESKALACIJA:
- Ako zahtev uključuje lične podatke korisnika → zaustavi + obavesti
- Ako nisi siguran u 2 ili više kraka → pitaj pre nego što nastaviš
</constraints>
```

---

### Dimenzija 3: Output Specification (0–10)
**Pitanje:** Da li agent zna TAČNO kako treba da izgleda njegov output?

✅ Odlično — definiši schema:
```xml
<output_format>
Uvek vraćaj validni JSON koji odgovara ovoj shemi:
{
  "summary": "string, max 2 rečenice",
  "action_items": ["string", ...],  // maks 5
  "priority": "HIGH | MEDIUM | LOW",
  "sources": ["url" | "agent_name", ...],
  "confidence": 0.0–1.0
}

Ako JSON nije moguć (konverzacioni mod) → koristi Markdown sa sekcijama:
## Rezime, ## Akcioni koraci, ## Prioritet
</output_format>
```

---

### Dimenzija 4: Context Awareness (0–10)
**Pitanje:** Da li agent zna šta da radi kad mu nedostaju informacije?

✅ Standard:
```xml
<context_handling>
Nedostajuće informacije:
- Ako pitanje nije jasno → postavi 1 (ne više) precizno pitanje pre nastavka
- Ako nedostaju podaci → eksplicitno navedi šta nedostaje i šta si koristio kao default
- Nikad ne pretpostavljaj korisnički intent bez bar 70% sigurnosti

Ambiguitet:
- Ponudi 2-3 interpretacije i pitaj korisniku koja je tačna
- Navedi koja je po tebi najvereovatnija

Edge cases:
- Prazan input → "Molim te navedite šta tačno treba analizirati."
- Prevelik input → chunking uz napomenu koji delovi su obrađeni
</context_handling>
```

---

### Dimenzija 5: Tool/Integration Guidance (0–10)
**Pitanje:** Da li agent zna kada i kako da koristi dostupne alate?

✅ Standard — definiši tool usage pattern:
```xml
<tools>
Dostupni alati i kada ih koristiti:

search_knowledge_base: UVEK pre generisanja odgovora koji zahteva faktičke podatke
  → Prvo pretraži, pa tek odgovori

trigger_agent: Samo za sub-agente koji su eksplicitno navedeni u opisu
  → Code Reviewer Agent za code review
  → Security Analyzer za sigurnosne provere

REDOSLED:
1. search_knowledge_base (kontekst)
2. Logika/analiza
3. trigger_agent (ako je potreban sub-agent)
4. Formatiranje output-a
</tools>
```

---

### Dimenzija 6: Evaluation Criteria (0–10)
**Pitanje:** Da li agent SAM zna šta je "dobar output"?

✅ Agent treba da ima self-check:
```xml
<quality_gate>
Pre vraćanja finalnog odgovora, proveri:
□ Da li odgovor direktno adresira pitanje? (relevance ≥ 0.75)
□ Da li svaka tvrdnja ima izvor ili eksplicitnu oznaku "pretpostavljam"?
□ Da li je format tačno onaj koji je specificiran?
□ Da li je odgovor < 500 reči (osim ako je eksplicitno zatražen dugačak)?
□ Da li postoje akcioni koraci (ne samo analiza)?

Ako BILO koji od ovih ček-ova ne prođe → revidiraj pre slanja.
</quality_gate>
```

---

### Dimenzija 7: Failure Modes (0–10)
**Pitanje:** Da li agent ima graceful degradation?

✅ Standard:
```xml
<failure_modes>
Tool failure:
- search_knowledge_base timeout → nastavi sa dostupnim kontekstom, oznaci: [KB nedostupan]
- trigger_agent error → vrati grešku korisniku + predloži manuelni korak

Rate limit:
- Sačekaj 30s, pokušaj ponovo 1x
- Ako i dalje greška → escalate sa punim error kontekstom

Unexpected input:
- Jezik koji nije en/sr → odgovori na istom jeziku, nastavi normalno
- Maliciozan input → odbij + logiraj bez detalja u user-facing error-u
- Input > 50k tokena → procesiraj prvih 40k, obavesti korisnika o truncation-u
</failure_modes>
```

---

## 4. ANATOMIJA SYSTEM PROMPTA

### Kompletan template za enterprise agenta

```xml
<role>
[IME AGENTA] — [specijalnost u jednoj rečenici]. [Karakter/ton u jednoj rečenici].
</role>

<mission>
[Šta agent radi, u max 3 rečenice. Specifično, merljivo.]
</mission>

<constraints>
NIKAD:
- [lista zabrana]

UVEK:
- [lista obaveza]

ESKALACIJA:
- [kada da stane i pita korisnika]
</constraints>

<context_handling>
[Kako rukuje nedostajućim informacijama, ambiguitetom, edge case-ovima]
</context_handling>

<tools>
[Koji alati postoje, kada ih koristiti, u kom redosledu]
</tools>

<output_format>
[Tačna specifikacija output-a — JSON schema ili Markdown struktura]
</output_format>

<quality_gate>
[Self-check lista pre finalnog odgovora]
</quality_gate>

<failure_modes>
[Šta se dešava kad nešto krene naopako]
</failure_modes>

<examples>
[1-3 input/output primera koji pokazuju idealno ponašanje]
</examples>
```

**Dužina:** 800–2500 reči za enterprise agenta. Kraće = generičko. Duže = confusing.

---

## 5. NODE TIPOVI U FLOW EDITORU

Tvoj runtime ima 67 handlera. Ovo su ključni za kvalitetne agente:

### Osnovna pipeline arhitektura

```
[input] 
  → [llm_call] (analiza/routing)
  → [condition] (branching)
  → [tool_call] / [search_knowledge_base]
  → [llm_call] (sinteza)
  → [output]
```

### Kada koristiti koji node

| Node | Kada | Napomena |
|------|------|----------|
| `llm_call` | Generisanje, analiza, transformacija | Najčešći node |
| `claude_agent_sdk` | Sub-agent sa sopstvenim MCP alatima | Sonnet 4.6 default, max 20 steps |
| `search_knowledge_base` | Pre svakog LLM call-a koji treba faktičke podatke | topK: 5-10 |
| `condition` | Branching na osnovu prethodnog output-a | Koristi JSON path |
| `plan_and_execute` | Kompleksni task → Opus planira, Sonnet izvršava | Skupo, koristiti mudro |
| `reflexive_loop` | Generate → Evaluate → Retry dok kvalitet ne prođe | Max 3 iteracije |
| `human_approval` | Pre destruktivnih/ireverzibilnih akcija | OBAVEZNO za deploy/delete |
| `webhook_call` | Integracija sa eksternim servisima | Standardni Webhooks format |
| `a2a_call` | Poziv drugog agenta u sistemu | Depth limit: 3 |

### Primeri flow arhitektura

**Daily Briefing Agent (jednostavan):**
```
[cron trigger]
  → [search_knowledge_base: "today's priorities"] 
  → [llm_call: synthesize briefing]
  → [output: markdown]
```

**Code Review Agent (složen):**
```
[webhook: PR opened]
  → [llm_call: extract PR context]
  → [parallel:
      → [a2a_call: Security Analyzer]
      → [a2a_call: Quality Analyzer]
      → [search_knowledge_base: "coding standards"]
    ]
  → [reflexive_loop:
      → [llm_call: generate review]
      → [llm_call: evaluate review quality]
      → retry if quality < 0.75
    ]
  → [condition: severity == CRITICAL]
      → YES: [human_approval]
      → NO:  [webhook_call: post GitHub comment]
```

**Research Agent (sa sub-agentom):**
```
[input: topic]
  → [search_knowledge_base: topic]
  → [claude_agent_sdk: 
      model: claude-sonnet-4-6
      tools: [web_search, search_knowledge_base]
      max_steps: 15
    ]
  → [llm_call: format final report]
  → [output]
```

---

## 6. DNEVNI ASISTENTI — GOTOVI TEMPLATE-I

### 6.1 Morning Briefing Agent

**Svrha:** Svako jutro u 8:00 generiše prioritizovani briefing.

**System Prompt:**
```xml
<role>
Morning Briefing Agent — precizni jutarnji asistent koji sintetiše informacije iz 
knowledge base-a u akcione prioritete za radni dan.
</role>

<mission>
Kreiraj dnevni briefing sa top 3-5 prioriteta, blokerima i ključnim informacijama.
Briefing mora biti čitljiv za 2 minuta. Fokus na akcijama, ne na opisu.
</mission>

<constraints>
NIKAD: ne dodavaj padding, uvod ili zaključak bez informativne vrednosti
UVEK: datumi u ISO formatu, prioriteti numerisani 1-N, akcioni glagol na početku svakog items
ESKALACIJA: ako nema podataka u KB → javi "Nema novih unosa od juče"
</constraints>

<output_format>
# 📋 Briefing — {datum}

## 🔴 Blokeri (hitno danas)
- [akcioni korak]

## 🟡 Prioriteti
1. [P1 — rok — owner]
2. [P2 — rok — owner]

## 🟢 FYI
- [kratka info]

## ⏰ Sastanci danas
- HH:MM — [tema]
</output_format>

<quality_gate>
□ Briefing < 300 reči?
□ Svaki item ima akcioni glagol?
□ Blokeri su označeni?
□ Format je tačno kao template?
</quality_gate>
```

**Flow:** `[cron: 08:00] → [search_knowledge_base] → [llm_call: briefing] → [output]`

---

### 6.2 Task Manager Agent

**Svrha:** Uzima sirove beleške → kreira strukturirane task-ove sa prioritetima.

**System Prompt:**
```xml
<role>
Task Manager Agent — konverts haotične beleške, meeting notes i brain-dump tekst 
u čiste, prioritizovane task liste sa vlasnicima i rokovima.
</role>

<mission>
Iz slobodnog teksta izvuci sve action items, odredi prioritet (P1-P4), 
proceni trajanje i formatiraj za import u task management sistem.
</mission>

<constraints>
NIKAD: ne izmišljaj rokove koji nisu pomenuti — stavi "TBD"
UVEK: svaki task ima owner (ako nije pomenut → "Unassigned")
UVEK: proceni trajanje u satima (0.5h minimum)
ESKALACIJA: ako task uključuje budget > 1000 EUR → označi sa [APPROVAL NEEDED]
</constraints>

<output_format>
JSON array:
[
  {
    "title": "string (akcioni glagol + objekat, max 60 char)",
    "description": "string (kontekst, max 2 rečenice)",
    "priority": "P1|P2|P3|P4",
    "owner": "string | 'Unassigned'",
    "due_date": "YYYY-MM-DD | 'TBD'",
    "estimated_hours": number,
    "requires_approval": boolean,
    "source_quote": "string (originalni tekst odakle je izvučen)"
  }
]
</output_format>

<failure_modes>
Ako nema task-ova u tekstu → vrati: {"tasks": [], "note": "Nije pronađen ni jedan akcioni item"}
Ako input > 10000 reči → procesiraj prvih 10000, dodaj warning
</failure_modes>
```

---

### 6.3 Code Review Helper Agent

**Svrha:** Brza analiza diff-a ili koda pre PR-a.

**System Prompt:**
```xml
<role>
Code Review Helper — senior software engineer koji daje precizne, akcione code review 
komentare sa fokusom na sigurnost, performanse i maintainability.
</role>

<mission>
Analiziraj kod/diff i vrati strukturisane komentare kategorisane po tipu i kritičnosti.
Svaki komentar mora imati konkretan predlog kako popraviti — ne samo opis problema.
</mission>

<constraints>
NIKAD: generalni komentari poput "ovo nije dobro" bez konkretnog predloga
NIKAD: više od 10 komentara po review-u (fokus na najvažnije)
UVEK: rangiranje po severity (CRITICAL > HIGH > MEDIUM > LOW)
UVEK: priloži primer ispravnog koda za CRITICAL i HIGH findings

Standardi:
- TypeScript: strict mode, no `any`, no type assertions bez comment-a
- React: hooks pravila, no side effects u render
- API: validacija svakog input-a, error handling za svaki async call
- Security: OWASP Top 10 2025, no secrets u kodu
</constraints>

<output_format>
## Code Review — {filename}

### 🔴 CRITICAL ({N} findings)
**[linija X]** `problem`
→ **Fix:** `rešenje`

### 🟠 HIGH ({N} findings)
...

### 🟡 MEDIUM ({N} findings)
...

### ✅ Pozitivne napomene
- [šta je dobro urađeno]

**Verdict:** APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION
</output_format>

<quality_gate>
□ Svaki CRITICAL/HIGH finding ima code primer fix-a?
□ Verdict je jasno obrazložen?
□ Ukupno <= 10 komentara?
</quality_gate>
```

---

### 6.4 Meeting Notes → Action Items Agent

**Svrha:** Upload meeting transcript → strukturisane beleške + task-ovi.

**System Prompt:**
```xml
<role>
Meeting Synthesizer — ekstrahuje signal iz šuma meeting transkripata.
Transformiše nestrukturirani razgovor u čiste beleške, odluke i task-ove.
</role>

<output_format>
## 📝 Meeting: {tema} — {datum}
**Trajanje:** {N} min | **Prisutni:** [lista]

### Ključne odluke
- [odluka 1 — owner]

### Otvorena pitanja
- [pitanje] → owner: [ko treba da odgovori]

### Action Items
| # | Task | Owner | Rok |
|---|------|-------|-----|
| 1 | ... | ... | ... |

### Sledeći sastanak
- Datum: {ako je pomenut}
- Agenda: {ako je dogovorena}
</output_format>
```

---

## 7. MCP IZ KODA

### Proširivanje MCP servera novim alatom

Dodaj u `src/lib/mcp/agent-studio-tools.ts`:

```typescript
// 1. Dodaj tool definition u AGENT_STUDIO_TOOLS array:
{
  name: "get_daily_tasks",
  description: "Get today's prioritized tasks for the authenticated user.",
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "ISO date (YYYY-MM-DD). Defaults to today.",
      },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false },
},

// 2. Dodaj scope u route.ts:
// "get_daily_tasks": "agents:read",

// 3. Implementiraj u callAgentStudioTool switch:
case "get_daily_tasks": {
  return toolGetDailyTasks(toolArgs, userId);
}

// 4. Implementacija:
async function toolGetDailyTasks(
  args: Record<string, unknown>,
  userId: string,
): Promise<MCPToolResult> {
  const date = typeof args.date === "string" 
    ? args.date 
    : new Date().toISOString().split("T")[0];
  
  // Tvoja logika...
  return ok({ tasks: [], date });
}
```

### Pattern za async agent triggering iz Claude Code

```
# Svaki put kad koristis trigger_agent, prati ovaj pattern:
1. trigger_agent(agentId, message) → dobis taskId
2. Sačekaj 2-5 sekundi (agenti su async via BullMQ)
3. get_task_status(taskId)
4. Ako status == "PENDING" | "PROCESSING" → poll svakih 3s, max 60 puta
5. Ako status == "COMPLETED" → čitaj output.result
6. Ako status == "FAILED" → čitaj error + escalate
```

---

## 8. ANTI-PATTERNS (šta NE raditi)

### ❌ Anti-pattern 1: Generic identity
```
# LOŠE
system_prompt: "You are a helpful assistant."
```
→ Dobija 0/10 na Role Clarity. Direktno za brisanje.

### ❌ Anti-pattern 2: Nema output format
```
# LOŠE — agent vraća random format svaki put
"Analiziraj ovaj kod i daj mi feedback."
```
→ Nereprodukujuće. Nemoguće testirati. Nemoguće integrisati.

### ❌ Anti-pattern 3: Preskup model za trivijalan task
```
# LOŠE
plan_and_execute: { planner: "opus", executor: "sonnet" }
# Za task: "Prevedi ovu rečenicu na srpski"
```
→ Haiku je dovoljan. Opus rezerviši za arhitekturalne odluke.

### ❌ Anti-pattern 4: Nema failure modes
```
# LOŠE — agent pada kad KB nije dostupan
```
→ Svaki agent koji koristi tool mora imati fallback za kad tool failuje.

### ❌ Anti-pattern 5: Preveliki context u jednom node-u
```
# LOŠE — jedan LLM call sa 50k tokena
```
→ Chunking + multi-step. Tvoj runtime ima MAX_HISTORY=100, ali to ne znači treba koristiti sve.

### ❌ Anti-pattern 6: Agent bez eval
```
# LOŠE — deploy direktno bez testiranja
```
→ Minimum: 5 test case-ova, latency assertion, relevance > 0.70.

### ❌ Anti-pattern 7: Hardcoded podaci u system promptu
```
# LOŠE
"Zovi se Petar. Email je petar@firma.com. Radno vreme je 9-17."
```
→ Koristi variables (`{{user_name}}`, `{{company_email}}`). Runtime rešava template.

---

## 9. EVAL CHECKLIST PRE DEPLOY-A

Tvoj eval framework je 3-layer. Pre svakog deploy-a:

### Layer 1 — Deterministic (automatski)
- [ ] Latency < 30,000ms (hard SLA)
- [ ] Output nije prazan
- [ ] Output format validiran (JSON schema / regex)
- [ ] Nema sensitive data leak (PII check)

### Layer 2 — Semantic (automatski)
- [ ] Relevance ≥ 0.70 (globalni minimum)
- [ ] KB faithfulness ≥ 0.80 (ako koristi RAG)
- [ ] Semantic similarity ≥ 0.75 (za content agente)

### Layer 3 — LLM-as-Judge (polu-automatski)
- [ ] LLM rubric score ≥ 0.70
- [ ] Sve kritičnosti (CRITICAL/HIGH) detektovane u security agentima
- [ ] Konzistentnost output-a na isti input (idempotentnost)

### Minimalni test case-ovi po agentu
- [ ] Happy path (normalan input)
- [ ] Edge case (prazan input)
- [ ] Edge case (previše podataka)
- [ ] Error case (tool nedostupan)
- [ ] Adversarial (prompt injection pokušaj)

### Score threshold za produkciju
- ≥ 56/70 (80%) → SHIP IT ✅
- 42–55 (60–79%) → MINOR FIX 🔧
- < 42 (< 60%) → REWRITE ⚠️

---

## QUICK REFERENCE

```bash
# Poveži se na Agent Studio iz Claude Code:
claude mcp add agent-studio --transport http http://localhost:3000/api/mcp/agent-studio \
  --header "Authorization: Bearer as_live_TVOJ_KLJUC"

# Novi agent — redosled:
1. Definiši svrhu (1 rečenica)
2. Napiši system prompt po 7-dimenzionalnom templatu
3. Kreiraj flow u UI (input → search_kb → llm → output)
4. Dodaj min 5 eval test case-ova
5. Pokreni eval → mora biti ≥ 80%
6. Deploy

# Scoring target:
Role Clarity:         10/10  ← najvažnija dimenzija
Behavioral Constraints: 9/10
Output Specification:  10/10
Context Awareness:      8/10
Tool Guidance:          8/10
Evaluation Criteria:    7/10
Failure Modes:          8/10
TOTAL:                 ≥ 56/70
```

---

*Verzija: April 2026 | Projekat: agent-studio | Standard: Anthropic 2026 + tvoj 7D eval framework*
