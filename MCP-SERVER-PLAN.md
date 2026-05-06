# Agent Studio MCP Server — Razvojni Plan
**Verzija:** 1.0 | **Datum:** 2026-05-02 | **Status:** Draft

---

## 1. Trenutno stanje (v1 — već postoji)

MCP server živi u `mcp-server/` direktorijumu. Deployovan je na Railway i radi.

### Postojeći tools (13 ukupno)

| Kategorija | Tool | Opis |
|---|---|---|
| Read | `as_list_agents` | Lista svih agenata |
| Read | `as_get_agent` | Detalji agenta + summary flow nodova |
| Read | `as_inspect_flow` | Full flow sa kompletnim promptovima |
| Read | `as_get_recent_executions` | Poslednje AgentExecution zapise |
| Mutation | `as_update_agent_model` | Promeni model na agentu + svim nodovima |
| Mutation | `as_set_agent_public` | Toggle isPublic (marketplace vidljivost) |
| Mutation | `as_patch_node_field` | Patch specifičnog polja u flow nodu |
| Mutation | `as_update_agent_prompt` | Zameni prompt na ai_response nodu |
| Mutation | `as_update_flow` | Zameni ceo nodes+edges array |
| Mutation | `as_delete_agent` | Trajno briše agenta (transakciono) |
| Diagnostic | `as_diagnose_models` | Proverava modele vs dostupne API ključeve |
| Diagnostic | `as_health_check` | DB ping + broj agenata/flowova |
| Diagnostic | `as_find_broken_flows` | Detektuje broken flow patterns |

### Kritičan arhitekturalni problem v1

```
Trenutno:  MCP klijent → DATABASE_URL (direktan DB pristup)
           ↳ Radi samo za admins/devs koji imaju DATABASE_URL
           ↳ Ne može se dati krajnjim korisnicima
           ↳ Ne podržava multi-tenancy (svako vidi sve agente)

Cilj:      MCP klijent → API_KEY → Agent Studio REST API
           ↳ Svaki korisnik koristi sopstveni API ključ
           ↳ Vidi samo sopstvene agente
           ↳ Može se objaviti kao: npx agent-studio-mcp
```

---

## 2. Analiza dostupnih REST API ruta

Agent Studio već ima bogat API koji MCP server ne koristi:

```
/api/agents                         → CRUD za agente
/api/agents/[agentId]/chat          → Chat sa agentom (streaming)
/api/agents/[agentId]/execute       → Pokreni agenta
/api/agents/[agentId]/conversations → Istorija razgovora
/api/agents/[agentId]/knowledge     → Knowledge base management
/api/agents/[agentId]/evals         → Evaluacije
/api/agents/[agentId]/flow          → Flow management
/api/agents/[agentId]/a2a           → A2A call history
/api/agents/[agentId]/tasks         → Task management
/api/agents/[agentId]/traces        → Execution traces
/api/agents/[agentId]/webhooks      → Webhook management
/api/agents/[agentId]/instincts     → Agent instincts (ECC)
```

Ovo znači da većina tools može biti implementirana kao REST wrapper
— bez direktnog DB pristupa — što rešava arhitekturalni problem.

---

## 3. Šta nedostaje — Gap analiza

### Gap 1: Nema execution tools (najkritičniji)
Claude Code ne može da **pokrene** agenta ili pošalje poruku. Može samo da čita i menja konfiguraciju. Ovo je kao da imaš auto ali ne možeš da upališ motor.

### Gap 2: Nema Knowledge Base tools
Ne može da pretražuje KB, dodaje dokumente, ni proverava embedding status. Za SOMA agente ovo je posebno bitno.

### Gap 3: Nema A2A visibility tools
Ne može da vidi A2A call log, debuguje multi-agent pipeline, ni prati chain izvršavanja.

### Gap 4: Nema agent creation tools
Ne može da kreira novog agenta ni iz scratch ni iz template-a. Samo čita i menja postojeće.

### Gap 5: Autentifikacija je neupotrebljiva za krajnje korisnike
DATABASE_URL = admin credentials. Mora preći na API ključeve.

---

## 4. Razvojni plan — 4 faze

---

### FAZA 1 — Arhitekturalni refaktor + Quick wins (1 nedelja)
**Cilj:** Prebaciti autentifikaciju na API ključeve. Dodati missing tools koji direktno koriste DB.

#### 1.1 Dual transport autentifikacija
Zadržati DB-direct za admin/dev mode. Dodati API-key mode za user mode.

```typescript
// mcp-server/src/auth.ts
// ADMIN mode: DATABASE_URL + MCP_API_KEY (trenutno)
// USER mode:  AGENT_STUDIO_URL + AGENT_STUDIO_API_KEY (novo)
```

Env var koji kontroliše mode: `MCP_MODE=admin|user`

#### 1.2 Novi tools u Fazi 1 (DB-direct, admin mode)

