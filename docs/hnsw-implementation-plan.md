# HNSW Vector Search Optimization — Finalni Plan Implementacije

**Datum:** 2026-03-28
**Autor:** Claude + buky
**Status:** Odobren za implementaciju
**Zasnovano na:** pgvector 0.8.0, Supabase PostgreSQL, 2026 industry standards

---

## Trenutno stanje (pre implementacije)

### Šta radi dobro ✅
- Hybrid search (semantic 70% + BM25 30%) sa RRF fusion
- Redis embedding cache (10min TTL) za ponovljene upite
- Embedding semaphore (max 3 concurrent) za rate limiting
- Reranking (LLM-rubric + Cohere opcija)
- HyDE i multi-query transformacije
- Parent document retrieval
- Context compression (4000 token budget)
- Prompt injection zaštita na chunk sadržaju
- Per-KB konfiguracija (10 parametara)

### Kritični nedostaci ❌
- **NEMA HNSW indeksa** na KBChunk.embedding — svaki semantic search je O(n) full table scan
- **NEMA HNSW indeksa** na AgentMemory.embedding — isti problem za memory search
- **NEMA GIN indeksa** za full-text search — keyword pretrage su isto O(n)
- **NEMA ef_search tuninga** — pgvector koristi default (40), nema per-query optimizacije
- **NEMA vector query latency metrike** — ne znamo koliko search traje
- Koristi `vector(1536)` (float32) — `halfvec(1536)` bi uštedeo 50% memorije

### Tabele sa vektorima

| Tabela | Kolona | Tip | Nullable | Korišćenje |
|--------|--------|-----|----------|------------|
| KBChunk | embedding | vector(1536) | NOT NULL | KB semantic search |
| AgentMemory | embedding | vector(1536) | nullable | Memory semantic search |

### SQL upiti koji koriste vektore

**KBChunk search** (`search.ts:189-202`):
```sql
SELECT c."id", c."content",
  1 - (c."embedding" <=> ${vectorStr}::vector) as similarity,
  c."sourceId", s."name", s."type", c."metadata"
FROM "KBChunk" c
INNER JOIN "KBSource" s ON c."sourceId" = s."id"
WHERE s."knowledgeBaseId" = ${knowledgeBaseId}
  AND s."status" = 'READY'
  AND c."embedding" IS NOT NULL
ORDER BY c."embedding" <=> ${vectorStr}::vector
LIMIT ${topK}
```

**AgentMemory search** (`memory-read-handler.ts:175-186`):
```sql
SELECT id, key, value, category, importance,
  1 - (embedding <=> $1::vector) as similarity
FROM "AgentMemory"
WHERE "agentId" = $2
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $3
```

**Keyword search** (`search.ts:220-235`):
```sql
... WHERE to_tsvector('simple', c."content") @@ plainto_tsquery('simple', ${query})
ORDER BY ts_rank(...) DESC
```

---

## Plan implementacije

### Faza 1A — HNSW indeksi (SQL migracija)

**Effort:** 30 minuta | **Rizik:** Nulti | **Benefit:** ~15-50x ubrzanje semantic pretrage

Kreirati SQL migraciju u Supabase SQL editoru:

```sql
-- ============================================================
-- HNSW Vector Search Optimization
-- Date: 2026-03-28
-- Target: pgvector 0.8.0, Supabase PostgreSQL
-- ============================================================

-- 1. HNSW indeks za KBChunk semantic search
--    m=16: standard za 1536-dim vektore (16 konekcija po čvoru)
--    ef_construction=64: balans brzine izgradnje i preciznosti
--    CONCURRENTLY: ne blokira čitanje/pisanje tokom kreiranja
CREATE INDEX CONCURRENTLY IF NOT EXISTS kbchunk_embedding_hnsw_idx
ON "KBChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 2. HNSW indeks za AgentMemory semantic search
CREATE INDEX CONCURRENTLY IF NOT EXISTS agentmemory_embedding_hnsw_idx
ON "AgentMemory"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 3. GIN indeks za full-text keyword search
--    Ubrzava to_tsvector() @@ plainto_tsquery() upit
CREATE INDEX CONCURRENTLY IF NOT EXISTS kbchunk_content_fts_idx
ON "KBChunk"
USING gin (to_tsvector('simple', content));

-- 4. Composite B-tree indeks za filtered vector queries
--    Search.ts filtrira po sourceId pre vector pretrage
CREATE INDEX CONCURRENTLY IF NOT EXISTS kbchunk_source_ready_idx
ON "KBChunk" (sourceId)
WHERE "embedding" IS NOT NULL;
```

