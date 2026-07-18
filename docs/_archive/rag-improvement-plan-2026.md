# RAG Pipeline — Plan Implementacije 2026

> **Status:** Final v2.0 · Mart 2026
> **Projekat:** agent-studio
> **Osnova:** Dubinska analiza koda (36 identifikovanih problema) + istraživanje trendova (Anthropic, Google, Microsoft, akademska literatura)

---

## 1. Kontekst i motivacija

### 1.1 Gde smo sada

Analiza codebase-a je otkrila da RAG pipeline u agent-studiu ima solidnu arhitekturnu osnovu (5 chunking strategija, hybrid search, reranking, query transform, context ordering), ali pati od kritičnih propusta i propuštenih 2026 industrijalnih standarda:

| Kategorija | Broj problema | Najteži |
|---|---|---|
| Kritični bloker | 3 | RAG nikad ne stiže do LLM-a, nema HNSW indeksa, kb_search handler ne postoji |
| Visoki prioritet | 7 | Lost-in-Middle pogrešan, threshold 0.1, nema multi-turn konteksta |
| Srednji prioritet | 18 | chunkText overflow, HyDE pogrešan model, RRF normalizacija |
| Niski prioritet | 10 | Metrici, circuit breaker, batchevi |

### 1.2 Industrija u 2026 — Šta radi Anthropic

Anthropic je objavio **Contextual Retrieval** — trenutno najefektivniji poznati RAG pristup:

- **Contextual Embeddings**: Svakom chunk-u se prepend-uje LLM-generisan kontekst koji situira chunk u okviru celog dokumenta
- **Contextual BM25**: Isti kontekst se koristi i za BM25 sparse indeks
- **Hybrid fusion 4:1**: Dense embedding skor (1.0) + BM25 skor (0.25)
- **Prompt Caching**: Ceo dokument se kešira u jednom API pozivu, pa se kontekst generiše za svaki chunk za ~90% niže troškove i 2x brže
- **Rezultat**: 49% manje failed retrieval-a, sa rerankingom **67% manje**

```
Originalni chunk:
"Prihodi su porasli za 23% u odnosu na prethodni kvartal."

Sa Contextual prepend-om:
"Ovaj odeljak je iz Q3 2024 finansijskog izveštaja kompanije ACME Corp,
koji diskutuje o kvartalnom performansu. Prihodi su porasli za 23%..."
```

**Alternativa (Jina AI):** Late Chunking — embedduje ceo dokument odjednom pre segmentacije, čuva globalni kontekst bez LLM poziva. Jeftiniji od Contextual Retrieval ali manje precizan za kratke dokumente. Zahteva long-context embedding model (jina-embeddings-v3). Beležimo kao opciju za buduću optimizaciju troškova.

### 1.3 Industrija u 2026 — Šta radi Google

Google Vertex AI RAG stack (production-ready):

1. **Document AI Layout Parser** — struktura-svesno parsiranje (tabele, headings, liste)
2. **Ranking API** — re-rankuje na osnovu query relevantnosti (ne samo nearest neighbor)
3. **Check Grounding API** — validira svaki claim u odgovoru nasuprot fakta iz KB-a, vrši fact-checking
4. **Dynamic Retrieval** — inteligentno bira kada koristiti KB vs training knowledge
5. **Gemini File Search** (2026) — automatski chunkuje, embedduje i pretražuje uploadovane dokumente
6. **Gemini 2.5 + Vector Search** — 95%+ tačnost, < $0.002 po query-ju

### 1.4 Industrija u 2026 — Širi trendovi

| Trend | Status | Relevantnost za agent-studio |
|---|---|---|
| **GraphRAG** (Microsoft) | Production-ready | Srednja — za complex multi-hop queries |
| **Agentic/Self-RAG** | Mainstream | Visoka — agenti sami odlučuju kada da retrievaju |
| **Multi-turn Conversational RAG** | Standard | **Kritična** — chat je naš primarni interfejs |
| **Late Chunking** (Jina) | Mature | Srednja — jeftinija alternativa Contextual Retrieval |
| **ColBERT / Late Interaction** | Growing | Niska — zahteva custom model deployment |
| **Multimodal RAG** | Emerging | Niska (next year) |
| **Context window 1M+** | Standard (Gemini 3, Llama 4) | Visoka — menja threshold logiku |
| **Reasoning modeli** (o1, DeepSeek-R1) | Mainstream | Visoka — bolje koriste retrieved context |
| **MCP + A2A protokoli** | Standard | Već implementirano u projektu |
| **RAGAS + ARES eval frameworks** | Standard | Visoka — moramo meriti RAG kvalitet |
| **Cost: <$1/M tokens** | Reality | Visoka — RAG više nije price bottleneck |

### 1.5 Šta je propušteno u draft planu (v1 → v2 dopune)

| Propust | Uticaj | Dodata faza |
|---|---|---|
| Multi-turn conversation context — query reformulacija na osnovu chat istorije | Kritičan — bez ovoga RAG ignoriše „kaži mi više o tome" | F0.3 |
| kb_search handler ne postoji — CLAUDE.md ga navodi kao node type, ali nema ga | Visok — korisnici ne mogu eksplicitno da koriste KB search u flow-u | F0.4 |
| RRF normalizacija uništava kalibraciju skorova | Srednji — threshold filter postaje nepouzdan | F1.6 |
| Code chunker ne chunka kod — cele funkcije kao jedan chunk | Srednji — code KB ima loš retrieval | F2.6 |
| Markdown header injection dodaje tokene bez provere | Nizak — moguć overflow | F2.7 |
| RAG eval integracija sa postojećim Evals framework-om (RAGAS metrike) | Visok — ne možemo meriti napredak | F3.4 |
| Embedding model migration path | Srednji — promena modela = garbage rezultati | F4.5 |
| UI promene (KB settings, grounding score, RAG toggle) | Visok — korisnici ne vide ništa | F0.2 + F3.3 |

