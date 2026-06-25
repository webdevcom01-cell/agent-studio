# Phase 1 — tenant-scoped raw `prisma` query sites (worklist)

Total: 298 sites across 93 files.

By zone — API routes: 97, WORKER/cron: 16, lib SERVICE: 184, other: 1

| file | zone | sites | models |
|---|---|---|---|
| src/lib/managed-tasks/manager.ts | SERVICE | 17 | ManagedAgentTask |
| src/lib/sdlc/pipeline-manager.ts | SERVICE | 17 | PipelineRun |
| src/lib/ecc/instinct-engine.ts | SERVICE | 11 | Instinct, HumanApprovalRequest |
| src/lib/versioning/version-service.ts | SERVICE | 10 | FlowVersion, Flow |
| src/lib/knowledge/ingest.ts | SERVICE | 9 | KBSource, KBChunk |
| src/lib/webhooks/execute.ts | SERVICE | 9 | WebhookExecution, WebhookConfig |
| src/lib/analytics.ts | SERVICE | 7 | AnalyticsEvent |
| src/app/api/analytics/summary/route.ts | API | 6 | AgentExecution, CostEvent, HumanApprovalRequest |
| src/lib/evals/runner.ts | SERVICE | 6 | EvalRun, EvalResult |
| src/lib/runtime/handlers/memory-read-handler.ts | SERVICE | 6 | AgentMemory |
| src/lib/scheduler/execution-engine.ts | WORKER | 6 | ScheduledExecution, Agent, FlowVersion, Conversation |
| src/lib/sdk-sessions/persistence.ts | SERVICE | 6 | AgentSdkSession |
| src/lib/sdlc/codebase-rag.ts | SERVICE | 6 | KBChunk, KBSource |
| src/app/api/agents/[agentId]/schedules/[scheduleId]/route.ts | API | 5 | FlowSchedule |
| src/app/api/agents/[agentId]/schedules/stats/route.ts | API | 5 | FlowSchedule, ScheduledExecution |
| src/lib/queue/worker.ts | WORKER | 5 | WebhookExecution, Conversation, PipelineRun |
| src/lib/runtime/handlers/call-agent-handler.ts | SERVICE | 5 | AgentCallLog, Conversation |
| src/lib/runtime/handlers/memory-write-handler.ts | SERVICE | 5 | AgentMemory |
| src/lib/sdlc/metrics-collector.ts | SERVICE | 5 | PipelineRun |
| src/app/api/agents/[agentId]/mcp/route.ts | API | 4 | AgentMCPServer |
| src/app/api/agents/[agentId]/memory/[memoryId]/route.ts | API | 4 | AgentMemory |
| src/lib/agents/agent-tools.ts | SERVICE | 4 | AgentCallLog, Conversation |
| src/lib/runtime/context.ts | SERVICE | 4 | Conversation, Message |
| src/lib/runtime/handlers/learn-handler.ts | SERVICE | 4 | Instinct, AgentExecution |
| src/lib/templates/template-engine.ts | SERVICE | 4 | Agent, Flow, AgentMCPServer, AgentGoalLink |
| src/app/api/agent-calls/stats/route.ts | API | 3 | AgentCallLog |
| src/app/api/agents/[agentId]/budget/route.ts | API | 3 | AgentBudget |
| src/app/api/agents/[agentId]/department/route.ts | API | 3 | Agent |
| src/app/api/agents/[agentId]/knowledge/sources/route.ts | API | 3 | KBSource |
| src/app/api/agents/[agentId]/memory/route.ts | API | 3 | AgentMemory |
| src/app/api/agents/[agentId]/schedules/route.ts | API | 3 | FlowSchedule |
| src/app/api/agents/[agentId]/traces/[traceId]/route.ts | API | 3 | FlowTrace |
| src/app/api/agents/discover/route.ts | API | 3 | Agent |
| src/lib/budget/cost-tracker.ts | SERVICE | 3 | AgentBudget, BudgetAlert |
| src/lib/ecc/skill-ingest.ts | SERVICE | 3 | KBSource, KnowledgeBase |
| src/lib/gdpr/data-export.ts | SERVICE | 3 | Conversation, KBSource, EvalSuite |
| src/lib/heartbeat/heartbeat-scheduler.ts | WORKER | 3 | FlowSchedule |
| src/lib/knowledge/maintenance.ts | SERVICE | 3 | KBSource |
| src/lib/mcp/agent-studio-tools.ts | SERVICE | 3 | Conversation, KnowledgeBase, ManagedAgentTask |
| src/lib/memory/markdown-export.ts | SERVICE | 3 | AgentMemory |
| src/lib/runtime/context-compaction.ts | SERVICE | 3 | AgentMemory |
| src/lib/runtime/engine.ts | SERVICE | 3 | Message, AgentExecution |
| src/lib/runtime/handlers/mcp-tool-handler.ts | SERVICE | 3 | AgentSkillPermission, Agent, AgentMCPServer |
| src/lib/webhooks/retry.ts | SERVICE | 3 | WebhookExecution, WebhookDeadLetter |
| src/app/api/agents/[agentId]/a2a/route.ts | API | 2 | AgentCallLog, Conversation |
| src/app/api/agents/[agentId]/evals/[suiteId]/compare/route.ts | API | 2 | FlowVersion |
| src/app/api/agents/[agentId]/flow/versions/[versionId]/diff/route.ts | API | 2 | FlowVersion |
| src/app/api/agents/[agentId]/flow/versions/[versionId]/test/route.ts | API | 2 | FlowVersion, Conversation |
| src/app/api/agents/[agentId]/goals/route.ts | API | 2 | AgentGoalLink |
| src/app/api/agents/[agentId]/heartbeat/context/route.ts | API | 2 | Agent |
| src/app/api/agents/[agentId]/heartbeat/route.ts | API | 2 | Agent |
| src/app/api/agents/[agentId]/knowledge/sources/[sourceId]/retry/route.ts | API | 2 | KBSource |
| src/app/api/agents/[agentId]/knowledge/sources/[sourceId]/route.ts | API | 2 | KBSource |
| src/app/api/agents/[agentId]/schedules/[scheduleId]/executions/route.ts | API | 2 | FlowSchedule, ScheduledExecution |
| src/app/api/agents/[agentId]/traces/route.ts | API | 2 | FlowTrace |
| src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/route.ts | API | 2 | WebhookExecution |
| src/app/api/analytics/route.ts | API | 2 | Conversation, Message |
| src/app/api/approvals/[requestId]/respond/route.ts | API | 2 | HumanApprovalRequest |
| src/lib/budget/reset-worker.ts | WORKER | 2 | AgentBudget |
| src/lib/gdpr/account-deletion.ts | SERVICE | 2 | Agent |
| src/lib/gdpr/retention-policy.ts | SERVICE | 2 | Conversation, WebhookExecution |
| src/lib/goals/goal-context.ts | SERVICE | 2 | AgentGoalLink, Agent |
| src/lib/governance/approval-engine.ts | SERVICE | 2 | PolicyDecision |
| src/lib/org-chart/hierarchy.ts | SERVICE | 2 | Agent |
| src/lib/runtime/handlers/human-approval-handler.ts | SERVICE | 2 | HumanApprovalRequest |
| src/lib/sdlc/pipeline-memory.ts | SERVICE | 2 | PipelineMemory |
| src/app/api/agent-calls/route.ts | API | 1 | AgentCallLog |
| src/app/api/agents/[agentId]/chat/route.ts | API | 1 | FlowVersion |
| src/app/api/agents/[agentId]/conversations/[conversationId]/route.ts | API | 1 | Conversation |
| src/app/api/agents/[agentId]/conversations/route.ts | API | 1 | Conversation |
| src/app/api/agents/[agentId]/evals/generate/route.ts | API | 1 | EvalSuite |
| src/app/api/agents/[agentId]/execute/route.ts | API | 1 | Conversation |
| src/app/api/agents/[agentId]/heartbeat/runs/route.ts | API | 1 | Agent |
| src/app/api/agents/[agentId]/instincts/route.ts | API | 1 | Instinct |
| src/app/api/agents/[agentId]/knowledge/sources/upload/route.ts | API | 1 | KBSource |
| src/app/api/agents/[agentId]/pending-approvals/route.ts | API | 1 | Agent |
| src/app/api/agents/[agentId]/permissions/route.ts | API | 1 | Agent |
| src/app/api/agents/[agentId]/pipelines/[runId]/retry/route.ts | API | 1 | PipelineRun |
| src/app/api/agents/[agentId]/pipelines/webhook-trigger/[webhookId]/route.ts | API | 1 | PipelineRun |
| src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/[executionId]/replay/route.ts | API | 1 | WebhookExecution |
| src/app/api/agents/[agentId]/webhooks/[webhookId]/executions/export/route.ts | API | 1 | WebhookExecution |
| src/app/api/analytics/activity/route.ts | API | 1 | AgentExecution |
| src/app/api/approvals/route.ts | API | 1 | HumanApprovalRequest |
| src/app/api/cron/trigger-scheduled-flows/route.ts | API | 1 | FlowSchedule |
| src/app/api/departments/[departmentId]/route.ts | API | 1 | Agent |
| src/app/api/integrations/obsidian/route.ts | API | 1 | Instinct |
| src/app/api/policies/route.ts | API | 1 | Agent |
| src/lib/a2a/card-generator.ts | SERVICE | 1 | AgentCard |
| src/lib/ecc/sdk-learn-hook.ts | SERVICE | 1 | AgentExecution |
| src/lib/mcp/client.ts | SERVICE | 1 | AgentMCPServer |
| src/lib/memory/hot-cold-tier.ts | SERVICE | 1 | AgentMemory |
| src/lib/runtime/engine-streaming.ts | SERVICE | 1 | Message |
| src/scripts/read-session.ts | OTHER | 1 | Conversation |
