# API Reference

> **Source of truth:** `src/app/api/**/route.ts` — this document is generated from the actual state of the code.
> **Total routes:** 170 | **Generated:** 2026-07-18 from branch `docs/english-only`

Response convention (see `AGENTS.md`): routes return `{ success, data }` or `{ success, error }`. For authentication details of an individual route, see its `route.ts` file.

Routes are grouped by the first path segment under `/api/`. 37 groups in total.

## A2A Protocol (`/api/a2a`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/a2a/[agentId]/agent-card` | GET | [`route.ts`](../../src/app/api/a2a/[agentId]/agent-card/route.ts) |
| `/api/a2a/agents` | GET | [`route.ts`](../../src/app/api/a2a/agents/route.ts) |

## Admin (`/api/admin`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/admin/flags` | GET, PATCH | [`route.ts`](../../src/app/api/admin/flags/route.ts) |
| `/api/admin/jobs` | GET | [`route.ts`](../../src/app/api/admin/jobs/route.ts) |
| `/api/admin/stats` | GET | [`route.ts`](../../src/app/api/admin/stats/route.ts) |

## Agent-to-Agent Calls (`/api/agent-calls`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/agent-calls` | GET | [`route.ts`](../../src/app/api/agent-calls/route.ts) |
| `/api/agent-calls/circuits` | GET | [`route.ts`](../../src/app/api/agent-calls/circuits/route.ts) |
| `/api/agent-calls/stats` | GET | [`route.ts`](../../src/app/api/agent-calls/stats/route.ts) |