---

## 2. Arhitektura ciljanog stanja

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        INGEST PIPELINE (v2)                              │
│                                                                          │
│  Document → Layout Parser → Chunker → [Contextual Enrichment]          │
│   (PDF/DOCX/   (struktura-   (5+1 strategija:     (LLM prepend,       │
│    HTML/Code)    svesno)       recursive, md,       async, batch,       │
│                                code-v2, sentence,   cacheiran doc)      │
│                                fixed, code)                              │
│                                    ↓                                    │
│  Dedup (hash + semantic) → Embedding → Store (pgvector HNSW + BM25)   │
│  (cosine >0.95 = skip)    (1536 dim)   (contentHash na chunku)         │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                     RETRIEVAL PIPELINE (v2)                              │
│                                                                          │
│  User Message + Chat History → [Conversation-Aware Reformulation]      │
│                                  (sliding window, coreference)          │
│              ↓                                                          │
│  [Agentic Decision: da li retrievovati?]                                │
│   (heuristic fast-path → LLM fallback)                                  │
│              ↓ DA                                                       │
│  [Query Router: factual / analytical / multi-hop / conversational]      │
│              ↓                                                          │
│  Query Transform (HyDE / Multi-Query / none) — per query type          │
│              ↓                                                          │
│  Hybrid Search: Dense (80%) + BM25 Contextual (20%)  [configurable]    │
│              ↓                                                          │
│  RRF Fusion (min-max norm) → Threshold Filter (≥0.5) → Dynamic TopK   │
│              ↓                                                          │
│  Reranking (Cohere / LLM-judge) → Context Ordering (U-shape)          │
│              ↓                                                          │
│  Compress (tiktoken-aware) → Sanitize → Inject u System Prompt         │
└─────────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      LLM GENERATION (v2)                                 │
│                                                                          │
│  System prompt sa <knowledge_base_context> XML tagovima                 │
│  Citation markers → UI prikazuje izvore                                 │
│              ↓ (post-generation)                                        │
│  [Check Grounding] → score 0-1 → log u AnalyticsEvent                 │
│  [RAG Eval Integration] → RAGAS metrike u EvalSuite                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Plan implementacije po fazama

### FAZA 0 — Kritični blokeri (Sprint 1, ~4 dana)

> **Cilj:** RAG počinje da radi end-to-end uključujući multi-turn kontekst.

#### 0.1 HNSW indeks na `KBChunk.embedding`

**Problem:** Full table scan na svakom semantičkom pretrazi.
**Fajl:** SQL migracija (direktno na Supabase)

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS kbchunk_embedding_hnsw_idx
ON "KBChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Napomena:** `CONCURRENTLY` = bez lock-ovanja tabele, sigurno u produkciji.
**Test:** Uporediti `EXPLAIN ANALYZE` pre i posle — očekivanje: 10-50x poboljšanje za >10K chunks.

#### 0.2 RAG ubacivanje u AI Response Handler

**Problem:** `ai-response-handler.ts` i `ai-response-streaming-handler.ts` imaju TODO komentare — KB nikad nije konzultovan.
**Fajlovi:** `src/lib/runtime/handlers/ai-response-handler.ts`, `ai-response-streaming-handler.ts`

```typescript
// Novi helper: src/lib/knowledge/rag-inject.ts
import { searchKnowledgeBase, sanitizeChunkContent } from "@/lib/knowledge/search";
import { extractCitations, formatCitationsForAI } from "@/lib/knowledge/citations";
import type { SearchResult } from "@/lib/knowledge/search";

export interface RAGInjectionResult {
  augmentedSystemPrompt: string;
  retrievedChunks: SearchResult[];
  retrievalTimeMs: number;
}

export async function injectRAGContext(
  systemPrompt: string,
  userMessage: string,
  knowledgeBaseId: string,
  options?: { topK?: number; rerankModel?: string },
): Promise<RAGInjectionResult> {
  const start = Date.now();
  const kbResults = await searchKnowledgeBase(knowledgeBaseId, userMessage, {
    topK: options?.topK ?? 5,
    rerankModel: options?.rerankModel ?? "llm-rubric",
  });

  if (kbResults.length === 0) {
    return { augmentedSystemPrompt: systemPrompt, retrievedChunks: [], retrievalTimeMs: Date.now() - start };
  }

  const citations = extractCitations(kbResults);
  const kbContext = formatCitationsForAI(citations);
  const sanitized = kbContext.split("\n").map(l => sanitizeChunkContent(l)).join("\n");

  const augmented = `${systemPrompt}

<knowledge_base_context>
${sanitized}
</knowledge_base_context>

Koristi gornji kontekst iz knowledge base-a za odgovor. Citiraj izvore kada je moguće.`;

  return {
    augmentedSystemPrompt: augmented,
    retrievedChunks: kbResults,
    retrievalTimeMs: Date.now() - start,
  };
}
```

