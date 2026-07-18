# Data Model Reference

> **Source of truth:** `prisma/schema.prisma` — this document is generated from the actual state of the schema.
> **Total models:** 63 | **Generated:** 2026-07-18 from branch `docs/english-only`

The database is PostgreSQL with the `pgvector` extension (embeddings). The ORM is Prisma v6. Migrations are applied exclusively via `pnpm prisma migrate deploy` (see `AGENTS.md`).

| Model | Fields | Schema line | Purpose |
|-------|-------:|-------------|---------|
| `User` | 21 | [`schema.prisma:15`](../../prisma/schema.prisma#L15) | User account |
| `ApiKey` | 14 | [`schema.prisma:46`](../../prisma/schema.prisma#L46) | Hashed API key with scopes and expiry |
| `Account` | 14 | [`schema.prisma:74`](../../prisma/schema.prisma#L74) | OAuth account linking (GitHub/Google) |
| `Session` | 5 | [`schema.prisma:99`](../../prisma/schema.prisma#L99) | NextAuth sessions |
| `VerificationToken` | 3 | [`schema.prisma:109`](../../prisma/schema.prisma#L109) | Email verification |
| `Agent` | 52 | [`schema.prisma:117`](../../prisma/schema.prisma#L117) | Central agent entity |
| `ManagedAgentTask` | 17 | [`schema.prisma:221`](../../prisma/schema.prisma#L221) | Async managed task (job, input/output, progress, callback) |
| `PipelineRun` | 31 | [`schema.prisma:272`](../../prisma/schema.prisma#L272) | SDLC pipeline run (steps, metrics, smart routing) |
| `PipelineMemory` | 6 | [`schema.prisma:346`](../../prisma/schema.prisma#L346) | Per-pipeline-run memory (category, content) |
| `AgentSdkSession` | 13 | [`schema.prisma:359`](../../prisma/schema.prisma#L359) | Claude Agent SDK session (messages, token usage, resume count) |
| `Flow` | 10 | [`schema.prisma:386`](../../prisma/schema.prisma#L386) | Visual workflow (JSON content) |
| `KnowledgeBase` | 22 | [`schema.prisma:400`](../../prisma/schema.prisma#L400) | Per-agent KB configuration |
| `KBSource` | 22 | [`schema.prisma:441`](../../prisma/schema.prisma#L441) | Document source (FILE/URL/SITEMAP/TEXT) |
| `KBChunk` | 11 | [`schema.prisma:470`](../../prisma/schema.prisma#L470) | Text chunk with pgvector embedding |
| `AnalyticsEvent` | 15 | [`schema.prisma:499`](../../prisma/schema.prisma#L499) | Usage tracking (tokens, cost, latency) |
| `Conversation` | 11 | [`schema.prisma:536`](../../prisma/schema.prisma#L536) | Chat session |
| `Message` | 8 | [`schema.prisma:558`](../../prisma/schema.prisma#L558) | Chat message |
| `MCPServer` | 15 | [`schema.prisma:577`](../../prisma/schema.prisma#L577) | MCP server configuration |
| `AgentMCPServer` | 6 | [`schema.prisma:597`](../../prisma/schema.prisma#L597) | Agent↔MCP server mapping |
| `GoogleOAuthToken` | 10 | [`schema.prisma:617`](../../prisma/schema.prisma#L617) | Google Workspace OAuth token |
| `FlowVersion` | 12 | [`schema.prisma:645`](../../prisma/schema.prisma#L645) | Immutable version snapshot |
| `FlowDeployment` | 8 | [`schema.prisma:666`](../../prisma/schema.prisma#L666) | Deployment audit log |
| `AgentCard` | 6 | [`schema.prisma:683`](../../prisma/schema.prisma#L683) | A2A agent metadata |
| `HumanApprovalRequest` | 12 | [`schema.prisma:692`](../../prisma/schema.prisma#L692) | Human-in-the-loop request |
| `AgentCallLog` | 23 | [`schema.prisma:720`](../../prisma/schema.prisma#L720) | A2A call with distributed tracing |
| `CLIGeneration` | 15 | [`schema.prisma:774`](../../prisma/schema.prisma#L774) | CLI generator pipeline run |
| `AgentMemory` | 12 | [`schema.prisma:797`](../../prisma/schema.prisma#L797) | Persistent agent memory with embedding |
| `FlowSchedule` | 19 | [`schema.prisma:836`](../../prisma/schema.prisma#L836) | Cron schedule configuration |
| `ScheduledExecution` | 12 | [`schema.prisma:886`](../../prisma/schema.prisma#L886) | Schedule execution log |
| `WebhookConfig` | 22 | [`schema.prisma:933`](../../prisma/schema.prisma#L933) | Inbound webhook endpoint |
| `WebhookExecution` | 20 | [`schema.prisma:1011`](../../prisma/schema.prisma#L1011) | Webhook trigger log |
| `WebhookDeadLetter` | 9 | [`schema.prisma:1077`](../../prisma/schema.prisma#L1077) | Dead-letter record of failed webhook deliveries |
| `EvalSuite` | 14 | [`schema.prisma:1110`](../../prisma/schema.prisma#L1110) | Test suite for an agent |
| `EvalTestCase` | 11 | [`schema.prisma:1132`](../../prisma/schema.prisma#L1132) | A single test case |
| `EvalRun` | 17 | [`schema.prisma:1148`](../../prisma/schema.prisma#L1148) | A single suite execution |
| `EvalResult` | 13 | [`schema.prisma:1172`](../../prisma/schema.prisma#L1172) | Result of a single test case |
| `AgentExecution` | 16 | [`schema.prisma:1201`](../../prisma/schema.prisma#L1201) | Execution trace (ECC) |
| `Skill` | 17 | [`schema.prisma:1223`](../../prisma/schema.prisma#L1223) | Skill module (ECC) |
| `AgentSkillPermission` | 6 | [`schema.prisma:1253`](../../prisma/schema.prisma#L1253) | Agent↔Skill RBAC permission |
| `Instinct` | 13 | [`schema.prisma:1264`](../../prisma/schema.prisma#L1264) | Learned pattern (ECC, confidence 0-1) |
| `AuditLog` | 10 | [`schema.prisma:1282`](../../prisma/schema.prisma#L1282) | Compliance log |
| `FlowTrace` | 15 | [`schema.prisma:1308`](../../prisma/schema.prisma#L1308) | Debug execution snapshot |
| `CompanyMission` | 8 | [`schema.prisma:1332`](../../prisma/schema.prisma#L1332) | Organization mission (vision, values, goals) |
| `Goal` | 16 | [`schema.prisma:1345`](../../prisma/schema.prisma#L1345) | Hierarchical goal tied to the mission |
| `AgentGoalLink` | 7 | [`schema.prisma:1369`](../../prisma/schema.prisma#L1369) | Agent↔goal link with a role |
| `HeartbeatConfig` | 14 | [`schema.prisma:1388`](../../prisma/schema.prisma#L1388) | Agent heartbeat configuration (cron, system prompt) |
| `HeartbeatContext` | 10 | [`schema.prisma:1412`](../../prisma/schema.prisma#L1412) | Key/value context for heartbeat with TTL |
| `HeartbeatRun` | 13 | [`schema.prisma:1430`](../../prisma/schema.prisma#L1430) | Log of a single heartbeat execution |
| `Department` | 10 | [`schema.prisma:1456`](../../prisma/schema.prisma#L1456) | Organizational unit (hierarchy, agents) |
| `AgentPermissionGrant` | 10 | [`schema.prisma:1473`](../../prisma/schema.prisma#L1473) | Permission grant between agents (scope, expiry) |
| `AgentBudget` | 13 | [`schema.prisma:1495`](../../prisma/schema.prisma#L1495) | Agent budget (hard/soft limit, current spend) |
| `CostEvent` | 10 | [`schema.prisma:1520`](../../prisma/schema.prisma#L1520) | Individual cost entry (model, tokens, USD) |
| `BudgetAlert` | 8 | [`schema.prisma:1539`](../../prisma/schema.prisma#L1539) | Alert on budget overrun |
| `Organization` | 10 | [`schema.prisma:1571`](../../prisma/schema.prisma#L1571) | Organization (plan, members, agents) |
| `OrganizationMember` | 7 | [`schema.prisma:1586`](../../prisma/schema.prisma#L1586) | User membership in an organization with a role |
| `Invitation` | 9 | [`schema.prisma:1600`](../../prisma/schema.prisma#L1600) | Invitation to an organization (token, expiry) |
| `ModelPerformanceStat` | 11 | [`schema.prisma:1616`](../../prisma/schema.prisma#L1616) | Model performance statistics per phase (success, retries, tokens) |
| `Template` | 14 | [`schema.prisma:1636`](../../prisma/schema.prisma#L1636) | Shareable agent template (payload, checksum, import count) |
| `ApprovalPolicy` | 13 | [`schema.prisma:1662`](../../prisma/schema.prisma#L1662) | Action approval policy (pattern, approvers, timeout) |
| `PolicyDecision` | 14 | [`schema.prisma:1687`](../../prisma/schema.prisma#L1687) | Decision under an approval policy (status, resolver) |
| `PipelineTemplate` | 16 | [`schema.prisma:1722`](../../prisma/schema.prisma#L1722) | Pre-built pipeline recipe (agent slugs, steps, setup guide) |
| `SomaReviewBatch` | 13 | [`schema.prisma:1775`](../../prisma/schema.prisma#L1775) | SOMA review batch (trend, angle, status) |
| `SomaReviewPost` | 16 | [`schema.prisma:1802`](../../prisma/schema.prisma#L1802) | SOMA review post (platform, hook, hashtags, quality flags) |