| Tool | Opis | Prioritet |
|---|---|---|
| `as_create_agent` | Kreira novog agenta sa praznim flowom | VISOK |
| `as_get_agent_call_log` | Čita AgentCallLog za agenta (A2A debug) | VISOK |
| `as_list_agent_calls` | Lista A2A poziva sa status/error filterom | VISOK |
| `as_list_kb_sources` | Lista KB izvora za agenta | SREDNJI |
| `as_get_kb_status` | Proverava embedding status (PENDING/READY) | SREDNJI |

**Deliverable:** v1.1 — 18 tools, admin mode isti, novi A2A debug tools.

---

### FAZA 2 — Execution & Chat tools via REST (2 nedelje)
**Cilj:** Claude Code može da POKRENE agenta i vidi rezultate.

#### 2.1 Novi tools

| Tool | REST endpoint | Opis |
|---|---|---|
| `as_chat_with_agent` | `POST /api/agents/[id]/chat` | Pošalji poruku agentu, dobij odgovor |
| `as_get_execution` | `GET /api/agents/[id]/execute/[execId]` | Detalji jednog izvršavanja |
| `as_list_conversations` | `GET /api/agents/[id]/conversations` | Istorija razgovora |
| `as_get_conversation` | `GET /api/agents/[id]/conversations/[id]` | Poruke jednog razgovora |
| `as_trigger_agent` | `POST /api/agents/[id]/trigger` | Webhook-style trigger |

#### 2.2 Autentifikacija za user mode
```typescript
// Korisnik dodaje MCP server sa:
// AGENT_STUDIO_URL=https://your-domain.com
// AGENT_STUDIO_API_KEY=as_key_xxxxx
// Svaki REST poziv ide kroz /api/* sa Bearer token autentifikacijom
```

#### 2.3 Kako as_chat_with_agent izgleda
```
Tool: as_chat_with_agent
Input:
  - agent_name: "SOMA Trend Intelligence"
  - message: "Find trending AI tools from last 24h"
  - wait_for_completion: true (polling do finished)
  - timeout_seconds: 120

Output:
  - execution_id: "exec_xxx"
  - status: "COMPLETED"
  - response: "## Trend Report — ..."
  - duration_ms: 45230
  - tokens_used: { input: 1200, output: 800 }
```

**Deliverable:** v2.0 — 23 tools, user mode aktiviran, `npx agent-studio-mcp` radi.

---

### FAZA 3 — Knowledge Base tools (1 nedelja)
**Cilj:** Upravljanje KB direktno iz Claude Code ili Cursor.

#### 3.1 Novi tools

| Tool | Opis |
|---|---|
| `as_list_knowledge_bases` | Lista svih KB za agenta |
| `as_search_knowledge_base` | Semantička pretraga u KB (vraća top-K chunks) |
| `as_add_kb_document` | Dodaj dokument (tekst ili URL) u KB |
| `as_add_kb_text` | Dodaj plain text chunk direktno |
| `as_get_kb_embedding_status` | Proverava da li su embeddingsi gotovi |
| `as_delete_kb_source` | Briše KB izvor i sve njegove chunkove |

#### 3.2 Primer use case-a koji ovo omogućava
```
Korisnik u Claude Code:
"Dodaj ovaj blog post u KB SOMA agenata i potvrdi da je embedovan"

Claude koristi:
1. as_add_kb_document(agent="SOMA Trend Intelligence", url="https://...")
2. as_get_kb_embedding_status(source_id="...") → polling dok nije READY
3. as_search_knowledge_base(agent="SOMA Trend Intelligence", query="test") → verifikacija
```

**Deliverable:** v2.1 — 29 tools.

---

### FAZA 4 — Agent Builder & Eval tools (2 nedelje)
**Cilj:** Kreiranje agenata i pokretanje evalova direktno iz MCP klijenta.

#### 4.1 Agent Builder tools

| Tool | Opis |
|---|---|
| `as_create_agent_from_template` | Instancira agent iz marketplace template-a |
| `as_scaffold_agent` | Kreira agenta sa custom flowom (nodes + edges JSON) |
| `as_add_flow_node` | Dodaje node u postojeći flow |
| `as_remove_flow_node` | Briše node iz flowa |
| `as_connect_nodes` | Dodaje edge između nodova |
| `as_clone_agent` | Klonira agenta (fork sa novim imenom) |

#### 4.2 Eval tools

| Tool | Opis |
|---|---|
| `as_list_evals` | Lista eval setova za agenta |
| `as_run_eval` | Pokreni eval run, vrati rezultate |
| `as_get_eval_results` | Detalji poslednjeg eval run-a |
| `as_create_eval_case` | Dodaj novi test case u eval set |

#### 4.3 Primer — Agent Creator workflow
```
Korisnik: "Napravi mi agenta koji summarizuje YouTube transkripte"

Claude koristi:
1. as_list_templates(search="youtube") → pronalazi template
2. as_create_agent_from_template(template_id="yt-summarizer", name="My YT Agent")
3. as_inspect_flow(agent_name="My YT Agent") → verifikuje flow
4. as_chat_with_agent(agent_name="My YT Agent", message="test...") → testira
5. as_run_eval(agent_name="My YT Agent") → pokreće evals
```

