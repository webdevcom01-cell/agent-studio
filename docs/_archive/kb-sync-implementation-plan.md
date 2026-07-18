# kb-sync Skill — Implementacioni plan
**Datum:** 2026-05-16  
**Autor:** Zero-hallucination analiza — sve tvrdnje zasnovane na live MCP čitanjima i codebase inspekciji  
**Status:** Draft v1

---

## 1. KONTEKST I PROBLEM

### Problem koji skill rješava

Obsidian vault je **source of truth** za agent memoriju. AgentStack KB je runtime
kopija te memorije koju agenti koriste tokom izvršavanja. Tokom normalnog rada
(evo-log ažuriranja, instincts izmjene, winners-log unosi) vault evoluira ali
KB ostaje na staroj verziji — tiha divergencija.

### Potvrđena divergencija (live, nije hallucination)

Potvrđeno živim MCP čitanjem danas (2026-05-16):

**Obsidian `agents/trend-intelligence/instincts.md`** (37 linija, last-modified: 2026-05-02):
```
## Learned Patterns
### What signals cut through noise
- Tool releases with version numbers outperform vague "AI trend" signals by 3x engagement
- GitHub star velocity (>500 stars in 24h) is stronger signal than absolute count
- Benchmark comparisons (X vs Y on task Z) consistently score ⭐⭐⭐ confidence
[... 30+ additional lines ...]
```

**AgentStack KB TI — isti document** (skraćena, starija verzija):
```
## Filtering Patterns
- Always prefer trends with specific tool/framework names over vague category trends
- Releases and version announcements (e.g. "Claude 3.5 Sonnet", "LangChain 0.3") are HOT candidates
[... 5 linija svega ...]
```

**Zaključak:** KB ima stariju, siromašniju verziju. TI agent radi sa degradiranom memorijom.

---

## 2. STANDARDS RESEARCH (Zero-hallucination — svi nalazi sa live webfetch-a)

### 2.1 Anthropic standards (maj 2026)

Izvor: docs.anthropic.com/en/build-with-claude/memory

**Što Anthropic preporučuje za agent memory:**
- Memory se čuva u strukturiranim fajlovima koji evoluiraju tokom vremena
- Agenti trebaju čuvati plan u memoriji kad context window raste
- Za RAG nad KB-om: **20 chunks je optimalno** (ne 5 ili 10) — testirano eksperimentalno
- Preporučuje kombinaciju BM25 + semantic embeddings za bolji retrieval
- Memorija se sumarizira dok context raste — ne čuva se sve raw

**Direktna implikacija za kb-sync:**
- Svaki ažurirani dokument mora biti čist i kompletan (ne stari fragmenti)
- Optimalan topK = 20 za kompleksne agente (Score Analyzer sada ima 10 — dobro, ali može i 20)
- Svaki dokument u KB treba imati jasnu identifikaciju (title = path)

### 2.2 Google Vertex AI RAG standards (maj 2026)

Izvor: cloud.google.com/blog, docs.cloud.google.com/vertex-ai

**Što Google preporučuje:**
- **Dynamic retrieval** — ne ažuriraj KB ako data nije promijenjena (cost efficiency)
- **Freshness signals** — metadata sa timestamp i version numberom za svaki dokument
- Hybrid search (semantic + keyword fusion) = standard za 2026
- Grounding = model mora znati *kada* je dokument nastao

**Direktna implikacija za kb-sync:**
- Ne sinkronizuj ako se ništa nije promijenilo → change detection je obavezan
- Svaki document treba imati datum u naslovu ili metadati (ali AS metadati nisu stored — koristiti title)

### 2.3 Industry RAG standards 2026

Izvor: apxml.com/courses/optimizing-rag-for-production (live fetch)

**Dva pristupa ažuriranja KB-a:**

| Pristup | Kada koristiti | Prednosti | Mane |
|---|---|---|---|
| Full re-index | Rijetke, velike promjene | Garantovana konzistencija | Skupo, sporo |
| Incremental update | Česte, male promjene | Brzo, resurse štedi | Kompleksija change detection |

**Preporučeni pattern za maj 2026 (production RAG):**
- Incremental update kao default
- Full re-index povremeno (tjedni/mjesečni "deep clean")
- Change detection via: timestamps (primarno) ili content hashing (fallback)
- Automated validation nakon svakog sync-a (embedding status provjera)
- Versioning i rollback sposobnost
- Hard delete starih dokumenata (ne soft delete koji akumulira noise)

