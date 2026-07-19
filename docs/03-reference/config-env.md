# Configuration & Environment Variables

> **Source of truth:** `.env.example` (documented variables) + `grep process.env` across `src/` (variables actually read by the code).
> **Generated:** 2026-07-19 from branch `docs/env-vars-reference`

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

## Variables read by the code but not listed in `.env.example`

The following 55 variables are read via `process.env` in `src/` but are not in `.env.example`. All are **optional** — each has a verified fallback or degrades gracefully as described. Purpose and unset-behavior were derived from the usage site cited in each row.

### Authentication & SSO

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `AUTH_OIDC_ISSUER` | OIDC issuer URL (must expose /.well-known/openid-configuration) for the dynamic SSO provider | OIDC provider not registered (disabled) | `src/lib/auth.ts:30` |
| `AUTH_OIDC_CLIENT_ID` | OAuth client ID for the dynamic OIDC SSO provider | OIDC provider not registered (disabled) | `src/lib/auth.ts:31` |
| `AUTH_OIDC_CLIENT_SECRET` | OAuth client secret for the dynamic OIDC SSO provider | OIDC provider not registered (disabled) | `src/lib/auth.ts:32` |
| `AUTH_OIDC_DISPLAY_NAME` | Human-readable name shown for the OIDC/SSO login provider | `?? "SSO"` | `src/lib/auth.ts:36` |
| `AUTH_URL` | Public base URL used to normalize NextAuth request origins behind a reverse proxy | falls back to `NEXTAUTH_URL`; if both unset, no origin rewrite | `src/app/api/auth/[...nextauth]/route.ts:29` |
| `NEXTAUTH_URL` | Fallback for `AUTH_URL` in the auth route; also base for the pipeline webhook URL on template deploy | deploy route falls back to `NEXT_PUBLIC_APP_URL`, then a placeholder URL | `src/app/api/auth/[...nextauth]/route.ts:29` |
| `NEXT_PUBLIC_APP_URL` | Public app base URL used as the OpenAPI spec server URL and deploy-webhook fallback | OpenAPI spec falls back to `http://localhost:3000` | `src/lib/openapi/spec.ts:96` |

### Storage (S3)

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `AWS_ACCESS_KEY_ID` | AWS access key for the S3 storage provider (file_operations node) | handler throws "AWS_ACCESS_KEY_ID is required for S3 operations" | `src/lib/runtime/handlers/file-operations-handler.ts:184` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for the S3 client | `?? ""` (S3 auth will fail) | `src/lib/storage/s3-provider.ts:18` |
| `AWS_REGION` | AWS region for the S3 client | `?? "eu-west-1"` | `src/lib/storage/s3-provider.ts:10` |
| `AWS_S3_BUCKET` | Default S3 bucket when a file_operations node does not specify one | `""` (node must supply a bucket) | `src/lib/runtime/handlers/file-operations-handler.ts:20` |

### Node-level provider keys

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `TAVILY_API_KEY` | Tavily provider key for the web_search node | if Brave key also absent, node returns "no API key configured" | `src/lib/runtime/handlers/web-search-handler.ts:55` |
| `BRAVE_SEARCH_API_KEY` | Brave Search provider key for the web_search node (fallback provider) | if Tavily key also absent, node returns "no API key configured" | `src/lib/runtime/handlers/web-search-handler.ts:56` |
| `COHERE_API_KEY` | Cohere key for LLM reranking of KB search results | reranker throws (switch rerank model to llm-rubric/none) | `src/lib/knowledge/reranker.ts:23` |
| `DEEPGRAM_API_KEY` | Deepgram key for STT/TTS in the speech_audio node | throws "DEEPGRAM_API_KEY is required for Deepgram STT/TTS" | `src/lib/audio/stt-providers.ts:71` |
| `ELEVENLABS_API_KEY` | ElevenLabs key for TTS synthesis | throws "ELEVENLABS_API_KEY is required for ElevenLabs TTS" | `src/lib/audio/tts-providers.ts:64` |
| `FAL_API_KEY` | fal.ai key for Flux image generation | throws "FAL_API_KEY is required for Flux models" | `src/lib/image/providers.ts:85` |
| `E2B_API_KEY` | E2B sandbox key enabling isolated code execution | sandbox execution fails closed (`isE2BConfigured()` false) | `src/lib/sandbox/e2b-executor.ts:84` |
| `GOOGLE_PLACES_API_KEY` | Server-side key for the /api/collector/places proxy | falls back to request-body apiKey; both empty → 400 | `src/app/api/collector/places/route.ts:86` |