**Parametri (objašnjenje izbora):**

| Parametar | Vrednost | Zašto |
|-----------|----------|-------|
| m | 16 | Standard za 1536-dim. Manje (8) = brži build ali lošiji recall. Više (32) = bolji recall ali duplo više memorije. 16 je sweet spot. |
| ef_construction | 64 | Google Cloud i AWS preporučuju 64-100. 64 je dovoljan za <1M vektora. Za veće datasetove razmotriti 128. |
| CONCURRENTLY | da | Zero downtime. Baza ostaje dostupna tokom izgradnje indeksa. |
| vector_cosine_ops | da | Jedini operator koji koristimo (`<=>` cosine distance). |

**Zašto ne IVFFlat:**
- HNSW je 15.5x brži pri istom recall-u (40.5 vs 2.6 QPS benchmark)
- Nema training step — radi odmah nakon kreiranja
- Inkrementalno se ažurira sa novim podacima
- IVFFlat ima smisla samo za 50M+ statičnih vektora

---

### Faza 1B — ef_search dinamički tuning

**Effort:** 1 sat | **Rizik:** Nulti | **Benefit:** 5-30% bolji recall za složene upite

Dodati `SET LOCAL hnsw.ef_search = N;` pre svakog search upita u `search.ts`.

**Dinamička strategija:**
```
Kratak upit (≤3 reči):  ef_search = 40  (brži, manje kandidata)
Srednji upit (4-8 reči): ef_search = 60  (default, dobar balans)
Dug upit (9+ reči):      ef_search = 100 (precizniji, više kandidata)
```

**Implementacija u `search.ts`:**
```typescript
// Pre svakog semantic search upita
const efSearch = query.split(/\s+/).length <= 3 ? 40
               : query.split(/\s+/).length <= 8 ? 60
               : 100;

await prisma.$executeRaw`SET LOCAL hnsw.ef_search = ${efSearch}`;
// ... zatim normalan search upit
```

`SET LOCAL` važi samo za tekuću transakciju — thread-safe, bez globalnog stanja.

**Implementacija u `memory-read-handler.ts`:**
```typescript
// Fiksno ef_search = 40 za memory search (uvek kratki lookups)
await prisma.$executeRaw`SET LOCAL hnsw.ef_search = 40`;
```

---

### Faza 1C — Search latency metrike

**Effort:** 30 minuta | **Rizik:** Nulti | **Benefit:** Mogućnost benchmark-ovanja pre/posle

Dodati merenje vremena SQL upita u `search.ts`:

```typescript
const start = performance.now();
const results = await prisma.$queryRaw<VectorSearchRow[]>`...`;
const durationMs = performance.now() - start;

// Emit metrika
metrics.histogram('kb.search.vector_query_ms', durationMs, {
  retrievalMode: 'semantic',
  efSearch: String(efSearch),
  topK: String(topK),
  resultCount: String(results.length),
});
```

Isto za keyword search i memory search.

---

### Faza 1D — Verifikacija i benchmark

**Effort:** 30 minuta | **Rizik:** Nulti

1. **Pre indeksa** — pokrenuti 10 search upita, zabeležiti latenciju
2. **Kreirati indekse** (Faza 1A SQL)
3. **Posle indeksa** — pokrenuti istih 10 upita, uporediti latenciju
4. **Verifikovati da HNSW radi:**
```sql
EXPLAIN ANALYZE
SELECT c."id", 1 - (c."embedding" <=> '[0.1,0.2,...]'::vector) as similarity
FROM "KBChunk" c
ORDER BY c."embedding" <=> '[0.1,0.2,...]'::vector
LIMIT 10;
```
Output treba da sadrži `Index Scan using kbchunk_embedding_hnsw_idx` umesto `Seq Scan`.

