# Prisma Models & Relations

## Model Relation Tree

```
User
  ├── Account[] (1:N, OAuth account linking, @@unique([provider, providerAccountId]))
  ├── Session[] (1:N, database sessions)
  ├── MCPServer[] (1:N, userId required)
  │     └── AgentMCPServer[] (1:N, cascade delete — join table)
  ├── CLIGeneration[] (1:N, cascade delete — CLI generator pipeline runs)
  ├── GoogleOAuthToken[] (1:N, cascade delete — Google Workspace OAuth tokens)
  └── Agent[] (1:N, userId is optional)
        ├── Flow (1:1, cascade delete)
        │     ├── FlowVersion[] (1:N, cascade delete — immutable content snapshots)
        │     └── activeVersionId? → FlowVersion
        ├── FlowDeployment[] (1:N, cascade delete — deploy audit log)
        ├── KnowledgeBase (1:1, cascade delete)
        │     └── KBSource[] (1:N, cascade delete, retryCount for ingest retries)
        │           └── KBChunk[] (1:N, cascade delete, has vector(1536) embedding)
        ├── AgentCard (1:1, cascade delete — A2A discovery card)
        ├── AgentMCPServer[] (1:N, cascade delete — enabledTools filter)
        ├── AgentCallLog[] (1:N, cascade delete — agent-to-agent call tracing)
        ├── HumanApprovalRequest[] (1:N — human-in-the-loop workflow)
        ├── AnalyticsEvent[] (1:N, cascade delete — response times, KB_SEARCH events)
        ├── FlowSchedule[] (1:N, cascade delete — scheduled execution configs)
        ├── FlowTrace[] (1:N, cascade delete — debug execution snapshots)
        ├── AgentExecution[] (1:N, cascade delete — ECC execution tracking)
        ├── AgentSkillPermission[] (1:N, cascade delete — ECC skill access)
        ├── Instinct[] (1:N, cascade delete — ECC learned patterns)
        └── Conversation[] (1:N, cascade delete, optional flowVersionId for audit)
              └── Message[] (1:N, cascade delete)

VerificationToken — NextAuth email verification (standalone, no relations)
```

## Standalone Models

### AgentMemory
- agentId (required, indexed)
- key (unique per agent via @@unique([agentId, key]))
- value (String), category (default "general"), importance (0-1)
- embedding (vector(1536), optional — for semantic search)
- accessCount, accessedAt — access tracking

### AgentCard
- agentId (1:1, unique)
- name, description, version, skills[]
- inputModes[], outputModes[], capabilities (Json)

### AgentCallLog
- callerAgentId, calleeAgentId (required, indexed)
- traceId, spanId, parentSpanId — distributed tracing
- status, durationMs, inputTokens, outputTokens

### HumanApprovalRequest
- agentId, conversationId (required)
- title, description, options (Json)
- status (PENDING|APPROVED|REJECTED|EXPIRED), respondedAt

### CLIGeneration
- userId (required, cascade delete)
- applicationName (String) — the CLI app being wrapped
- target String @default("python") — "python" (FastMCP) or "typescript" (Node.js MCP SDK)
- status (CLIGenerationStatus enum)
- currentPhase (Int, 0–5)
- phases (Json) — PhaseResult[] array with per-phase output, tokens, errors
- cliConfig (Json?) — final MCPConfig produced by publish phase
- generatedFiles (Json?) — Record<filename, content>
- errorMessage (String?) — last failure reason
- mcpServerId (String?) — MCP server created after publish (SetNull on delete)
- Indexes: [userId], [userId, status], [createdAt]

### EvalSuite
- agentId (required, cascade delete)
- name, description?
- isDefault Boolean — default suite selected in UI
- runOnDeploy Boolean — auto-run after flow deploy
- scheduleEnabled Boolean — auto-run on cron schedule
- scheduleCron String? — cron expression (5-field)
- lastScheduledAt DateTime? — double-run prevention (4-min window)
- testCases EvalTestCase[], runs EvalRun[]
- Indexes: [agentId], [agentId, runOnDeploy], [scheduleEnabled]

### EvalTestCase
- suiteId (required, cascade delete)
- label, input @db.Text, order Int
- assertions Json — EvalAssertion[] (12 types, 3 layers)
- tags String[]
- results EvalResult[]

### EvalRun
- suiteId (required, cascade delete)
- status EvalRunStatus, triggeredBy ("manual"|"deploy"|"schedule"|"compare")
- totalCases, passedCases, failedCases, score Float?, durationMs
- errorMessage?, completedAt?
- comparisonRunId String? — paired run ID for A/B comparison
- flowVersionId String? — which flow version was tested
- modelOverride String? — model used if comparing different models
- results EvalResult[]
- Indexes: [suiteId], [suiteId, createdAt]

### EvalResult
- runId, testCaseId (required, cascade delete)
- status EvalResultStatus
- agentOutput @db.Text?, assertions Json (AssertionResult[])
- score Float?, latencyMs?, tokensUsed Json?
- Indexes: [runId], [testCaseId]