**Integracija u oba handlera:**
```typescript
if (context.knowledgeBaseId && node.data.enableRAG !== false) {
  const ragResult = await injectRAGContext(systemPrompt, latestUserMessage, context.knowledgeBaseId);
  systemPrompt = ragResult.augmentedSystemPrompt;
  // Log metrike asinhrono
  trackKBRetrieval(context.agentId, ragResult);
}
```

**Property panel:** Dodati toggle "Use Knowledge Base" na `ai_response` node, default `true` za agente sa KB.

#### 0.3 Multi-turn Conversation-Aware Query Reformulation

**Problem:** Korisnik piše "kaži mi više o tome" — RAG pretražuje "kaži mi više o tome" umesto pravog topika.
**Fajl:** `src/lib/knowledge/query-reformulation.ts` (novi fajl)

```typescript
import { generateText } from "ai";
import { getModel } from "@/lib/ai";

/**
 * Reformuliše korisničku poruku koristeći kontekst prethodnih poruka.
 * Sliding window: poslednje 3 razmene (6 poruka).
 */
export async function reformulateWithHistory(
  currentQuery: string,
  chatHistory: Array<{ role: string; content: string }>,
): Promise<string> {
  // Ako je prvi message ili nema istorije, vrati original
  if (chatHistory.length === 0) return currentQuery;

  // Brza heuristika: ako nema zamenica/referenci, ne treba reformulacija
  const hasReference = /\b(to|toga|tome|ono|ova|taj|it|that|this|those|them|they|its|their)\b/i.test(currentQuery);
  const isShort = currentQuery.split(/\s+/).length <= 3;
  if (!hasReference && !isShort) return currentQuery;

  // Sliding window: poslednje 3 razmene
  const recentHistory = chatHistory.slice(-6);
  const historyText = recentHistory
    .map(m => `${m.role === "user" ? "Korisnik" : "Asistent"}: ${m.content.slice(0, 200)}`)
    .join("\n");

  const { text } = await generateText({
    model: getModel("deepseek-chat"),
    prompt: `Reformuliši korisnikovo pitanje tako da bude razumljivo bez konteksta razgovora.

Istorija:
${historyText}

Trenutno pitanje: "${currentQuery}"

Reformulisano pitanje (samo pitanje, bez objašnjenja):`,
    maxTokens: 100,
  });

  return text.trim() || currentQuery;
}
```

**Integracija u RAG inject:**
```typescript
// Pre pretrage KB, reformulisati query:
const reformulatedQuery = await reformulateWithHistory(latestUserMessage, conversationMessages);
const ragResult = await injectRAGContext(systemPrompt, reformulatedQuery, context.knowledgeBaseId);
```

#### 0.4 kb_search Node Handler

**Problem:** CLAUDE.md navodi `kb_search` kao jedan od 32 node tipova, ali handler ne postoji.
**Fajlovi:** `src/lib/runtime/handlers/kb-search-handler.ts` (novi), `handlers/index.ts`

```typescript
// src/lib/runtime/handlers/kb-search-handler.ts
import type { NodeHandler, RuntimeContext, ExecutionResult } from "../types";
import { searchKnowledgeBase } from "@/lib/knowledge/search";
import { resolveTemplate } from "../template";

export const kbSearchHandler: NodeHandler = async (node, context) => {
  const query = resolveTemplate(node.data.query ?? "{{input}}", context.variables);
  const topK = node.data.topK ?? 5;
  const outputVariable = node.data.outputVariable ?? "kb_results";

  if (!context.knowledgeBaseId) {
    return {
      messages: [{ role: "assistant", content: "Knowledge base nije konfigurisan." }],
      nextNodeId: node.data.nextNodeId,
      updatedVariables: { [outputVariable]: [] },
    };
  }

  const results = await searchKnowledgeBase(context.knowledgeBaseId, query, { topK });
  const formatted = results.map(r => ({
    content: r.content.slice(0, 500),
    score: r.relevanceScore,
    source: r.sourceTitle ?? "Unknown",
  }));

  return {
    messages: [{ role: "assistant", content: `Pronađeno ${results.length} rezultata.` }],
    nextNodeId: node.data.nextNodeId,
    updatedVariables: { [outputVariable]: formatted },
  };
};
```

Registrovati u `src/lib/runtime/handlers/index.ts`:
```typescript
import { kbSearchHandler } from "./kb-search-handler";
// ...
kb_search: kbSearchHandler,
```

**Test plan:** Vitest unit test sa mock searchKnowledgeBase, property panel support, node-picker entry.

---

### FAZA 1 — Kvalitet retrievala (Sprint 2, ~5 dana)

> **Cilj:** Implementirati Anthropic Contextual Retrieval + popraviti sve threshold/topK/RRF bugove.

#### 1.1 Contextual Chunk Enrichment (Anthropic pristup)

**Fajl:** `src/lib/knowledge/contextual-enrichment.ts` (novi fajl)

```typescript
const CONTEXT_PROMPT = `<document>
{{WHOLE_DOCUMENT}}
</document>

Ovde je chunk koji treba da situiraš unutar dokumenta:
<chunk>
{{CHUNK_CONTENT}}
</chunk>

