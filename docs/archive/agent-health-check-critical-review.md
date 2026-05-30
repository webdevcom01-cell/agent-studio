# Agent Health Check — Kritička Analiza Plana
*Verzija: 1.0 | Datum: 2026-05-16*
*Metoda: Svaka pretpostavka je verifikovana direktnim pozivom MCP alata — ništa nije preuzeto kao tačno bez dokaza*

---

## Metodologija verifikacije

Před pisanjem ove analize, pozvani su sljedeći MCP alati da bi se verifikovale pretpostavke iz plana:
- `as_find_broken_flows()` — stvarni output na 55 agenata
- `as_list_agents(limit:200)` — stvarna lista svih 55 agenata sa svim poljima
- `as_list_knowledge_bases(agent_name:"Trend Intelligence")` — verifikacija returna
- `as_list_knowledge_bases(agent_name:"Score Analyzer")` — verifikacija returna
- Tool schemas: `as_find_broken_flows`, `as_list_knowledge_bases`, `as_get_kb_embedding_status`, `as_list_agents`, `as_get_recent_executions`, `as_get_agent_call_log`

---

## 🔴 KRITIČNO — Blokiraju ispravnu implementaciju (5 nalaza)

---

### K-1: `as_list_knowledge_bases` NIJE globalna — plan je to pogrešno pretpostavio

**Što plan kaže:**
> "as_list_knowledge_bases() → kbs[]" — jednim globalnim pozivom dobijamo sve KB-ove

**Stvarnost (iz tool schema — POTVRĐENO):**
```json
Parameters: {
  "agent_id": "Exact agent ID (cuid)",
  "agent_name": "Partial agent name — case-insensitive ILIKE match"
}
```
Tool zahtijeva `agent_id` ili `agent_name`. Nema globalnog poziva bez parametara.

**Impakt:**
Plan je "Fazu 1 — Gathering" dizajnirao kao 5 paralelnih poziva, uključujući jedan globalni KB poziv. Taj poziv ne postoji. Svaki agent zahtijeva odvojen poziv. Sa 55 agenata = 55 sekvencijalnih poziva = health check koji traje nekoliko minuta.

**Fix:**
KB provjera mora biti ograničena na agente koji su nedavno aktivni (production scope), ne svih 55. Vidi K-2 za rješenje.

---

### K-2: Svi agenti imaju `category: null` — filtriranje po kategoriji je nemoguće

**Što plan kaže (sekcija 7, Dim F u v2):**
> "Provjera postoji li agent-card.md... možemo filtrirati samo production agente po kategoriji"

**Stvarnost (iz `as_list_agents` — POTVRĐENO na 55/55 agenata):**
```json
{"name": "🔍 Trend Intelligence Agent", "category": null, "hasFlow": true},
{"name": "Score Analyzer", "category": null, "hasFlow": true},
{"name": "Accessibility Auditor", "category": null, "hasFlow": true}
// Svi 55 agenata — category: null
```

**Impakt:**
Bez category filtera, ne možemo programatski razlikovati 4 SOMA production agente od 51 template/neaktivnog agenta. Health check koji provjeri svih 55:
- Generira lažne alarme (template agenti nikad neće imati KBove — to je očekivano ponašanje)
- Sruši scoring formulu (vidi K-3)
- Troši 50+ MCP poziva na irelevantne agente

**Fix:**
Koristiti `as_get_recent_executions(agent_id, limit:1)` kao "production" filter. Agent bez ijednog execution = template = skip. Ovo je jedini pouzdani filter koji je dostupan putem API-ja.

**Troškovi fixa:**
`as_get_recent_executions` zahtijeva `agent_id` (nije globalna). Znači: get list → za svaki agent call executions → filter. Još 55 poziva. Alternativno: health check uvijek traži od korisnika koji agenti se provjeravaju, ili radi na "scope" koji korisnik definiše.

---

### K-3: Scoring formula se matematički sruši na 55 agenata

**Što plan kaže:**
```
Score = 100 - Σ(penalti)
CRITICAL: -25 poena po instanci
WARNING:  -10 poena po instanci
```

**Realna kalkulacija sa svim 55 agentima:**
- 40+ template agenata bez KB → svaki dobija WARNING "KB missing" = -400 poena
- 10 broken flow issues (potvrđeno iz `as_find_broken_flows`) = -100 poena
- Score = 100 - 500 = -400 → `max(0, score)` = 0

Score 0 je nekoristan broj — ne govori ništa o stvarnom zdravlju production agenata.