### FlowSchedule
- agentId (required, cascade delete)
- scheduleType (CRON|INTERVAL|MANUAL)
- cronExpression String? — standard 5-field cron
- intervalMinutes Int? — 1–10080 (1 week)
- timezone String @default("UTC") — IANA timezone
- enabled Boolean, label String?
- nextRunAt DateTime? — computed after each execution
- executions ScheduledExecution[]
- Indexes: [agentId], [enabled, nextRunAt]

### ScheduledExecution
- flowScheduleId (required, cascade delete)
- status (ScheduledExecutionStatus)
- triggeredAt, completedAt?, durationMs?
- errorMessage? @db.Text
- tokenUsage Json?

### GoogleOAuthToken
- userId (required, cascade delete)
- email String — the Google account email
- accessToken @db.Text, refreshToken? @db.Text
- expiresAt DateTime?, scopes @db.Text
- @@unique([userId, email])

### FlowTrace
- agentId (required, cascade delete)
- conversationId?, testInput? @db.Text
- status TraceStatus @default(RUNNING)
- totalDurationMs?, nodesExecuted?, nodesFailed?
- executionPath String[] — ordered list of node IDs visited
- nodeTraces Json — Map<nodeId, NodeDebugState>
- edgeTraces Json — Map<edgeKey, EdgeDebugState>
- Indexes: [agentId], [agentId, createdAt]

## ECC Models

### AgentExecution
- agentId (required, cascade delete)
- status ExecutionStatus @default(PENDING)
- startedAt, completedAt?, durationMs?
- inputParams Json?, outputResult Json?
- traceId String?, parentExecutionId String?
- parentExecution/childExecutions (self-referential "ExecutionTree")
- error String?, tokenUsage Json?
- Indexes: [agentId, status], [traceId]

### Skill
- name, slug (unique), version @default("1.0.0")
- description, content @db.Text
- inputSchema Json?, outputSchema Json?
- tags String[], category String?, language String?
- eccOrigin Boolean @default(true)
- permissions AgentSkillPermission[], instincts Instinct[]
- Indexes: [slug], [language]

### AgentSkillPermission
- agentId, skillId (cascade delete both)
- accessLevel AccessLevel @default(READ)
- @@unique([agentId, skillId])

### Instinct
- name, description
- confidence Float @default(0.0) — 0.0-1.0
- frequency Int @default(1)
- origin String?, examples Json?
- agentId (required, cascade delete)
- promotedToSkillId String? → Skill
- Indexes: [agentId, confidence]

### AuditLog
- userId String?
- action String — CREATE, UPDATE, DELETE, EXECUTE, ACCESS
- resourceType String — Agent, Skill, Flow, KB, etc.
- resourceId String
- before Json?, after Json?
- ipAddress String?, userAgent String?
- timestamp DateTime
- Indexes: [resourceType, resourceId], [userId, timestamp]

## Enums

- **KBSourceType:** FILE | URL | SITEMAP | TEXT
- **KBSourceStatus:** PENDING | PROCESSING | READY | FAILED
- **ConversationStatus:** ACTIVE | COMPLETED | ABANDONED
- **MessageRole:** USER | ASSISTANT | SYSTEM
- **AnalyticsEventType:** CHAT_RESPONSE | KB_SEARCH
- **MCPTransport:** STREAMABLE_HTTP | SSE
- **FlowVersionStatus:** DRAFT | PUBLISHED | ARCHIVED
- **A2ATaskStatus:** SUBMITTED | WORKING | INPUT_REQUIRED | COMPLETED | FAILED
- **CLIGenerationStatus:** PENDING | ANALYZING | DESIGNING | IMPLEMENTING | TESTING | DOCUMENTING | PUBLISHING | COMPLETED | FAILED
- **EvalRunStatus:** PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
- **EvalResultStatus:** PENDING | PASSED | FAILED | ERROR | SKIPPED
- **ScheduleType:** CRON | INTERVAL | MANUAL
- **ScheduledExecutionStatus:** PENDING | RUNNING | SUCCESS | FAILED | SKIPPED
- **ExecutionStatus:** PENDING | RUNNING | SUCCESS | FAILED | TIMEOUT
- **AccessLevel:** READ | EXECUTE | ADMIN
- **TraceStatus:** RUNNING | COMPLETED | FAILED | TIMEOUT
- **WebhookExecutionStatus:** PENDING | SUCCESS | FAILED | SKIPPED

## Key Details

- Agent model has: `category String?`, `tags String[]`, `isPublic Boolean` — marketplace fields
- Agent.userId is `String?` — optional, linked when user is authenticated
- MCPServer.userId is `String` — required, ownership enforced in API routes
- AgentMCPServer has @@unique([agentId, mcpServerId]) to prevent duplicate links
- Account model enables OAuth account linking (GitHub + Google on same email)
- KBChunk.embedding uses `Unsupported("vector(1536)")` for pgvector
- Flow.content is `Json` storing `FlowContent` (nodes, edges, variables)
- Conversation.variables is `Json` storing runtime variable state
- AnalyticsEvent.metadata is `Json` storing response timing and conversation data
- AgentCallLog uses traceId/spanId for distributed tracing across agent chains
- Database indexes: `@@index([category])`, `@@index([isPublic, updatedAt])` on Agent
- All child models cascade delete from their parent
- Agent.eccEnabled Boolean @default(false) — ECC feature flag per agent