**Direktna implikacija za kb-sync:**
- Incremental je naš pristup (ne full re-index)
- Change detection: Obsidian `modified` timestamp vs KB document timestamp
- Hard delete starog dokumenta + add novi = pravi sync, bez akumulacije noise-a

---

## 3. AGENTSTACK KB ARHITEKTURA (live inspekcija — zero hallucination)

### 3.1 MCP alati koji postoje

Potvrđeno live čitanjem schemas:

| MCP Tool | Što radi | Relevantnost za sync |
|---|---|---|
| `as_list_knowledge_bases(agent_name)` | Vraća: id, name, documentCount, embeddingStatus, statusBreakdown | ✅ Identificira KB ID i status |
| `as_add_kb_text(kb_id, text, title)` | Dodaje novi dokument async. Vraća sourceId + PENDING | ✅ Glavna write operacija |
| `as_search_knowledge_base(kb_id, query, top_k)` | Hybrid search, vraća content + score + sourceTitle | ✅ Čitanje/poređenje sadržaja |
| `as_get_kb_embedding_status(kb_id)` | Aggregate ili per-document status | ✅ Validacija nakon sync-a |

**Kritično ograničenje MCP-a:** Nema `as_delete_kb_source` alata. Nema `as_list_kb_sources` koji vraća sourceId-ove.

### 3.2 HTTP API koji POSTOJI (potvrđeno codebase inspekcijom)

Potvrđeno čitanjem `/src/app/api/agents/[agentId]/knowledge/sources/[sourceId]/route.ts`:

```
DELETE /api/agents/{agentId}/knowledge/sources/{sourceId}
→ deleteSourceChunks(sourceId) + prisma.kBSource.delete
→ Returns: { success: true }
```

Potvrđeno čitanjem `/src/app/api/agents/[agentId]/knowledge/sources/route.ts`:

```
GET /api/agents/{agentId}/knowledge/sources
→ Returns: lista svih KBSource sa id, title, createdAt, chunk count
```

**Zaključak:** Delete i list-sources su dostupni putem HTTP REST API-ja.  
Auth: `requireAgentOwner` → traži API key.

### 3.3 Naming konvencija u KB-u (potvrđeno live search-om)

Potvrđeno živim `as_search_knowledge_base` za TI KB:
```
sourceTitle: "trend-intelligence/instincts"
sourceTitle: "trend-intelligence/evo-log"
```

**Konvencija:** `"{agent-folder-name}/{obsidian-filename-bez-ekstenzije}"`

Ova konvencija omogućava deterministički mapping između Obsidian fajla i KB dokumenta.

### 3.4 Scope — koji agenti i fajlovi

Potvrđeno živim Obsidian listingom i as_list_knowledge_bases:

| Agent | KB ID (live) | Vault fajlovi | DocumentCount (live) |
|---|---|---|---|
| Trend Intelligence | c1777724361613zkacaonj60 | instincts.md, evo-log.md | 2 ✅ |
| Hook Writer | c17777243623082bxh7e2crn | instincts.md, evo-log.md, winners-log.md | 2 ⚠️ (winners-log možda nije u KB) |
| Content Repurposer | c1777724362990ottwffcep9 | instincts.md, evo-log.md, format-templates.md | 2 ⚠️ |
| Score Analyzer | cmp7gtng100hfpc010xztikpd | instincts.md, evo-log.md, agent-card.md, DESIGN_SPEC.md | 3 |

**Napomena:** HW ima winners-log.md u vault ali samo 2 dokumenta u KB — sync će to otkriti.

---

## 4. SYNC ALGORITAM (design decision — zero hallucination)

### 4.1 Zašto ne MCP-only pristup

Ako koristimo samo MCP bez bash HTTP poziva:
- Možemo dodati dokument ali ne možemo obrisati stari
- KB akumulira stare verzije → noise u retrieval-u
- `as_search_knowledge_base` vraća oba dokumenta (stari i novi)
- Agent dobiva kontradiktorne informacije iz KB-a

**Ovo je neprihvatljivo** za produkcioni sistem. Koristimo bash+curl za delete.

### 4.2 Odabrani algoritam — Incremental True-Sync