Daj kratki kontekst (2-3 rečenice) koji situira ovaj chunk unutar dokumenta.
Odgovori samo sa kontekstom, bez uvoda.`;

export async function enrichChunksWithContext(
  chunks: TextChunk[],
  documentContent: string,
  options?: { concurrency?: number },
): Promise<TextChunk[]> {
  const concurrency = options?.concurrency ?? 5;
  const docPrefix = documentContent.slice(0, 8000);

  // Batch processing sa ograničenom paralelizacijom
  const enriched: TextChunk[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (chunk) => {
        try {
          const { text } = await generateText({
            model: getModel("deepseek-chat"),
            prompt: CONTEXT_PROMPT
              .replace("{{WHOLE_DOCUMENT}}", docPrefix)
              .replace("{{CHUNK_CONTENT}}", chunk.content),
            maxTokens: 150,
          });
          return { ...chunk, content: `${text.trim()}\n\n${chunk.content}` };
        } catch {
          return chunk; // fallback: originalni chunk
        }
      }),
    );
    enriched.push(...results);
  }
  return enriched;
}
```

**Konfiguracija:** Per-KB `contextualEnrichment: boolean` (default `false`). Dodati u KB Settings UI tab.
**Cost:** 1000 chunks × ~300 input tokens × deepseek-chat = ~$0.02 ukupno za ingest.

#### 1.2 Threshold korekcija + Embedding dimenzija validacija

**Fajl:** `src/lib/knowledge/search.ts`

```typescript
// Linija ~15: Threshold 0.1 → 0.5
const DEFAULT_RELEVANCE_THRESHOLD = 0.5;

// Linija ~135: Embedding dimenzija validacija
if (queryEmbedding.length !== (kb.embeddingDimension ?? 1536)) {
  throw new Error(
    `Embedding dimension mismatch: query=${queryEmbedding.length}, ` +
    `kb=${kb.embeddingDimension ?? 1536}. Re-ingest KB with correct model.`
  );
}
```

#### 1.3 Dynamic TopK — ukloniti cap na 7

**Fajl:** `src/lib/knowledge/search.ts` linija ~254

```typescript
export function computeDynamicTopK(query: string, configuredTopK: number): number {
  const wordCount = query.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 3) return Math.min(3, configuredTopK);
  if (wordCount <= 8) return Math.min(configuredTopK, Math.ceil(configuredTopK * 0.6));
  return configuredTopK; // za duge query-je koristi pun konfigurisani topK
}
```

#### 1.4 BM25 Contextual weight (Anthropic 4:1 standard)

**Fajl:** `src/lib/knowledge/search.ts` — RRF fusion sekcija

```typescript
// Dinamički weights na osnovu KB konfiguracije
const semanticWeight = kb.contextualEnrichment ? 0.8 : 0.7;
const bm25Weight = kb.contextualEnrichment ? 0.2 : 0.3;
```

#### 1.5 Lost-in-Middle ispravka (Liu et al. 2023)

**Fajl:** `src/lib/knowledge/context-ordering.ts`

```typescript
export function orderLostInMiddle(results: SearchResult[]): SearchResult[] {
  if (results.length <= 2) return results;
  const sorted = [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  const ordered: SearchResult[] = new Array(sorted.length);
  // U-shape: parni indeksi → front, neparni → back
  let front = 0;
  let back = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) ordered[front++] = sorted[i];
    else ordered[back--] = sorted[i];
  }
  return ordered;
}
```

#### 1.6 RRF normalizacija — min-max umesto divByMax (NOVO)

**Fajl:** `src/lib/knowledge/search.ts` linija ~244

```typescript
// Staro: deli sa max (uništava kalibraciju)
// Novo: min-max normalizacija koja čuva raspored
function normalizeRRFScores(results: SearchResult[]): SearchResult[] {
  if (results.length <= 1) return results;
  const scores = results.map(r => r.relevanceScore);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;
  if (range === 0) return results;
  return results.map(r => ({
    ...r,
    relevanceScore: (r.relevanceScore - minScore) / range,
  }));
}
```

**Test plan za celu fazu:** Unit testovi za computeDynamicTopK, orderLostInMiddle, normalizeRRFScores, enrichChunksWithContext. Minimalno 15 novih test case-ova.

---

### FAZA 2 — Bezbednost i robustnost (Sprint 3, ~4 dana)

> **Cilj:** Prompt injection zaštita, error handling, chunker popravke.

#### 2.1 Prompt Injection Sanitization

**Fajl:** `src/lib/knowledge/search.ts`

```typescript
const INJECTION_PATTERNS = [
  /\[SYSTEM\]/gi,
  /\[INST\]/gi,
  /ignore (previous|above|all) instructions/gi,
  /<\|im_start\|>/gi,
  /###\s*(System|Instruction|Prompt)/gi,
  /\bASSISTANT:\s/gi,
  /\bHUMAN:\s/gi,
];

export function sanitizeChunkContent(content: string): string {
  let sanitized = content.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }
  return sanitized;
}
```

**Plus:** XML tag wrapping pri injekciji (već u F0.2 handleru), defense-in-depth.

#### 2.2 HyDE model fix — koristiti KB-kompatibilan model

**Fajl:** `src/lib/knowledge/query-transform.ts`

```typescript
export async function hydeTransform(query: string, kbConfig?: { embeddingModel?: string }): Promise<string> {
  const llmModel = kbConfig?.embeddingModel?.includes("openai") ? "gpt-4o-mini" : "deepseek-chat";
  // ...
}
```

#### 2.3 Multi-Query deduplication

**Fajl:** `src/lib/knowledge/query-transform.ts`

```typescript
const expanded = text.split("\n").map(l => l.trim()).filter(Boolean).slice(0, MAX_EXPANDED_QUERIES);
const uniqueExpanded = expanded.filter(q => q.toLowerCase() !== query.toLowerCase());
return [query, ...new Set(uniqueExpanded)];
```

