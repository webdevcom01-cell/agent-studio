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
};
