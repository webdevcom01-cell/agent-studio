# Agent Health Check — Implementacioni Plan
*Verzija: 1.0 | Datum: 2026-05-16*

---

## 1. Istraživanje — Relevantni Standardi

### 1.1 Anthropic — "Building Effective Agents"
Anthropic definiše observability kao **obavezan sloj**, ne opciju. Ključni standardi:

- **MELT Framework**: Metrics, Events, Logs, Traces — sve 4 dimenzije moraju biti pokrivene
- **Structured logging**: prompts, outputs, template verzije, API endpointi, timestamps
- **Anti-pattern koji se mora izbjeći**: "missing observability" — eksplicitno naveden kao anti-pattern
- **Princip**: agentic workflow mora biti u stanju da objasni ZAŠTO je failovao, ne samo DA je failovao
- **Shadow mode testing**: nova verzija agenta se testira paralelno sa produkcijom bez uticaja na rezultate

### 1.2 Google A2A Protocol (v0.3, Linux Foundation, 150+ organizacija u produkciji, maj 2026)
A2A uvodi **AgentCard** kao standardni mehanizam health declaracije:

- **AgentCard** (`/.well-known/agent-card.json`): JSON dokument koji deklariše identity, capabilities, skills, security
- **Capability Validation**: agent MORA deklarovati šta podržava (`streaming`, `pushNotifications`, `extendedAgentCard`) — i MORA vraćati greške kad klijent zatraži nedeklariranu capability
- **Enterprise Ready princip**: "authentication, authorization, security, privacy, tracing, and monitoring" kao guiding principle
- **Error kategorije**: Authentication → Authorization → Validation → Resource → System (svaka kategorija ima konkretan error kod i poruku)
- **Tri-slojna enterprise arhitektura 2026**: A2A (agent coordination) + MCP (agent-to-tool) + Context layer

### 1.3 OpenTelemetry — GenAI Semantic Conventions (aktivno, febr. 2026)
OpenTelemetry definuje **standardizovane atribute** za AI agent monitoring:

- `gen_ai.request.model` — koji model se koristi
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens` — token trošak
- `gen_ai.response.finish_reasons` — razlog zaustavljanja generacije
- **4 monitoring sloja**: LLM client spans, agent spans, events (prompt/completion content), metrics
- **RAG-specific**: embedding drift praćenje — ključno za KB zdravlje
- **Majorni vendori** (Datadog, Honeycomb, New Relic) i frameworki (LangChain, CrewAI, AutoGen) već nativno emituju OTel spans

### 1.4 Industry Patterns — Production LLM Agent Monitoring (2026)
Ključni nalaz: **tradicionalni monitoring je slijep za agent failures** — HTTP 200 može sadržati halucinovane podatke.

Kritično što treba pratiti:
- Token usage / cost po runu
- Generation latency
- Groundedness / hallucination rate
- Embedding drift u RAG pipeline-ima
- **Liveness vs Readiness razlika** (Kubernetes standard, preneseno na AI agente):
  - **Liveness**: "Je li proces živ?" → `/health` → vraća 200 ako server nije crashovao
  - **Readiness**: "Može li primiti zahtjev?" → `/ready` → provjerava DB, API ključeve, zavisnosti

### 1.5 MCP Server Health Check Standards
Za MCP servere koji podržavaju HTTP:
- `/health` → liveness probe → vraća `{ "status": "up", "uptime": N }`
- `/ready` → readiness probe → provjerava API keys, tool availability, connection status

---

## 2. Analiza Agent Studio Arhitekture

Na osnovu kompletne forenzičke analize, Agent Studio ima **5 dimenzija koje su podložne kvarovima**:

### Dimenzija A — Model Availability
**Šta može poći krivo**: Node koristi model za koji API ključ nije konfigurisan na serveru.
**Realan primjer**: Score Analyzer smoke test failovao jer je koristio `claude-haiku-4-5-20251001` a `ANTHROPIC_API_KEY` nije postavljen.
**AgentStack alat**: `as_diagnose_models` — vraća status svakog API ključa i listu agenata koji će failovati.
**Mapping na standard**: OpenTelemetry `gen_ai.request.model` + Anthropic MELT (Metrics).

### Dimenzija B — Memory Wiring
**Šta može poći krivo**: `kb_search` node nema `knowledgeBaseId` → `{{kb_context}}` uvijek prazan → agent radi bez instincts i evo-log memorije.
**Realan primjer**: TI i CR agenti su **cijele sedmice** radili bez memorije — tihi bug koji se ne vidi u logovima.
**AgentStack alat**: `as_inspect_flow(agent, kb_search)` → provjeri ima li `knowledgeBaseId` u `node.data`.
**Mapping na standard**: A2A AgentCard capability validation (deklarisana sposobnost ≠ stvarna sposobnost) + Anthropic "agent mora objasniti zašto failuje".

### Dimenzija C — KB Embedding Status
**Šta može poći krivo**: Dokument je dodan u KB ali embedovanje nije završeno → vektor search vraća prazno.
**Realan primjer**: Seeding KBs tokom scaffoldinga — ima prozor od ~30s do 2min gdje dokument postoji ali nije pretraživ.
**AgentStack alat**: `as_get_kb_embedding_status` per KB → provjeri `status: "ready"` vs `"processing"` vs `"failed"`.
**Mapping na standard**: OpenTelemetry embedding drift monitoring.

### Dimenzija D — Flow Integrity
**Šta može poći krivo**: Node referencira `{{varijabla}}` koja nije definisana kao output prethodnog noda, ili edge postoji ali target node ne postoji.
**AgentStack alat**: `as_find_broken_flows` → vraća listu broken nodova per agent.
**Mapping na standard**: A2A error kategorija "Validation Errors" (invalid parameters before processing).

### Dimenzija E — Agent Connectivity
**Šta može poći krivo**: `call_agent` node referencira `agent_id` koji više ne postoji (obrisan agent) ili koji je promijenio ime.
**Realan primjer**: SOMA pipeline — TI → HW → CR chain. Ako se HW obriše ili renamuje, TI call_agent node šalje u void.
**AgentStack alat**: `as_inspect_flow(all, call_agent)` → uzmi `agent_id` iz node.data → provjeri postoji li u `as_list_agents()`.
**Mapping na standard**: A2A `TaskNotFoundError` pattern + Google ADK agent discovery.

---

## 3. Health Score Metodologija

Inspirisano OpenTelemetry severity levels i Kubernetes probe pattern:

```
Score = 100 - Σ(penalti po dimenziji)