#### 2.4 Cohere config error — ne tiha degradacija

**Fajl:** `src/lib/knowledge/reranker.ts`

```typescript
if (!apiKey) {
  throw new Error(
    "COHERE_API_KEY nije konfigurisan. Promeni reranking model u KB podešavanjima " +
    "ili dodaj COHERE_API_KEY environment varijablu."
  );
}
```

#### 2.5 chunkText overflow fix

**Fajl:** `src/lib/knowledge/chunker.ts` linija ~99

```typescript
if (countTokens(combined) <= maxTokens) {
  overlappedChunks.push(combined);
} else {
  overlappedChunks.push(chunks[i]); // bez overlapa ako bi prešlo granicu
}
```

#### 2.6 Code chunker — dodati sub-chunking velikih funkcija (NOVO)

**Fajl:** `src/lib/knowledge/chunker.ts` u `chunkCode()` funkciji

```typescript
// Ako funkcija premašuje maxTokens, podeli na logičke blokove
function chunkCodeBlock(block: string, maxTokens: number): string[] {
  if (countTokens(block) <= maxTokens) return [block];
  // Split po praznim linijama unutar funkcije
  const sections = block.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (countTokens(current + "\n\n" + section) > maxTokens && current) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? current + "\n\n" + section : section;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
```

#### 2.7 Markdown header injection token check (NOVO)

**Fajl:** `src/lib/knowledge/chunker.ts` u `chunkMarkdown()`

```typescript
if (preserveHeaders && lastHeader && !line.match(HEADING_RE)) {
  const headerWithLine = `${lastHeader}\n${line}`;
  // Proveri da li header + linija ne prelazi maxTokens
  if (countTokens(headerWithLine) <= maxTokens) {
    currentChunk = headerWithLine;
  } else {
    currentChunk = line; // preskoči header ako bi prešlo
  }
}
```

**Test plan:** Unit testovi za sanitizeChunkContent (injection patterns), chunkCodeBlock, markdown header overflow. Minimalno 12 novih testova.

---

### FAZA 3 — Agentic RAG + RAG Evaluacija (Sprint 4, ~6 dana)

> **Cilj:** Agenti sami odlučuju kada i kako da retrievaju. Merimo kvalitet po RAGAS standardu.

#### 3.1 Self-RAG Decision Layer

**Fajl:** `src/lib/knowledge/agentic-retrieval.ts` (novi fajl)

```typescript
export async function shouldRetrieve(
  query: string,
  hasKnowledgeBase: boolean,
): Promise<{ retrieve: boolean; reason: string }> {
  if (!hasKnowledgeBase) return { retrieve: false, reason: "no_kb" };

  // Brza heuristika (bez LLM poziva):
  const SKIP_PATTERNS = [/^(zdravo|cao|hvala|ok|da|ne)\b/i, /^(hi|hello|thanks|bye)\b/i];
  if (SKIP_PATTERNS.some(p => p.test(query.trim()))) {
    return { retrieve: false, reason: "greeting_or_simple" };
  }
  if (query.split(/\s+/).length <= 2) {
    return { retrieve: false, reason: "too_short" };
  }

  // Za sve ostalo — retrievuj (konzervativno, bolje previše nego premalo)
  return { retrieve: true, reason: "standard_query" };
}
```

**Napomena:** V1 koristi samo heuristiku (bez LLM poziva) radi latency-ja. LLM-based decision layer dodati u v2 kada imamo metrike.

#### 3.2 Adaptive Query Routing

**Fajl:** `src/lib/knowledge/query-router.ts` (novi fajl)

```typescript
export type QueryType = "factual" | "analytical" | "conversational" | "multi-hop";

export function classifyQuery(query: string): QueryType {
  const wordCount = query.split(/\s+/).length;
  const hasComparison = /compare|razlika|vs\.|versus|između|difference/i.test(query);
  const hasMultiHop = /and also|a takođe|kao i|plus|both|sve/i.test(query);
  if (hasComparison || hasMultiHop) return "multi-hop";
  if (wordCount <= 5) return "factual";
  if (wordCount <= 10) return "conversational";
  return "analytical";
}

export function getSearchConfigForQueryType(type: QueryType) {
  switch (type) {
    case "factual": return { topK: 3, rerankModel: "none" as const };
    case "analytical": return { topK: 8, rerankModel: "llm-rubric" as const };
    case "multi-hop": return { topK: 10, queryTransform: "multi_query" as const };
    case "conversational": return { topK: 5, rerankModel: "none" as const };
  }
}
```

#### 3.3 Check Grounding (Google pristup)

**Fajl:** `src/lib/knowledge/grounding-check.ts` (novi fajl)

```typescript
import { generateObject } from "ai";
import { getModel } from "@/lib/ai";
import { z } from "zod";
import type { SearchResult } from "./search";

const GroundingResultSchema = z.object({
  overallScore: z.number().min(0).max(1),
  claims: z.array(z.object({
    claim: z.string(),
    supported: z.boolean(),
    sourceIndex: z.number().optional(),
  })),
});

export type GroundingResult = z.infer<typeof GroundingResultSchema>;

export async function checkGrounding(
  agentResponse: string,
  retrievedChunks: SearchResult[],
): Promise<GroundingResult> {
  if (retrievedChunks.length === 0) {
    return { overallScore: 1, claims: [] };
  }

  const sources = retrievedChunks.slice(0, 5)
    .map((c, i) => `[${i + 1}] ${c.content.slice(0, 300)}`)
    .join("\n");

  const { object } = await generateObject({
    model: getModel("deepseek-chat"),
    schema: GroundingResultSchema,
    prompt: `Oceni da li su tvrdnje u odgovoru potkrepljene izvorima.