## Agents (`/api/agents`) — 82 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/agents` | GET, POST | [`route.ts`](../../src/app/api/agents/route.ts) |
| `/api/agents/[agentId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/route.ts) |
| `/api/agents/[agentId]/a2a` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/a2a/route.ts) |
| `/api/agents/[agentId]/a2a/card` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/a2a/card/route.ts) |
| `/api/agents/[agentId]/budget` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/budget/route.ts) |
| `/api/agents/[agentId]/card.json` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/card.json/route.ts) |
| `/api/agents/[agentId]/chat` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/chat/route.ts) |
| `/api/agents/[agentId]/checkouts` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/checkouts/route.ts) |
| `/api/agents/[agentId]/children` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/children/route.ts) |
| `/api/agents/[agentId]/conversations` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/conversations/route.ts) |
| `/api/agents/[agentId]/conversations/[conversationId]` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/conversations/[conversationId]/route.ts) |
| `/api/agents/[agentId]/debug/[sessionId]/control` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/debug/[sessionId]/control/route.ts) |
| `/api/agents/[agentId]/debug/[sessionId]/variables` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/debug/[sessionId]/variables/route.ts) |
| `/api/agents/[agentId]/department` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/department/route.ts) |
| `/api/agents/[agentId]/evals` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/evals/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/cases` | DELETE, GET, POST, PUT | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/cases/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/compare` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/compare/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/export` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/export/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/run` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/run/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/run/[runId]/route.ts) |
| `/api/agents/[agentId]/evals/[suiteId]/run/[runId]/export` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/evals/[suiteId]/run/[runId]/export/route.ts) |
| `/api/agents/[agentId]/evals/generate` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/evals/generate/route.ts) |
| `/api/agents/[agentId]/execute` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/execute/route.ts) |
| `/api/agents/[agentId]/export` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/export/route.ts) |
| `/api/agents/[agentId]/flow` | GET, PUT | [`route.ts`](../../src/app/api/agents/[agentId]/flow/route.ts) |
| `/api/agents/[agentId]/flow/versions` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/route.ts) |
| `/api/agents/[agentId]/flow/versions/[versionId]` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/[versionId]/route.ts) |
| `/api/agents/[agentId]/flow/versions/[versionId]/deploy` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/[versionId]/deploy/route.ts) |
| `/api/agents/[agentId]/flow/versions/[versionId]/diff` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/[versionId]/diff/route.ts) |
| `/api/agents/[agentId]/flow/versions/[versionId]/rollback` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/[versionId]/rollback/route.ts) |
| `/api/agents/[agentId]/flow/versions/[versionId]/test` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/flow/versions/[versionId]/test/route.ts) |
| `/api/agents/[agentId]/goals` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/goals/route.ts) |
| `/api/agents/[agentId]/heartbeat` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/heartbeat/route.ts) |
| `/api/agents/[agentId]/heartbeat/context` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/heartbeat/context/route.ts) |
| `/api/agents/[agentId]/heartbeat/runs` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/heartbeat/runs/route.ts) |
| `/api/agents/[agentId]/instincts` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/instincts/route.ts) |
| `/api/agents/[agentId]/knowledge/analytics` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/analytics/route.ts) |
| `/api/agents/[agentId]/knowledge/config` | GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/config/route.ts) |
| `/api/agents/[agentId]/knowledge/drift` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/drift/route.ts) |
| `/api/agents/[agentId]/knowledge/evaluate` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/evaluate/route.ts) |
| `/api/agents/[agentId]/knowledge/maintenance` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/maintenance/route.ts) |
| `/api/agents/[agentId]/knowledge/search` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/search/route.ts) |
| `/api/agents/[agentId]/knowledge/sources` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/sources/route.ts) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]` | DELETE | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/sources/[sourceId]/route.ts) |
| `/api/agents/[agentId]/knowledge/sources/[sourceId]/retry` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/sources/[sourceId]/retry/route.ts) |
| `/api/agents/[agentId]/knowledge/sources/upload` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/knowledge/sources/upload/route.ts) |
| `/api/agents/[agentId]/mcp` | DELETE, GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/mcp/route.ts) |
| `/api/agents/[agentId]/memory` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/memory/route.ts) |
| `/api/agents/[agentId]/memory/[memoryId]` | DELETE, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/memory/[memoryId]/route.ts) |
| `/api/agents/[agentId]/memory/export` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/memory/export/route.ts) |
| `/api/agents/[agentId]/memory/import` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/memory/import/route.ts) |
| `/api/agents/[agentId]/pending-approvals` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/pending-approvals/route.ts) |
| `/api/agents/[agentId]/permissions` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/permissions/route.ts) |
| `/api/agents/[agentId]/pipelines` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/route.ts) |
| `/api/agents/[agentId]/pipelines/[runId]` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/[runId]/route.ts) |
| `/api/agents/[agentId]/pipelines/[runId]/approve` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/[runId]/approve/route.ts) |
| `/api/agents/[agentId]/pipelines/[runId]/cancel` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/[runId]/cancel/route.ts) |
| `/api/agents/[agentId]/pipelines/[runId]/retry` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/[runId]/retry/route.ts) |
| `/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts) |
| `/api/agents/[agentId]/schedules` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/schedules/route.ts) |
| `/api/agents/[agentId]/schedules/[scheduleId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/schedules/[scheduleId]/route.ts) |
| `/api/agents/[agentId]/schedules/[scheduleId]/executions` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/schedules/[scheduleId]/executions/route.ts) |
| `/api/agents/[agentId]/schedules/stats` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/schedules/stats/route.ts) |
| `/api/agents/[agentId]/sdk-sessions` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/sdk-sessions/route.ts) |
| `/api/agents/[agentId]/sdk-sessions/[sessionId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/sdk-sessions/[sessionId]/route.ts) |
| `/api/agents/[agentId]/tasks` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/tasks/route.ts) |
| `/api/agents/[agentId]/tasks/[taskId]` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/tasks/[taskId]/route.ts) |
| `/api/agents/[agentId]/tasks/[taskId]/cancel` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/tasks/[taskId]/cancel/route.ts) |
| `/api/agents/[agentId]/tasks/[taskId]/pause` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/tasks/[taskId]/pause/route.ts) |
| `/api/agents/[agentId]/tasks/[taskId]/resume` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/tasks/[taskId]/resume/route.ts) |
| `/api/agents/[agentId]/traces` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/traces/route.ts) |
| `/api/agents/[agentId]/traces/[traceId]` | DELETE, GET | [`route.ts`](../../src/app/api/agents/[agentId]/traces/[traceId]/route.ts) |
| `/api/agents/[agentId]/trigger/[webhookId]` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/trigger/[webhookId]/route.ts) |
| `/api/agents/[agentId]/webhooks` | GET, POST | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/route.ts) |
| `/api/agents/[agentId]/webhooks/[webhookId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/[webhookId]/route.ts) |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/route.ts) |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions/[executionId]/replay` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/[executionId]/replay/route.ts) |
| `/api/agents/[agentId]/webhooks/[webhookId]/executions/export` | GET | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/export/route.ts) |
| `/api/agents/[agentId]/webhooks/[webhookId]/rotate` | POST | [`route.ts`](../../src/app/api/agents/[agentId]/webhooks/[webhookId]/rotate/route.ts) |
| `/api/agents/discover` | GET | [`route.ts`](../../src/app/api/agents/discover/route.ts) |
| `/api/agents/import` | POST | [`route.ts`](../../src/app/api/agents/import/route.ts) |

## Analytics (`/api/analytics`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/analytics` | GET | [`route.ts`](../../src/app/api/analytics/route.ts) |
| `/api/analytics/activity` | GET | [`route.ts`](../../src/app/api/analytics/activity/route.ts) |
| `/api/analytics/summary` | GET | [`route.ts`](../../src/app/api/analytics/summary/route.ts) |