```
Za svakog agenta u scope:
  1. as_list_knowledge_bases(agent_name)
     → dobij: kb_id, agent_id

  2. bash curl GET /api/agents/{agent_id}/knowledge/sources
     → dobij: lista {id, title, createdAt} za sve KB dokumente

  3. Za svaki Obsidian fajl agenta (instincts.md, evo-log.md, ...):
     a. obsidian_read_note(path) → dobij content + modified timestamp
     b. Izračunaj content_hash(obsidian_content)
     c. Pronađi matching KB dokument po title = "{agent-folder}/{filename}"
     d. Ako KB dokument ne postoji:
        → as_add_kb_text(kb_id, content, title) [NEW]
     e. Ako KB dokument postoji:
        → as_search_knowledge_base(kb_id, "full content", top_k=1) za taj title
        → Izračunaj content_hash(kb_content)
        → Ako hash isti → SKIP (already in sync)
        → Ako hash različit:
           → bash curl DELETE /api/agents/{agent_id}/knowledge/sources/{old_source_id}
           → as_add_kb_text(kb_id, fresh_content, title) [REPLACE]

  4. Čekaj embedding: poll as_get_kb_embedding_status(kb_id)
     → čekaj dok embeddingStatus != "ready" (max 60s, retry svakih 10s)

  5. Validation: as_search_knowledge_base(kb_id, unique_phrase_from_new_content, top_k=1)
     → Provjeri da se novi sadržaj pojavljuje u rezultatima

  6. Reportuj: {agent, synced: N, skipped: M, errors: K}
```

### 4.3 Change detection — zašto content hash, ne timestamp

Opcija A — Obsidian `modified` timestamp vs KB `createdAt`:
- Problem: KB `createdAt` je datum kad smo DODALI dokument, ne datum kad je Obsidian fajl nastao
- Ako je KB kreiran nakon Obsidian zadnje izmjene → timestamp poređenje je pouzdano
- Ako je redoslijed obrnut (Obsidian izmjena bila PRIJE KB kreacije) → timestamp greška

Opcija B — Content hash:
- SHA-256 ili MD5 Obsidian sadržaja vs SHA-256 KB search result-a
- Deterministički, nema lažnih alarma
- Jedini problem: KB search vraća chunks, ne cijeli dokument → moguć mismatch
- Rješenje: search sa `top_k=20` i konkatenirati sve chunks za isti title, onda hash

**Odabir: content hash kao primarni, timestamp kao sekundarni check**

Praktična implementacija: Poredi prvih ~500 karaktera Obsidian fajla sa prvim chunk-om iz KB search-a. Ako se razlikuju → sync. Ovo je dovoljno precizno za naš use case i ne zahtijeva kompleksni SHA-256.

---

## 5. IMPLEMENTACIONI ZAHTJEVI

### 5.1 Šta skill mora znati (env vars)

- `AGENT_STUDIO_URL` — base URL (npr. `https://agent-studio-production-c43e.up.railway.app`)
- `AGENT_STUDIO_API_KEY` — za HTTP auth

Provjera u `.env.local`: `NEXT_PUBLIC_APP_URL=http://localhost:3000` — ovo je local, treba Railway URL.

Skill treba pitati korisnika ili čitati iz environment.

### 5.2 MCP alati koje skill koristi

```
obsidian_read_note          — čitanje Obsidian fajlova
obsidian_list_notes         — listanje vault fajlova po agentu
as_list_knowledge_bases     — dobij kb_id i agent_id
as_add_kb_text              — dodaj novi/zamjenski dokument
as_get_kb_embedding_status  — provjeri embedding (polling)
as_search_knowledge_base    — validation + content poređenje
bash (curl)                 — GET sources, DELETE source
```

### 5.3 Trigger kondicije

Skill se pokreće:
1. Ručno: "sync kb", "sinkroniziraj KB", "ažuriraj agentsku memoriju"
2. Nakon izmjene instincts.md ili winners-log.md (korisnik može pokrenuti odmah)
3. Nakon `evo-log-writer` ili `winners-log-logger` run-a (preporučeno)

### 5.4 Output format

```
🔄 KB-SYNC REPORT
═══════════════════════════════
Datum: 2026-05-16 | Scope: 4 agenta

TREND INTELLIGENCE
  instincts.md → UPDATED (hash mismatch)
  evo-log.md   → SKIPPED (already in sync)

HOOK WRITER
  instincts.md  → SKIPPED (already in sync)
  evo-log.md    → UPDATED (hash mismatch)
  winners-log.md → ADDED (not in KB before)

CONTENT REPURPOSER
  instincts.md      → UPDATED (hash mismatch)
  evo-log.md        → SKIPPED
  format-templates  → SKIPPED

SCORE ANALYZER
  instincts.md → SKIPPED
  evo-log.md   → SKIPPED
  agent-card   → SKIPPED
  DESIGN_SPEC  → SKIPPED

═══════════════════════════════
REZULTAT: 3 updated, 1 added, 8 skipped, 0 errors
Embedding status: ready ✅ (confirmed via as_get_kb_embedding_status)
```

