# Knowledge Base — Complete Guide

## What is the Knowledge Base?

The Knowledge Base (KB) is your agent's knowledge store. Instead of the AI answering only from its general knowledge, the KB allows the agent to use your specific data — documentation, FAQ pages, blog posts, manuals.

### How it Works (RAG Pipeline)

```
Add source (URL / text / file)
    ↓
Scraping / parsing content
    ↓
Chunking (splitting text into ~400 token pieces)
    ↓
Embedding (converting each chunk to a 1536-dimension vector)
    ↓
Saving to PostgreSQL (pgvector)
```

When a user asks a question, the agent:
1. Converts the question into an embedding vector
2. Finds the most similar chunks (semantic search + BM25 keyword search)
3. Merges results (Reciprocal Rank Fusion)
4. Optionally re-ranks using an LLM
5. Passes the context to the AI Response node

---

## Source Types

### URL Source
Scrape content from any web page. Agent Studio uses the Cheerio parser which automatically removes navigation, footer, script, and style tags — only useful text remains.

### Text Source
Directly enter text. Useful for internal documents, FAQ answers, or anything not available as a URL.

### File Source (upload)
Upload PDF or DOCX files (max 10 MB). Supported formats:
- PDF — parsed using the pdf-parse library
- DOCX — parsed using the mammoth library

---

## How to Add URL Sources

1. Go to the agent's Knowledge page
2. Click "Add Source"
3. Select the "URL" tab
4. Enter the full URL (with https://)
5. Click "Add"

### Examples of Good URLs

| Type | Example | Why it's good |
|------|---------|--------------|
| FAQ page | https://company.com/faq | Structured questions and answers |
| Documentation | https://docs.company.com/getting-started | Detailed content |
| Blog post | https://company.com/blog/how-to-use-x | Specific topic |
| Help center | https://help.company.com/article-123 | User instructions |

### URLs to Avoid

| Type | Example | Why it's bad |
|------|---------|-------------|
| Home page | https://company.com | Too much navigation, little content |
| Login page | https://app.company.com/login | No useful text |
| SPA application | https://app.company.com/dashboard | JavaScript rendering — scraper can't see content |
| Image gallery | https://company.com/gallery | Images are not indexed |

---

## How Many URLs to Add?

There is no strict limit, but here are guidelines:

| Number of URLs | Example use case |
|---------------|-----------------|
| 3-10 | Small FAQ bot, single topic |
| 10-30 | Customer support bot with multiple categories |
| 30-100 | Complete product documentation |
| 100+ | Enterprise help desk (watch quality) |

### Quality > Quantity

It's better to have 10 URLs with clean, relevant content than 100 URLs with noise. Every URL you add goes through chunking and indexing — irrelevant chunks can reduce answer quality.

---

## How to Check if Ingesting Succeeded

### Source Status

On the Knowledge page, each source displays a status:

| Status | Meaning | Action |
|--------|---------|--------|
| PENDING | Waiting to be processed | Wait — it's being processed in order |
| PROCESSING | Scraping and indexing in progress | Wait — can take 10-60 seconds |
| READY | Successfully indexed | Ready for search |
| FAILED | Processing error | Check the URL and try again |

### Chunk Count

Next to each source, the number of chunks is displayed (e.g. "24 chunks"). If a source has 0 chunks but its status is READY, the page probably doesn't have enough text.

### Test Search

The best way to verify is to test the search:

1. On the Knowledge page, use the Search functionality
2. Enter a query related to the source content
3. Check if results return relevant chunks
4. Pay attention to the score — higher score means greater relevance

---

## Tips for Better Search

### 1. Add URLs with Structured Content

Pages with clear headings, paragraphs, and lists produce better chunks than pages with lots of navigation and ads.

### 2. Use Specific URLs Instead of General Ones

```
Bad:  https://company.com
Good: https://company.com/docs/installation
Good: https://company.com/faq/payment
```

### 3. Add Text Sources for Key Information

If you have information that's not on the web (business hours, prices, policies), add it as a Text source. Format it however you want — this produces the cleanest chunks.

### 4. Pay Attention to Language

If users ask questions in one language but KB content is in another, search quality will be lower. Try to have KB content in the same language as the expected questions.

### 5. Combine KB Search with a Good System Prompt

The System Prompt in the AI Response node should tell the agent:
- Use only information from the context
- If there's no answer in the context, tell the user
- Respond in the user's language

Example:
```
You are an assistant for Company X. Answer only based on the provided context.
If the context does not contain the requested information, tell the user you 
don't have that information and direct them to support@company.com.
Be concise — respond in 2-3 sentences when possible.
```

### 6. Test and Iterate

1. Add sources
2. Test with real questions
3. If answers aren't good enough:
   - Add more specific URLs
   - Add Text sources with missing information
   - Improve the System Prompt
4. Repeat until satisfied

---

## Deleting Sources

If a source is not useful or contains outdated information:

1. On the Knowledge page, find the source
2. Click the Delete button
3. The source and all its chunks are deleted from the database

Deletion is permanent — you'll need to re-add the URL if you want it back.

---

## Technical Details

- Chunk size: ~400 tokens with 20% overlap between chunks
- Embedding model: OpenAI text-embedding-3-small (1536 dimensions)
- Search: Hybrid (semantic cosine similarity + BM25 keyword search)
- Ranking: Reciprocal Rank Fusion + optional LLM re-ranking
- Storage: PostgreSQL with pgvector extension
- Max upload: 10 MB per file (PDF/DOCX)
