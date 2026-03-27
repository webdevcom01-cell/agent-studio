# DevSecOps Knowledge Base Seeds

This directory contains Markdown documents to be ingested into the Knowledge Bases
of the DevSecOps pipeline agents. Each agent gets a dedicated KB with relevant rules.

## Files

| File | Target Agent KB | Content |
|------|----------------|---------|
| `owasp-top10-2025.md` | Security Scanner | Full OWASP Top 10 (2025) with TypeScript/Next.js code examples |
| `code-quality-rules.md` | Code Quality Analyzer | TypeScript strict rules, complexity, async patterns, DRY |
| `testing-patterns-2026.md` | Test Intelligence Agent | Vitest patterns, coverage requirements, anti-patterns |

## How to Ingest

1. Open each agent in Agent Studio
2. Go to Knowledge Base tab
3. Click "Add Source" → Text tab
4. Paste the content of each `.md` file
5. Click "Process" — it will chunk and embed the content

Alternatively, add via URL pointing to the raw GitHub content once the repo is public.

## Updating the KB

When security rules change, update these files and re-ingest. The RAG pipeline
will automatically use the latest chunks for analysis.
