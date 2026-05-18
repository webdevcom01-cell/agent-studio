# kb-sync Implementacioni plan — Kritički pregled
**Datum:** 2026-05-16  
**Metoda:** Zero-hallucination — svaka tvrdnja potvrđena živim čitanjem source koda, MCP schema-e i baze  
**Nalaz:** 4 kritična problema, 3 važna problema, 2 minorna

---

## PREGLED POTVRĐENIH NALAZA

Svaka stavka ispod je zasnovana na konkretnim linijama koda — ne na pretpostavkama.

---

## 🔴 KRITIČNI PROBLEMI (blokiraju ispravno funkcionisanje)

---

### KRITIČNI #1 — Content comparison metodologija je fundamentalno pogrešna

**Šta plan kaže:**
> "as_search_knowledge_base(kb_id, 'full content', top_k=1) za taj title → Izračunaj content_hash(kb_content)"

**Zašto je ovo pogrešno (potvrđeno iz koda):**

`as_search_knowledge_base` vraća **chunks** — fragmente teksta nastale chunkingom, ne originalni dokument. Potvrđeno iz `mcp-server/src/tools/knowledge.ts`:
```typescript
interface SearchResultItem {
  chunkId: string;
  content: string;       // ← ovo je chunk sadržaj, ne cijeli dokument
  relevanceScore: number;
  sourceDocument: string | null;
}
```

SHA-256 konkateniranih chunks ≠ SHA-256 originalnog teksta jer:
1. Chunking mijenja whitespace i strukturu
2. `top_k=20` max — ali dokument može imati više od 20 chunks
3. Redoslijed chunks u search result nije garantovano isti kao redoslijed u dokumentu
4. Semantic search vraća najrelevantniji chunk, ne sve chunks od istog documenta

**Posljedica:** Svaki put kad skill radi poređenje, hash će biti različit čak i kad Obsidian i KB imaju isti sadržaj. **Skill bi uvijek detektovao "changed" i uvijek brisao+dodavao dokumente. Pravi sync nikad ne bi radio.**

**Ispravno rješenje (potvrđeno iz `ingest.ts` i Prisma schema):**

AgentStack VEĆ čuva SHA-256 hash cijelog teksta u `KBSource.contentHash` polju:
```typescript
// ingest.ts — linija 97-112 (potvrđeno živim čitanjem)
function computeContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
// ... nakon uspješnog embeddinga:
await prisma.kBSource.update({
  data: { status: "READY", contentHash, lastIngestedAt: new Date() }
});
```

HTTP GET `/api/agents/{agentId}/knowledge/sources` vraća cijeli `KBSource` model uključujući `contentHash`. Ispravni algoritam:
```
1. GET /api/agents/{agentId}/knowledge/sources 
   → dobij { id, name, contentHash, status } za svaki dokument
2. Izračunaj SHA-256 Obsidian sadržaja lokalno
3. Poredi hash-eve
4. Ako isti → SKIP (bez ikakvih API poziva)
5. Ako različit → DELETE stari + ADD novi
```

---

### KRITIČNI #2 — Nema podrške za rate limiting (10 POST-ova/minutu)

**Šta plan kaže:**  
Plan ne pominje rate limiting uopšte.

**Šta kod kaže (potvrđeno iz `sources/route.ts` i `rate-limit.ts`):**
```typescript
// sources/route.ts — POST handler
const rateResult = checkRateLimit(`kb-source:${authResult.userId}`, 10);
if (!rateResult.allowed) {
  return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
}

// rate-limit.ts
const WINDOW_MS = 60_000;  // 1 minuta
// checkRateLimit("kb-source:userId", 10) → max 10 poževa u 60 sekundi
```

**Posljedica:** Skill planira sinkronizovati 4 agenta × ~3 fajla = 12 potencijalnih ADD operacija. Ako je nekoliko dokumenata promijenjeno, može se desiti 10+ POST poziva. POST #11 vraća `429 Too Many Requests` — **skill pada na pola sync-a s nepotpunim stanjem KB-a**.

