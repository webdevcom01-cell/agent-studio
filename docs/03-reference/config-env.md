# Configuration & Environment Variables

> **Izvor istine:** `.env.example` (dokumentovane varijable) + `grep process.env` kroz `src/` (stvarno korišćene).
> **Generisano:** 2026-07-18 sa grane `docs/reorg-diataxis`

## Dokumentovane varijable (`.env.example`)

Kompletan komentarisan spisak sa uputstvima je u [`.env.example`](../../.env.example). Sažetak:

| Varijabla | Status | Svrha |
|-----------|--------|-------|
| `DEEPSEEK_API_KEY` | obavezno | Default chat model (DeepSeek) |
| `OPENAI_API_KEY` | obavezno | Embeddings (text-embedding-3-small) + OpenAI modeli |
| `AUTH_SECRET` | obavezno | NextAuth JWT secret |
| `AUTH_GITHUB_ID` | obavezno | GitHub OAuth App ID |
| `AUTH_GITHUB_SECRET` | obavezno | GitHub OAuth App secret |
| `AUTH_GOOGLE_ID` | obavezno | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | obavezno | Google OAuth client secret |
| `DATABASE_URL` | obavezno | PostgreSQL konekcija |
| `DIRECT_URL` | obavezno | Prisma direct konekcija (migracije) |
| `REDIS_URL` | obavezno | Redis (BullMQ queue) |
| `DATABASE_URL_APP_USER` | opciono | RLS: app rola konekcija |
| `DATABASE_URL_ADMIN_USER` | opciono | RLS: admin rola konekcija |
| `ANTHROPIC_API_KEY` | opciono | Claude modeli |
| `GOOGLE_GENERATIVE_AI_API_KEY` | opciono | Gemini modeli |
| `GROQ_API_KEY` | opciono | Groq (Llama, Compound) |
| `MISTRAL_API_KEY` | opciono | Mistral modeli |
| `MOONSHOT_API_KEY` | opciono | Kimi K2 modeli |
| `ADMIN_USER_IDS` | obavezno u produkciji | Admin pristup /api/admin/* |
| `CRON_SECRET` | obavezno u produkciji | Auth za /api/cron/* |
| `ECC_ENABLED` | opciono | ECC modul feature flag |
| `ECC_MCP_URL` | opciono | ECC skills MCP endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | opciono | OpenTelemetry export |
| `OTEL_SERVICE_NAME` | opciono | OpenTelemetry ime servisa |
| `SENTRY_DSN` | opciono | Sentry server-side |
| `NEXT_PUBLIC_SENTRY_DSN` | opciono | Sentry client-side |
| `RLS_ENFORCEMENT_ENABLED` | feature flag | PostgreSQL RLS enforcement (default OFF, CI forsira ON) |

## Varijable korišćene u kodu, a nedokumentovane u `.env.example`

Sledeće varijable `src/` kod čita kroz `process.env`, ali nisu u `.env.example` (kandidati za dokumentovanje; svrhu proveriti na mestu upotrebe):

- `API_BASE_URL`
- `AUTH_OIDC_CLIENT_ID`
- `AUTH_OIDC_CLIENT_SECRET`
- `AUTH_OIDC_DISPLAY_NAME`
- `AUTH_OIDC_ISSUER`
- `AUTH_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_SECRET_ACCESS_KEY`
- `BRAVE_SEARCH_API_KEY`
- `CODE_INTERPRETER_MEMORY_MB`
- `COHERE_API_KEY`
- `COMPACTION_MODEL`
- `DATABASE_QUERY_MAX_ROWS`
- `DATABASE_QUERY_TIMEOUT_MS`
- `DATABASE_READ_URL`
- `DEEPGRAM_API_KEY`
- `E2B_API_KEY`
- `ELEVENLABS_API_KEY`
- `EVAL_AGENT_TIMEOUT_MS`
- `EVAL_ALERTS_ENABLED`
- `EVAL_REGRESSION_FLOOR`
- `EVAL_REGRESSION_THRESHOLD`
- `FAL_API_KEY`
- `GITHUB_PAT`
- `GITHUB_TOKEN`
- `GITLAB_PAT`
- `GITLAB_TOKEN`
- `GIT_AUTHOR_EMAIL`
- `GIT_AUTHOR_NAME`
- `GIT_REPO`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_WORKSPACE_CLIENT_ID`
- `GOOGLE_WORKSPACE_CLIENT_SECRET`
- `MCP_TASK_MAX_DURATION_MS`
- `MCP_TASK_POLL_INTERVAL_MS`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `NOTIFICATION_WEBHOOK_URL`
- `NOTION_CLIENT_ID`
- `NOTION_CLIENT_SECRET`
- `OAUTH_ENCRYPTION_KEY`
- `OBSIDIAN_GITHUB_TOKEN`
- `OBSIDIAN_VAULT_BRANCH`
- `OBSIDIAN_VAULT_PATH`
- `OBSIDIAN_VAULT_REPO`
- `RAG_TRANSFORM_MODEL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `SDLC_SLACK_WEBHOOK_URL`
- `SKIP_SECURITY_SCAN`
- `TAVILY_API_KEY`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`
- `WEBHOOK_ENCRYPTION_KEY`