**Deliverable:** v3.0 — 39 tools, full lifecycle coverage.

---

## 5. Kompletna mapa tools (target stanje)

```
mcp-server/src/tools/
├── agents.ts          → list, get, create, clone, delete, scaffold     (7 tools)
├── flow.ts            → inspect, update, add_node, remove_node, connect (5 tools)
├── execution.ts       → chat, execute, get_execution, list_convos       (5 tools)
├── knowledge.ts       → list_kb, search, add_doc, add_text, status      (6 tools)
├── a2a.ts             → get_call_log, list_calls                        (2 tools)
├── evals.ts           → list, run, results, create_case                 (4 tools)
├── templates.ts       → list_templates, create_from_template            (2 tools)
├── mutations.ts       → update_model, set_public, patch_node, prompt    (4 tools — refactored)
└── diagnostics.ts     → health_check, diagnose_models, find_broken      (4 tools — ostaje)
                                                               UKUPNO: 39 tools
```

---

## 6. Tehnička arhitektura — target

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Klijenti                          │
│   Claude Code   │   Cursor   │   Claude Cowork           │
└────────────────────────┬────────────────────────────────┘
                         │ Streamable HTTP / stdio
                         ▼
┌─────────────────────────────────────────────────────────┐
│              agent-studio-mcp-server v3                  │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────────┐│
│  │  Admin mode │    │         User mode                ││
│  │ DATABASE_URL│    │  AGENT_STUDIO_URL + API_KEY       ││
│  │ (dev/ops)   │    │  (end users, multi-tenant)        ││
│  └──────┬──────┘    └───────────────┬──────────────────┘│
└─────────┼─────────────────────────┼─────────────────────┘
          │                         │
          ▼                         ▼
    Railway PostgreSQL        Agent Studio REST API
    (direct DB access)        /api/agents/*/chat
                              /api/agents/*/execute
                              /api/agents/*/knowledge
                              /api/agents/*/evals
```

---

## 7. npm package — distribucija

Target: korisnik može da pokrene MCP server sa jednom komandom.

```bash
# Instalacija
npx agent-studio-mcp@latest

# Claude Code config (~/.claude/config.json)
{
  "mcpServers": {
    "agent-studio": {
      "command": "npx",
      "args": ["agent-studio-mcp@latest"],
      "env": {
        "AGENT_STUDIO_URL": "https://your-agent-studio.railway.app",
        "AGENT_STUDIO_API_KEY": "as_key_xxxxx"
      }
    }
  }
}
```

Za npm publish potrebno:
1. Registrovati `agent-studio-mcp` na npmjs.com
2. CI/CD pipeline: merge na main → auto publish nova verzija
3. Versioning: FAZA 2 → v2.0.0, FAZA 3 → v2.1.0, FAZA 4 → v3.0.0

---

## 8. Redosled implementacije — po prioritetu

| # | Task | Vreme | Vrednost |
|---|------|-------|----------|
| 1 | A2A tools: `as_get_agent_call_log`, `as_list_agent_calls` | 2h | ODMAH — blocker za SOMA debug |
| 2 | `as_create_agent` — kreira agenta sa praznim flowom | 3h | VISOK |
| 3 | Dual-mode auth (admin DB / user API key) | 1 dan | KRITIČAN za distribuciju |
| 4 | `as_chat_with_agent` via REST | 1 dan | VISOK — core execution |
| 5 | `as_list_conversations`, `as_get_conversation` | 4h | SREDNJI |
| 6 | KB tools (list, search, add, status) | 2 dana | VISOK za SOMA agente |
| 7 | Agent builder tools (scaffold, add_node, connect) | 3 dana | SREDNJI |
| 8 | Eval tools | 2 dana | SREDNJI |
| 9 | npm publish pipeline | 1 dan | VISOK za distribuciju |

**Ukupna procena: ~3 nedelje do v3.0 (39 tools, npm objavljeno)**

---

## 9. Inspiracija iz Paperclip (MIT licenca)

Konkretne stvari koje možemo preuzeti/adaptirati iz `paperclipai/paperclip`:

1. **MCP tool naming konvencija** — njihov pattern `paperclipGetAgent`, `paperclipListIssues` je čist. Naš `as_` prefix je dobar, treba ga zadržati.

2. **`paperclipApiRequest` escape hatch tool** — raw REST passthrough. Dodati `as_api_request` kao poslednji resort tool za slučajeve koje drugi tools ne pokrivaju.

3. **Tool annotation pattern** — `readOnlyHint`, `destructiveHint`, `idempotentHint` — već koristimo ovo, ali treba proveriti da su tačno postavljeni na svim tools.

4. **Structured output format** — vraćaju i `content` (text) i `structuredContent` (JSON) iz svakog tool poziva. Već koristimo ovo, ali treba biti konzistentno.