## API Keys (`/api/api-keys`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/api-keys` | GET, POST | [`route.ts`](../../src/app/api/api-keys/route.ts) |
| `/api/api-keys/[keyId]` | DELETE, PATCH | [`route.ts`](../../src/app/api/api-keys/[keyId]/route.ts) |

## Approvals (HITL) (`/api/approvals`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/approvals` | GET | [`route.ts`](../../src/app/api/approvals/route.ts) |
| `/api/approvals/[requestId]/respond` | POST | [`route.ts`](../../src/app/api/approvals/[requestId]/respond/route.ts) |

## Authentication (`/api/auth`) — 6 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/auth/[...nextauth]` | GET, POST | [`route.ts`](../../src/app/api/auth/[...nextauth]/route.ts) |
| `/api/auth/oauth/google-workspace` | GET | [`route.ts`](../../src/app/api/auth/oauth/google-workspace/route.ts) |
| `/api/auth/oauth/google-workspace/callback` | GET | [`route.ts`](../../src/app/api/auth/oauth/google-workspace/callback/route.ts) |
| `/api/auth/oauth/notion` | GET | [`route.ts`](../../src/app/api/auth/oauth/notion/route.ts) |
| `/api/auth/oauth/notion/callback` | GET | [`route.ts`](../../src/app/api/auth/oauth/notion/callback/route.ts) |
| `/api/auth/register` | POST | [`route.ts`](../../src/app/api/auth/register/route.ts) |

## CLI Generator (`/api/cli-generator`) — 9 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/cli-generator` | GET, POST | [`route.ts`](../../src/app/api/cli-generator/route.ts) |
| `/api/cli-generator/[generationId]` | DELETE, GET | [`route.ts`](../../src/app/api/cli-generator/[generationId]/route.ts) |
| `/api/cli-generator/[generationId]/advance` | POST | [`route.ts`](../../src/app/api/cli-generator/[generationId]/advance/route.ts) |
| `/api/cli-generator/[generationId]/download` | GET | [`route.ts`](../../src/app/api/cli-generator/[generationId]/download/route.ts) |
| `/api/cli-generator/[generationId]/files` | GET | [`route.ts`](../../src/app/api/cli-generator/[generationId]/files/route.ts) |
| `/api/cli-generator/[generationId]/logs` | GET | [`route.ts`](../../src/app/api/cli-generator/[generationId]/logs/route.ts) |
| `/api/cli-generator/[generationId]/publish` | POST | [`route.ts`](../../src/app/api/cli-generator/[generationId]/publish/route.ts) |
| `/api/cli-generator/[generationId]/resume` | POST | [`route.ts`](../../src/app/api/cli-generator/[generationId]/resume/route.ts) |
| `/api/cli-generator/[generationId]/test-mcp` | GET | [`route.ts`](../../src/app/api/cli-generator/[generationId]/test-mcp/route.ts) |