**Fix:**
Dvije opcije:
1. **Relativni scoring**: `(healthy_checks / total_checks) * 100` — % zdravlja
2. **Scoped scoring**: Score se računa samo za production scope (agenti koji imaju barem jedan execution)

Preporuka: opcija 1 (relativni), jer je jednostavnija za implementaciju i intuitivnija za korisnika.

---

### K-4: Dimenzija E (Agent Connectivity) je duplikat — `as_find_broken_flows` to već radi

**Što plan kaže:**
> Dim E — Agent Connectivity: "as_inspect_flow(all, call_agent) → uzmi target_agent_id → provjeri u as_list_agents"

**Stvarnost (iz `as_find_broken_flows` opisa — POTVRĐENO):**
```
Scan patterns:
  3. call_agent nodes targeting non-existent agents
```

Tool VEĆ skenira sve call_agent reference i provjerava postoje li target agenti.

**Impakt:**
Plan predviđa 55 `as_inspect_flow` poziva + 1 `as_list_agents` + ručno poređenje ID-ova. `as_find_broken_flows` radi istu stvar u jednom pozivu za sve agente.

**Fix:**
Ukloniti Dim E kao zasebnu provjeru. Premjestiti coverage pod Dim D (Flow Integrity via `as_find_broken_flows`). Štedimo 55+ MCP poziva.

---

### K-5: `as_get_kb_embedding_status` je redundantan alat u planu

**Što plan kaže:**
> "for each KB in kbs[]: as_get_kb_embedding_status(kb_id) → embedding_status[]"

**Stvarnost (iz `as_list_knowledge_bases` stvarnog poziva — POTVRĐENO):**
```json
{
  "embeddingStatus": "ready",
  "statusBreakdown": {
    "ready": 2,
    "pending": 0,
    "processing": 0,
    "failed": 0
  }
}
```

`as_list_knowledge_bases` VEĆ vraća kompletan embedding breakdown. `as_get_kb_embedding_status` je potreban samo za per-document granularnost — što za health check nije relevantno.

**Fix:**
Ukloniti `as_get_kb_embedding_status` iz Faze 1. Koristiti samo `as_list_knowledge_bases` po agentu. Štedimo N poziva gdje N = broj KB-ova.

---

## 🟡 UPOZORENJE — Neće blokirati implementaciju, ali će uzrokovati runtime probleme (5 nalaza)

---

### U-1: `embeddingStatus: "empty"` mora biti CRITICAL, nije OK

**Što plan kaže:**
Plan definiše Dim C (KB Embedding Status) ali ne specificira šta se dešava kada je KB prazan.

**Stvarnost (iz `as_list_knowledge_bases` schema — POTVRĐENO):**
```
embeddingStatus values: empty | processing | ready | partial_failure | failed
```

"empty" = KB postoji ali nema nijednog dokumenta. Agent radi bez memorije — **identičan efekat kao `knowledgeBaseId` missing u Dim B**.

**Fix:**
Dodati eksplicitno pravilo:
```
embeddingStatus: "empty"         → CRITICAL (agent without memory)
embeddingStatus: "failed"        → CRITICAL (embedding permanently broken)
embeddingStatus: "partial_failure" → WARNING (degraded memory)
embeddingStatus: "processing"    → WARNING (temporary, retry in 60s)
embeddingStatus: "ready"         → OK
```

---

### U-2: Otkrivena aktivna produkcijska greška pri verifikaciji plana

**Novo, potvrđeno iz `as_find_broken_flows` — NIJE BILO U FORENSIC ANALIZI:**
```json
{"agent": "🧠 NLU Chat Agent — AI Nekretnine CG", "severity": "WARN",
 "issue": "Node 'format_parcel_result': ai_response has no outputVariable — result is lost."},
{"agent": "🧠 NLU Chat Agent — AI Nekretnine CG", "severity": "WARN",
 "issue": "Node 'general_answer': ai_response has no outputVariable — result is lost."},
{"agent": "🧠 NLU Chat Agent — AI Nekretnine CG", "severity": "WARN",
 "issue": "Node 'ask_clarification': ai_response has no outputVariable — result is lost."}
```

NLU Chat Agent je **primarni korisničko-suočeni agent** u AI Nekretnine CG sistemu. Tri noda gube rezultat — znači output tih nodova nikad ne stiže downstream. Ovo je produkcijska greška koja je vjerovatno uzrokovala neispravno ponašanje sistema.

**Konsekvenca za plan:**
`as_find_broken_flows` je moćniji alat od što ga plan tretira. Pronašao je grešku u 2 sekunde koju ni dvije forenzičke analize nisu uhvatile. Treba biti centralni dio health check-a, ne sporedna provjera.