Penalti:
  KRITIČNO (po instanci): -25 poena
    - Agent koji će sigurno failovati (Dim A: model API key missing)
    - kb_search bez knowledgeBaseId (Dim B: memorija slijepa)
  
  UPOZORENJE (po instanci): -10 poena
    - KB dokument u processing statusu (Dim C)
    - Broken flow node (Dim D)
    - Broken call_agent referenca (Dim E)

Kategorije:
  90-100 → ✅ HEALTHY (sve zeleno)
  70-89  → ⚠️ DEGRADED (radi ali sa problemima)
  50-69  → ⚠️ AT RISK (aktivni problemi, pipeline nezdrav)
  0-49   → ❌ CRITICAL (hitna intervencija potrebna)
```

---

## 4. Output Format

```
🏥 AGENT STUDIO HEALTH REPORT
══════════════════════════════════════
Generated : 2026-05-16 14:32 UTC
Agents    : 8 checked
KBs       : 4 checked
══════════════════════════════════════

OVERALL HEALTH: 72/100 ⚠️ DEGRADED

══════════════════════════════════════
❌ CRITICAL (2 issues)
══════════════════════════════════════
[A] Model Availability
  ❌ ANTHROPIC_API_KEY: NOT SET
     Affected agents: Score Analyzer (extractor node)
     Fix: as_patch_node_field model → gpt-4.1-mini

[B] Memory Wiring
  ❌ kb_search-soma-memory (TI Agent): knowledgeBaseId missing
     Fix: as_patch_node_field knowledgeBaseId → c1777724361613zkacaonj60

══════════════════════════════════════
⚠️ WARNINGS (1 issue)
══════════════════════════════════════
[C] KB Embedding Status
  ⚠️ KB "Score Analyzer Memory" (cmp7gtng100hfpc010xztikpd)
     Document "scoring-rubric.md": status = processing (1/3 docs ready)
     Action: Wait 60s and re-run health check

══════════════════════════════════════
✅ OK (3 checks)
══════════════════════════════════════
[D] Flow Integrity    → No broken nodes found
[E] Agent Connectivity → All call_agent references valid
[B] HW Memory Wiring  → knowledgeBaseId correctly set

