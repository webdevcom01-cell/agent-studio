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
      { id: "input",     type: "message",     position: pos(0), data: { label: "Task Input", message: "{{user_input}}" } },
      { id: "planner",   type: "call_agent",  position: pos(1), data: { label: "Planner", mode: "internal", targetAgentId: "", outputVariable: "plan", inputMapping: [{ key: "task", value: "{{user_input}}" }], onError: "continue" } },
      { id: "tdd",       type: "call_agent",  position: pos(2), data: { label: "TDD Guide", mode: "internal", targetAgentId: "", outputVariable: "tests_and_code", inputMapping: [{ key: "task", value: "{{plan}}" }], onError: "continue" } },
      { id: "review",    type: "parallel",    position: ppos(3, 0), data: { label: "Review (parallel)", mergeStrategy: "all", timeoutSeconds: 60, branches: [{ branchId: "b_code", label: "Code Review", outputVariable: "code_review" }, { branchId: "b_sec", label: "Security Review", outputVariable: "sec_review" }] } },
      { id: "reviewer",  type: "call_agent",  position: ppos(4, -1), data: { label: "Code Reviewer", mode: "internal", targetAgentId: "", outputVariable: "code_review", inputMapping: [{ key: "code", value: "{{tests_and_code}}" }], onError: "continue" } },
      { id: "security",  type: "call_agent",  position: ppos(4, 1), data: { label: "Security Reviewer", mode: "internal", targetAgentId: "", outputVariable: "sec_review", inputMapping: [{ key: "code", value: "{{tests_and_code}}" }], onError: "continue" } },
      { id: "summary",   type: "ai_response", position: pos(5), data: { label: "Merge Results", prompt: "Summarize the TDD pipeline results:\n\nPlan: {{plan}}\nCode: {{tests_and_code}}\nCode Review: {{code_review}}\nSecurity Review: {{sec_review}}", outputVariable: "final_output" } },
      { id: "output",    type: "message",     position: pos(6), data: { label: "Result", message: "{{final_output}}" } },
    ],
    edges: [
      edge("input", "planner"), edge("planner", "tdd"), edge("tdd", "review"),
      { id: "e_review_reviewer", source: "review", target: "reviewer", sourceHandle: "b_code" },
      { id: "e_review_security", source: "review", target: "security", sourceHandle: "b_sec" },
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
      { id: "input",     type: "message",     position: pos(0), data: { label: "Code to Review", message: "{{user_input}}" } },
      { id: "planner",   type: "call_agent",  position: pos(1), data: { label: "Planner", mode: "internal", targetAgentId: "", outputVariable: "review_plan", inputMapping: [{ key: "task", value: "Review this code: {{user_input}}" }], onError: "continue" } },
      { id: "reviews",   type: "parallel",    position: ppos(2, 0), data: { label: "Reviews (parallel)", mergeStrategy: "all", timeoutSeconds: 60, branches: [{ branchId: "b_general", label: "General Review", outputVariable: "general_review" }, { branchId: "b_lang", label: "Language-Specific", outputVariable: "lang_review" }] } },
      { id: "general",   type: "call_agent",  position: ppos(3, -1), data: { label: "Code Reviewer", mode: "internal", targetAgentId: "", outputVariable: "general_review", inputMapping: [{ key: "code", value: "{{user_input}}" }], onError: "continue" } },
      { id: "lang_rev",  type: "ai_response", position: ppos(3, 1), data: { label: "Language Review", prompt: "Perform a language-specific code review focusing on idioms, patterns, and best practices:\n\n{{user_input}}", outputVariable: "lang_review" } },
      { id: "summary",   type: "ai_response", position: pos(4), data: { label: "Review Summary", prompt: "Consolidate these code reviews into a single prioritized report:\n\nGeneral: {{general_review}}\nLanguage-specific: {{lang_review}}\nPlan context: {{review_plan}}", outputVariable: "final_review" } },
      { id: "output",    type: "message",     position: pos(5), data: { label: "Review Report", message: "{{final_review}}" } },
    ],
    edges: [
      edge("input", "planner"), edge("planner", "reviews"),
      { id: "e_reviews_general", source: "reviews", target: "general", sourceHandle: "b_general" },
      { id: "e_reviews_lang",    source: "reviews", target: "lang_rev", sourceHandle: "b_lang" },
      edge("reviews", "summary"), edge("summary", "output"),
    ],
    variables: [],
  },

  // ── DevSecOps Pipeline ────────────────────────────────────────────────────

  /**
   * Autonomous DevSecOps Pipeline — full 2026 CI/CD security guard.
   *
   * Architecture:
   *   GitHub PR Webhook
   *     → Payload Parser (extracts PR context)
   *     → Parallel Analysis (3 agents simultaneously)
   *         ├── Code Quality Analyzer    (ESLint / TS / complexity)
   *         ├── Security Scanner         (OWASP / SAST / secrets)
   *         └── Test Intelligence Agent  (coverage delta / test gen)
   *     → Risk Aggregator (calculates score 0-100)
   *     → Decision Switch
   *         ├── score ≥ 80  → Auto-approve path
   *         ├── score 50-79 → Human review path
   *         └── score < 50  → Auto-block path
   *     → [Human Approval] (only on NEEDS_REVIEW path)
   *     → PR Review Publisher (GitHub comment + Slack notification)
   *     → Done
   *
   * Node count: 15 nodes — complex enough to stress-test the engine.
   * Uses: webhook_trigger, parallel, call_agent, ai_response, switch,
   *       human_approval, notification, set_variable, mcp_tool.
   */
  "devsecops-orchestrator": {
    nodes: [
      // ── Entry: GitHub Webhook ───────────────────────────────────────────
      {
        id: "wh_trigger",
        type: "webhook_trigger",
        position: pos(0),
        data: {
          label: "GitHub PR Webhook",
          outputVariable: "pr_payload",
          eventTypeVariable: "github_event",
          description: "Receives GitHub pull_request events. Configure webhook at: repo → Settings → Webhooks",
        },
      },

      // ── Stage 1: Parse PR Context ───────────────────────────────────────
      {
        id: "pr_parser",
        type: "ai_response",
        position: pos(1),
        data: {
          label: "Parse PR Context",
          prompt: `Extract and structure the PR context from this GitHub webhook payload.

Webhook payload: {{pr_payload}}
GitHub event: {{github_event}}

Return a JSON object with:
{
  "pr_number": number,
  "pr_title": string,
  "pr_url": string,
  "author": string,
  "base_branch": string,
  "head_branch": string,
  "repo_full_name": string,
  "files_changed": string[],
  "additions": number,
  "deletions": number,
  "diff_summary": string,
  "commit_messages": string[],
  "is_draft": boolean
}

If the event is not a pull_request open/synchronize event, return { "skip": true, "reason": "not a PR event" }.`,
          outputVariable: "pr_context",
          model: "deepseek-chat",
        },
      },

      // ── Stage 2: Parallel Analysis (3 agents) ──────────────────────────
      {
        id: "analysis_parallel",
        type: "parallel",
        position: pos(2),
        data: {
          label: "Parallel Security Analysis",
          mergeStrategy: "all",
          timeoutSeconds: 120,
          branches: [
            { branchId: "b_quality",   label: "Code Quality",   outputVariable: "quality_result"   },
            { branchId: "b_security",  label: "Security Scan",  outputVariable: "security_result"  },
            { branchId: "b_tests",     label: "Test Coverage",  outputVariable: "test_result"      },
          ],
        },
      },

      // Branch A: Code Quality Analyzer
      {
        id: "code_quality",
        type: "call_agent",
        position: ppos(3, -1),
        data: {
          label: "Code Quality Analyzer",
          mode: "internal",
          targetAgentId: "",   // → link to devsecops-code-quality agent
          outputVariable: "quality_result",
          inputMapping: [
            { key: "pr_context",     value: "{{pr_context}}" },
            { key: "files_changed",  value: "{{pr_context.files_changed}}" },
            { key: "diff_summary",   value: "{{pr_context.diff_summary}}" },
          ],
          onError: "continue",
        },
      },

      // Branch B: Security Scanner
      {
        id: "security_scan",
        type: "call_agent",
        position: ppos(3, 0),
        data: {
          label: "Security Scanner",
          mode: "internal",
          targetAgentId: "",   // → link to devsecops-security-scanner agent
          outputVariable: "security_result",
          inputMapping: [
            { key: "pr_context",     value: "{{pr_context}}" },
            { key: "files_changed",  value: "{{pr_context.files_changed}}" },
            { key: "diff_summary",   value: "{{pr_context.diff_summary}}" },
            { key: "repo_name",      value: "{{pr_context.repo_full_name}}" },
          ],
          onError: "continue",
        },
      },

      // Branch C: Test Intelligence
      {
        id: "test_intel",
        type: "call_agent",
        position: ppos(3, 1),
        data: {
          label: "Test Intelligence Agent",
          mode: "internal",
          targetAgentId: "",   // → link to devsecops-test-intelligence agent
          outputVariable: "test_result",
          inputMapping: [
            { key: "pr_context",     value: "{{pr_context}}" },
            { key: "files_changed",  value: "{{pr_context.files_changed}}" },
            { key: "diff_summary",   value: "{{pr_context.diff_summary}}" },
          ],
          onError: "continue",
        },
      },

      // ── Stage 3: Risk Aggregator ────────────────────────────────────────
      {
        id: "risk_aggregator",
        type: "ai_response",
        position: pos(4),
        data: {
          label: "Risk Aggregator",
          prompt: `You are the final risk aggregator for a DevSecOps pipeline.

Aggregate these analysis results and produce a final risk assessment:

PR Context: {{pr_context}}
Code Quality Result: {{quality_result}}
Security Scan Result: {{security_result}}
Test Coverage Result: {{test_result}}

Calculate a risk score using this model:
- Start at 100
- Critical security vulnerability: -40 pts each (max -80)
- High severity finding: -20 pts each (max -40)
- Medium severity finding: -10 pts each (max -20)
- Lint errors: -5 pts each (max -15)
- Missing tests for new code: -10 pts
- Test coverage < 60%: -5 pts

Determine decision:
- score ≥ 80: "AUTO_APPROVE"
- score 50-79: "NEEDS_REVIEW"
- score < 50: "BLOCK"

Return JSON:
{
  "risk_score": number,
  "decision": "AUTO_APPROVE" | "NEEDS_REVIEW" | "BLOCK",
  "decision_reasoning": string,
  "critical_findings": string[],
  "high_findings": string[],
  "medium_findings": string[],
  "positive_observations": string[],
  "recommended_actions": string[],
  "quality_score": number,
  "security_score": number,
  "test_score": number
}`,
          outputVariable: "risk_assessment",
          model: "deepseek-chat",
        },
      },

      // ── Stage 4: Decision Gate (Switch) ────────────────────────────────
      {
        id: "decision_switch",
        type: "switch",
        position: pos(5),
        data: {
          label: "Decision Gate",
          variable: "risk_assessment.decision",
          operator: "equals",
          outputVariable: "switch_result",
          cases: [
            { value: "AUTO_APPROVE", label: "✅ Auto Approve (score ≥ 80)" },
            { value: "NEEDS_REVIEW", label: "⚠️ Needs Review (score 50-79)" },
            { value: "BLOCK",        label: "🚫 Block (score < 50)" },
          ],
        },
      },

      // ── Path A: Auto Approve ────────────────────────────────────────────
      {
        id: "set_auto_approve",
        type: "set_variable",
        position: ppos(6, -1),
        data: {
          label: "Set: Auto Approve",
          assignments: [
            { variable: "final_decision",    value: "AUTO_APPROVE" },
            { variable: "review_event_type", value: "APPROVE" },
          ],
        },
      },

      // ── Path B: Human Review ────────────────────────────────────────────
      {
        id: "human_review",
        type: "human_approval",
        position: ppos(6, 0),
        data: {
          label: "Human Security Review",
          prompt: `A PR requires your review before merge decision.

**PR:** {{pr_context.pr_title}} (#{{pr_context.pr_number}})
**Author:** {{pr_context.author}}
**Risk Score:** {{risk_assessment.risk_score}}/100

**Key Findings:**
{{risk_assessment.high_findings}}

**Recommended Actions:**
{{risk_assessment.recommended_actions}}

Do you approve this PR for merge?`,
          inputVariable: "risk_assessment",
          outputVariable: "human_decision",
          timeoutMinutes: 60,
          onTimeout: "continue",
          defaultValue: "APPROVED",
        },
      },

      // ── Path C: Auto Block ──────────────────────────────────────────────
      {
        id: "set_block",
        type: "set_variable",
        position: ppos(6, 1),
        data: {
          label: "Set: Block PR",
          assignments: [
            { variable: "final_decision",    value: "BLOCK" },
            { variable: "review_event_type", value: "REQUEST_CHANGES" },
          ],
        },
      },

      // ── Stage 5: Merge Paths → Publish ─────────────────────────────────
      {
        id: "publish_review",
        type: "call_agent",
        position: pos(7),
        data: {
          label: "PR Review Publisher",
          mode: "internal",
          targetAgentId: "",   // → link to devsecops-pr-review-publisher agent
          outputVariable: "published_review",
          inputMapping: [
            { key: "pr_context",     value: "{{pr_context}}"     },
            { key: "risk_assessment", value: "{{risk_assessment}}" },
            { key: "quality_result", value: "{{quality_result}}" },
            { key: "security_result", value: "{{security_result}}" },
            { key: "test_result",    value: "{{test_result}}"    },
            { key: "final_decision", value: "{{final_decision}}" },
            { key: "review_event_type", value: "{{review_event_type}}" },
          ],
          onError: "continue",
        },
      },

      // ── Stage 6: Slack Notification ────────────────────────────────────
      {
        id: "slack_notify",
        type: "notification",
        position: pos(8),
        data: {
          label: "Slack Notification",
          message: `🔐 *DevSecOps Pipeline* — PR #{{pr_context.pr_number}}: {{pr_context.pr_title}}

Decision: {{risk_assessment.decision}} (Score: {{risk_assessment.risk_score}}/100)
Author: @{{pr_context.author}} → \`{{pr_context.head_branch}}\`

{{risk_assessment.decision_reasoning}}

🔗 {{pr_context.pr_url}}`,
          channel: "webhook",
          webhookUrl: "",  // → configure with Slack webhook URL
        },
      },

      // ── Done ────────────────────────────────────────────────────────────
      {
        id: "done",
        type: "end",
        position: pos(9),
        data: {
          label: "Pipeline Complete",
          message: "✅ DevSecOps pipeline completed. Decision: {{risk_assessment.decision}} ({{risk_assessment.risk_score}}/100)",
        },
      },
    ],

    edges: [
      // Main flow
      edge("wh_trigger",        "pr_parser"),
      edge("pr_parser",         "analysis_parallel"),

      // Parallel branches
      { id: "e_parallel_quality",   source: "analysis_parallel", target: "code_quality",  sourceHandle: "b_quality"  },
      { id: "e_parallel_security",  source: "analysis_parallel", target: "security_scan", sourceHandle: "b_security" },
      { id: "e_parallel_tests",     source: "analysis_parallel", target: "test_intel",    sourceHandle: "b_tests"    },

      // After parallel merge → risk aggregator
      edge("analysis_parallel", "risk_aggregator"),

      // Risk → Switch
      edge("risk_aggregator", "decision_switch"),

      // Switch → 3 paths
      { id: "e_switch_approve", source: "decision_switch", target: "set_auto_approve", sourceHandle: "case_0" },
      { id: "e_switch_review",  source: "decision_switch", target: "human_review",     sourceHandle: "case_1" },
      { id: "e_switch_block",   source: "decision_switch", target: "set_block",        sourceHandle: "case_2" },

      // All 3 paths → Publish
      edge("set_auto_approve", "publish_review"),
      edge("human_review",     "publish_review"),
      edge("set_block",        "publish_review"),

      // Publish → Notify → Done
      edge("publish_review", "slack_notify"),
      edge("slack_notify",   "done"),
    ],

    variables: [
      { name: "pr_payload",         type: "object" as const, default: null   },
      { name: "github_event",       type: "string" as const, default: ""     },
      { name: "pr_context",         type: "object" as const, default: null   },
      { name: "quality_result",     type: "object" as const, default: null   },
      { name: "security_result",    type: "object" as const, default: null   },
      { name: "test_result",        type: "object" as const, default: null   },
      { name: "risk_assessment",    type: "object" as const, default: null   },
      { name: "final_decision",     type: "string" as const, default: ""     },
      { name: "review_event_type",  type: "string" as const, default: "COMMENT" },
      { name: "human_decision",     type: "string" as const, default: ""     },
      { name: "published_review",   type: "object" as const, default: null   },
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
