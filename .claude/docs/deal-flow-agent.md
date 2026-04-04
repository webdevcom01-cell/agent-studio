# Deal Flow Agent — M&A Due Diligence Subproject

## Overview
Standalone Python FastAPI backend located at `deal-flow-agent/` — wraps 5 specialized M&A
due diligence agents into a REST API. Runs independently of the Next.js app on port 8000.
The same 5 agents also exist as native Agent Studio agents (created 2026-03-27) for chat-based use.

## Tech Stack
- **Framework:** FastAPI 0.115 + Uvicorn
- **AI:** Anthropic Claude (primary) + OpenAI (fallback) via direct SDK
- **DB:** SQLAlchemy + asyncpg + pgvector (shared Supabase instance, separate schema)
- **Validation:** Pydantic v2

## Folder Structure
```
deal-flow-agent/
  backend/
    main.py               ← FastAPI app (lifespan, CORS, /health, all routers)
    config.py             ← Settings (DATABASE_URL, API keys, AI model)
    agents/
      base_agent.py       ← BaseAgent class (common scoring, LLM calls)
      screening_agent.py  ← Strategic fit, market position, red flags
      financial_agent.py  ← DCF, EBITDA multiples, revenue trends, valuation
      risk_agent.py       ← Operational, market, regulatory, ESG risks
      competitive_agent.py← Moat, Porter's Five Forces, market positioning
      legal_agent.py      ← Contracts, IP, compliance, litigation exposure
    routers/
      deals.py            ← CRUD: POST/GET /deals, GET/DELETE /deals/{id}
      agents.py           ← POST /agents/run/{deal_id} (all 5 parallel), GET /agents/results/{deal_id}
      memos.py            ← POST /memos/generate/{deal_id}, GET /memos/{deal_id}
    database/             ← SQLAlchemy models + async session
    integrations/         ← External data sources (LinkedIn, Crunchbase stubs)
    memo/                 ← Investment memo generator (Markdown output)
  Dockerfile
  docker-compose.yml      ← includes pgvector/pgvector:pg16 on port 5433
  requirements.txt
```

## Scoring Model
- Weighted overall score: Screening 15% + Financial 30% + Risk 25% + Competitive 20% + Legal 10%
- Recommendation: ≥72 → **BUY**, ≥55 → **HOLD**, <55 → **PASS**

## Running Locally
```bash
cd deal-flow-agent
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
# Swagger UI: http://localhost:8000/docs
# Health:     http://localhost:8000/health
```

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/deals` | Create new deal |
| GET | `/deals` | List all deals |
| GET | `/deals/{id}` | Get deal detail |
| DELETE | `/deals/{id}` | Delete deal |
| POST | `/agents/run/{deal_id}` | Run all 5 agents in parallel |
| POST | `/agents/run/{deal_id}/{name}` | Run single agent |
| GET | `/agents/results/{deal_id}` | Get all agent results for a deal |
| POST | `/memos/generate/{deal_id}` | Generate investment memo (requires agent results) |
| GET | `/memos/{deal_id}` | Get generated memo |
| GET | `/memos/{deal_id}/markdown` | Get memo as raw Markdown |
| GET | `/health` | Health check (DB status, uptime, AI model, mode) |

## Agent Studio Integration
The same 5 agents exist as native Agent Studio agents (IDs in DB):
- M&A Screening Agent
- M&A Financial Agent
- M&A Risk Agent
- M&A Competitive Agent
- M&A Legal Agent

Use Agent Studio chat for interactive analysis; use the FastAPI backend for programmatic/batch workflows.