**Ispravno rješenje:**  
Dodati delay od ≥7 sekundi između svake `as_add_kb_text` operacije. Alternativno: batch sve sync operacije i dodati retry logiku za 429 odgovor.

---

### KRITIČNI #3 — Production URL nije dostupan u environment-u

**Šta plan kaže:**
> "Skill čita iz env ili pita korisnika"

**Šta kod kaže (potvrđeno iz `.env` i `.env.local`):**
```
# .env.local
NEXT_PUBLIC_APP_URL="http://localhost:3000"  # ← development URL
```

MCP alati (`as_list_knowledge_bases`, `as_add_kb_text`) rade direktno na bazi (DATABASE_URL) i ne trebaju HTTP URL.  
Ali bash curl pozivi za GET sources i DELETE trebaju HTTP server URL.

`localhost:3000` ne funkcioniše za curl pozive iz Cowork sesije — server nije dostupan izvana.

Potvrđen Railway URL (iz `Request link to Agent Studio` sesije):  
`https://agent-studio-production-c43e.up.railway.app`

**Ali ovaj URL nije u `.env` fajlu projekta** — skill ne može ga automatski pročitati.

**Ispravno rješenje:**  
Skill mora eksplicitno pitati korisnika za AGENT_STUDIO_URL i AGENT_STUDIO_API_KEY na početku, ili tražiti da ih postavi u environment. Dodati u SKILL.md: "Precondition: user must provide AGENT_STUDIO_URL and AGENT_STUDIO_API_KEY".

---

### KRITIČNI #4 — `as_get_kb_embedding_status` ne vraća `contentHash`

**Šta plan kaže:**
> "Poll as_get_kb_embedding_status(kb_id, document_id=documentId)"

Ovo je ispravno ZA PRAĆENJE EMBEDDINGA, ali plan implicitno pretpostavlja da možemo koristiti ovaj alat i za content poređenje.

**Šta kod kaže (potvrđeno iz `knowledge.ts` MCP handler):**
```typescript
// Per-document query u as_get_kb_embedding_status:
`SELECT id, name, status, "errorMsg", "charCount", "createdAt", "updatedAt"
 FROM "KBSource" WHERE id = $1 AND "knowledgeBaseId" = $2`
```

`contentHash` NIJE u ovom SELECT-u. Alat vraća: `id, name, status, charCount, errorMsg, createdAt, updatedAt`.

**Posljedica:** Skill NE MOŽE koristiti `as_get_kb_embedding_status` za content comparison. Mora koristiti HTTP GET za contentHash. Plan je bio nekoherentan — koristio search za comparison i status alat za validaciju, ali nijedan nije odgovarajući za change detection.

---

## 🟡 VAŽNI PROBLEMI (uzrokuju bugove u edge case-ovima)

---

### VAŽNI #1 — Naming nekonzistentnost: "title" vs "name" vs "sourceTitle"

**Problem:** Plan koristi "title" u svim kontekstima, ali tri različita alata vraćaju isti field pod različitim imenima:

| Kontekst | Field ime | Potvrda |
|---|---|---|
| `as_search_knowledge_base` rezultat | `sourceTitle` | `r.sourceDocument` mapped to `sourceTitle` u MCP handler |
| HTTP GET `/knowledge/sources` | `name` | `prisma.kBSource.findMany` — raw DB field |
| `as_add_kb_text` parameter | `title` | MCP param, mapped to `{ name: title }` u HTTP body |
| `as_get_kb_embedding_status` rezultat | `name` | Direct DB query |

**Posljedica:** Ako skill filtrira HTTP GET results po polju "title" umjesto "name", ne pronalazi ništa → tretira svaki dokument kao novi → uvijek dodaje, nikad ne provjerava divergenciju.