---

### U-3: Duplikati agenata nisu u planu ali su potvrđeni u stvarnim podacima

**Iz `as_list_agents` — POTVRĐENO:**
```json
{"id": "cmnhvh6770005ob01xmmlp56a", "name": "Bug Detection & Debugging Expert"},
{"id": "cmosce3z80013s60146udlfyq",  "name": "Bug Detection & Debugging Expert"}
```

Isti naziv, različiti ID-ovi, oba `hasFlow: true`. `call_agent` node koji referencira po imenu može pozvati pogrešan agent, nedeterministički.

**Fix:**
Dodati Dim F: Duplicate Agent Names — group by name, flag if count > 1. Trivijalno za implementirati iz `as_list_agents` outputa, nema dodatnih MCP poziva.

---

### U-4: Fix commands za Memory Wiring imaju nepokriveni edge case

**Što plan kaže:**
> Report će imati "exact as_patch_node_field commands" za Memory Wiring fix.

**Problem koji plan ne adresira:**
Za generiranje fix commande `as_patch_node_field knowledgeBaseId → [KB_ID]`, trebamo KB ID.
KB ID dobijamo iz `as_list_knowledge_bases(agent)`.

Postoje dva scenarija:
- **Scenario A**: kb_search node postoji, KB postoji, knowledgeBaseId samo nije setovan → KB ID je dostupan → auto-fix command moguć ✅
- **Scenario B**: kb_search node postoji, ali agent NEMA KB → `as_list_knowledge_bases` vraća prazno → KB ID nepoznat → fix command ne može biti generisan, treba ručna intervencija ⚠️

Plan predviđa samo Scenario A.

**Fix:**
Razlikovati u reportu:
```
[B] Memory Wiring
  ❌ Agent "TI": kb_search node bez knowledgeBaseId
     KB postoji → Auto-fix: as_patch_node_field kb_search-soma-memory knowledgeBaseId → c1777724361613zkacaonj60
  
  ❌ Agent "XYZ": kb_search node bez knowledgeBaseId
     KB ne postoji → Manual fix: kreirati KB pa setovati knowledgeBaseId
```

---

### U-5: Faza 1 nije zaista paralelna — postoje sekvencijalne zavisnosti

**Što plan kaže:**
> "PARALLEL: as_diagnose_models + as_list_agents + as_find_broken_flows + as_list_knowledge_bases + as_inspect_flow"

**Stvarnost:**
```
Phase 1A (genuinely parallel):
├── as_diagnose_models()      ← bez zavisnosti
├── as_list_agents()          ← bez zavisnosti  
└── as_find_broken_flows()    ← bez zavisnosti

Phase 1B (zahtijeva Phase 1A output):
└── for each active_agent in list_agents output:
    └── as_list_knowledge_bases(agent_id)   ← zavisi od as_list_agents
```

`as_list_knowledge_bases` ne može biti u istom paralelnom pozivu kao `as_list_agents` jer joj treba agent_id koji dolazi iz `as_list_agents`. Plan ovo grafički prikazuje kao istu fazu što je netačno.

**Fix:**
Eksplicitno dokumentovati dvofazni gathering:
- Phase 1A: 3 globalna paralelna poziva (diagnose_models + list_agents + find_broken_flows)
- Phase 1B: per-agent pozivi za KB status (zavisi od Phase 1A)

---

## 🔵 POBOLJŠANJA — Plan funkcioniše bez njih, ali bi bili vrijedni (4 nalaza)

---

### P-1: `as_get_agent_call_log(status: FAILED)` kao prirodni "production filter"

`as_get_recent_executions` i `as_get_agent_call_log` zajedno mogu identificirati koji agenti su zapravo u produkciji:
- Agent sa FAILED executions = produkcijski problem koji treba prijaviti
- Agent bez ijednog execution-a = template, skip za KB check

Ovo rješava K-2 bez potrebe za category poljem. Tradeoff: još 55 poziva za executions check. Može biti opcionalan flag: `health_check(scope: "active_only")`.

---

### P-2: `as_find_broken_flows` treba biti prva linija odgovora, ne Dim D

Iz stvarnih podataka: jedan poziv, 0 sekundi konfiguracije, pronašao 10 realnih problema u 55 agenata uključujući 3 aktivne produkcijske greške u NLU Chat Agentu.

Trenutna pozicija u planu (Dim D) stavlja ga kao jednu od 5 ravnopravnih dimenzija. Trebalo bi ga pozicionirati kao **inicijalni scan** koji se uvijek radi prvi, čiji output informiše ostatak health check-a.