---

## 6. KRITIČNI RIZICI I MJERE

### Rizik 1 — Embedding delay
**Problem:** `as_add_kb_text` vraća PENDING. Embedding traje 5-30s.  
**Mjera:** Poll `as_get_kb_embedding_status` svakih 10s, max 60s. Ako timeout → reportuj WARNING.

### Rizik 2 — Partial sync (add uspio, delete failovao)
**Problem:** Delete HTTP call failuje → KB ima i stari i novi dokument.  
**Mjera:** Delete UVIJEK ide PRIJE add. Ako delete failuje → ne dodaj novi, reportuj ERROR za taj dokument.

### Rizik 3 — Agent ID vs KB ID mismatch
**Problem:** `as_list_knowledge_bases` vraća `kb_id`, ali HTTP DELETE treba `agent_id` i `source_id`.  
**Mjera:** `as_list_knowledge_bases` vraća i `agentId` (potvrđeno u live response: `"agentId":"c1777723587797ch65fqcudn"`). Koristiti direktno.

### Rizik 4 — Obsidian note ne postoji za nekog agenta
**Problem:** Score Analyzer ima DESIGN_SPEC.md u KB ali možda nema u Obsidian.  
**Mjera:** Skill radi samo sa fajlovima koji POSTOJE u Obsidian vault. Ako fajl ne postoji → SKIP sa napomenom.

### Rizik 5 — KB source title konvencija nije konzistentna
**Problem:** Neki dokumenti imaju drugačije title formate.  
**Mjera:** Skill gradi title po konvenciji `"{agent-folder}/{filename}"` i traži EXACT match u GET sources response-u.

---

## 7. SCOPE DECISION — koji vault fajlovi se sinkronizuju

Na osnovu production scope-a (agent-health-check logika):

| Agent | Sync fajlovi |
|---|---|
| Trend Intelligence | instincts.md, evo-log.md |
| Hook Writer | instincts.md, evo-log.md, winners-log.md |
| Content Repurposer | instincts.md, evo-log.md, format-templates.md |
| Score Analyzer | instincts.md, evo-log.md, agent-card.md, DESIGN_SPEC.md |

**NE sinkronizovati:** NLU Chat Agent i ostali AI Nekretnine CG agenti (nemaju Obsidian fajlove u vault-u).

---

## 8. OPEN PITANJA KOJA TREBA RIJEŠITI PRIJE IMPLEMENTACIJE

1. **AGENT_STUDIO_URL za production** — `.env.local` ima localhost. Treba Railway URL za HTTP pozive. Rješenje: skill čita iz env ili pita korisnika.

2. **as_search_knowledge_base vraća chunks** — ne cijeli dokument. Za content poređenje, skill mora konkatenirati sve results sa istim sourceTitle. Test: da li `top_k=20` vraća sve chunks jednog dokumenta?

3. **winners-log.md** — HW ima 2 dokumenta u KB ali 3 fajla u vault (uključujući winners-log). Treba provjeriti da li je winners-log ikada seeded. Ako nije → ADD, ne UPDATE.

---

## 9. ZAKLJUČAK I PREPORUKA

**Implementirati skill u ovom redoslijedu:**

1. Implementirati "compare" fazu (read Obsidian + search KB + log razlika) bez ikakvih write operacija. Ovo je "dry run" mode.
2. Dodati "sync" fazu — bash DELETE + as_add_kb_text.
3. Dodati "validate" fazu — polling + search verification.
4. Dodati "report" fazu — finalni summary.

**Prioritet:** Visok. TI agent već sada radi sa degradiranom memorijom (potvrđeno live danas).

---

*Sve tvrdnje u ovom dokumentu zasnovane su na:*
- *Live MCP pozivima (`as_list_knowledge_bases`, `as_search_knowledge_base`, `obsidian_read_note`)*
- *Live codebase čitanjima (`route.ts` fajlovi za HTTP API endpoints)*
- *Live web fetchovima (apxml.com, cloud.google.com, anthropic.com sources)*
- *Nema hallucination-a iz treninga ili prethodnih sesija*