### Third-party OAuth apps

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `GOOGLE_WORKSPACE_CLIENT_ID` | Google Workspace OAuth client ID (init, callback exchange, token refresh) | OAuth routes return "not configured"; refresh throws | `src/lib/google-workspace/token.ts:50` |
| `GOOGLE_WORKSPACE_CLIENT_SECRET` | Google Workspace OAuth client secret | OAuth routes return "not configured"; refresh throws | `src/lib/google-workspace/token.ts:51` |
| `NOTION_CLIENT_ID` | Notion OAuth app client ID (init + token exchange) | OAuth route returns "Notion OAuth is not configured" | `src/app/api/auth/oauth/notion/route.ts:23` |
| `NOTION_CLIENT_SECRET` | Notion OAuth app client secret (Basic-auth token exchange) | OAuth callback returns "not configured" | `src/app/api/auth/oauth/notion/callback/route.ts:59` |

### SDLC git & deploy

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `GITHUB_TOKEN` | Primary GitHub token for the SDLC git node (clone/push, PR creation) | falls back to `GITHUB_PAT`; neither → git node throws | `src/lib/runtime/handlers/git-node-handler.ts:79` |
| `GITHUB_PAT` | Fallback GitHub token when `GITHUB_TOKEN` is unset | both unset → git node throws | `src/lib/runtime/handlers/git-node-handler.ts:79` |
| `GITLAB_TOKEN` | Primary GitLab token for SDLC clone/push (`oauth2:<token>@host`) | falls back to `GITLAB_PAT`; neither → `{ success: false, error }` | `src/lib/sdlc/git-integration.ts:290` |
| `GITLAB_PAT` | Fallback GitLab token when `GITLAB_TOKEN` is unset | both unset → error result | `src/lib/sdlc/git-integration.ts:290` |
| `GIT_AUTHOR_NAME` | Git commit author/committer name for SDLC commits | `?? "SDLC Pipeline"` | `src/lib/runtime/handlers/git-node-handler.ts:387` |
| `GIT_AUTHOR_EMAIL` | Git commit author/committer email for SDLC commits | `?? "sdlc@agent-studio.app"` | `src/lib/runtime/handlers/git-node-handler.ts:388` |
| `GIT_REPO` | Default `owner/repo` target for the SDLC git node | node's `prRepo` used instead; both empty → handler throws | `src/lib/runtime/handlers/git-node-handler.ts:80` |
| `VERCEL_TOKEN` | Vercel API token for the deploy_trigger node | handler skips gracefully (Railway auto-deploys from push) | `src/lib/runtime/handlers/deploy-trigger-handler.ts:42` |
| `VERCEL_PROJECT_ID` | Default Vercel project ID for deploy_trigger | `""` (node must supply projectId) | `src/lib/runtime/handlers/deploy-trigger-handler.ts:25` |

### Obsidian vault (ECC)

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `OBSIDIAN_VAULT_REPO` | GitHub `owner/repo` of the Obsidian vault the ECC adapter syncs to | adapter config resolves to null (integration disabled) | `src/lib/ecc/obsidian-adapter.ts:53` |
| `OBSIDIAN_GITHUB_TOKEN` | GitHub token for reading/writing the Obsidian vault repo | adapter config resolves to null (integration disabled) | `src/lib/ecc/obsidian-adapter.ts:54` |
| `OBSIDIAN_VAULT_BRANCH` | Git branch of the Obsidian vault repo | `?? "main"` | `src/lib/ecc/obsidian-adapter.ts:59` |
| `OBSIDIAN_VAULT_PATH` | Base subdirectory inside the vault repo | `?? ""` (repo root) | `src/lib/ecc/obsidian-adapter.ts:60` |