## Collector Proxy (`/api/collector`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/collector/overpass` | POST | [`route.ts`](../../src/app/api/collector/overpass/route.ts) |
| `/api/collector/places` | POST | [`route.ts`](../../src/app/api/collector/places/route.ts) |

## Cron Jobs (`/api/cron`) — 7 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/cron/budget-reset` | GET | [`route.ts`](../../src/app/api/cron/budget-reset/route.ts) |
| `/api/cron/cleanup` | POST | [`route.ts`](../../src/app/api/cron/cleanup/route.ts) |
| `/api/cron/evolve` | POST | [`route.ts`](../../src/app/api/cron/evolve/route.ts) |
| `/api/cron/governance-timeout` | GET | [`route.ts`](../../src/app/api/cron/governance-timeout/route.ts) |
| `/api/cron/migrate-oauth-tokens` | POST | [`route.ts`](../../src/app/api/cron/migrate-oauth-tokens/route.ts) |
| `/api/cron/migrate-webhook-secrets` | POST | [`route.ts`](../../src/app/api/cron/migrate-webhook-secrets/route.ts) |
| `/api/cron/trigger-scheduled-flows` | POST | [`route.ts`](../../src/app/api/cron/trigger-scheduled-flows/route.ts) |

## Decisions (`/api/decisions`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/decisions/[decisionId]` | DELETE, GET, POST | [`route.ts`](../../src/app/api/decisions/[decisionId]/route.ts) |

## Departments (`/api/departments`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/departments` | GET, POST | [`route.ts`](../../src/app/api/departments/route.ts) |
| `/api/departments/[departmentId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/departments/[departmentId]/route.ts) |

## Documentation (`/api/docs`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/docs` | GET | [`route.ts`](../../src/app/api/docs/route.ts) |

## ECC (`/api/ecc`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/ecc/ingest-skills` | POST | [`route.ts`](../../src/app/api/ecc/ingest-skills/route.ts) |

## Evals (`/api/evals`) — 4 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/evals/backfill` | POST | [`route.ts`](../../src/app/api/evals/backfill/route.ts) |
| `/api/evals/scheduled` | POST | [`route.ts`](../../src/app/api/evals/scheduled/route.ts) |
| `/api/evals/standards` | GET | [`route.ts`](../../src/app/api/evals/standards/route.ts) |
| `/api/evals/standards/[category]` | GET | [`route.ts`](../../src/app/api/evals/standards/[category]/route.ts) |

## Goals (`/api/goals`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/goals` | GET, POST | [`route.ts`](../../src/app/api/goals/route.ts) |
| `/api/goals/[goalId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/goals/[goalId]/route.ts) |

## Health Check (`/api/health`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/health` | GET | [`route.ts`](../../src/app/api/health/route.ts) |

## Integrations (`/api/integrations`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/integrations/obsidian` | GET, POST | [`route.ts`](../../src/app/api/integrations/obsidian/route.ts) |

## Invites (`/api/invites`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/invites/[token]/accept` | POST | [`route.ts`](../../src/app/api/invites/[token]/accept/route.ts) |

## Jobs (`/api/jobs`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/jobs/[jobId]` | GET | [`route.ts`](../../src/app/api/jobs/[jobId]/route.ts) |

## Keys (`/api/keys`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/keys/validate` | POST | [`route.ts`](../../src/app/api/keys/validate/route.ts) |

## MCP (`/api/mcp`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/mcp/agent-studio` | POST | [`route.ts`](../../src/app/api/mcp/agent-studio/route.ts) |
| `/api/mcp/proxy/google-workspace/[tokenId]` | POST | [`route.ts`](../../src/app/api/mcp/proxy/google-workspace/[tokenId]/route.ts) |

## MCP Servers (`/api/mcp-servers`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/mcp-servers` | GET, POST | [`route.ts`](../../src/app/api/mcp-servers/route.ts) |
| `/api/mcp-servers/[serverId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/mcp-servers/[serverId]/route.ts) |
| `/api/mcp-servers/[serverId]/test` | POST | [`route.ts`](../../src/app/api/mcp-servers/[serverId]/test/route.ts) |

## Mission (`/api/mission`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/mission` | GET, POST, PUT | [`route.ts`](../../src/app/api/mission/route.ts) |