5. **Verify GIN index:**
```sql
EXPLAIN ANALYZE
SELECT c."id"
FROM "KBChunk" c
WHERE to_tsvector('simple', c."content") @@ plainto_tsquery('simple', 'test query');
```
Treba da prikaže `Bitmap Index Scan using kbchunk_content_fts_idx`.

---

### Faza 2 (buduća) — halfvec migracija

**Effort:** 3-4 sata | **Rizik:** Nizak-Srednji | **Benefit:** 50% manje memorije za indeks

Ovo je odvojena inicijativa za kada baza naraste (>100K chunks):

1. Kreirati novu `halfvec(1536)` kolonu
2. Migrirati podatke: `UPDATE "KBChunk" SET embedding_hv = embedding::halfvec`
3. Kreirati novi HNSW indeks na halfvec koloni
4. Ažurirati search.ts da koristi novu kolonu
5. Drop staru kolonu

**Zašto ne sada:**
- Zahteva schema migraciju + code changes + testing
- Za <100K chunks, float32 HNSW radi odlično
- halfvec benefit je pretežno memorijski — bitan tek pri većem scale-u

---

## Redosled implementacije

| # | Faza | Fajlovi | Effort | Prioritet |
|---|------|---------|--------|-----------|
| 1 | 1A: HNSW + GIN indeksi | Supabase SQL Editor | 30 min | KRITIČAN |
| 2 | 1B: ef_search tuning | search.ts, memory-read-handler.ts | 1h | VISOK |
| 3 | 1C: Latency metrike | search.ts | 30 min | SREDNJI |
| 4 | 1D: Verifikacija | Supabase SQL Editor + test | 30 min | KRITIČAN |
| 5 | 2: halfvec (buduća) | schema + search.ts + migracija | 3-4h | NIZAK (za sada) |

**Ukupno vreme: ~2.5 sata** za faze 1A-1D

---

## Očekivani rezultati

| Metrika | Pre | Posle (očekivano) |
|---------|-----|-------------------|
| Semantic search latency | O(n) seq scan, ~50-500ms | O(log n) HNSW, ~1-10ms |
| Keyword search latency | O(n) tsvector scan | O(1) GIN lookup, ~1-5ms |
| Memory search latency | O(n) seq scan | O(log n) HNSW, ~1-5ms |
| Recall@10 | 100% (exact) | 98-99% (approximate) |
| Index memory overhead | 0 | ~50-100MB za 100K chunks |

**Trade-off:** HNSW je approximate nearest neighbor — recall pada sa ~100% na ~98-99%. Za RAG sisteme ovo je prihvatljivo jer je razlika u kvalitetu odgovora zanemarljiva, a ubrzanje dramatično.

---

## Referentni standardi (2026)

- **Google Cloud** — preporučuje HNSW sa m=16, ef_construction=64 za pgvector
- **AWS Aurora** — HNSW sa parallel builds, ef_construction=100 za high-recall
- **Supabase Docs** — HNSW sa vector_cosine_ops kao default
- **Neon** — halfvec kao standard za nove projekte (50% memory savings)
- **Redis RAG at Scale** — hybrid (semantic + keyword + reranking) kao baseline
- **pgvector 0.8.0** — podržava HNSW, scalar quantization, binary quantization, SIMD

---

## Rizici i mitigacije

| Rizik | Verovatnoća | Mitigacija |
|-------|-------------|------------|
| HNSW build traje dugo za veliki dataset | Niska | CONCURRENTLY ne blokira; za >500K chunks povećati maintenance_work_mem |
| Recall pad od 100% na ~98% | Niska | Za RAG je zanemarljivo; po potrebi povećati ef_search |
| Supabase ograničenja | Niska | Free tier podržava HNSW; check statement_timeout za large builds |
| Halfvec nekompatibilan sa existing code | Srednja | Zato je halfvec u Fazi 2, ne sada |

---

## Fajlovi za izmenu

| Fajl | Izmena |
|------|--------|
| Supabase SQL Editor (ne u repo) | 4 CREATE INDEX naredbe |
| `src/lib/knowledge/search.ts` | Dodati SET LOCAL ef_search + latency metrike |
| `src/lib/runtime/handlers/memory-read-handler.ts` | Dodati SET LOCAL ef_search |
| `CLAUDE.md` (sekcija Knowledge/RAG) | Dokumentovati HNSW indekse i parametre |