### Email & notifications

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `RESEND_API_KEY` | Resend client key for outbound email | warn logged, email silently not sent | `src/lib/email/client.ts:23` |
| `RESEND_FROM_EMAIL` | From address on outbound Resend emails | `|| "Agent Studio <noreply@agent-studio.app>"` | `src/lib/email/client.ts:37` |
| `NOTIFICATION_WEBHOOK_URL` | Webhook URL for eval-regression alerts, notification node fallback sink | empty → no webhook sent (worker returns early) | `src/lib/runtime/handlers/notification-handler.ts:69` |
| `SDLC_SLACK_WEBHOOK_URL` | Slack webhook for SDLC pipeline status/approval messages | falls back to `NOTIFICATION_WEBHOOK_URL`, then no-op | `src/lib/queue/worker.ts:758` |

### Encryption keys

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `WEBHOOK_ENCRYPTION_KEY` | 32-byte base64url key encrypting stored webhook secrets | `encrypt()` throws when key missing | `src/lib/crypto.ts:18` |
| `OAUTH_ENCRYPTION_KEY` | 32-byte base64url key encrypting stored OAuth tokens (isolated from webhook key) | `encrypt()` throws when key missing | `src/lib/crypto.ts:18` |

### Runtime tuning & models

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `COMPACTION_MODEL` | Cheap model ID for context/session summarization during compaction | `|| "gpt-4.1-mini"` | `src/lib/runtime/context-compaction.ts:33` |
| `RAG_TRANSFORM_MODEL` | Model ID for RAG query expansion / HyDE transform | `?? "gpt-4o-mini"` | `src/lib/knowledge/query-transform.ts:14` |
| `CODE_INTERPRETER_MEMORY_MB` | Memory cap (MB) for code_interpreter JS execution | `?? "512"` | `src/lib/runtime/handlers/code-interpreter-handler.ts:58` |
| `DATABASE_QUERY_MAX_ROWS` | Default max rows for the database_query node | `?? "1000"` | `src/lib/runtime/handlers/database-query-handler.ts:22` |
| `DATABASE_QUERY_TIMEOUT_MS` | Query timeout (ms) for the database_query node | `?? "10000"` | `src/lib/runtime/handlers/database-query-handler.ts:24` |
| `DATABASE_READ_URL` | Read-replica connection URL (replica-routed reads + lag measurement) | primary client used; health reports "not-configured" | `src/lib/prisma.ts:42` |
| `MCP_TASK_MAX_DURATION_MS` | Max wall-clock (ms) mcp_task_runner polls a task | `?? 3_600_000` (1 h) | `src/lib/runtime/handlers/mcp-task-runner-handler.ts:26` |
| `MCP_TASK_POLL_INTERVAL_MS` | Poll interval (ms) for mcp_task_runner status checks | `?? 2000` | `src/lib/runtime/handlers/mcp-task-runner-handler.ts:23` |

### Evals & verification

| Variable | Purpose | When unset | Usage site |
|----------|---------|------------|------------|
| `EVAL_AGENT_TIMEOUT_MS` | Per-agent chat timeout (ms) in eval suite runs | `180_000` | `src/lib/queue/worker.ts:121` |
| `EVAL_ALERTS_ENABLED` | Kill-switch for eval regression alerting | enabled unless explicitly `"false"` | `src/lib/constants/eval-alerts.ts:18` |
| `EVAL_REGRESSION_THRESHOLD` | Regression delta fraction [0,1] that triggers an alert | `0.15` | `src/lib/constants/eval-alerts.ts:22` |
| `EVAL_REGRESSION_FLOOR` | Minimum score fraction [0,1] floor for regression alerting | `0.5` | `src/lib/constants/eval-alerts.ts:26` |
| `SKIP_SECURITY_SCAN` | Escape hatch bypassing the post-deploy security scan | scan runs normally; only `"true"` skips | `src/lib/versioning/post-deploy-verifier.ts:244` |