Odgovor: "${agentResponse.slice(0, 1000)}"

Izvori:
${sources}

Vrati overallScore (0-1) i listu tvrdnji (claims) sa supported statusom.`,
    maxTokens: 400,
  });

  return object;
}
```

**Integracija:** Post-generation hook u streaming handleru — logovati grounding score u `AnalyticsEvent`. Prikazati u chat UI kao badge ("85% grounded").

#### 3.4 RAG Eval integracija sa postojećim Evals framework-om (NOVO)

**Problem:** Projekat već ima 3-layer Eval framework (deterministic + semantic + LLM-judge) ali nema RAG-specifičnih assertion tipova.

**Fajl:** `src/lib/evals/schemas.ts` — dodati nove assertion tipove

```typescript
// Dodati u EvalAssertionSchema discriminated union:
{ type: "rag_faithfulness" }     // Da li je odgovor veran retrieved kontekstu
{ type: "rag_context_precision" } // Da li su retrieved chunks relevantni za pitanje
{ type: "rag_answer_relevancy" }  // Da li odgovor zapravo odgovara na pitanje

// Implementacija u src/lib/evals/rag-assertions.ts (novi fajl)
```

**Integracija:** RAGAS-stil evaluacija koristeći postojeći `evaluateAllAssertions()` pipeline — LLM-as-Judge Layer 3.

**Test plan za celu fazu:** Unit testovi za shouldRetrieve, classifyQuery, checkGrounding, RAG eval assertions. Minimalno 20 novih testova.

---

### FAZA 4 — Performanse i observability (Sprint 5, ~5 dana)

> **Cilj:** Circuit breaker, metrike, embedding migration, semantic dedup.

#### 4.1 Embedding API Circuit Breaker

**Fajl:** `src/lib/knowledge/embeddings.ts`

```typescript
import { CircuitBreaker } from "@/lib/a2a/circuit-breaker";

const embeddingCB = new CircuitBreaker({ failureThreshold: 3, successThreshold: 2, timeout: 30_000 });

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return embeddingCB.execute(async () => { /* existing batch code */ });
}
```

#### 4.2 CompressContext tiktoken fix

**Fajl:** `src/lib/knowledge/context-ordering.ts`

```typescript
// Koristiti token-level truncation umesto word split
import { countTokens } from "../knowledge/chunker";
// Truncate na osnovu tokenCount, ne word count
```

#### 4.3 RAG Observability metrike

**Fajl:** `src/lib/analytics.ts` + `src/lib/knowledge/rag-metrics.ts` (novi)

```typescript
// Novi event tipovi:
KB_RETRIEVAL_GROUNDING   // grounding score per response
KB_RETRIEVAL_SKIPPED     // agentic skip decision
KB_RETRIEVAL_TIMING      // per-phase timing breakdown
KB_RETRIEVAL_QUALITY     // reformulation used, query type, result count

interface RAGTimings {
  reformulationMs: number;  // NOVO: multi-turn reformulation time
  agenticDecisionMs: number; // NOVO: should-retrieve decision time
  queryTransformMs: number;
  embeddingMs: number;
  searchMs: number;
  rerankMs: number;
  compressMs: number;
  totalMs: number;
}
```

#### 4.4 Semantic deduplication

**Fajl:** `src/lib/knowledge/deduplication.ts`

```typescript
export async function semanticDedup(chunks: TextChunk[], threshold = 0.95): Promise<TextChunk[]> {
  const embeddings = await generateEmbeddings(chunks.map(c => c.content));
  const kept: TextChunk[] = [chunks[0]];
  const keptEmbeddings: number[][] = [embeddings[0]];
  for (let i = 1; i < chunks.length; i++) {
    const maxSim = Math.max(...keptEmbeddings.map(e => cosineSimilarity(embeddings[i], e)));
    if (maxSim < threshold) {
      kept.push(chunks[i]);
      keptEmbeddings.push(embeddings[i]);
    }
  }
  return kept;
}
```

#### 4.5 Embedding Model Migration Path (NOVO)

**Problem:** Promena embedding modela ostavlja stare chunks sa nekompatibilnim vektorima.
**Fajl:** `src/lib/knowledge/embedding-migration.ts` (novi)

```typescript
export async function migrateEmbeddings(
  knowledgeBaseId: string,
  newModel: string,
  batchSize: number = 50,
): Promise<{ migrated: number; failed: number }> {
  // 1. Nađi sve chunks sa starim embedding modelom
  // 2. Re-embedduj u batchevima sa novim modelom
  // 3. Ažuriraj embedding + embeddingModel na svakom chunk-u
  // 4. Ažuriraj KB config sa novim modelom
  // Koristi circuit breaker za API pozive
}
```

**API:** `POST /api/agents/[agentId]/knowledge/migrate-embeddings` — background job sa progress trackingom.
**UI:** Dugme "Migrate Embeddings" u KB Settings panelu, prikazuje progress bar.

**Test plan za celu fazu:** Unit testovi za circuit breaker, semanticDedup, RAG timing tracking. Minimalno 10 novih testova.

---

## 4. Priority matrica