---

### P-3: `as_find_broken_flows` ima vlastitu severity skalu koja se mora mapirati

Iz stvarnih podataka: tool vraća `"severity": "WARN"` za sve pronađene greške. Nije jasno postoji li i `"severity": "ERROR"` ili `"CRITICAL"`. Plan koristi vlastitu CRITICAL/WARNING/OK skalu.

Potrebno eksplicitno mapiranje u SKILL.md:
```
as_find_broken_flows severity → naš severity
  "WARN" → WARNING
  "ERROR" (ako postoji) → CRITICAL
```

---

### P-4: Dim F — Duplicate Agent Names (trivijalan za dodati)

Iz `as_list_agents` outputa, bez dodatnih MCP poziva:
```python
from collections import Counter
name_counts = Counter(agent["name"] for agent in agents)
duplicates = [name for name, count in name_counts.items() if count > 1]
```

Potvrđen slučaj: "Bug Detection & Debugging Expert" postoji dvaput. Vrijedi uključiti u v1, ne v2.

---

## Revidiran plan dimenzija

Na osnovu analize, ovo je ispravljena lista dimenzija za v1:

| # | Dimenzija | Alat | Pozivi | Napomena |
|---|---|---|---|---|
| D0 | **Broken Flows** | `as_find_broken_flows()` | 1 (globalan) | Postaje "nulta" dimenzija — uvijek prva |
| A | **Model Availability** | `as_diagnose_models()` | 1 (globalan) | Nepromijenjeno |
| B | **Memory Wiring** | `as_inspect_flow(agent, kb_search)` | N (per active agent) | Zadržati, custom check koji `as_find_broken_flows` ne pokriva |
| C | **KB Embedding Status** | `as_list_knowledge_bases(agent)` | N (per active agent) | `as_get_kb_embedding_status` ukloniti — redundantan |
| F | **Duplicate Agents** | iz `as_list_agents` outputa | 0 extra | Trivijalno dodati u v1 |
| ~~E~~ | ~~Agent Connectivity~~ | ~~as_inspect_flow(all, call_agent)~~ | ~~55+~~ | **UKLONITI — `as_find_broken_flows` to već radi** |

**Ukupni MCP pozivi (nova procjena):**
- Faza 1A (paralelno): 3 poziva (find_broken_flows + diagnose_models + list_agents)
- Faza 1B (sekvencijalno, per production agent): 2 × N poziva (inspect_flow za kb_search + list_knowledge_bases)
- Sa 4-5 production agenata: ukupno 3 + 10 = **13 MCP poziva** (vs. 110+ u originalnom planu)

---

## Revidirana scoring formula

```
Relativni score (preporuka):

health_checks = []
for each check:
    health_checks.append(PASS ili FAIL)

score = (count(PASS) / count(total)) * 100

Kategorije:
  90-100 → ✅ HEALTHY
  70-89  → ⚠️ DEGRADED  
  50-69  → ⚠️ AT RISK
  0-49   → ❌ CRITICAL
```

---

## Sažetak: Što mijenjamo u planu

| Promjena | Tip | Urgentnost |
|---|---|---|
| `as_list_knowledge_bases` nije globalna → per-agent | Fix | 🔴 Kritično |
| `category: null` na svim agentima → koristiti executions filter | Fix | 🔴 Kritično |
| Scoring formula → relativni % | Fix | 🔴 Kritično |
| Dim E ukloniti (duplikat `as_find_broken_flows`) | Simplifikacija | 🔴 Kritično |
| `as_get_kb_embedding_status` ukloniti (redundantan) | Simplifikacija | 🔴 Kritično |
| `embeddingStatus: empty/failed` → CRITICAL | Fix | 🟡 Upozorenje |
| NLU Chat Agent bug → prioritetni fix | Bonus nalaz | 🟡 Upozorenje |
| Duplicate agent detection → Dim F | Dodavanje | 🟡 Upozorenje |
| Fix commands edge case (KB ne postoji) | Fix | 🟡 Upozorenje |
| Faza 1 = dvofazna (1A paralelno, 1B per-agent) | Pojašnjenje | 🟡 Upozorenje |
| `as_find_broken_flows` → D0 (prva, uvijek) | Restrukturiranje | 🔵 Poboljšanje |
| AgentStack severity → naša severity mapiranje | Pojašnjenje | 🔵 Poboljšanje |

---

*Kritička analiza završena. Sljedeći korak: revidirati implementacioni plan i kreirati SKILL.md.*
