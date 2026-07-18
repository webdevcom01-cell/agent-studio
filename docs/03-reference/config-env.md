# Configuration & Environment Variables

> **Source of truth:** `.env.example` (documented variables) + `grep process.env` across `src/` (variables actually read by the code).
> **Generated:** 2026-07-18 from branch `docs/english-only`

## Documented variables (`.env.example`)

The full commented list with setup instructions lives in [`.env.example`](../../.env.example). Summary:

| Variable | Status | Purpose |
|----------|--------|---------|
| `DEEPSEEK_API_KEY` | required | Default chat model (DeepSeek) |
| `OPENAI_API_KEY` | required | Embeddings (text-embedding-3-small) + OpenAI models |
| `AUTH_SECRET` | required | NextAuth JWT secret |
| `AUTH_GITHUB_ID` | required | GitHub OAuth App ID |
| `AUTH_GITHUB_SECRET` | required | GitHub OAuth App secret |
| `AUTH_GOOGLE_ID` | required | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | required | Google OAuth client secret |
| `DATABASE_URL` | required | PostgreSQL connection |
| `DIRECT_URL` | required | Prisma direct connection (migrations) |
| `REDIS_URL` | required | Redis (BullMQ queue) |
| `DATABASE_URL_APP_USER` | optional | RLS: app-role connection |
| `DATABASE_URL_ADMIN_USER` | optional | RLS: admin-role connection |
| `ANTHROPIC_API_KEY` | optional | Claude models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | optional | Gemini models |
| `GROQ_API_KEY` | optional | Groq (Llama, Compound) |
| `MISTRAL_API_KEY` | optional | Mistral models |
| `MOONSHOT_API_KEY` | optional | Kimi K2 models |
| `ADMIN_USER_IDS` | required in production | Admin access to /api/admin/* |
| `CRON_SECRET` | required in production | Auth for /api/cron/* |
| `ECC_ENABLED` | optional | ECC module feature flag |
| `ECC_MCP_URL` | optional | ECC skills MCP endpoint |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | optional | OpenTelemetry export |
| `OTEL_SERVICE_NAME` | optional | OpenTelemetry service name |
| `SENTRY_DSN` | optional | Sentry server-side |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Sentry client-side |
| `RLS_ENFORCEMENT_ENABLED` | feature flag | PostgreSQL RLS enforcement (default OFF, CI forces ON) |

## Variables read by the code but not documented in `.env.example`

The following variables are read via `process.env` in `src/` but are missing from `.env.example` (candidates for documentation; verify each one's purpose at its usage site):

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
