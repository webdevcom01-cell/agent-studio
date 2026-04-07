/**
 * Starter flows for agent templates.
 *
 * Each entry maps a template ID to a minimal FlowContent that pre-populates
 * the flow editor when a user creates an agent from that template.
 *
 * Rules:
 *  - 3–5 nodes max (enough to be useful, not overwhelming)
 *  - Positions form a clean top-to-bottom layout (x=250, y increments of 160)
 *  - Every edge has a unique ID prefixed with "e_"
 *  - Node IDs are stable slugs so diffs stay clean across template updates
 */

import type { FlowContent } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function edge(source: string, target: string) {
  return { id: `e_${source}_${target}`, source, target };
}

function pos(row: number): { x: number; y: number } {
  return { x: 250, y: 50 + row * 160 };
}

function ppos(row: number, col: number): { x: number; y: number } {
  return { x: 250 + col * 280, y: 50 + row * 160 };
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const STARTER_FLOWS: Record<string, FlowContent> = {

  // ── Support ──────────────────────────────────────────────────────────────

  "support-support-responder": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "User Message", message: "{{user_input}}" } },
      { id: "kb",        type: "kb_search",   position: pos(1), data: { label: "Search KB", query: "{{user_input}}", outputVariable: "kb_results", topK: 5 } },
      { id: "ai",        type: "ai_response", position: pos(2), data: { label: "Generate Answer", prompt: "Answer the user question using the knowledge base results.\n\nQuestion: {{user_input}}\n\nKB Results: {{kb_results}}", outputVariable: "answer" } },
      { id: "msg_out",   type: "message",     position: pos(3), data: { label: "Send Answer", message: "{{answer}}" } },
    ],
    edges: [edge("msg_in","kb"), edge("kb","ai"), edge("ai","msg_out")],
    variables: [],
  },

  "support-executive-summary-generator": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Daily Summary", scheduleType: "cron", cronExpression: "0 8 * * 1-5", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "kb",        type: "kb_search",        position: pos(1), data: { label: "Fetch Reports", query: "latest reports updates metrics", outputVariable: "reports", topK: 8 } },
      { id: "ai",        type: "ai_summarize",     position: pos(2), data: { label: "Summarize", text: "{{reports}}", outputVariable: "summary", format: "bullet_points" } },
      { id: "send",      type: "email_send",       position: pos(3), data: { label: "Email Summary", subject: "Executive Summary — {{trigger_info.triggeredAt}}", body: "{{summary}}", to: "" } },
    ],
    edges: [edge("trigger","kb"), edge("kb","ai"), edge("ai","send")],
    variables: [],
  },

  "support-analytics-reporter": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Weekly Report", scheduleType: "cron", cronExpression: "0 9 * * 1", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Data", url: "", method: "GET", outputVariable: "raw_data" } },
      { id: "ai",        type: "ai_summarize",     position: pos(2), data: { label: "Analyze", text: "{{raw_data}}", outputVariable: "report", format: "structured" } },
      { id: "send",      type: "email_send",       position: pos(3), data: { label: "Send Report", subject: "Analytics Report — Week of {{trigger_info.triggeredAt}}", body: "{{report}}", to: "" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","ai"), edge("ai","send")],
    variables: [],
  },

  "support-finance-tracker": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Daily Finance Check", scheduleType: "cron", cronExpression: "0 18 * * 1-5", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Transactions", url: "", method: "GET", outputVariable: "transactions" } },
      { id: "fmt",       type: "format_transform", position: pos(2), data: { label: "Format Data", inputVariable: "transactions", format: "json_to_text", outputVariable: "formatted" } },
      { id: "ai",        type: "ai_response",      position: pos(3), data: { label: "Finance Summary", prompt: "Summarize today's financial activity, flag anomalies:\n\n{{formatted}}", outputVariable: "summary" } },
      { id: "notify",    type: "notification",     position: pos(4), data: { label: "Notify", message: "{{summary}}", channel: "in_app" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","fmt"), edge("fmt","ai"), edge("ai","notify")],
    variables: [],
  },

  // ── Project Management ────────────────────────────────────────────────────

  "project-management-project-shepherd": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Morning Standup", scheduleType: "cron", cronExpression: "0 9 * * 1-5", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "ai",        type: "ai_response",      position: pos(1), data: { label: "Generate Update", prompt: "Generate a concise daily standup summary and task priorities for the team. Include blockers, progress, and next steps.", outputVariable: "standup" } },
      { id: "notify",    type: "notification",     position: pos(2), data: { label: "Post to Team", message: "📋 Daily Standup\n\n{{standup}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","ai"), edge("ai","notify")],
    variables: [],
  },

  "project-management-jira-workflow-steward": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Daily Jira Sync", scheduleType: "cron", cronExpression: "0 8 * * 1-5", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Jira Issues", url: "", method: "GET", outputVariable: "issues" } },
      { id: "ai",        type: "ai_summarize",     position: pos(2), data: { label: "Prioritize Issues", text: "{{issues}}", outputVariable: "summary", format: "bullet_points" } },
      { id: "notify",    type: "notification",     position: pos(3), data: { label: "Notify Team", message: "🎯 Jira Priorities\n\n{{summary}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","ai"), edge("ai","notify")],
    variables: [],
  },

  "project-management-experiment-tracker": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Weekly Experiment Review", scheduleType: "cron", cronExpression: "0 10 * * 5", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Experiment Results", url: "", method: "GET", outputVariable: "results" } },
      { id: "fmt",       type: "format_transform", position: pos(2), data: { label: "Format Results", inputVariable: "results", format: "json_to_text", outputVariable: "formatted" } },
      { id: "ai",        type: "ai_summarize",     position: pos(3), data: { label: "Analyze Experiments", text: "{{formatted}}", outputVariable: "analysis", format: "structured" } },
      { id: "notify",    type: "notification",     position: pos(4), data: { label: "Share Findings", message: "🧪 Experiment Results\n\n{{analysis}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","fmt"), edge("fmt","ai"), edge("ai","notify")],
    variables: [],
  },

  // ── Engineering ───────────────────────────────────────────────────────────

  "engineering-senior-developer": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "Code Request", message: "{{user_input}}" } },
      { id: "ai",        type: "ai_response", position: pos(1), data: { label: "Code Assistant", prompt: "{{user_input}}", outputVariable: "response" } },
      { id: "msg_out",   type: "message",     position: pos(2), data: { label: "Response", message: "{{response}}" } },
    ],
    edges: [edge("msg_in","ai"), edge("ai","msg_out")],
    variables: [],
  },

  "engineering-devops-automator": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Health Check", scheduleType: "interval", intervalMinutes: 30, timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Check Services", url: "", method: "GET", outputVariable: "health_status" } },
      { id: "classify",  type: "ai_classify",      position: pos(2), data: { label: "Assess Status", text: "{{health_status}}", categories: ["healthy", "degraded", "critical"], outputVariable: "severity" } },
      { id: "cond",      type: "condition",         position: pos(3), data: { label: "Is Degraded?", condition: "{{severity}} !== 'healthy'", trueLabel: "Alert", falseLabel: "OK" } },
      { id: "notify",    type: "notification",      position: pos(4), data: { label: "Fire Alert", message: "🚨 Service Alert — Status: {{severity}}\n\n{{health_status}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","classify"), edge("classify","cond"), { id: "e_cond_notify", source: "cond", target: "notify", sourceHandle: "true" }],
    variables: [],
  },

  "engineering-incident-response-commander": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Incident Monitor", scheduleType: "interval", intervalMinutes: 15, timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Alerts", url: "", method: "GET", outputVariable: "alerts" } },
      { id: "classify",  type: "ai_classify",      position: pos(2), data: { label: "Classify Severity", text: "{{alerts}}", categories: ["P1-critical", "P2-high", "P3-medium", "P4-low"], outputVariable: "severity" } },
      { id: "ai",        type: "ai_response",      position: pos(3), data: { label: "Draft Response Plan", prompt: "You are an incident commander. Draft a response plan for:\nAlerts: {{alerts}}\nSeverity: {{severity}}", outputVariable: "plan" } },
      { id: "notify",    type: "notification",     position: pos(4), data: { label: "Alert On-Call", message: "🔴 Incident — {{severity}}\n\n{{plan}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","classify"), edge("classify","ai"), edge("ai","notify")],
    variables: [],
  },

  "engineering-security-engineer": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Security Scan", scheduleType: "cron", cronExpression: "0 2 * * *", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Security Logs", url: "", method: "GET", outputVariable: "logs" } },
      { id: "ai",        type: "ai_classify",      position: pos(2), data: { label: "Detect Threats", text: "{{logs}}", categories: ["critical", "suspicious", "clean"], outputVariable: "threat_level" } },
      { id: "cond",      type: "condition",         position: pos(3), data: { label: "Threat Detected?", condition: "{{threat_level}} !== 'clean'", trueLabel: "Alert", falseLabel: "OK" } },
      { id: "notify",    type: "notification",     position: pos(4), data: { label: "Security Alert", message: "🛡️ Security Alert — {{threat_level}}\n\nDetails:\n{{logs}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","ai"), edge("ai","cond"), { id: "e_cond_notify", source: "cond", target: "notify", sourceHandle: "true" }],
    variables: [],
  },

  "engineering-technical-writer": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "Documentation Request", message: "{{user_input}}" } },
      { id: "kb",        type: "kb_search",   position: pos(1), data: { label: "Search Existing Docs", query: "{{user_input}}", outputVariable: "existing_docs", topK: 5 } },
      { id: "ai",        type: "ai_response", position: pos(2), data: { label: "Write Documentation", prompt: "Write clear technical documentation for: {{user_input}}\n\nExisting context: {{existing_docs}}", outputVariable: "docs" } },
      { id: "msg_out",   type: "message",     position: pos(3), data: { label: "Deliver Docs", message: "{{docs}}" } },
    ],
    edges: [edge("msg_in","kb"), edge("kb","ai"), edge("ai","msg_out")],
    variables: [],
  },

  // ── Marketing ─────────────────────────────────────────────────────────────

  "marketing-content-creator": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Daily Content", scheduleType: "cron", cronExpression: "0 8 * * *", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "kb",        type: "kb_search",        position: pos(1), data: { label: "Brand Guidelines", query: "brand voice tone content guidelines", outputVariable: "brand_context", topK: 3 } },
      { id: "ai",        type: "ai_response",      position: pos(2), data: { label: "Generate Content", prompt: "Create engaging social media content for today using brand guidelines:\n\n{{brand_context}}", outputVariable: "content" } },
      { id: "notify",    type: "notification",     position: pos(3), data: { label: "Content Ready", message: "✍️ Today's Content\n\n{{content}}", channel: "in_app" } },
    ],
    edges: [edge("trigger","kb"), edge("kb","ai"), edge("ai","notify")],
    variables: [],
  },

  "marketing-social-media-strategist": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "Strategy Request", message: "{{user_input}}" } },
      { id: "kb",        type: "kb_search",   position: pos(1), data: { label: "Search Insights", query: "{{user_input}}", outputVariable: "insights", topK: 5 } },
      { id: "ai",        type: "ai_response", position: pos(2), data: { label: "Create Strategy", prompt: "Create a social media strategy for: {{user_input}}\n\nMarket insights: {{insights}}", outputVariable: "strategy" } },
      { id: "msg_out",   type: "message",     position: pos(3), data: { label: "Share Strategy", message: "{{strategy}}" } },
    ],
    edges: [edge("msg_in","kb"), edge("kb","ai"), edge("ai","msg_out")],
    variables: [],
  },

  "marketing-seo-specialist": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "SEO Request", message: "{{user_input}}" } },
      { id: "kb",        type: "kb_search",   position: pos(1), data: { label: "Keyword Research", query: "{{user_input}} SEO keywords ranking", outputVariable: "seo_data", topK: 5 } },
      { id: "ai",        type: "ai_response", position: pos(2), data: { label: "SEO Recommendations", prompt: "Provide SEO recommendations for: {{user_input}}\n\nResearch data: {{seo_data}}", outputVariable: "recommendations" } },
      { id: "msg_out",   type: "message",     position: pos(3), data: { label: "Deliver Recommendations", message: "{{recommendations}}" } },
    ],
    edges: [edge("msg_in","kb"), edge("kb","ai"), edge("ai","msg_out")],
    variables: [],
  },

  "marketing-growth-hacker": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Weekly Growth Report", scheduleType: "cron", cronExpression: "0 9 * * 1", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Metrics", url: "", method: "GET", outputVariable: "metrics" } },
      { id: "ai",        type: "ai_response",      position: pos(2), data: { label: "Growth Insights", prompt: "Analyze growth metrics and suggest top 3 experiments to run this week:\n\n{{metrics}}", outputVariable: "insights" } },
      { id: "notify",    type: "notification",     position: pos(3), data: { label: "Share Insights", message: "📈 Growth Insights\n\n{{insights}}", channel: "webhook" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","ai"), edge("ai","notify")],
    variables: [],
  },

  // ── Specialized ───────────────────────────────────────────────────────────

  "specialized-data-analytics-reporter": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Daily Analytics", scheduleType: "cron", cronExpression: "0 7 * * *", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Analytics Data", url: "", method: "GET", outputVariable: "analytics" } },
      { id: "fmt",       type: "format_transform", position: pos(2), data: { label: "Format Data", inputVariable: "analytics", format: "json_to_text", outputVariable: "formatted" } },
      { id: "ai",        type: "ai_summarize",     position: pos(3), data: { label: "Generate Report", text: "{{formatted}}", outputVariable: "report", format: "structured" } },
      { id: "send",      type: "email_send",       position: pos(4), data: { label: "Email Report", subject: "Analytics Report — {{trigger_info.triggeredAt}}", body: "{{report}}", to: "" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","fmt"), edge("fmt","ai"), edge("ai","send")],
    variables: [],
  },

  "specialized-report-distribution-agent": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Scheduled Report", scheduleType: "cron", cronExpression: "0 8 * * 1", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "kb",        type: "kb_search",        position: pos(1), data: { label: "Gather Report Data", query: "latest report data metrics", outputVariable: "data", topK: 10 } },
      { id: "ai",        type: "ai_summarize",     position: pos(2), data: { label: "Compile Report", text: "{{data}}", outputVariable: "report", format: "structured" } },
      { id: "send",      type: "email_send",       position: pos(3), data: { label: "Distribute Report", subject: "Weekly Report — {{trigger_info.triggeredAt}}", body: "{{report}}", to: "" } },
    ],
    edges: [edge("trigger","kb"), edge("kb","ai"), edge("ai","send")],
    variables: [],
  },

  "specialized-agents-orchestrator": {
    nodes: [
      { id: "msg_in",    type: "message",     position: pos(0), data: { label: "Orchestration Request", message: "{{user_input}}" } },
      { id: "ai",        type: "ai_response", position: pos(1), data: { label: "Orchestrate Agents", prompt: "{{user_input}}", outputVariable: "result", enableAgentTools: true } },
      { id: "msg_out",   type: "message",     position: pos(2), data: { label: "Result", message: "{{result}}" } },
    ],
    edges: [edge("msg_in","ai"), edge("ai","msg_out")],
    variables: [],
  },

  "specialized-data-consolidation-agent": {
    nodes: [
      { id: "trigger",   type: "schedule_trigger", position: pos(0), data: { label: "Data Consolidation", scheduleType: "cron", cronExpression: "0 6 * * *", timezone: "UTC", outputVariable: "trigger_info" } },
      { id: "fetch",     type: "api_call",         position: pos(1), data: { label: "Fetch Source Data", url: "", method: "GET", outputVariable: "raw_data" } },
      { id: "fmt",       type: "format_transform", position: pos(2), data: { label: "Normalize Data", inputVariable: "raw_data", format: "json_to_text", outputVariable: "normalized" } },
      { id: "notify",    type: "notification",     position: pos(3), data: { label: "Consolidation Complete", message: "✅ Data consolidation complete\n\n{{normalized}}", channel: "in_app" } },
    ],
    edges: [edge("trigger","fetch"), edge("fetch","fmt"), edge("fmt","notify")],
    variables: [],
  },

  // ── ECC Developer Agent Pipelines ──────────────────────────────────────────

  "ecc-tdd-pipeline": {
    nodes: [
      { id: "input",      type: "message",          position: pos(0), data: { label: "Task Input", message: "{{user_input}}" } },
      { id: "proj_ctx",   type: "project_context",  position: pos(1), data: { label: "Load Project Context", contextFiles: ["CLAUDE.md", ".claude/rules/*.md"], outputVariable: "projectContext" } },
      { id: "planner",    type: "call_agent",        position: pos(2), data: { label: "Planner", mode: "internal", targetAgentId: "", outputVariable: "plan", inputMapping: [{ key: "task", value: "{{user_input}}" }, { key: "projectContext", value: "{{projectContext}}" }], onError: "continue" } },
      { id: "tdd",        type: "call_agent",        position: pos(3), data: { label: "TDD Guide", mode: "internal", targetAgentId: "", outputVariable: "tests_and_code", inputMapping: [{ key: "task", value: "{{plan}}" }, { key: "projectContext", value: "{{projectContext}}" }], onError: "continue" } },
      { id: "codegen",    type: "ai_response",       position: pos(4), data: { label: "Code Generation", model: "deepseek-chat", prompt: "Generate production-ready code based on the TDD plan.\n\nProject Context:\n{{projectContext}}\n\nTDD Plan & Tests:\n{{tests_and_code}}\n\nReturn a CodeGenOutput JSON object.", outputVariable: "generatedCode", outputSchema: "CodeGenOutput" } },
      { id: "sandbox",    type: "sandbox_verify",    position: pos(5), data: { label: "Sandbox Verify", inputVariable: "generatedCode", checks: ["typecheck", "lint", "forbidden_patterns"], outputVariable: "sandboxResult" } },
      { id: "retry_node", type: "retry",             position: ppos(6, 1), data: { label: "Escalating Retry", targetNodeId: "codegen", maxRetries: 2, enableEscalation: true, failureVariable: "sandboxResult", failureValues: ["FAIL"], prGateVariable: "gateResult", sandboxErrorsVariable: "sandboxResult", projectContextVariable: "projectContext", outputVariable: "generatedCode" } },
      { id: "review",     type: "parallel",          position: ppos(6, -1), data: { label: "PR Gate (parallel)", mergeStrategy: "all", timeoutSeconds: 90, branches: [{ branchId: "b_code", label: "Code Review", outputVariable: "code_review" }, { branchId: "b_sec", label: "Security Review", outputVariable: "sec_review" }] } },
      { id: "reviewer",   type: "call_agent",        position: ppos(7, -1), data: { label: "Code Reviewer", mode: "internal", targetAgentId: "", outputVariable: "code_review", outputSchema: "PRGateOutput", inputMapping: [{ key: "code", value: "{{generatedCode}}" }, { key: "projectContext", value: "{{projectContext}}" }], onError: "continue" } },
      { id: "security",   type: "call_agent",        position: ppos(7, 0),  data: { label: "Security Reviewer", mode: "internal", targetAgentId: "", outputVariable: "sec_review", outputSchema: "PRGateOutput", inputMapping: [{ key: "code", value: "{{generatedCode}}" }], onError: "continue" } },
      { id: "summary",    type: "ai_response",       position: pos(8), data: { label: "Pipeline Summary", prompt: "Summarize the TDD pipeline results:\n\nPlan: {{plan}}\nCode: {{generatedCode}}\nSandbox: {{sandboxResult}}\nCode Review: {{code_review}}\nSecurity: {{sec_review}}", outputVariable: "final_output" } },
      { id: "output",     type: "message",           position: pos(9), data: { label: "Result", message: "{{final_output}}" } },
    ],
    edges: [
      edge("input", "proj_ctx"), edge("proj_ctx", "planner"),
      edge("planner", "tdd"), edge("tdd", "codegen"), edge("codegen", "sandbox"),
      { id: "e_sandbox_passed", source: "sandbox",    target: "review",     sourceHandle: "passed" },
      { id: "e_sandbox_failed", source: "sandbox",    target: "retry_node", sourceHandle: "failed" },
      { id: "e_review_reviewer", source: "review",   target: "reviewer",   sourceHandle: "b_code" },
      { id: "e_review_security", source: "review",   target: "security",   sourceHandle: "b_sec" },
      edge("review", "summary"), edge("summary", "output"),
    ],
    variables: [],
  },

  "ecc-full-dev-workflow": {
    nodes: [
      { id: "input",     type: "message",     position: pos(0), data: { label: "Feature Request", message: "{{user_input}}" } },
      { id: "planner",   type: "call_agent",  position: pos(1), data: { label: "Planner", mode: "internal", targetAgentId: "", outputVariable: "plan", inputMapping: [{ key: "task", value: "{{user_input}}" }], onError: "continue" } },
      { id: "architect",  type: "call_agent",  position: pos(2), data: { label: "Architect", mode: "internal", targetAgentId: "", outputVariable: "architecture", inputMapping: [{ key: "plan", value: "{{plan}}" }], onError: "continue" } },
      { id: "impl",      type: "parallel",    position: ppos(3, 0), data: { label: "Implement (parallel)", mergeStrategy: "all", timeoutSeconds: 90, branches: [{ branchId: "b_backend", label: "Backend", outputVariable: "backend_result" }, { branchId: "b_sec", label: "Security", outputVariable: "sec_result" }, { branchId: "b_docs", label: "Docs", outputVariable: "docs_result" }] } },
      { id: "backend",   type: "ai_response", position: ppos(4, -1), data: { label: "Backend Implementation", prompt: "Implement the backend based on:\n\nArchitecture: {{architecture}}\nPlan: {{plan}}", outputVariable: "backend_result" } },
      { id: "sec_check", type: "call_agent",  position: ppos(4, 0), data: { label: "Security Check", mode: "internal", targetAgentId: "", outputVariable: "sec_result", inputMapping: [{ key: "architecture", value: "{{architecture}}" }], onError: "continue" } },
      { id: "docs",      type: "call_agent",  position: ppos(4, 1), data: { label: "Doc Updater", mode: "internal", targetAgentId: "", outputVariable: "docs_result", inputMapping: [{ key: "plan", value: "{{plan}}" }], onError: "continue" } },
      { id: "reviewer",  type: "call_agent",  position: pos(5), data: { label: "Code Reviewer", mode: "internal", targetAgentId: "", outputVariable: "review", inputMapping: [{ key: "code", value: "{{backend_result}}" }, { key: "security", value: "{{sec_result}}" }], onError: "continue" } },
      { id: "output",    type: "message",     position: pos(6), data: { label: "Result", message: "Plan: {{plan}}\n\nArchitecture: {{architecture}}\n\nReview: {{review}}\n\nDocs: {{docs_result}}" } },
    ],
    edges: [
      edge("input", "planner"), edge("planner", "architect"), edge("architect", "impl"),
      { id: "e_impl_backend", source: "impl", target: "backend", sourceHandle: "b_backend" },
      { id: "e_impl_sec",     source: "impl", target: "sec_check", sourceHandle: "b_sec" },
      { id: "e_impl_docs",    source: "impl", target: "docs", sourceHandle: "b_docs" },
      edge("impl", "reviewer"), edge("reviewer", "output"),
    ],
    variables: [],
  },

  "ecc-security-audit": {
    nodes: [
      { id: "input",      type: "message",     position: pos(0), data: { label: "Audit Target", message: "{{user_input}}" } },
      { id: "sec_review", type: "call_agent",  position: pos(1), data: { label: "Security Reviewer", mode: "internal", targetAgentId: "", outputVariable: "initial_findings", inputMapping: [{ key: "target", value: "{{user_input}}" }], onError: "continue" } },
      { id: "deep_scan",  type: "parallel",    position: ppos(2, 0), data: { label: "Deep Scan (parallel)", mergeStrategy: "all", timeoutSeconds: 90, branches: [{ branchId: "b_owasp", label: "OWASP Check", outputVariable: "owasp_results" }, { branchId: "b_secrets", label: "Secret Scan", outputVariable: "secret_results" }, { branchId: "b_deps", label: "Dependency Audit", outputVariable: "dep_results" }] } },
      { id: "owasp",      type: "ai_response", position: ppos(3, -1), data: { label: "OWASP Top 10", prompt: "Check for OWASP Top 10 vulnerabilities in:\n\n{{initial_findings}}\n\nTarget: {{user_input}}", outputVariable: "owasp_results" } },
      { id: "secrets",    type: "ai_response", position: ppos(3, 0), data: { label: "Secret Scanner", prompt: "Scan for hardcoded secrets, API keys, credentials in:\n\n{{user_input}}", outputVariable: "secret_results" } },
      { id: "deps",       type: "ai_response", position: ppos(3, 1), data: { label: "Dependency Audit", prompt: "Audit dependencies for known CVEs and outdated packages in:\n\n{{user_input}}", outputVariable: "dep_results" } },
      { id: "doc_update", type: "call_agent",  position: pos(4), data: { label: "Doc Updater", mode: "internal", targetAgentId: "", outputVariable: "audit_report", inputMapping: [{ key: "findings", value: "OWASP: {{owasp_results}}\nSecrets: {{secret_results}}\nDeps: {{dep_results}}" }], onError: "continue" } },
      { id: "output",     type: "message",     position: pos(5), data: { label: "Audit Report", message: "{{audit_report}}" } },
    ],
    edges: [
      edge("input", "sec_review"), edge("sec_review", "deep_scan"),
      { id: "e_scan_owasp",   source: "deep_scan", target: "owasp",   sourceHandle: "b_owasp" },
      { id: "e_scan_secrets", source: "deep_scan", target: "secrets", sourceHandle: "b_secrets" },
      { id: "e_scan_deps",    source: "deep_scan", target: "deps",    sourceHandle: "b_deps" },
      edge("deep_scan", "doc_update"), edge("doc_update", "output"),
    ],
    variables: [],
  },

  "ecc-code-review-pipeline": {
    nodes: [
      { id: "input",     type: "message",         position: pos(0), data: { label: "Code to Review", message: "{{user_input}}" } },
      { id: "proj_ctx",  type: "project_context", position: pos(1), data: { label: "Load Project Context", contextFiles: ["CLAUDE.md", ".claude/rules/*.md"], outputVariable: "projectContext" } },
      { id: "review",    type: "call_agent",      position: pos(2), data: { label: "Code Reviewer", mode: "internal", targetAgentId: "", outputVariable: "prGateResult", outputSchema: "PRGateOutput", inputMapping: [{ key: "code", value: "{{user_input}}" }, { key: "projectContext", value: "{{projectContext}}" }], onError: "continue" } },
      { id: "gate_cond", type: "condition",       position: pos(3), data: { label: "Gate Decision", condition: "{{prGateResult.decision}} === 'BLOCK'", trueLabel: "Block — needs manual review", falseLabel: "Approve / Request Changes" } },
      { id: "approval",  type: "human_approval",  position: ppos(4, -1), data: { label: "Manual Review Required", prompt: "Code review returned BLOCK decision.\n\nReview Result: {{prGateResult}}\n\nProject Context: {{projectContext}}\n\nDo you want to override and approve?", inputVariable: "prGateResult", outputVariable: "humanDecision", timeoutMinutes: 60, onTimeout: "continue", defaultValue: "APPROVED" } },
      { id: "output",    type: "message",         position: ppos(4, 1), data: { label: "Review Complete", message: "{{prGateResult}}" } },
    ],
    edges: [
      edge("input", "proj_ctx"), edge("proj_ctx", "review"), edge("review", "gate_cond"),
      { id: "e_block_true",  source: "gate_cond", target: "approval", sourceHandle: "true" },
      { id: "e_block_false", source: "gate_cond", target: "output",   sourceHandle: "false" },
      edge("approval", "output"),
    ],
    variables: [],
  },

  // ── DevSecOps Pipeline ────────────────────────────────────────────────────

  /**
   * DevSecOps Orchestrator — Code Generation + Verification Pipeline.
   *
   * Architecture:
   *   project_context → Architecture Planning
   *     → Parallel Phase (Security Engineer + TDD Planning)
   *     → Code Generation (outputSchema: CodeGenOutput)
   *     → sandbox_verify
   *         ├── passed → Parallel PR Gate (Code Review + Security + Reality Checker)
   *         └── failed → retry (escalating, max 2) → Code Gen
   *     → Risk Aggregation → Deploy Decision Switch
   *         ├── AUTO_APPROVE → Done
   *         ├── NEEDS_REVIEW → Human Approval → Done
   *         └── BLOCK        → Done (blocked)
   *
   * Uses: project_context, ai_response, parallel, call_agent, sandbox_verify,
   *       retry, switch, human_approval, set_variable, end.
   */
  "devsecops-orchestrator": {
    nodes: [
      // ── Stage 1: Entry ─────────────────────────────────────────────────
      {
        id: "input",
        type: "message",
        position: pos(0),
        data: { label: "Task / PR Input", message: "{{user_input}}" },
      },

      // ── Stage 2: Project Context ────────────────────────────────────────
      {
        id: "proj_ctx",
        type: "project_context",
        position: pos(1),
        data: {
          label: "Load Project Context",
          contextFiles: ["CLAUDE.md", ".claude/rules/*.md"],
          outputVariable: "projectContext",
        },
      },

      // ── Stage 3: Architecture ────────────────────────────────────────────
      {
        id: "arch",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Architecture Planning",
          model: "deepseek-reasoner",
          prompt: `Analyze the task and produce an architecture plan.

Project Context:
{{projectContext}}

Task:
{{user_input}}

Output the approach, file structure, key design decisions, and security considerations.`,
          outputVariable: "architecture",
        },
      },

      // ── Stage 4: Parallel Planning (Security + TDD) ──────────────────────
      {
        id: "plan_parallel",
        type: "parallel",
        position: pos(3),
        data: {
          label: "Parallel Planning",
          mergeStrategy: "all",
          timeoutSeconds: 90,
          branches: [
            { branchId: "b_sec_plan", label: "Security Engineer",  outputVariable: "securityPlan"  },
            { branchId: "b_tdd",      label: "TDD Planning",        outputVariable: "tddPlan"       },
          ],
        },
      },
      {
        id: "security_eng",
        type: "call_agent",
        position: ppos(4, -1),
        data: {
          label: "Security Engineer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "securityPlan",
          inputMapping: [
            { key: "architecture", value: "{{architecture}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "tdd_guide",
        type: "call_agent",
        position: ppos(4, 1),
        data: {
          label: "TDD Planning",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "tddPlan",
          inputMapping: [
            { key: "architecture", value: "{{architecture}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },

      // ── Stage 5: Code Generation ──────────────────────────────────────────
      {
        id: "codegen",
        type: "ai_response",
        position: pos(5),
        data: {
          label: "Code Generation",
          model: "deepseek-chat",
          prompt: `Generate production-ready code.

Project Context:
{{projectContext}}

Architecture:
{{architecture}}

Security Requirements:
{{securityPlan}}

TDD Plan:
{{tddPlan}}

Task:
{{user_input}}

Return a CodeGenOutput JSON object with all required files.`,
          outputVariable: "generatedCode",
          outputSchema: "CodeGenOutput",
        },
      },

      // ── Stage 6: Sandbox Verification ────────────────────────────────────
      {
        id: "sandbox",
        type: "sandbox_verify",
        position: pos(6),
        data: {
          label: "Sandbox Verify",
          inputVariable: "generatedCode",
          checks: ["typecheck", "lint", "forbidden_patterns"],
          outputVariable: "sandboxResult",
        },
      },

      // ── Retry path (sandbox failed) ───────────────────────────────────────
      {
        id: "retry_node",
        type: "retry",
        position: ppos(7, 1),
        data: {
          label: "Escalating Retry",
          targetNodeId: "codegen",
          maxRetries: 2,
          enableEscalation: true,
          failureVariable: "sandboxResult",
          failureValues: ["FAIL"],
          prGateVariable: "gateResult",
          sandboxErrorsVariable: "sandboxResult",
          projectContextVariable: "projectContext",
          outputVariable: "generatedCode",
        },
      },

      // ── Stage 7: PR Gate (parallel) ────────────────────────────────────────
      {
        id: "gate_parallel",
        type: "parallel",
        position: ppos(7, -1),
        data: {
          label: "PR Gate (parallel)",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_review",  label: "Code Review",      outputVariable: "codeReview"  },
            { branchId: "b_sec_rev", label: "Security Review",   outputVariable: "secReview"   },
            { branchId: "b_reality", label: "Reality Checker",   outputVariable: "realityCheck" },
          ],
        },
      },
      {
        id: "code_reviewer",
        type: "call_agent",
        position: ppos(8, -2),
        data: {
          label: "Code Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "codeReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",           value: "{{generatedCode}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "sec_reviewer",
        type: "call_agent",
        position: ppos(8, 0),
        data: {
          label: "Security Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "secReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",           value: "{{generatedCode}}" },
            { key: "securityPlan",   value: "{{securityPlan}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "reality_checker",
        type: "ai_response",
        position: ppos(8, 2),
        data: {
          label: "Reality Checker",
          model: "deepseek-chat",
          prompt: `Verify the generated code matches the original task requirements.

Task: {{user_input}}
Generated Code: {{generatedCode}}
Architecture Plan: {{architecture}}

Check: Are all must-have requirements addressed? Return PASS or FAIL with explanation.`,
          outputVariable: "realityCheck",
        },
      },

      // ── Stage 8: Risk Aggregation ─────────────────────────────────────────
      {
        id: "risk_agg",
        type: "ai_response",
        position: pos(9),
        data: {
          label: "Risk Aggregator",
          model: "deepseek-chat",
          prompt: `Aggregate the gate results into a deploy risk assessment.

Code Review: {{codeReview}}
Security Review: {{secReview}}
Reality Check: {{realityCheck}}
Sandbox Result: {{sandboxResult}}

Score 0-100. Decision: AUTO_APPROVE (≥80), NEEDS_REVIEW (50-79), BLOCK (<50).

Return JSON: { risk_score, decision, reasoning, critical_findings, recommended_actions }`,
          outputVariable: "riskAssessment",
        },
      },

      // ── Stage 9: Deploy Decision ──────────────────────────────────────────
      {
        id: "deploy_switch",
        type: "switch",
        position: pos(10),
        data: {
          label: "Deploy Decision",
          variable: "riskAssessment.decision",
          operator: "equals",
          outputVariable: "switchResult",
          cases: [
            { value: "AUTO_APPROVE", label: "Auto Approve (≥80)" },
            { value: "NEEDS_REVIEW", label: "Needs Review (50-79)" },
            { value: "BLOCK",        label: "Block (<50)" },
          ],
        },
      },

      // ── Path A: Auto Approve ───────────────────────────────────────────────
      {
        id: "set_approve",
        type: "set_variable",
        position: ppos(11, -1),
        data: {
          label: "Set: Auto Approve",
          assignments: [{ variable: "finalDecision", value: "AUTO_APPROVE" }],
        },
      },

      // ── Path B: Human Review ───────────────────────────────────────────────
      {
        id: "human_review",
        type: "human_approval",
        position: ppos(11, 0),
        data: {
          label: "Human Review Required",
          prompt: `Pipeline requires your review before deploy.

Risk Score: {{riskAssessment.risk_score}}/100
Reasoning: {{riskAssessment.reasoning}}

Critical Findings: {{riskAssessment.critical_findings}}
Recommended Actions: {{riskAssessment.recommended_actions}}

Do you approve deployment?`,
          inputVariable: "riskAssessment",
          outputVariable: "humanDecision",
          timeoutMinutes: 60,
          onTimeout: "continue",
          defaultValue: "APPROVED",
        },
      },

      // ── Path C: Block ──────────────────────────────────────────────────────
      {
        id: "set_block",
        type: "set_variable",
        position: ppos(11, 1),
        data: {
          label: "Set: Block",
          assignments: [{ variable: "finalDecision", value: "BLOCK" }],
        },
      },

      // ── Done ───────────────────────────────────────────────────────────────
      {
        id: "done",
        type: "end",
        position: pos(12),
        data: {
          label: "Pipeline Complete",
          message: "DevSecOps pipeline completed. Decision: {{riskAssessment.decision}} ({{riskAssessment.risk_score}}/100)",
        },
      },
    ],

    edges: [
      edge("input",        "proj_ctx"),
      edge("proj_ctx",     "arch"),
      edge("arch",         "plan_parallel"),

      { id: "e_plan_sec",  source: "plan_parallel", target: "security_eng", sourceHandle: "b_sec_plan" },
      { id: "e_plan_tdd",  source: "plan_parallel", target: "tdd_guide",    sourceHandle: "b_tdd"      },

      edge("plan_parallel", "codegen"),
      edge("codegen",       "sandbox"),

      { id: "e_sb_passed", source: "sandbox",    target: "gate_parallel", sourceHandle: "passed" },
      { id: "e_sb_failed", source: "sandbox",    target: "retry_node",    sourceHandle: "failed" },

      { id: "e_gate_review",  source: "gate_parallel", target: "code_reviewer",  sourceHandle: "b_review"  },
      { id: "e_gate_sec",     source: "gate_parallel", target: "sec_reviewer",   sourceHandle: "b_sec_rev" },
      { id: "e_gate_reality", source: "gate_parallel", target: "reality_checker",sourceHandle: "b_reality" },

      edge("gate_parallel", "risk_agg"),
      edge("risk_agg",      "deploy_switch"),

      { id: "e_sw_approve", source: "deploy_switch", target: "set_approve",  sourceHandle: "case_0" },
      { id: "e_sw_review",  source: "deploy_switch", target: "human_review", sourceHandle: "case_1" },
      { id: "e_sw_block",   source: "deploy_switch", target: "set_block",    sourceHandle: "case_2" },

      edge("set_approve",  "done"),
      edge("human_review", "done"),
      edge("set_block",    "done"),
    ],

    variables: [
      { name: "projectContext",  type: "string" as const, default: ""   },
      { name: "architecture",    type: "string" as const, default: ""   },
      { name: "securityPlan",    type: "string" as const, default: ""   },
      { name: "tddPlan",         type: "string" as const, default: ""   },
      { name: "generatedCode",   type: "object" as const, default: null },
      { name: "sandboxResult",   type: "string" as const, default: ""   },
      { name: "codeReview",      type: "object" as const, default: null },
      { name: "secReview",       type: "object" as const, default: null },
      { name: "realityCheck",    type: "string" as const, default: ""   },
      { name: "riskAssessment",  type: "object" as const, default: null },
      { name: "finalDecision",   type: "string" as const, default: ""   },
      { name: "humanDecision",   type: "string" as const, default: ""   },
    ],
  },

  // ── DevSecOps individual agent flows ──────────────────────────────────────

  "devsecops-code-quality": {
    nodes: [
      {
        id: "in",
        type: "message",
        position: pos(0),
        data: { label: "Code Input", message: "{{user_input}}" },
      },
      {
        id: "kb_rules",
        type: "kb_search",
        position: pos(1),
        data: {
          label: "Fetch Quality Rules",
          query: "code quality rules TypeScript ESLint complexity best practices",
          outputVariable: "quality_rules",
          topK: 5,
        },
      },
      {
        id: "analyze",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Analyze Code Quality",
          prompt: `Perform a comprehensive code quality analysis on the provided code.

Code/Diff: {{user_input}}
PR Context: {{pr_context}}
Files Changed: {{files_changed}}

Quality Rules Reference: {{quality_rules}}

Analyze for:
1. TypeScript strict mode compliance (no any, proper types)
2. Cyclomatic complexity (flag functions > 10)
3. Code duplication (DRY violations)
4. Error handling completeness
5. Performance anti-patterns
6. Architectural concerns

Return structured JSON with quality_score (0-100) and detailed findings.`,
          outputVariable: "quality_result",
          model: "deepseek-chat",
        },
      },
      {
        id: "out",
        type: "message",
        position: pos(3),
        data: { label: "Quality Report", message: "{{quality_result}}" },
      },
    ],
    edges: [edge("in", "kb_rules"), edge("kb_rules", "analyze"), edge("analyze", "out")],
    variables: [],
  },

  "devsecops-security-scanner": {
    nodes: [
      {
        id: "in",
        type: "message",
        position: pos(0),
        data: { label: "Code Input", message: "{{user_input}}" },
      },
      {
        id: "kb_owasp",
        type: "kb_search",
        position: pos(1),
        data: {
          label: "Fetch OWASP Rules",
          query: "OWASP Top 10 vulnerabilities injection XSS CSRF authentication security patterns",
          outputVariable: "owasp_rules",
          topK: 8,
        },
      },
      {
        id: "scan",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Security SAST Scan",
          prompt: `Perform SAST (Static Application Security Testing) on the provided code.

Code/Diff: {{user_input}}
PR Context: {{pr_context}}
Files Changed: {{files_changed}}
Repo: {{repo_name}}

OWASP Security Rules: {{owasp_rules}}

Scan for:
1. OWASP Top 10 (2025) vulnerabilities
2. Secret/credential exposure (API keys, passwords, tokens)
3. Injection flaws (SQL, NoSQL, command, SSTI)
4. Authentication and authorization bypasses
5. Cryptographic weaknesses
6. SSRF vulnerabilities
7. Dependency CVEs

Return structured JSON with security_score (0-100), risk_level, and detailed vulnerabilities with CVSS scores.`,
          outputVariable: "security_result",
          model: "deepseek-chat",
        },
      },
      {
        id: "out",
        type: "message",
        position: pos(3),
        data: { label: "Security Report", message: "{{security_result}}" },
      },
    ],
    edges: [edge("in", "kb_owasp"), edge("kb_owasp", "scan"), edge("scan", "out")],
    variables: [],
  },

  "devsecops-test-intelligence": {
    nodes: [
      {
        id: "in",
        type: "message",
        position: pos(0),
        data: { label: "Code Input", message: "{{user_input}}" },
      },
      {
        id: "kb_testing",
        type: "kb_search",
        position: pos(1),
        data: {
          label: "Fetch Testing Patterns",
          query: "unit testing integration tests Vitest Jest coverage best practices",
          outputVariable: "testing_patterns",
          topK: 5,
        },
      },
      {
        id: "analyze_coverage",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Analyze Test Coverage",
          prompt: `Analyze test coverage for the provided code changes.

Code/Diff: {{user_input}}
PR Context: {{pr_context}}
Files Changed: {{files_changed}}

Testing Patterns Reference: {{testing_patterns}}

Analyze:
1. New functions/methods without test coverage
2. Modified logic without updated tests
3. New API routes without integration tests
4. Error paths without error handling tests
5. Coverage delta estimation

Generate missing tests following Vitest/Jest 2026 standards.

Return structured JSON with coverage_score (0-100), files_missing_tests, and generated_tests array.`,
          outputVariable: "test_result",
          model: "deepseek-chat",
        },
      },
      {
        id: "out",
        type: "message",
        position: pos(3),
        data: { label: "Coverage Report", message: "{{test_result}}" },
      },
    ],
    edges: [edge("in", "kb_testing"), edge("kb_testing", "analyze_coverage"), edge("analyze_coverage", "out")],
    variables: [],
  },

  "devsecops-pr-review-publisher": {
    nodes: [
      {
        id: "in",
        type: "message",
        position: pos(0),
        data: { label: "Analysis Input", message: "{{user_input}}" },
      },
      {
        id: "format_review",
        type: "ai_response",
        position: pos(1),
        data: {
          label: "Format GitHub Review",
          prompt: `Format a comprehensive GitHub PR review comment from the pipeline results.

PR Context: {{pr_context}}
Risk Assessment: {{risk_assessment}}
Code Quality: {{quality_result}}
Security Scan: {{security_result}}
Test Coverage: {{test_result}}
Final Decision: {{final_decision}}

Create a rich Markdown comment with:
1. Risk score badge and decision
2. Summary table (Quality / Security / Tests scores)
3. Critical and high findings with code snippets and fixes
4. Positive observations
5. Action items checklist ([ ] format)
6. Collapsible full details section

Use emoji-coded severity: 🚫 Critical, ⚠️ High, 💛 Medium, ℹ️ Low`,
          outputVariable: "formatted_review",
          model: "deepseek-chat",
        },
      },
      {
        id: "out",
        type: "message",
        position: pos(2),
        data: { label: "Publish Review", message: "{{formatted_review}}" },
      },
    ],
    edges: [edge("in", "format_review"), edge("format_review", "out")],
    variables: [],
  },

  // ── SDLC Full Pipeline ────────────────────────────────────────────────

  /**
   * Full SDLC Pipeline — reference implementation with all Phase 1-6 improvements.
   *
   * Architecture:
   *   project_context
   *     → Phase 1: Product Discovery
   *     → Phase 2: Parallel (Architecture + Security Engineer + TDD Guide)
   *     → Phase 3: Code Generation (outputSchema: CodeGenOutput)
   *         → sandbox_verify
   *             ├── passed → Parallel PR Gate (Code Review + Security Review + Reality Checker)
   *             └── failed → retry (escalating, max 2) → Code Gen
   *     → Phase 4: CI/CD Generator
   *     → Phase 5: Deploy Decision → Human Approval
   *
   * This flow uses ALL new node types and schemas introduced in phases 1-6.
   */
  "sdlc-full-pipeline": {
    nodes: [
      // ── Phase 0: Entry + Context ──────────────────────────────────────────
      {
        id: "input",
        type: "message",
        position: pos(0),
        data: { label: "Feature Request", message: "{{user_input}}" },
      },
      {
        id: "proj_ctx",
        type: "project_context",
        position: pos(1),
        data: {
          label: "Load Project Context",
          contextFiles: ["CLAUDE.md", ".claude/rules/*.md"],
          outputVariable: "projectContext",
        },
      },

      // ── Phase 1: Product Discovery ────────────────────────────────────────
      {
        id: "discovery",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Product Discovery",
          model: "deepseek-reasoner",
          prompt: `You are a product manager. Analyze the feature request and produce a concise product spec.

Project Context:
{{projectContext}}

Feature Request:
{{user_input}}

Output: user stories, acceptance criteria, must-have vs nice-to-have, risks.`,
          outputVariable: "productSpec",
        },
      },

      // ── Phase 2: Parallel Architecture + Security + TDD ───────────────────
      {
        id: "phase2_parallel",
        type: "parallel",
        position: pos(3),
        data: {
          label: "Phase 2: Architecture Planning",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_arch", label: "Architecture",      outputVariable: "architecture"    },
            { branchId: "b_sec",  label: "Security Engineer",  outputVariable: "securityPlan"    },
            { branchId: "b_tdd",  label: "TDD Guide",          outputVariable: "tddPlan"         },
          ],
        },
      },
      {
        id: "architect",
        type: "call_agent",
        position: ppos(4, -1),
        data: {
          label: "Architect",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "architecture",
          inputMapping: [
            { key: "spec",           value: "{{productSpec}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "security_eng",
        type: "call_agent",
        position: ppos(4, 0),
        data: {
          label: "Security Engineer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "securityPlan",
          inputMapping: [
            { key: "spec",           value: "{{productSpec}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "tdd_guide",
        type: "call_agent",
        position: ppos(4, 1),
        data: {
          label: "TDD Guide",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "tddPlan",
          inputMapping: [
            { key: "spec",           value: "{{productSpec}}" },
            { key: "architecture",   value: "{{architecture}}" },
          ],
          onError: "continue",
        },
      },

      // ── Phase 3: Code Generation ───────────────────────────────────────────
      {
        id: "codegen",
        type: "ai_response",
        position: pos(5),
        data: {
          label: "Code Generation",
          model: "deepseek-chat",
          prompt: `Generate production-ready code for the feature.

Project Context:
{{projectContext}}

Product Spec:
{{productSpec}}

Architecture:
{{architecture}}

Security Requirements:
{{securityPlan}}

TDD Plan (write code to pass these tests):
{{tddPlan}}

Return a CodeGenOutput JSON object with files array, summary, and language.`,
          outputVariable: "generatedCode",
          outputSchema: "CodeGenOutput",
        },
      },

      // ── Phase 3a: Sandbox Verification ────────────────────────────────────
      {
        id: "sandbox",
        type: "sandbox_verify",
        position: pos(6),
        data: {
          label: "Sandbox Verify",
          inputVariable: "generatedCode",
          checks: ["typecheck", "lint", "forbidden_patterns"],
          outputVariable: "sandboxResult",
        },
      },

      // ── Retry on sandbox failure ───────────────────────────────────────────
      {
        id: "retry_node",
        type: "retry",
        position: ppos(7, 1),
        data: {
          label: "Escalating Retry",
          targetNodeId: "codegen",
          maxRetries: 2,
          enableEscalation: true,
          failureVariable: "sandboxResult",
          failureValues: ["FAIL"],
          prGateVariable: "gateResult",
          sandboxErrorsVariable: "sandboxResult",
          projectContextVariable: "projectContext",
          outputVariable: "generatedCode",
        },
      },

      // ── Phase 3b: Parallel PR Gate ─────────────────────────────────────────
      {
        id: "gate_parallel",
        type: "parallel",
        position: ppos(7, -1),
        data: {
          label: "PR Gate (parallel)",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_review",  label: "Code Review",    outputVariable: "codeReview"   },
            { branchId: "b_secrev",  label: "Security Review", outputVariable: "secReview"    },
            { branchId: "b_reality", label: "Reality Checker", outputVariable: "realityCheck" },
          ],
        },
      },
      {
        id: "code_reviewer",
        type: "call_agent",
        position: ppos(8, -2),
        data: {
          label: "Code Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "codeReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",           value: "{{generatedCode}}" },
            { key: "projectContext", value: "{{projectContext}}" },
            { key: "tddPlan",        value: "{{tddPlan}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "sec_reviewer",
        type: "call_agent",
        position: ppos(8, 0),
        data: {
          label: "Security Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "secReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",         value: "{{generatedCode}}" },
            { key: "securityPlan", value: "{{securityPlan}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "reality_checker",
        type: "ai_response",
        position: ppos(8, 2),
        data: {
          label: "Reality Checker",
          model: "deepseek-chat",
          prompt: `Verify the code addresses all must-have requirements from the product spec.

Product Spec: {{productSpec}}
Generated Code: {{generatedCode}}
Architecture Plan: {{architecture}}

For each must-have requirement: PASS or FAIL. Overall verdict: PASS or FAIL.`,
          outputVariable: "realityCheck",
        },
      },

      // ── Phase 4: CI/CD Generator ───────────────────────────────────────────
      {
        id: "cicd_gen",
        type: "ai_response",
        position: pos(9),
        data: {
          label: "CI/CD Generator",
          model: "deepseek-chat",
          prompt: `Generate a CI/CD pipeline configuration for this code.

Project Context: {{projectContext}}
Generated Code Summary: {{generatedCode}}
Code Review: {{codeReview}}
Security Review: {{secReview}}

Output: GitHub Actions workflow YAML, deployment steps, rollback procedure.`,
          outputVariable: "cicdConfig",
        },
      },

      // ── Phase 5: Deploy Decision ───────────────────────────────────────────
      {
        id: "deploy_switch",
        type: "switch",
        position: pos(10),
        data: {
          label: "Deploy Decision",
          variable: "codeReview.decision",
          operator: "equals",
          outputVariable: "deployDecision",
          cases: [
            { value: "APPROVE",          label: "Approved — deploy" },
            { value: "REQUEST_CHANGES",  label: "Changes requested" },
            { value: "BLOCK",            label: "Blocked" },
          ],
        },
      },
      {
        id: "human_approval",
        type: "human_approval",
        position: ppos(11, 0),
        data: {
          label: "Deploy Approval",
          prompt: `SDLC pipeline complete. Review results before deploy.

Code Review: {{codeReview}}
Security Review: {{secReview}}
Reality Check: {{realityCheck}}
CI/CD Config: {{cicdConfig}}

Approve deployment?`,
          inputVariable: "codeReview",
          outputVariable: "deployApproval",
          timeoutMinutes: 120,
          onTimeout: "continue",
          defaultValue: "APPROVED",
        },
      },
      {
        id: "auto_deploy",
        type: "set_variable",
        position: ppos(11, -1),
        data: {
          label: "Auto Deploy",
          assignments: [{ variable: "deployApproval", value: "AUTO_APPROVED" }],
        },
      },
      {
        id: "blocked",
        type: "set_variable",
        position: ppos(11, 1),
        data: {
          label: "Blocked",
          assignments: [{ variable: "deployApproval", value: "BLOCKED" }],
        },
      },

      // ── Done ───────────────────────────────────────────────────────────────
      {
        id: "done",
        type: "end",
        position: pos(12),
        data: {
          label: "SDLC Complete",
          message: "Full SDLC pipeline completed.\n\nCode: {{generatedCode}}\nCI/CD: {{cicdConfig}}\nDeploy: {{deployApproval}}",
        },
      },
    ],

    edges: [
      edge("input",    "proj_ctx"),
      edge("proj_ctx", "discovery"),
      edge("discovery", "phase2_parallel"),

      { id: "e_p2_arch", source: "phase2_parallel", target: "architect",    sourceHandle: "b_arch" },
      { id: "e_p2_sec",  source: "phase2_parallel", target: "security_eng", sourceHandle: "b_sec"  },
      { id: "e_p2_tdd",  source: "phase2_parallel", target: "tdd_guide",    sourceHandle: "b_tdd"  },

      edge("phase2_parallel", "codegen"),
      edge("codegen", "sandbox"),

      { id: "e_sb_passed", source: "sandbox",    target: "gate_parallel", sourceHandle: "passed" },
      { id: "e_sb_failed", source: "sandbox",    target: "retry_node",    sourceHandle: "failed" },

      { id: "e_gate_review",  source: "gate_parallel", target: "code_reviewer",   sourceHandle: "b_review"  },
      { id: "e_gate_sec",     source: "gate_parallel", target: "sec_reviewer",    sourceHandle: "b_secrev"  },
      { id: "e_gate_reality", source: "gate_parallel", target: "reality_checker", sourceHandle: "b_reality" },

      edge("gate_parallel", "cicd_gen"),
      edge("cicd_gen", "deploy_switch"),

      { id: "e_sw_approve", source: "deploy_switch", target: "auto_deploy",   sourceHandle: "case_0" },
      { id: "e_sw_changes", source: "deploy_switch", target: "human_approval", sourceHandle: "case_1" },
      { id: "e_sw_block",   source: "deploy_switch", target: "blocked",        sourceHandle: "case_2" },

      edge("auto_deploy",    "done"),
      edge("human_approval", "done"),
      edge("blocked",        "done"),
    ],

    variables: [
      { name: "projectContext", type: "string" as const, default: ""   },
      { name: "productSpec",    type: "string" as const, default: ""   },
      { name: "architecture",   type: "string" as const, default: ""   },
      { name: "securityPlan",   type: "string" as const, default: ""   },
      { name: "tddPlan",        type: "string" as const, default: ""   },
      { name: "generatedCode",  type: "object" as const, default: null },
      { name: "sandboxResult",  type: "string" as const, default: ""   },
      { name: "codeReview",     type: "object" as const, default: null },
      { name: "secReview",      type: "object" as const, default: null },
      { name: "realityCheck",   type: "string" as const, default: ""   },
      { name: "cicdConfig",     type: "string" as const, default: ""   },
      { name: "deployDecision", type: "string" as const, default: ""   },
      { name: "deployApproval", type: "string" as const, default: ""   },
    ],
  },

  // ── Autonomous SDLC Pipeline ──────────────────────────────────────────

  /**
   * Fully autonomous SDLC pipeline — spec → code → test → git → deploy.
   *
   * Phases:
   *   0. Input + project context
   *   1. Product discovery (deepseek-reasoner)
   *   2. Parallel: Architecture (ArchitectureOutput) + Security + TDD planning
   *   3. Code generation (CodeGenOutput) + sandbox verify + escalating retry
   *   3b. Parallel PR Gate: Code Review + Security Review (PRGateOutput each)
   *   4. Gate decision (switch on codeReview.decision)
   *   5. file_writer  — writes CodeGenOutput.files to disk
   *   6. process_runner — runs pnpm typecheck + pnpm test --run
   *   7. git_node  — git add + commit + push
   *   8. deploy_trigger — Vercel REST API deploy + poll
   */
  "sdlc-autonomous-pipeline": {
    nodes: [
      // ── Phase 0: Input + Context ────────────────────────────────────────
      {
        id: "input",
        type: "message",
        position: pos(0),
        data: { label: "Feature Request", message: "{{user_input}}" },
      },
      {
        id: "proj_ctx",
        type: "project_context",
        position: pos(1),
        data: {
          label: "Load Project Context",
          contextFiles: ["CLAUDE.md", ".claude/rules/*.md"],
          outputVariable: "projectContext",
        },
      },

      // ── Phase 1: Product Discovery ──────────────────────────────────────
      {
        id: "discovery",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Product Discovery",
          model: "deepseek-reasoner",
          prompt: `You are a senior product manager. Analyse the feature request and produce a concise product spec.

Project Context:
{{projectContext}}

Feature Request:
{{user_input}}

Output JSON with fields: title (string), userStories (string[]), acceptanceCriteria (string[]), mustHave (string[]), niceToHave (string[]), risks (string[]).`,
          outputVariable: "productSpec",
        },
      },

      // ── Phase 2: Parallel Architecture + Security + TDD ─────────────────
      {
        id: "phase2_parallel",
        type: "parallel",
        position: pos(3),
        data: {
          label: "Phase 2: Planning",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_arch", label: "Architecture",      outputVariable: "architecture" },
            { branchId: "b_sec",  label: "Security Engineer",  outputVariable: "securityPlan" },
            { branchId: "b_tdd",  label: "TDD Guide",          outputVariable: "tddPlan"      },
          ],
        },
      },
      {
        id: "architect",
        type: "call_agent",
        position: ppos(4, -1),
        data: {
          label: "Architect",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "architecture",
          outputSchema: "ArchitectureOutput",
          inputMapping: [
            { key: "spec",           value: "{{productSpec}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "security_eng",
        type: "call_agent",
        position: ppos(4, 0),
        data: {
          label: "Security Engineer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "securityPlan",
          inputMapping: [
            { key: "spec",           value: "{{productSpec}}" },
            { key: "projectContext", value: "{{projectContext}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "tdd_guide",
        type: "call_agent",
        position: ppos(4, 1),
        data: {
          label: "TDD Guide",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "tddPlan",
          inputMapping: [
            { key: "spec",         value: "{{productSpec}}" },
            { key: "architecture", value: "{{architecture}}" },
          ],
          onError: "continue",
        },
      },

      // ── Phase 3: Code Generation ────────────────────────────────────────
      {
        id: "codegen",
        type: "ai_response",
        position: pos(5),
        data: {
          label: "Code Generation",
          model: "deepseek-chat",
          prompt: `Generate production-ready code for this feature.

Project Context:
{{projectContext}}

Product Spec:
{{productSpec}}

Architecture:
{{architecture}}

Security Requirements:
{{securityPlan}}

TDD Plan (write code to pass these tests):
{{tddPlan}}

{{#if __retry_escalation}}
RETRY CONTEXT — previous attempt failed:
{{__retry_escalation}}
{{/if}}

Return a valid CodeGenOutput JSON with files[], dependencies[], envVariables[], and summary.`,
          outputVariable: "generatedCode",
          outputSchema: "CodeGenOutput",
        },
      },

      // ── Phase 3a: Sandbox Verify ────────────────────────────────────────
      {
        id: "sandbox",
        type: "sandbox_verify",
        position: pos(6),
        data: {
          label: "Sandbox Verify",
          inputVariable: "generatedCode",
          checks: ["typecheck", "lint", "forbidden_patterns"],
          outputVariable: "sandboxResult",
        },
      },
      {
        id: "retry_sandbox",
        type: "retry",
        position: ppos(7, 1),
        data: {
          label: "Retry on Sandbox Fail",
          targetNodeId: "codegen",
          maxRetries: 2,
          enableEscalation: true,
          failureVariable: "sandboxResult",
          failureValues: ["FAIL"],
          sandboxErrorsVariable: "sandboxResult",
          projectContextVariable: "projectContext",
          outputVariable: "generatedCode",
        },
      },

      // ── Phase 3b: Parallel PR Gate ──────────────────────────────────────
      {
        id: "gate_parallel",
        type: "parallel",
        position: ppos(7, -1),
        data: {
          label: "PR Gate",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_review", label: "Code Review",    outputVariable: "codeReview" },
            { branchId: "b_secrev", label: "Security Review", outputVariable: "secReview"  },
          ],
        },
      },
      {
        id: "code_reviewer",
        type: "call_agent",
        position: ppos(8, -2),
        data: {
          label: "Code Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "codeReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",           value: "{{generatedCode}}" },
            { key: "projectContext", value: "{{projectContext}}" },
            { key: "tddPlan",        value: "{{tddPlan}}" },
          ],
          onError: "continue",
        },
      },
      {
        id: "sec_reviewer",
        type: "call_agent",
        position: ppos(8, 0),
        data: {
          label: "Security Reviewer",
          mode: "internal",
          targetAgentId: "",
          outputVariable: "secReview",
          outputSchema: "PRGateOutput",
          inputMapping: [
            { key: "code",         value: "{{generatedCode}}" },
            { key: "securityPlan", value: "{{securityPlan}}" },
          ],
          onError: "continue",
        },
      },

      // ── Phase 4: Gate Decision ──────────────────────────────────────────
      {
        id: "gate_switch",
        type: "switch",
        position: pos(9),
        data: {
          label: "Gate Decision",
          variable: "codeReview.decision",
          operator: "equals",
          cases: [
            { value: "APPROVE",            label: "Approved — proceed" },
            { value: "APPROVE_WITH_NOTES", label: "Approved with notes" },
            { value: "BLOCK",              label: "Blocked" },
          ],
        },
      },
      {
        id: "blocked_end",
        type: "end",
        position: ppos(10, 1),
        data: {
          label: "Blocked by PR Gate",
          message: "Deployment blocked.\n\nCode Review Decision: BLOCK\n\nIssues:\n{{codeReview}}",
        },
      },

      // ── Phase 5: Write Files to Disk ────────────────────────────────────
      {
        id: "file_write",
        type: "file_writer",
        position: pos(10),
        data: {
          label: "Write Files to Disk",
          inputVariable: "generatedCode",
          baseDir: ".",
          nextNodeId: "run_tests",
          onErrorNodeId: "file_err",
          outputVariable: "fileWriteResult",
        },
      },
      {
        id: "file_err",
        type: "end",
        position: ppos(11, 1),
        data: {
          label: "File Write Error",
          message: "Failed to write generated files to disk.\n\n{{fileWriteResult}}",
        },
      },

      // ── Phase 6: Run Tests ───────────────────────────────────────────────
      {
        id: "run_tests",
        type: "process_runner",
        position: pos(11),
        data: {
          label: "Run Tests",
          commands: ["pnpm typecheck", "pnpm test --run"],
          timeoutMs: 120000,
          outputVariable: "testResult",
        },
      },
      {
        id: "retry_tests",
        type: "retry",
        position: ppos(12, 1),
        data: {
          label: "Retry on Test Failure",
          targetNodeId: "codegen",
          maxRetries: 1,
          enableEscalation: true,
          failureVariable: "generatedCode",
          failureValues: ["[Error:"],
          sandboxErrorsVariable: "testResult",
          projectContextVariable: "projectContext",
          outputVariable: "generatedCode",
        },
      },

      // ── Phase 6b: Human Approval before commit ─────────────────────────
      {
        id: "code_approval",
        type: "human_approval",
        position: ppos(12, 0),
        data: {
          label: "Review Before Commit",
          prompt: `Tests passed ✅ — review the generated code before committing.

Generated Code Summary:
{{generatedCode.summary}}

Files to be written:
{{fileWriteResult.filesWritten}}

Test Results:
{{testResult}}

Code Review:
{{codeReview.summary}}

Security Review:
{{secReview.summary}}

Approve to commit and deploy, or reject to stop here.`,
          outputVariable: "commitApproval",
          timeoutMinutes: 60,
          onTimeout: "stop",
          defaultValue: "PENDING",
        },
      },
      {
        id: "approval_check",
        type: "switch",
        position: pos(13),
        data: {
          label: "Approval Decision",
          variable: "commitApproval",
          operator: "equals",
          cases: [
            { value: "APPROVED", label: "Approved — commit & deploy" },
            { value: "REJECTED", label: "Rejected — stop" },
          ],
        },
      },
      {
        id: "rejected_end",
        type: "end",
        position: ppos(14, 1),
        data: {
          label: "Rejected by Developer",
          message: "Pipeline stopped. Developer rejected the generated code.\n\nReview issues and restart with updated requirements.",
        },
      },

      // ── Phase 7: Git Commit + Push ──────────────────────────────────────
      {
        id: "git_commit",
        type: "git_node",
        position: pos(14),
        data: {
          label: "Git Commit & Push",
          operation: "commit_and_push",
          commitMessage: "feat: autonomous pipeline — {{productSpec}}",
          branch: "feature/sdlc-pipeline",
          nextNodeId: "deploy",
          onErrorNodeId: "git_err",
          outputVariable: "gitResult",
        },
      },
      {
        id: "git_err",
        type: "end",
        position: ppos(15, 1),
        data: {
          label: "Git Error",
          message: "Git operation failed.\n\n{{gitResult}}",
        },
      },

      // ── Phase 8: Deploy to Vercel ───────────────────────────────────────
      {
        id: "deploy",
        type: "deploy_trigger",
        position: pos(15),
        data: {
          label: "Deploy to Vercel",
          projectId: "",
          teamId: "",
          target: "production",
          outputVariable: "deployResult",
        },
      },
      {
        id: "deploy_err",
        type: "end",
        position: ppos(16, 1),
        data: {
          label: "Deploy Failed",
          message: "Vercel deployment failed.\n\n{{deployResult}}",
        },
      },

      // ── Done ─────────────────────────────────────────────────────────────
      {
        id: "done",
        type: "end",
        position: pos(16),
        data: {
          label: "Pipeline Complete ✓",
          message: "Autonomous SDLC pipeline completed successfully.\n\nCode: {{generatedCode.summary}}\nFiles written: {{fileWriteResult.filesWritten}}\nGit commit: {{gitResult.commitHash}} (branch: feature/sdlc-pipeline)\nDeploy URL: {{deployResult.url}}",
        },
      },
    ],

    edges: [
      // Phase 0-2
      edge("input",    "proj_ctx"),
      edge("proj_ctx", "discovery"),
      edge("discovery", "phase2_parallel"),

      // Phase 2 parallel branches
      { id: "e_p2_arch", source: "phase2_parallel", target: "architect",    sourceHandle: "b_arch" },
      { id: "e_p2_sec",  source: "phase2_parallel", target: "security_eng", sourceHandle: "b_sec"  },
      { id: "e_p2_tdd",  source: "phase2_parallel", target: "tdd_guide",    sourceHandle: "b_tdd"  },

      // Phase 3: codegen → sandbox
      edge("phase2_parallel", "codegen"),
      edge("codegen", "sandbox"),

      // Sandbox routing
      { id: "e_sb_passed", source: "sandbox",    target: "gate_parallel", sourceHandle: "passed" },
      { id: "e_sb_failed", source: "sandbox",    target: "retry_sandbox", sourceHandle: "failed" },

      // Phase 3b: PR Gate parallel branches
      { id: "e_gate_review", source: "gate_parallel", target: "code_reviewer", sourceHandle: "b_review" },
      { id: "e_gate_sec",    source: "gate_parallel", target: "sec_reviewer",  sourceHandle: "b_secrev" },

      // Gate switch routing (case_0=APPROVE, case_1=APPROVE_WITH_NOTES, case_2=BLOCK)
      edge("gate_parallel", "gate_switch"),
      { id: "e_sw_approve", source: "gate_switch", target: "file_write",  sourceHandle: "case_0" },
      { id: "e_sw_notes",   source: "gate_switch", target: "file_write",  sourceHandle: "case_1" },
      { id: "e_sw_block",   source: "gate_switch", target: "blocked_end", sourceHandle: "case_2" },

      // Phase 5: file_write (visual edge — routing via data.nextNodeId)
      edge("file_write", "run_tests"),
      edge("file_write", "file_err"),

      // Phase 6: process_runner routing
      { id: "e_tests_passed", source: "run_tests",     target: "code_approval", sourceHandle: "passed" },
      { id: "e_tests_failed", source: "run_tests",     target: "retry_tests",   sourceHandle: "failed" },

      // Phase 6b: human approval → approval_check switch
      edge("code_approval", "approval_check"),
      { id: "e_appr_approved", source: "approval_check", target: "git_commit",   sourceHandle: "case_0" },
      { id: "e_appr_rejected", source: "approval_check", target: "rejected_end", sourceHandle: "case_1" },

      // Phase 7: git_node (visual edge — routing via data.nextNodeId)
      edge("git_commit", "deploy"),
      edge("git_commit", "git_err"),

      // Phase 8: deploy_trigger routing
      { id: "e_deploy_passed", source: "deploy", target: "done",       sourceHandle: "passed" },
      { id: "e_deploy_failed", source: "deploy", target: "deploy_err", sourceHandle: "failed" },
    ],

    variables: [
      { name: "projectContext",  type: "string" as const, default: ""   },
      { name: "productSpec",     type: "object" as const, default: null },
      { name: "architecture",    type: "object" as const, default: null },
      { name: "securityPlan",    type: "string" as const, default: ""   },
      { name: "tddPlan",         type: "string" as const, default: ""   },
      { name: "generatedCode",   type: "object" as const, default: null },
      { name: "sandboxResult",   type: "string" as const, default: ""   },
      { name: "codeReview",      type: "object" as const, default: null },
      { name: "secReview",       type: "object" as const, default: null },
      { name: "fileWriteResult", type: "object" as const, default: null },
      { name: "testResult",      type: "object" as const, default: null },
      { name: "commitApproval",  type: "string" as const, default: ""   },
      { name: "gitResult",       type: "object" as const, default: null },
      { name: "deployResult",    type: "object" as const, default: null },
    ],
  },

  // ── Orchestration ─────────────────────────────────────────────────────

  "orchestration-plan-and-execute-pipeline": {
    nodes: [
      {
        id: "msg_in",
        type: "message",
        position: pos(0),
        data: { label: "User Task", message: "{{user_input}}" },
      },
      {
        id: "cost",
        type: "cost_monitor",
        position: ppos(1, 0),
        data: {
          label: "Budget Guard",
          mode: "adaptive",
          budgetUsd: 0.5,
          alertThreshold: 0.6,
          trackingVariable: "cost_tracking",
          outputVariable: "cost_status",
        },
      },
      {
        id: "plan",
        type: "plan_and_execute",
        position: ppos(2, 0),
        data: {
          label: "Plan & Execute",
          plannerModel: "deepseek-reasoner",
          maxSubtasks: 6,
          executionStrategy: "auto",
          enableSynthesis: true,
          timeoutPerSubtask: 30000,
          parallelLimit: 5,
          inputVariable: "user_input",
          outputVariable: "plan_result",
        },
      },
      {
        id: "eval",
        type: "reflexive_loop",
        position: ppos(3, 0),
        data: {
          label: "Quality Check",
          executorModel: "deepseek-chat",
          evaluatorModel: "gpt-4.1-mini",
          maxIterations: 2,
          passingScore: 7,
          criteria: [
            { name: "accuracy", description: "Factual correctness", weight: 2 },
            { name: "completeness", description: "Covers all aspects of the task", weight: 1 },
          ],
          includeHistory: true,
          inputVariable: "plan_result",
          outputVariable: "refined_result",
        },
      },
      {
        id: "msg_out",
        type: "message",
        position: ppos(4, 0),
        data: { label: "Final Answer", message: "{{refined_result.finalOutput}}" },
      },
    ],
    edges: [
      edge("msg_in", "cost"),
      edge("cost", "plan"),
      { id: "e_plan_eval", source: "plan", target: "eval", sourceHandle: "done" },
      { id: "e_eval_out", source: "eval", target: "msg_out", sourceHandle: "passed" },
      { id: "e_plan_out", source: "plan", target: "msg_out", sourceHandle: "failed" },
      { id: "e_eval_out_fail", source: "eval", target: "msg_out", sourceHandle: "failed" },
    ],
    variables: [],
  },

  // ── Verification Pipeline ──────────────────────────────────────────────

  "verification-pipeline": {
    nodes: [
      {
        id: "msg_in",
        type: "message",
        position: pos(0),
        data: { label: "User Input", message: "What would you like me to build?" },
      },
      {
        id: "generate",
        type: "ai_response",
        position: pos(1),
        data: {
          label: "Generate Code",
          model: "deepseek-chat",
          systemPrompt: "You are a code generator. Produce clean, tested code based on the user request.",
          outputVariable: "generated_code",
        },
      },
      {
        id: "verify",
        type: "verification",
        position: pos(2),
        data: {
          label: "Run Checks",
          checks: [
            { type: "build", command: "tsc --noEmit", label: "TypeScript" },
            { type: "lint", command: "eslint src/", label: "Lint" },
            { type: "test", command: "npm test", label: "Tests" },
          ],
          outputVariable: "verificationResults",
        },
      },
      {
        id: "msg_pass",
        type: "message",
        position: ppos(3, 0),
        data: { label: "Success", message: "All checks passed! Code is ready." },
      },
      {
        id: "msg_fail",
        type: "message",
        position: ppos(3, 1),
        data: { label: "Failed", message: "Some checks failed. Review the results: {{verificationResults}}" },
      },
    ],
    edges: [
      edge("msg_in", "generate"),
      edge("generate", "verify"),
      { id: "e_verify_pass", source: "verify", target: "msg_pass", sourceHandle: "passed" },
      { id: "e_verify_fail", source: "verify", target: "msg_fail", sourceHandle: "failed" },
    ],
    variables: [],
  },

  // ── Cross-Provider Synthesis ───────────────────────────────────────────

  "cross-provider-synthesis": {
    nodes: [
      {
        id: "msg_in",
        type: "message",
        position: pos(0),
        data: { label: "User Input", message: "What would you like analyzed?" },
      },
      {
        id: "ai_deepseek",
        type: "ai_response",
        position: ppos(1, -1),
        data: {
          label: "DeepSeek Analysis",
          model: "deepseek-chat",
          systemPrompt: "Analyze the user request from a technical and analytical perspective. Be thorough and precise.",
          outputVariable: "deepseek_result",
        },
      },
      {
        id: "ai_openai",
        type: "ai_response",
        position: ppos(1, 1),
        data: {
          label: "OpenAI Analysis",
          model: "gpt-4.1-mini",
          systemPrompt: "Analyze the user request from a creative and strategic perspective. Offer unique insights.",
          outputVariable: "openai_result",
        },
      },
      {
        id: "synthesize",
        type: "ai_response",
        position: pos(2),
        data: {
          label: "Synthesize Results",
          model: "deepseek-chat",
          systemPrompt:
            "You are a synthesis expert. Combine these two analyses into a comprehensive response:\n\nAnalysis A: {{deepseek_result}}\n\nAnalysis B: {{openai_result}}\n\nProduce a unified, balanced answer that captures the best of both perspectives.",
          outputVariable: "synthesized_result",
        },
      },
    ],
    edges: [
      edge("msg_in", "ai_deepseek"),
      edge("msg_in", "ai_openai"),
      edge("ai_deepseek", "synthesize"),
      edge("ai_openai", "synthesize"),
    ],
    variables: [],
  },

};