## OpenAPI Spec (`/api/openapi.json`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/openapi.json` | GET | [`route.ts`](../../src/app/api/openapi.json/route.ts) |

## Organizations (`/api/orgs`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/orgs/[orgId]/invite` | POST | [`route.ts`](../../src/app/api/orgs/[orgId]/invite/route.ts) |
| `/api/orgs/[orgId]/members` | GET | [`route.ts`](../../src/app/api/orgs/[orgId]/members/route.ts) |
| `/api/orgs/[orgId]/members/[memberId]` | DELETE | [`route.ts`](../../src/app/api/orgs/[orgId]/members/[memberId]/route.ts) |

## Pipeline Templates (`/api/pipeline-templates`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/pipeline-templates` | GET | [`route.ts`](../../src/app/api/pipeline-templates/route.ts) |
| `/api/pipeline-templates/[slug]/deploy` | POST | [`route.ts`](../../src/app/api/pipeline-templates/[slug]/deploy/route.ts) |

## Policies (`/api/policies`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/policies` | GET, POST | [`route.ts`](../../src/app/api/policies/route.ts) |
| `/api/policies/[policyId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/policies/[policyId]/route.ts) |
| `/api/policies/[policyId]/decisions` | GET | [`route.ts`](../../src/app/api/policies/[policyId]/decisions/route.ts) |

## Schedules (`/api/schedules`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/schedules/preview` | POST | [`route.ts`](../../src/app/api/schedules/preview/route.ts) |

## SDLC (`/api/sdlc`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/sdlc/metrics` | GET | [`route.ts`](../../src/app/api/sdlc/metrics/route.ts) |

## Skills (`/api/skills`) — 2 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/skills` | GET | [`route.ts`](../../src/app/api/skills/route.ts) |
| `/api/skills/evolve` | POST | [`route.ts`](../../src/app/api/skills/evolve/route.ts) |

## SOMA (`/api/soma`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/soma/review-queue` | GET, POST | [`route.ts`](../../src/app/api/soma/review-queue/route.ts) |
| `/api/soma/review-queue/[batchId]` | GET | [`route.ts`](../../src/app/api/soma/review-queue/[batchId]/route.ts) |
| `/api/soma/review-queue/[batchId]/posts/[postId]` | PATCH | [`route.ts`](../../src/app/api/soma/review-queue/[batchId]/posts/[postId]/route.ts) |

## Tasks (`/api/tasks`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/tasks/[taskId]/checkout` | DELETE, POST | [`route.ts`](../../src/app/api/tasks/[taskId]/checkout/route.ts) |
| `/api/tasks/[taskId]/checkout/force-release` | POST | [`route.ts`](../../src/app/api/tasks/[taskId]/checkout/force-release/route.ts) |
| `/api/tasks/[taskId]/checkout/renew` | POST | [`route.ts`](../../src/app/api/tasks/[taskId]/checkout/renew/route.ts) |

## Templates (`/api/templates`) — 4 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/templates` | GET, POST | [`route.ts`](../../src/app/api/templates/route.ts) |
| `/api/templates/[templateId]` | DELETE, GET, PATCH | [`route.ts`](../../src/app/api/templates/[templateId]/route.ts) |
| `/api/templates/[templateId]/import` | POST | [`route.ts`](../../src/app/api/templates/[templateId]/import/route.ts) |
| `/api/templates/import` | POST | [`route.ts`](../../src/app/api/templates/import/route.ts) |

## User (profile) (`/api/user`) — 3 routes

| Route | Methods | File |
|-------|---------|------|
| `/api/user/account` | DELETE, POST | [`route.ts`](../../src/app/api/user/account/route.ts) |
| `/api/user/complete-onboarding` | POST | [`route.ts`](../../src/app/api/user/complete-onboarding/route.ts) |
| `/api/user/export` | POST | [`route.ts`](../../src/app/api/user/export/route.ts) |

## Users (`/api/users`) — 1 route

| Route | Methods | File |
|-------|---------|------|
| `/api/users/switch-org` | POST | [`route.ts`](../../src/app/api/users/switch-org/route.ts) |