```
IMPACT
  │
H │  [F0.2 RAG inject]  [F1.1 Contextual]     [F3.3 Grounding]
  │  [F0.1 HNSW idx ]  [F1.2 Threshold]       [F3.4 RAG Evals]
  │  [F0.3 MultiTurn]  [F1.6 RRF fix  ]       [F3.1 Self-RAG]
  │
M │  [F0.4 kb_search]  [F2.1 Injection ]      [F4.3 Metrics  ]
  │  [F1.5 Lost-Mid ]  [F2.2 HyDE model]      [F3.2 Routing  ]
  │  [F1.3 TopK fix ]  [F2.6 Code chunk]      [F4.5 Migration]
  │
L │  [F2.3 MultiQ   ]  [F4.1 Circuit Br]      [F4.4 Sem.Dedup]
  │  [F2.5 Chunk fix]  [F4.2 Compress  ]
  │  [F2.7 MD header]  [F2.4 Cohere err]
  │
  └──────────────────────────────────────────────────────── EFFORT
           Low              Medium                High
```

---

## 5. Timeline

| Sprint | Trajanje | Faza | Deliverable | Test Target |
|---|---|---|---|---|
| Sprint 1 | 4 dana | Faza 0 | HNSW + RAG inject + multi-turn + kb_search → **RAG radi E2E** | 10 novih testova |
| Sprint 2 | 5 dana | Faza 1 | Contextual retrieval + quality popravke + RRF fix | 15 novih testova |
| Sprint 3 | 4 dana | Faza 2 | Bezbednost + chunker popravke | 12 novih testova |
| Sprint 4 | 6 dana | Faza 3 | Agentic RAG + Grounding + RAG Evals | 20 novih testova |
| Sprint 5 | 5 dana | Faza 4 | Circuit breaker + metrike + migration + dedup | 10 novih testova |
| **Ukupno** | **~24 dana** | | **Kompletan RAG v2** | **67+ novih testova** |

---

## 6. Metrike uspeha (KPI)

| Metrika | Trenutno | Cilj Sprint 2 | Cilj Sprint 4 | Kako merimo |
|---|---|---|---|---|
| Retrieval failure rate (top-20) | ~15% (procena) | < 8% | < 3% | RAGAS eval suite |
| Avg query latency P95 | Nemereno | < 800ms | < 500ms | RAGTimings analytics |
| Grounding score (avg) | Nemereno | Baseline | > 0.8 | checkGrounding() per response |
| False positive chunks | Visoko (threshold 0.1) | < 5% | < 2% | Manual sampling + eval |
| Multi-turn accuracy | 0% (ne radi) | > 70% | > 85% | Konverzacioni eval suite |
| Ingest time (1000 chunks) | Nemereno | < 2 min | < 90s | Analytics event |
| RAG eval coverage | 0 assertion types | 3 RAG types | 3 + grounding | EvalSuite count |
| Test coverage RAG lib | ~60% | 80% | 90% | Vitest coverage |

---

## 7. Rizici i mitigacije

| Rizik | Verovatnoća | Uticaj | Mitigacija |
|---|---|---|---|
| Contextual enrichment povećava ingest cost | Visoka | Nizak (deepseek jeftin) | Default OFF, opt-in per KB |
| HNSW indeks blokira tabelu | Niska | Visok | `CONCURRENTLY`, van radnog vremena |
| Threshold 0.5 previše agresivan | Srednja | Srednji | Per-KB konfigurabilno, warning u UI |
| Multi-turn reformulation dodaje latency | Srednja | Srednji | Heuristic fast-path, LLM samo kad treba |
| Self-RAG LLM poziv pre svake pretrage | Visoka | Srednji | V1: samo heuristika, LLM u V2 |
| Prompt injection bypass | Niska | Visok | Defense-in-depth: regex + XML tags + monitoring |
| Embedding migration gubi podatke | Niska | Visok | Backup pre migracije, rollback flag |
| RAGAS eval troši API kredite | Srednja | Nizak | Koristiti deepseek-chat za judge, batch eval |

---

## 8. Tehnički dugovi koji se NEĆE rešavati (scope-out)

- **GraphRAG** (Microsoft knowledge graph) — zahteva novi Prisma model + graph engine; Q3 2026
- **Late Chunking** (Jina) — zahteva long-context embedding model; razmotriti posle F1.1 rezultata
- **ColBERT / Late Interaction** — zahteva custom model deployment; nije justifikovano za naš scale
- **Multimodal RAG** (slike, audio) — zahteva multimodal embedding; 2027
- **Real-time streaming ingest** — nije potrebno za trenutni use case
- **Cohere Rerank API** (as default) — zahteva API key + GDPR; LLM-judge je dovoljno dobar
- **Full RAGAS framework** (pip package) — prevelik dependency; implementiramo core metrike ručno

---

## 9. Zavisnosti i paralelizabilnost

```
PARALELNO (bez zavisnosti):
  F0.1 (HNSW)  ║  F0.4 (kb_search handler)  ║  F2.5 (chunk fix)  ║  F2.7 (MD header)

SEKVENCIJALNO:
  F0.2 (RAG inject) → F0.3 (multi-turn) → F2.1 (injection) → F3.1 (Self-RAG)
  F0.2 (RAG inject) → F3.3 (Grounding) → F4.3 (Metrics)
  F1.1 (Contextual) → F1.4 (BM25 weight)
  F4.1 (Circuit Br) → F4.4 (Sem.Dedup) → F4.5 (Migration)

NEZAVISNO (bilo kad):
  F1.2 (Threshold)  F1.3 (TopK)  F1.5 (Lost-Mid)  F1.6 (RRF)
  F2.2 (HyDE)  F2.3 (MultiQ)  F2.4 (Cohere)  F2.6 (Code chunk)
  F3.2 (Routing)  F3.4 (RAG Evals)
  F4.2 (Compress)
```