══════════════════════════════════════
PRIORITIZED FIXES:
1. [CRITICAL] Patch Score Analyzer extractor model
2. [CRITICAL] Patch TI kb_search knowledgeBaseId  
3. [WARN] Re-check KB embedding in 60s
══════════════════════════════════════
```

---

## 5. Implementacioni Plan

### Faza 1 — Gathering (paralelno, 5 MCP poziva)

```
PARALLEL:
├── as_diagnose_models()                    → model_status_map
├── as_list_agents()                         → all_agents[]
├── as_find_broken_flows()                   → broken_nodes[]
├── as_list_knowledge_bases()                → kbs[]
└── for each agent: as_inspect_flow(kb_search) → kb_nodes[]
    + as_inspect_flow(call_agent)            → call_agent_nodes[]
```

Zatim sekvencijalno:
```
SEQUENTIAL:
└── for each KB in kbs[]:
    └── as_get_kb_embedding_status(kb_id)    → embedding_status[]
```

### Faza 2 — Analysis (cross-referencing)

```python
issues = []

# Dim A: Model check
for agent in failing_agents_from_diagnose:
    issues.append(CRITICAL, "model_unavailable", agent)

# Dim B: Memory wiring
for node in kb_nodes:
    if not node.data.knowledgeBaseId:
        issues.append(CRITICAL, "missing_kb_id", node.agent, node.id)

# Dim C: KB embedding
for kb in kbs:
    for doc in kb.documents:
        if doc.status != "ready":
            issues.append(WARNING, "embedding_pending", kb.name, doc.name)

# Dim D: Flow integrity
for broken in broken_nodes:
    issues.append(WARNING, "broken_node", broken.agent, broken.node)

# Dim E: Agent connectivity
valid_agent_ids = {a.id for a in all_agents}
for node in call_agent_nodes:
    if node.data.target_agent_id not in valid_agent_ids:
        issues.append(WARNING, "broken_call_agent", node.agent, node.data.target_agent_id)
```

### Faza 3 — Scoring
```python
score = 100
for issue in issues:
    if issue.severity == CRITICAL: score -= 25
    if issue.severity == WARNING:  score -= 10
score = max(0, score)
```

### Faza 4 — Report Generation
Formatiran output kao u sekciji 4, sa:
- Summary banner (score + kategorija)
- Critical issues (sa konkretnim fix komandama)
- Warning issues (sa action items)
- OK checks
- Prioritizovana lista fixeva

---

## 6. SKILL.md Struktura

```
/skills/agent-health-check/
└── SKILL.md
```

### Trigger fraze (srpski + engleski):
- "health check", "system status", "check agents", "što je pokvareno", "šta ne radi"
- "agent health", "provjeri agente", "status sistema", "health report"
- "before I run pipeline", "nešto ne radi", "pipeline fails", "pipeline ne radi"

### Ograničenja skilla (NOT USE when):
- User wants to fix a specific known issue (direktno `as_patch_node_field`)
- User wants to run an agent (skill nije runner)
- User wants to add KB documents

---

## 7. Veze sa Standardima

| Dimenzija | Anthropic | A2A/Google | OpenTelemetry | Industry |
|---|---|---|---|---|
| A: Model Availability | MELT Metrics | Enterprise Ready | gen_ai.request.model | Readiness probe |
| B: Memory Wiring | Structured logging | Capability validation | agent span attributes | Observability gap |
| C: KB Embedding | Shadow mode testing | — | Embedding drift | RAG monitoring |
| D: Flow Integrity | Explain failures | Validation Errors | agent spans | Trace routing |
| E: Agent Connectivity | Composability | TaskNotFoundError | — | Pipeline health |

---

## 8. Otvorena Pitanja / Odluke

1. **Skill-only vs. Scheduled?** — Health check je najkorisniji ako se može i schedulovati (npr. svako jutro). Implementiramo ga kao skill koji radi oba: ručni poziv + opcija za scheduling.

2. **Vault coverage kao Dim F?** — Provjera postoji li `agent-card.md` za svakog agenta u Obsidianu. Korisno ali sporije (Obsidian MCP ne podržava batch). Stavimo u v2.

3. **Fix actions unutar health-check-a?** — Skill bi mogao ponuditi "apply all critical fixes" button. Ali to mijenja scope: nije više samo health check, postaje health-check-and-repair. Odluka: **v1 = samo report + fix komande**, v2 = interactive repair.

4. **Token cost tracking?** — OpenTelemetry standard preporučuje. AgentStack `as_get_agent_call_log` ima token info. Dodati u v2 kao Dim F.

---

*Plan spreman za implementaciju. Sljedeći korak: kreiranje SKILL.md fajla.*
