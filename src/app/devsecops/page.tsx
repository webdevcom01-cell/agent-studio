/**
 * DevSecOps Pipeline Setup Page
 *
 * Interactive guide for setting up the Autonomous DevSecOps Pipeline:
 *   GitHub PR Webhook → Parallel Analysis (3 agents) → Risk Score → Auto-decision → GitHub Review
 *
 * Features:
 *  - Visual pipeline architecture diagram (SVG)
 *  - Step-by-step setup checklist
 *  - Risk scoring model explanation
 *  - Live demo section
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  GitPullRequest,
  Zap,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Terminal,
  BookOpen,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

export const metadata: Metadata = {
  title: "DevSecOps Pipeline | Agent Studio",
  description:
    "Autonomous CI/CD security pipeline — GitHub PR webhook triggers parallel code quality, security SAST, and test coverage analysis across multiple AI agents with automated risk scoring.",
};

// ─── Pipeline Architecture Diagram ───────────────────────────────────────────

function PipelineDiagram() {
  return (
    <div className="relative w-full overflow-x-auto">
      <svg
        viewBox="0 0 900 560"
        className="w-full max-w-4xl mx-auto"
        aria-label="DevSecOps Pipeline Architecture Diagram"
      >
        {/* Background */}
        <rect width="900" height="560" fill="transparent" />

        {/* ── Stage labels ── */}
        <text x="450" y="28" textAnchor="middle" className="fill-muted-foreground" fontSize="11" fontFamily="monospace">AUTONOMOUS DEVSECOPS PIPELINE — 2026</text>

        {/* ── Row 1: Webhook Trigger ── */}
        <rect x="325" y="40" width="250" height="54" rx="10" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
        <text x="450" y="60" textAnchor="middle" fill="#a5b4fc" fontSize="11" fontWeight="600">🐙 GitHub PR Webhook</text>
        <text x="450" y="78" textAnchor="middle" fill="#818cf8" fontSize="10">pull_request.opened / synchronize</text>

        {/* Arrow down */}
        <line x1="450" y1="94" x2="450" y2="120" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow-indigo)" />

        {/* ── Row 2: Parser ── */}
        <rect x="325" y="120" width="250" height="54" rx="10" fill="#1c1917" stroke="#78716c" strokeWidth="1.5" />
        <text x="450" y="140" textAnchor="middle" fill="#d6d3d1" fontSize="11" fontWeight="600">🔄 PR Context Parser</text>
        <text x="450" y="158" textAnchor="middle" fill="#a8a29e" fontSize="10">Extract diff · files · author · branch</text>

        {/* Arrow down */}
        <line x1="450" y1="174" x2="450" y2="200" stroke="#78716c" strokeWidth="1.5" markerEnd="url(#arrow-stone)" />

        {/* ── Row 3: Parallel Box ── */}
        <rect x="60" y="200" width="780" height="54" rx="10" fill="#0c1a0c" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x="450" y="220" textAnchor="middle" fill="#86efac" fontSize="11" fontWeight="600">⚡ Parallel Analysis — 3 agents simultaneously</text>
        <text x="450" y="238" textAnchor="middle" fill="#4ade80" fontSize="10">mergeStrategy: &quot;all&quot; · timeout: 120s</text>

        {/* 3 branch arrows */}
        <line x1="200" y1="254" x2="200" y2="284" stroke="#22c55e" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
        <line x1="450" y1="254" x2="450" y2="284" stroke="#22c55e" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
        <line x1="700" y1="254" x2="700" y2="284" stroke="#22c55e" strokeWidth="1.5" markerEnd="url(#arrow-green)" />

        {/* ── Row 4: 3 Analysis Agents ── */}
        {/* Code Quality */}
        <rect x="80" y="284" width="240" height="70" rx="10" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1.5" />
        <text x="200" y="306" textAnchor="middle" fill="#93c5fd" fontSize="12" fontWeight="700">🔍 Code Quality</text>
        <text x="200" y="322" textAnchor="middle" fill="#60a5fa" fontSize="10">ESLint · TypeScript</text>
        <text x="200" y="338" textAnchor="middle" fill="#60a5fa" fontSize="10">Complexity · DRY</text>

        {/* Security */}
        <rect x="330" y="284" width="240" height="70" rx="10" fill="#3b0f0f" stroke="#ef4444" strokeWidth="1.5" />
        <text x="450" y="306" textAnchor="middle" fill="#fca5a5" fontSize="12" fontWeight="700">🛡️ Security SAST</text>
        <text x="450" y="322" textAnchor="middle" fill="#f87171" fontSize="10">OWASP Top 10 · Semgrep</text>
        <text x="450" y="338" textAnchor="middle" fill="#f87171" fontSize="10">Secrets · CVEs</text>

        {/* Test Coverage */}
        <rect x="580" y="284" width="240" height="70" rx="10" fill="#0f2e1a" stroke="#22c55e" strokeWidth="1.5" />
        <text x="700" y="306" textAnchor="middle" fill="#86efac" fontSize="12" fontWeight="700">🧪 Test Intelligence</text>
        <text x="700" y="322" textAnchor="middle" fill="#4ade80" fontSize="10">Coverage delta</text>
        <text x="700" y="338" textAnchor="middle" fill="#4ade80" fontSize="10">Test generation</text>

        {/* Merge arrows */}
        <line x1="200" y1="354" x2="200" y2="380" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="200" y1="380" x2="450" y2="380" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="450" y1="354" x2="450" y2="380" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="700" y1="354" x2="700" y2="380" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="700" y1="380" x2="450" y2="380" stroke="#6366f1" strokeWidth="1.5" />
        <line x1="450" y1="380" x2="450" y2="400" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow-indigo)" />

        {/* ── Row 5: Risk Aggregator ── */}
        <rect x="290" y="400" width="320" height="54" rx="10" fill="#1e1b4b" stroke="#a855f7" strokeWidth="1.5" />
        <text x="450" y="420" textAnchor="middle" fill="#d8b4fe" fontSize="11" fontWeight="600">🧠 Risk Aggregator</text>
        <text x="450" y="438" textAnchor="middle" fill="#c084fc" fontSize="10">Score 0–100 · AUTO_APPROVE / NEEDS_REVIEW / BLOCK</text>

        {/* Arrow to switch */}
        <line x1="450" y1="454" x2="450" y2="480" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrow-purple)" />

        {/* ── Row 6: Decision switch indicator ── */}
        <text x="450" y="496" textAnchor="middle" fill="#a855f7" fontSize="10" fontStyle="italic">↙  switch node  ↘</text>

        {/* Score indicators */}
        <rect x="60" y="505" width="230" height="38" rx="8" fill="#0d2d0d" stroke="#22c55e" strokeWidth="1" />
        <text x="175" y="520" textAnchor="middle" fill="#86efac" fontSize="10" fontWeight="600">✅  score ≥ 80</text>
        <text x="175" y="534" textAnchor="middle" fill="#4ade80" fontSize="10">AUTO_APPROVE → GitHub LGTM</text>

        <rect x="335" y="505" width="230" height="38" rx="8" fill="#2d2200" stroke="#f59e0b" strokeWidth="1" />
        <text x="450" y="520" textAnchor="middle" fill="#fcd34d" fontSize="10" fontWeight="600">⚠️  score 50–79</text>
        <text x="450" y="534" textAnchor="middle" fill="#fbbf24" fontSize="10">NEEDS_REVIEW → Human approval</text>

        <rect x="610" y="505" width="230" height="38" rx="8" fill="#2d0d0d" stroke="#ef4444" strokeWidth="1" />
        <text x="725" y="520" textAnchor="middle" fill="#fca5a5" fontSize="10" fontWeight="600">🚫  score &lt; 50</text>
        <text x="725" y="534" textAnchor="middle" fill="#f87171" fontSize="10">BLOCK → Request changes</text>

        {/* Arrow markers */}
        <defs>
          <marker id="arrow-indigo" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#6366f1" />
          </marker>
          <marker id="arrow-stone" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#78716c" />
          </marker>
          <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#22c55e" />
          </marker>
          <marker id="arrow-purple" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#a855f7" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