---

## 10. Novi fajlovi koji se kreiraju

| Fajl | Faza | Opis |
|---|---|---|
| `src/lib/knowledge/rag-inject.ts` | F0.2 | Centralni helper za RAG injekciju u AI handlere |
| `src/lib/knowledge/query-reformulation.ts` | F0.3 | Multi-turn conversation-aware reformulacija |
| `src/lib/runtime/handlers/kb-search-handler.ts` | F0.4 | Handler za kb_search node tip |
| `src/lib/knowledge/contextual-enrichment.ts` | F1.1 | Anthropic Contextual Retrieval enrichment |
| `src/lib/knowledge/agentic-retrieval.ts` | F3.1 | Self-RAG decision layer |
| `src/lib/knowledge/query-router.ts` | F3.2 | Adaptive query type routing |
| `src/lib/knowledge/grounding-check.ts` | F3.3 | Google-stil Check Grounding |
| `src/lib/evals/rag-assertions.ts` | F3.4 | RAGAS-stil RAG eval assertion tipovi |
| `src/lib/knowledge/rag-metrics.ts` | F4.3 | RAG observability metrike |
| `src/lib/knowledge/embedding-migration.ts` | F4.5 | Embedding model migration tool |

---

## 11. Izmene u postojećim fajlovima

| Fajl | Faze | Izmena |
|---|---|---|
| `src/lib/runtime/handlers/ai-response-handler.ts` | F0.2, F0.3 | RAG inject + multi-turn |
| `src/lib/runtime/handlers/ai-response-streaming-handler.ts` | F0.2, F0.3, F3.3 | RAG inject + grounding |
| `src/lib/runtime/handlers/index.ts` | F0.4 | Registracija kb_search handlera |
| `src/components/builder/property-panel.tsx` | F0.2, F0.4 | RAG toggle, kb_search config |
| `src/components/builder/node-picker.tsx` | F0.4 | kb_search node |
| `src/lib/knowledge/search.ts` | F1.2-F1.4, F1.6 | Threshold, topK, BM25 weight, RRF |
| `src/lib/knowledge/context-ordering.ts` | F1.5, F4.2 | Lost-in-Middle, compress fix |
| `src/lib/knowledge/chunker.ts` | F2.5-F2.7 | Overflow, code, markdown |
| `src/lib/knowledge/query-transform.ts` | F2.2-F2.3 | HyDE model, dedup |
| `src/lib/knowledge/reranker.ts` | F2.4 | Cohere error handling |
| `src/lib/knowledge/embeddings.ts` | F4.1 | Circuit breaker |
| `src/lib/knowledge/deduplication.ts` | F4.4 | Semantic dedup |
| `src/lib/knowledge/ingest.ts` | F1.1 | Contextual enrichment hook |
| `src/lib/evals/schemas.ts` | F3.4 | RAG assertion tipovi |
| `src/lib/analytics.ts` | F4.3 | Novi event tipovi |
| `prisma/schema.prisma` | F4.5 | embeddingModel field na KBChunk |

---

## 12. Reference

### Anthropic
- [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval) — 49-67% manje failed retrievals
- [Prompt Caching — Contextual Embeddings Guide](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide)
- [Contextual Retrieval on Bedrock (AWS)](https://aws.amazon.com/blogs/machine-learning/contextual-retrieval-in-anthropic-using-amazon-bedrock-knowledge-bases/)

### Google
- [Vertex AI RAG Engine overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview)
- [Check Grounding API](https://cloud.google.com/generative-ai-app-builder/docs/check-grounding)
- [Ground responses using RAG](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/ground-responses-using-rag)

### Istraživanja
- [RAG Survey 2026 — arxiv.org](https://arxiv.org/abs/2506.00054)
- [Late Chunking — Jina AI](https://jina.ai/news/late-chunking-in-long-context-embedding-models/)
- [Late Chunking vs Contextual Retrieval — Math Behind](https://medium.com/kx-systems/late-chunking-vs-contextual-retrieval-the-math-behind-rags-context-problem-d5a26b9bbd38)
- [Multi-Turn RAG Comparison — arxiv.org](https://arxiv.org/abs/2602.09552)
- [From RAG to Context — RAGFlow 2025](https://ragflow.io/blog/rag-review-2025-from-rag-to-context)
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/)
- [RAGAS Framework](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [RAG Evaluation Survey](https://arxiv.org/html/2405.07437v2)

### Agent Orchestration
- [A2A Protocol specification](https://a2a-protocol.org/latest/specification/)
- [7 Agentic AI Trends 2026](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)
- [Multi-Agent Orchestration Guide](https://www.codebridge.tech/articles/mastering-multi-agent-orchestration-coordination-is-the-new-scale-frontier)
- [Deloitte: AI Agent Orchestration](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html)

### LLM Trendovi
- [RAG Enterprise Evolution 2026-2030](https://nstarxinc.com/blog/the-next-frontier-of-rag-how-enterprise-knowledge-systems-will-evolve-2026-2030/)
- [RAG Evaluation Metrics — Best Practices](https://www.patronus.ai/llm-testing/rag-evaluation-metrics)

---

*Dokument kreiran: Mart 2026 | Final v2.0 | Sledeći review: po završetku Sprint 2*
