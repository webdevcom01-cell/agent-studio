# Model Classifications

All 61 Prisma models classified by RLS tenancy strategy.
Based on schema analysis of `prisma/schema.prisma` (post PR #125 schema drift sync).
Last updated: 2026-05-23

**Total: 61 models**

| Classification | Count | Strategy |
|---------------|-------|----------|
| TENANT_DIRECT | 13 | Direct `organizationId = current_setting('app.current_org_id', true)` policy |
| TENANT_INDIRECT | 36 | EXISTS subquery via FK chain to Agent → Organization |
| USER_OWNED | 4 | `userId = current_setting('app.current_user_id', true)` policy |
| GLOBAL | 7 | No RLS (5 truly global + 2 NextAuth-managed) |
| AMBIGUOUS | 1 | Requires schema change (add organizationId column) before RLS |

---

## TENANT_DIRECT (13)

These tables have an `organizationId` column directly. Use `tenant-direct.sql.template`
(or `tenant-direct-public.sql.template` for tables with `isPublic`).

| # | Model | isPublic | Notes |
|---|-------|---------|-------|
| 1 | Agent | ✓ | Primary tenant table. Use `tenant-direct-public.sql.template`. Phase 1. |
| 2 | AgentPermissionGrant | — | Links two agents within an org. Direct `organizationId`. Phase 1. |
| 3 | ApprovalPolicy | — | Has both `organizationId` and `agentId`; `organizationId` is primary. Phase 1. |
| 4 | CompanyMission | — | Org-level singleton. Phase 1. |
| 5 | Department | — | Org hierarchy with `parentId` self-ref. Phase 1. |
| 6 | Goal | — | Has `missionId` and `parentGoalId` self-ref; primary tenant is `organizationId`. Phase 1. |
| 7 | HeartbeatConfig | — | Has both `organizationId` and `agentId`; use `organizationId`. Phase 1. |
| 8 | HeartbeatContext | — | Same as HeartbeatConfig. Phase 1. |
| 9 | HeartbeatRun | — | Same as HeartbeatConfig. Phase 1. |
| 10 | Invitation | — | Pure `organizationId` tenant. Phase 1. |
| 11 | OrganizationMember | — | Has `userId` too; primary is `organizationId`. Phase 1. |
| 12 | PolicyDecision | — | Has both `organizationId` and `agentId`; use `organizationId`. Phase 1. |
| 13 | Template | ✓ | Marketplace templates. Use `tenant-direct-public.sql.template`. Phase 1. |

---

## TENANT_INDIRECT (36)

These tables reach `organizationId` via one or more FK hops.
Use `tenant-indirect.sql.template` with appropriate `{{FK_COLUMN}}`, `{{PARENT_TABLE}}`, and `{{PARENT_TENANT_COL}}`.

| # | Model | FK Chain | Notes |
|---|-------|----------|-------|
| 1 | AgentBudget | `agentId → Agent.organizationId` | Phase 2 |
| 2 | AgentCallLog | `callerAgentId → Agent.organizationId` | A2A calls; also has `conversationId`. Phase 2. |
| 3 | AgentCard | `agentId → Agent.organizationId` | Has `isPublic` — marketplace card. Consider `tenant-direct-public` via agent. Phase 2. |
| 4 | AgentExecution | `agentId → Agent.organizationId` | Also has `parentExecutionId` self-ref. Phase 2. |
| 5 | AgentGoalLink | `agentId → Agent.organizationId` | Junction table; also links to Goal. Phase 2. |
| 6 | AgentMCPServer | `agentId → Agent.organizationId` | Junction table. Phase 2. |
| 7 | AgentMemory | `agentId → Agent.organizationId` | Phase 2. |
| 8 | AgentSdkSession | `agentId → Agent.organizationId` | Claude SDK sessions. Phase 2. |
| 9 | AgentSkillPermission | `agentId → Agent.organizationId` | Junction; also links to Skill (GLOBAL). Phase 2. |
| 10 | AnalyticsEvent | `agentId → Agent.organizationId` | Phase 2. |
| 11 | BudgetAlert | `agentId → Agent.organizationId` | Also has `budgetId`. Phase 2. |
| 12 | Conversation | `agentId → Agent.organizationId` | Phase 2. |
| 13 | CostEvent | `agentId → Agent.organizationId` | Also has `budgetId`, `modelId`. Phase 2. |
| 14 | EvalResult | `runId → EvalRun → suiteId → EvalSuite.agentId → Agent.organizationId` | Three hops. Phase 2. |
| 15 | EvalRun | `suiteId → EvalSuite.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 16 | EvalSuite | `agentId → Agent.organizationId` | Phase 2. |
| 17 | EvalTestCase | `suiteId → EvalSuite.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 18 | Flow | `agentId → Agent.organizationId` | `agentId` is `@unique` (1:1). Phase 2. |
| 19 | FlowDeployment | `agentId → Agent.organizationId` | Phase 2. |
| 20 | FlowSchedule | `agentId → Agent.organizationId` | Phase 2. |
| 21 | FlowTrace | `agentId → Agent.organizationId` | Phase 2. |
| 22 | FlowVersion | `flowId → Flow.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 23 | HumanApprovalRequest | `agentId → Agent.organizationId` | Also has `userId`. Phase 2. |
| 24 | Instinct | `agentId → Agent.organizationId` | Also has `promotedToSkillId` → Skill (GLOBAL). Phase 2. |
| 25 | KBChunk | `sourceId → KBSource.knowledgeBaseId → KnowledgeBase.agentId → Agent.organizationId` | Three hops + pgvector. Phase 2. |
| 26 | KBSource | `knowledgeBaseId → KnowledgeBase.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 27 | KnowledgeBase | `agentId → Agent.organizationId` | Phase 2. |
| 28 | ManagedAgentTask | `agentId → Agent.organizationId` | Also has `userId`. Phase 2. |
| 29 | Message | `conversationId → Conversation.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 30 | ModelPerformanceStat | `agentId → Agent.organizationId` | Phase 2. |
| 31 | PipelineMemory | `agentId → Agent.organizationId` | Phase 2. |
| 32 | PipelineRun | `agentId → Agent.organizationId` | Phase 2. |
| 33 | ScheduledExecution | `flowScheduleId → FlowSchedule.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 34 | WebhookConfig | `agentId → Agent.organizationId` | Phase 2. |
| 35 | WebhookDeadLetter | `webhookConfigId → WebhookConfig.agentId → Agent.organizationId` | Two hops. Phase 2. |
| 36 | WebhookExecution | `conversationId → Conversation.agentId → Agent.organizationId` | Two hops. Phase 2. |

---

## USER_OWNED (4)

These tables are scoped to a user, not an organization.
RLS policy uses `app.current_user_id` session variable. Use `user-owned.sql.template`. Phase 3.

| # | Model | Notes |
|---|-------|-------|
| 1 | ApiKey | User API keys. `userId` column. Phase 3. |
| 2 | CLIGeneration | CLI generation history. `userId` column. Phase 3. |
| 3 | GoogleOAuthToken | Per-user Google OAuth. `userId` column. Phase 3. |
| 4 | MCPServer | User-created MCP servers. `userId` column. Phase 3. |

---

## GLOBAL (7)

No RLS policy applied. These tables are either truly global or managed externally.

| # | Model | Reason | Notes |
|---|-------|--------|-------|
| 1 | User | Auth table; no tenant | Cross-org by design |
| 2 | VerificationToken | NextAuth token | Short-lived; no tenant |
| 3 | Skill | Global skill library | Platform-wide |
| 4 | Organization | Org registry | Cross-org admin queries |
| 5 | PipelineTemplate | Global pipeline templates | Platform-wide |
| 6 | Account | NextAuth OAuth accounts | Managed by NextAuth adapter — query via `admin_user` |
| 7 | Session | NextAuth sessions | Managed by NextAuth adapter — query via `admin_user` |

> **Note on Account/Session**: The master plan v2 lists 5 GLOBAL models (excluding Account/Session). Schema analysis shows Account and Session are GLOBAL by the same logic. They are kept GLOBAL to avoid breaking NextAuth sign-in flows.

---

## AMBIGUOUS (1)

Requires schema changes before RLS can be applied.
Use `ambiguous-schema-additions.sql.template` first, then `tenant-direct.sql.template`. Phase 4.

| # | Model | Issue | Resolution |
|---|-------|-------|-----------|
| 1 | AuditLog | Has `userId` but no `organizationId` | Add `organizationId` column, backfill via `OrganizationMember`, then apply TENANT_DIRECT policies |

> **ModelPerformanceStat**: The master plan v2 listed this as potentially AMBIGUOUS. Schema analysis shows it has `agentId` column, making it TENANT_INDIRECT. It is classified as such in this document.

---

## Notes on Phase Ordering

| Phase | Classification | Tables | Risk |
|-------|---------------|--------|------|
| 1 | TENANT_DIRECT (13) | Agent, CompanyMission, Department, Goal, HeartbeatConfig, HeartbeatContext, HeartbeatRun, Invitation, OrganizationMember, PolicyDecision, Template, AgentPermissionGrant, ApprovalPolicy | Low — direct column policy |
| 2 | TENANT_INDIRECT (36) | All agent-linked tables | Medium — subquery per row |
| 3 | USER_OWNED (4) | ApiKey, CLIGeneration, GoogleOAuthToken, MCPServer | Low — simple userId policy |
| 4 | AMBIGUOUS (1) | AuditLog | High — schema change required |

## Sensitive table flags

- **KBChunk**: Phase 2 — contains pgvector embeddings. `SET LOCAL hnsw.ef_search` must be inside `$transaction` before RLS is enabled. See PLAN-V2.md §4.5.
- **AgentCallLog**: Phase 2 — A2A call log with `callerAgentId`/`calleeAgentId`. Policy should use `callerAgentId` as primary FK. Verify cross-org A2A calls still function (the callee may be from a different org).
- **OrganizationMember**: Phase 1 — The table that `is_org_member()` queries. Enable RLS here LAST among Phase 1 tables to avoid bootstrap issues.
- **Account / Session**: GLOBAL (no RLS). These are queried by NextAuth's PrismaAdapter using the main `postgres` connection. Do not enable RLS on them.