// ─── Setup Step Component ─────────────────────────────────────────────────────

function SetupStep({
  number,
  title,
  description,
  code,
  badge,
}: {
  number: number;
  title: string;
  description: string;
  code?: string;
  badge?: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/20 border border-border flex items-center justify-center text-muted-foreground font-bold text-sm">
        {number}
      </div>
      <div className="flex-1 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted/20 text-muted-foreground border border-border">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
        {code && (
          <pre className="text-xs bg-muted/20 border border-border rounded-lg p-3 text-foreground/80 overflow-x-auto font-mono">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Score Badge ─────────────────────────────────────────────────────────────

function ScoreBadge({
  min,
  max,
  label,
  color,
  icon: Icon,
}: {
  min: number;
  max?: number;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap: Record<string, string> = {
    green: "border-border bg-muted/20 text-foreground/60",
    yellow: "border-border bg-muted/20 text-muted-foreground",
    red: "border-destructive/30 bg-muted/10 text-destructive",
  };
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border ${colorMap[color]}`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div>
        <div className="text-sm font-bold">
          {max ? `${min}–${max}` : `< ${min}`} pts
        </div>
        <div className="text-xs opacity-75">{label}</div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  emoji,
  name,
  role,
  color,
}: {
  emoji: string;
  name: string;
  role: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    violet: "border-border bg-card/50",
    blue: "border-border bg-card/50",
    red: "border-border bg-card/50",
    green: "border-border bg-card/50",
    orange: "border-border bg-card/50",
  };
  return (
    <div className={`p-4 rounded-xl border ${colorMap[color]}`}>
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-sm font-semibold text-foreground">{name}</div>
      <div className="text-xs text-muted-foreground mt-1">{role}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevSecOpsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden text-foreground"><div className="flex-1 overflow-y-auto">

      {/* Hero */}
      <div className="shrink-0 border-b border-border bg-card/60">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 font-mono uppercase tracking-widest">
            <Shield className="w-3.5 h-3.5" />
            <span>DevSecOps Pipeline · 2026</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Autonomous CI/CD<br />
            <span className="text-foreground">
              Security Pipeline
            </span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mb-8">
            Every pull request triggers a parallel analysis across three specialized AI agents —
            code quality, SAST security scanning, and test coverage intelligence —
            delivering a risk score and automated merge decision in under 60 seconds.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/templates?category=devsecops"
              className="inline-flex items-center gap-2 bg-foreground hover:bg-foreground/90 text-background px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              <Zap className="w-4 h-4" />
              Browse Templates
              <ChevronRight className="w-4 h-4" />
            </Link>
            <a
              href="https://docs.github.com/en/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border hover:border-foreground/30 text-muted-foreground px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              GitHub Webhooks Docs
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">

        {/* Architecture Diagram */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-muted-foreground" />
            Pipeline Architecture
          </h2>
          <div className="rounded-2xl border border-border bg-card p-6">
            <PipelineDiagram />
          </div>
        </section>

        {/* 5 Agents */}
        <section>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Zap className="size-5 text-muted-foreground" />
            5 Specialized Agents
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Each agent has a single responsibility. They run in parallel via the A2A protocol,
            then the Orchestrator aggregates their outputs into a unified risk assessment.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <AgentCard emoji="🔄" name="Orchestrator"        role="Webhook entry point, coordinates all agents, posts final review" color="violet" />
            <AgentCard emoji="🔍" name="Code Quality"        role="ESLint, TypeScript strict, complexity, DRY violations, smells"    color="blue"   />
            <AgentCard emoji="🛡️" name="Security Scanner"    role="OWASP Top 10, SAST, secret detection, dependency CVEs"            color="red"    />
            <AgentCard emoji="🧪" name="Test Intelligence"   role="Coverage delta, missing tests, auto-generates unit tests"          color="green"  />
            <AgentCard emoji="📢" name="PR Publisher"        role="GitHub review comment, Slack notification, audit trail"            color="orange" />
          </div>
        </section>

        {/* Risk Score Model */}
        <section>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Shield className="size-5 text-muted-foreground" />
            Risk Scoring Model
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            The Risk Aggregator calculates a score from 0–100. Deductions are applied for each finding.
            The score determines the automated merge decision.
          </p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <ScoreBadge min={80} max={100} label="AUTO_APPROVE — merged automatically" color="green" icon={CheckCircle} />
            <ScoreBadge min={50} max={79}  label="NEEDS_REVIEW — human approval required" color="yellow" icon={AlertTriangle} />
            <ScoreBadge min={50}           label="BLOCK — request changes, cannot merge" color="red" icon={XCircle} />
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Finding Type</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Deduction</th>
                  <th className="text-right px-4 py-3 text-muted-foreground font-medium">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { type: "Critical security vulnerability (CVSS ≥ 9.0)", deduction: "−40 pts", max: "−80 pts", color: "text-destructive" },
                  { type: "High severity finding (CVSS 7.0–8.9)",          deduction: "−20 pts", max: "−40 pts", color: "text-muted-foreground" },
                  { type: "Medium severity finding (CVSS 4.0–6.9)",        deduction: "−10 pts", max: "−20 pts", color: "text-muted-foreground" },
                  { type: "ESLint / TypeScript errors",                    deduction: "−5 pts",  max: "−15 pts", color: "text-muted-foreground" },
                  { type: "No tests for new code paths",                   deduction: "−10 pts", max: "−10 pts", color: "text-muted-foreground" },
                  { type: "Test coverage < 60%",                           deduction: "−5 pts",  max: "−5 pts",  color: "text-muted-foreground" },
                ].map((row) => (
                  <tr key={row.type} className="hover:bg-muted/20 transition-colors">
                    <td className={`px-4 py-3 ${row.color}`}>{row.type}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground/80">{row.deduction}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground/40">{row.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Setup Guide */}
        <section>
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Terminal className="size-5 text-muted-foreground" />
            Setup Guide
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Get the full pipeline running in about 15 minutes.
          </p>

          <div className="border-l-2 border-border pl-6">
            <SetupStep
              number={1}
              title="Create 5 agents from DevSecOps templates"
              description="Go to Templates → DevSecOps. Create one agent for each template: Orchestrator, Code Quality Analyzer, Security Scanner, Test Intelligence Agent, and PR Review Publisher."
              badge="Templates page"
            />
            <SetupStep
              number={2}
              title="Open the Orchestrator flow editor"
              description="Open the Orchestrator agent in the Flow Builder. The starter flow is pre-populated with all 15 nodes. You need to link the 3 call_agent nodes to the correct agents you just created."
              badge="Flow Builder"
            />
            <SetupStep
              number={3}
              title="Link agents to call_agent nodes"
              description="Click each call_agent node (Code Quality, Security Scanner, Test Intelligence, PR Publisher) and select the matching agent from the dropdown in the property panel."
            />
            <SetupStep
              number={4}
              title="Add Knowledge Bases to analysis agents"
              description="Each analysis agent has a kb_search node. Add the DevSecOps Security KB to the Security Scanner agent and the Code Quality KB to the Code Quality agent. Add OWASP rules, ESLint configs, and testing patterns."
              badge="Knowledge Base"
            />
            <SetupStep
              number={5}
              title="Configure the GitHub PR webhook"
              description='Go to Webhooks tab on the Orchestrator agent. Create a new webhook, select the "GitHub PR (DevSecOps)" preset. This auto-fills all PR field mappings. Copy the webhook URL.'
              badge="Webhooks"
            />
            <SetupStep
              number={6}
              title="Register the webhook in your GitHub repo"
              description="Go to your GitHub repo → Settings → Webhooks → Add webhook. Paste the webhook URL, set Content-Type to application/json, enter the secret, and select 'Pull requests' events only."
              code={`Payload URL:  https://your-app.railway.app/api/agents/{agentId}/trigger/{webhookId}
Content-Type: application/json
Secret:       <copy from Agent Studio webhook settings>
Events:       ✓ Pull requests`}
            />
            <SetupStep
              number={7}
              title="Configure Slack notification (optional)"
              description="In the Orchestrator flow, click the 'Slack Notification' node and enter your Slack Incoming Webhook URL. The pipeline will send a summary message to your channel after each PR analysis."
              code={`Slack webhook URL format:
https://hooks.slack.com/services/T.../B.../...`}
            />
            <SetupStep
              number={8}
              title="Deploy and test"
              description='Deploy the Orchestrator agent (Version panel → Deploy). Open a test PR in your repo. Watch the pipeline execute in real time via the Conversations tab.'
              badge="Go live"
            />
          </div>
        </section>

        {/* What gets tested */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <BookOpen className="size-5 text-muted-foreground" />
            What the Pipeline Tests
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: "🔍",
                title: "Code Quality (30%)",
                items: [
                  "TypeScript strict: no any, proper types",
                  "Cyclomatic complexity > 10",
                  "Duplicate code (DRY violations)",
                  "Missing null checks",
                  "Unhandled promise rejections",
                  "Async/await anti-patterns",
                  "God objects, feature envy",
                ],
                color: "border-border",
              },
              {
                icon: "🛡️",
                title: "Security SAST (40%)",
                items: [
                  "SQL/NoSQL injection",
                  "XSS (stored & reflected)",
                  "Hardcoded secrets & API keys",
                  "SSRF via unvalidated URLs",
                  "Authentication bypasses",
                  "Dependency CVEs (npm audit)",
                  "OWASP Top 10 (2025)",
                ],
                color: "border-border",
              },
              {
                icon: "🧪",
                title: "Test Coverage (30%)",
                items: [
                  "New functions without tests",
                  "Modified logic without updates",
                  "New API routes (no integration tests)",
                  "Error paths (not just happy path)",
                  "Coverage delta from baseline",
                  "Test quality (not just quantity)",
                  "Auto-generated missing tests",
                ],
                color: "border-border",
              },
            ].map((col) => (
              <div key={col.title} className={`border ${col.color} bg-card/40 rounded-xl p-5`}>
                <div className="text-2xl mb-2">{col.icon}</div>
                <h3 className="text-sm font-bold text-foreground mb-3">{col.title}</h3>
                <ul className="space-y-1.5">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground/60">
                      <ArrowRight className="size-3 mt-0.5 shrink-0 text-muted-foreground/30" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Node inventory */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-muted-foreground" />
            Node Inventory — All 15 Flow Nodes
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            This pipeline is the most comprehensive use of Agent Studio&apos;s capabilities —
            it uses 8 out of 32 available node types in a single flow.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { type: "webhook_trigger",  label: "Webhook Trigger",  count: 1, desc: "GitHub PR entry point" },
              { type: "ai_response",      label: "AI Response",      count: 2, desc: "Parser + Risk Aggregator" },
              { type: "parallel",         label: "Parallel",         count: 1, desc: "3-branch analysis" },
              { type: "call_agent",       label: "Call Agent",       count: 4, desc: "4 specialized agents" },
              { type: "switch",           label: "Switch",           count: 1, desc: "Decision gate" },
              { type: "set_variable",     label: "Set Variable",     count: 2, desc: "Approve / Block paths" },
              { type: "human_approval",   label: "Human Approval",   count: 1, desc: "Review borderline PRs" },
              { type: "notification",     label: "Notification",     count: 1, desc: "Slack notification" },
              { type: "end",              label: "End",              count: 1, desc: "Pipeline complete" },
            ].map((n) => (
              <div key={n.type} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between mb-1">
                  <code className="text-xs text-foreground/70 font-mono">{n.type}</code>
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">×{n.count}</span>
                </div>
                <div className="text-xs text-muted-foreground/40">{n.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to ship safer, faster?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto text-sm">
            Start with the DevSecOps templates and have your first automated PR review
            running in under 15 minutes.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/templates?category=devsecops"
              className="inline-flex items-center gap-2 bg-foreground hover:bg-foreground/90 text-background px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
            >
              <Zap className="w-4 h-4" />
              Browse DevSecOps Templates
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 border border-border hover:border-foreground/30 text-muted-foreground px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>

      </div>
    </div>
    </div>
  );
}