**Ispravno rješenje:** SKILL.md mora eksplicitno specificirati:
- Kad čitaš HTTP GET sources → filtriraj po `source.name`
- Kad koristiš as_search → field je `sourceTitle`
- Naming konvencija ostaje ista: `"{agent-folder}/{filename-bez-ekstenzije}"`

---

### VAŽNI #2 — Edge case: DELETE uspije, ADD failuje → KB ostaje bez dokumenta

**Plan kaže:**
> "Ako delete failuje → ne dodaj novi, reportuj ERROR"

Ali plan ne specificira što se dešava kada je **redoslijed obrnut**: DELETE uspije ali `as_add_kb_text` failuje (npr. network timeout, rate limit).

**Posljedica:** KB nema ni stari ni novi dokument. Agent radi bez memorijskog dokumenta. Ni jedna od narednih operacija ne detektuje ovo jer je `documentCount` smanjen, ne nula.

**Ispravno rješenje:**
```
1. Provjeri da ADD radi prije DELETE (test sa dummy dokumentom? Ne.)
2. Bolje: radi u redoslijedu — ADD novi, čekaj READY status, ZATIM DELETE stari
   → KB nikad nema gap, samo kratko ima duplikat (stari + novi)
3. Ako DELETE failuje nakon uspješnog ADD → reportuj WARNING (duplikat), ali sadržaj je ispravan
```

Ovaj redoslijed ADD→wait→DELETE je industriski standard i eliminira KB gap.

---

### VAŽNI #3 — `customMetadata` nije stored — timestamp comparison nije opcija

**Plan pominje** timestamp kao alternativu za change detection.

**Potvrđeno iz koda:**
```typescript
// sources/route.ts POST handler
const source = await prisma.kBSource.create({
  data: {
    name, type,
    rawContent: type === "TEXT" ? body.content : null,
    knowledgeBaseId: agent.knowledgeBase.id,
    status: "PENDING",
    // customMetadata: body.metadata  ← NIJE OVDJE, metadata se NE ČUVA
  },
});
```

I iz MCP tool opisa: `"Metadata is accepted but not currently stored by the ingest pipeline"`.

**Posljedica:** Nema načina čuvati Obsidian `modified` timestamp u KB dokumentu. Timestamp comparison je nemoguća.

**Ispravno rješenje:** Jedini pouzdani change detection mehanizam je SHA-256 hash comparison opisano u Kritičnom #1. Plan ne smije nuditi timestamp kao alternativu.

---

## 🟢 MINORNI PROBLEMI (kozmetika ili edge case-ovi niske vjerovatnoće)

---

### MINORNI #1 — `as_get_kb_embedding_status` polling treba document_id, ne samo kb_id

**Plan kaže:** "poll as_get_kb_embedding_status(kb_id)"

`as_add_kb_text` vraća `documentId` (= `KBSource.id`). Skill bi trebao koristiti:
```
as_get_kb_embedding_status(kb_id=KB_ID, document_id=documentId)
```
umjesto aggregate polling-a. Aggregate može biti misleading ako drugi dokumenti u KB-u imaju `processing` status.

---

### MINORNI #2 — winners-log.md HW KB status nije verificiran

Plan ispravno navodi ovo kao otvoreno pitanje. Treba potvrditi živim HTTP GET sources pozivom na početku sync-a. Skill to može uraditi automatski bez user interakcije.

---

## ISPRAVLJENA ARHITEKTURA SYNC ALGORITMA

Na osnovu svih nalaza, ispravan algoritam je:

```
PRECONDITIONS:
  - User je postavio AGENT_STUDIO_URL = "https://agent-studio-production-c43e.up.railway.app"
  - User je postavio AGENT_STUDIO_API_KEY = "<key iz /api/api-keys>"

ZA SVAKOG AGENTA u scope:
  
  KORAK 1 — Fetch KB metadata (MCP)
    as_list_knowledge_bases(agent_name)
    → dobij: kb_id, agent_id

  KORAK 2 — Fetch existing KB sources (bash curl)
    GET {AGENT_STUDIO_URL}/api/agents/{agent_id}/knowledge/sources
    Header: x-api-key: {AGENT_STUDIO_API_KEY}
    → dobij: [ { id, name, contentHash, status, createdAt } ]
    → Indeksiraj po `name` za O(1) lookup

  KORAK 3 — Za svaki Obsidian fajl agenta:
    a. obsidian_read_note(path) → content, modified
    b. Lokalno izračunaj SHA-256(content) = obsidian_hash
    c. Pronađi KB source gdje source.name == "{agent-folder}/{filename}"
    
    d. Ako KB source ne postoji:
       → as_add_kb_text(kb_id, content, title="{agent-folder}/{filename}")
       → Sačekaj READY: as_get_kb_embedding_status(kb_id, document_id=returned_id)
       → Loguj: "ADDED: {title}"
       → Čekaj 7s (rate limit buffer)
    
    e. Ako KB source postoji I source.status == "READY":
       → Poredi: obsidian_hash == source.contentHash?
       → Ako isti: Loguj "SKIPPED: {title} (in sync)" → nastavi
       → Ako različit:
          i.  as_add_kb_text(kb_id, content, title="{agent-folder}/{filename}")
              → Sačekaj READY: poll as_get_kb_embedding_status(kb_id, document_id=new_id)
          ii. bash curl DELETE {AGENT_STUDIO_URL}/api/agents/{agent_id}/knowledge/sources/{old_source_id}
              → Ako DELETE failuje: Loguj WARNING (duplikat, ali sadržaj ispravan)
          → Loguj: "UPDATED: {title}"
          → Čekaj 7s (rate limit buffer)
    
    f. Ako KB source postoji I source.status != "READY":
       → Loguj WARNING: "SKIPPED: {title} (KB source status={status}, manual check needed)"

  KORAK 4 — Final report po agentu:
    ADDED: N | UPDATED: N | SKIPPED: N | WARNINGS: N | ERRORS: N
```

---

## SAŽETAK IZMJENA U ODNOSU NA ORIGINALNI PLAN

| Izmjena | Tip | Razlog |
|---|---|---|
| Change detection: search+hash → HTTP GET contentHash | 🔴 Kritično | SHA-256 chunks ≠ SHA-256 originalnog teksta |
| Sync redoslijed: DELETE→ADD → ADD→wait→DELETE | 🟡 Važno | Eliminira KB gap ako ADD failuje |
| Dodati rate limit buffer: 7s između ADD operacija | 🔴 Kritično | 10 POST/min limit |
| Precondition: AGENT_STUDIO_URL mora biti Railway URL | 🔴 Kritično | localhost ne radi iz Cowork sesije |
| Field name za HTTP matching: "title" → "name" | 🟡 Važno | Raw DB field je `name`, ne `title` |
| Timestamp comparison ukloniti iz opcija | 🟡 Važno | customMetadata nije stored |
| Polling: aggregate → per-document (document_id) | 🟢 Minorno | Preciznije praćenje |

---

## ZAKLJUČAK

Plan je bio konceptualno ispravan (True Sync pristup, bash+MCP kombinacija, contentHash ideja) ali je imao 4 kritična tehnička propusta koji bi spriječili ispravno funkcionisanje. Nakon ovih korekcija, implementacija može početi.

**Naredni korak:** Implementirati SKILL.md na osnovu ispravnog algoritma iz sekcije iznad.

---

*Sve tvrdnje u ovom dokumentu zasnovane su na živom čitanju:*
- `mcp-server/src/tools/knowledge.ts` — puna implementacija MCP alata
- `src/app/api/agents/[agentId]/knowledge/sources/route.ts` — GET, POST, DELETE endpoints
- `src/lib/knowledge/ingest.ts` — contentHash computation i storage
- `prisma/schema.prisma` — KBSource model sa svim poljima
- `src/lib/rate-limit.ts` — WINDOW_MS=60000, limit=10
- `.env`, `.env.local` — URL konfiguracija
