"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, Clock, ChevronDown,
  ChevronUp, TrendingUp, TrendingDown, Minus, Download,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssertionResult {
  type: string;
  passed: boolean;
  score: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface EvalCaseResult {
  id: string;
  status: "PASSED" | "FAILED" | "ERROR" | "PENDING" | "SKIPPED";
  agentOutput: string | null;
  score: number | null;
  latencyMs: number | null;
  assertions: AssertionResult[];
  errorMessage?: string | null;
  createdAt: string;
  testCase: {
    id: string;
    label: string;
    input: string;
    tags: string[];
    order: number;
  };
}

export interface EvalRunDetail {
  id: string;
  suiteName: string;
  status: string;
  score: number | null;
  passedCases: number;
  failedCases: number;
  totalCases: number;
  durationMs: number | null;
  triggeredBy: string | null;
  createdAt: string;
  completedAt: string | null;
  results: EvalCaseResult[];
}

export interface RunHistoryItem {
  id: string;
  status: string;
  score: number | null;
  passedCases: number;
  failedCases: number;
  totalCases: number;
  durationMs: number | null;
  triggeredBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface EvalResultsViewProps {
  run: EvalRunDetail;
  history: RunHistoryItem[];
  onSelectRun: (runId: string) => void;
  agentId: string;
  suiteId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scorePct(score: number | null): string {
  if (score == null) return "—";
  return `${(score * 100).toFixed(0)}%`;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 0.8) return "text-foreground/60";
  if (score >= 0.5) return "text-muted-foreground";
  return "text-destructive";
}

function durationLabel(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PASSED:    "bg-foreground/5 text-foreground/60 border-border",
    FAILED:    "bg-muted/10 text-destructive border-destructive/30",
    ERROR:     "bg-muted/10 text-muted-foreground border-border",
    COMPLETED: "bg-muted/10 text-muted-foreground border-border",
    RUNNING:   "bg-muted/10 text-muted-foreground border-border",
    PENDING:   "bg-muted/20 text-muted-foreground border-border",
    SKIPPED:   "bg-muted/20 text-muted-foreground/60 border-border",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] ?? map.PENDING}`}>
      {status}
    </span>
  );
}

function TriggeredByBadge({ triggeredBy }: { triggeredBy: string | null }) {
  const value = triggeredBy ?? "manual";
  const map: Record<string, string> = {
    manual:   "bg-muted/20 text-muted-foreground",
    deploy:   "bg-muted/10 text-muted-foreground",
    schedule: "bg-muted/10 text-muted-foreground",
    compare:  "bg-muted/10 text-muted-foreground",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${map[value] ?? map.manual}`}>
      {value}
    </span>
  );
}

function TrendIcon({ history }: { history: RunHistoryItem[] }) {
  if (history.length < 2) return <Minus className="size-4 text-muted-foreground" />;
  const prev = history[1].score;
  const curr = history[0].score;
  if (prev == null || curr == null) return <Minus className="size-4 text-muted-foreground" />;
  if (curr > prev + 0.02) return <TrendingUp className="size-4 text-foreground/60" />;
  if (curr < prev - 0.02) return <TrendingDown className="size-4 text-destructive" />;
  return <Minus className="size-4 text-muted-foreground" />;
}

// ─── Case result row ──────────────────────────────────────────────────────────

function CaseResultRow({ result }: { result: EvalCaseResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors bg-card"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Status icon */}
        <div className="shrink-0">
          {result.status === "PASSED" && <CheckCircle2 className="size-4 text-foreground/60" />}
          {result.status === "FAILED" && <XCircle className="size-4 text-destructive" />}
          {result.status === "ERROR"  && <AlertCircle className="size-4 text-muted-foreground" />}
          {(result.status === "PENDING" || result.status === "SKIPPED") && <Clock className="size-4 text-muted-foreground" />}
        </div>

        {/* Label + input preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/80 truncate">{result.testCase.label}</p>
          <p className="text-xs text-muted-foreground truncate">{result.testCase.input}</p>
        </div>

        {/* Tags */}
        <div className="flex gap-1 shrink-0">
          {result.testCase.tags.map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border">
              {tag}
            </span>
          ))}
        </div>

        {/* Score */}
        <span className={`text-sm font-mono font-semibold w-12 text-right shrink-0 ${scoreColor(result.score)}`}>
          {scorePct(result.score)}
        </span>

        {/* Latency */}
        <span className="text-xs text-muted-foreground w-16 text-right shrink-0 font-mono">
          {durationLabel(result.latencyMs)}
        </span>

        {/* Expand */}
        {expanded
          ? <ChevronUp className="size-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="size-4 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {/* Agent output */}
          {result.agentOutput && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Agent Response</p>
              <p className="text-sm text-foreground/80 bg-muted rounded-md px-3 py-2 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                {result.agentOutput}
              </p>
            </div>
          )}

          {/* Error */}
          {result.errorMessage && (
            <div className="text-xs text-destructive bg-muted/10 rounded-md px-3 py-2 border border-destructive/30">
              {result.errorMessage}
            </div>
          )}

          {/* Assertion results */}
          {result.assertions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Assertion Results</p>
              <div className="space-y-1.5">
                {result.assertions.map((a, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    {a.passed
                      ? <CheckCircle2 className="size-3.5 text-foreground/60 mt-0.5 shrink-0" />
                      : <XCircle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                    }
                    <span className="text-muted-foreground font-mono shrink-0">{a.type}</span>
                    <span className="text-foreground/80 flex-1">{a.message}</span>
                    <span className={`font-mono font-semibold shrink-0 ${a.passed ? "text-foreground/60" : "text-destructive"}`}>
                      {(a.score * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Trend chart ──────────────────────────────────────────────────────────────

function TrendChart({ history }: { history: RunHistoryItem[] }) {
  if (history.length < 2) return null;

  const data = [...history]
    .reverse()
    .map((r, i) => ({
      run: `#${i + 1}`,
      score: r.score != null ? Math.round(r.score * 100) : null,
      date: new Date(r.createdAt).toLocaleDateString(),
    }));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-sm font-medium text-foreground/80 mb-3">Score Trend</p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="run" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
            formatter={(v) => [`${typeof v === "number" ? v : 0}%`, "Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={{ fill: "hsl(var(--foreground))", r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EvalResultsView({ run, history, onSelectRun, agentId, suiteId }: EvalResultsViewProps) {
  const passRate = run.totalCases > 0 ? run.passedCases / run.totalCases : 0;

  function handleDownloadRun() {
    window.open(
      `/api/agents/${agentId}/evals/${suiteId}/run/${run.id}/export`,
      "_blank",
    );
  }

  function handleDownloadAllRuns() {
    window.open(
      `/api/agents/${agentId}/evals/${suiteId}/export`,
      "_blank",
    );
  }

  return (
    <div className="space-y-4">
      {/* Export buttons row */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={handleDownloadRun}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded border border-border hover:border-border bg-card hover:bg-muted"
          title="Download this run as CSV"
        >
          <Download className="size-3.5" />
          Export Run
        </button>
        <button
          onClick={handleDownloadAllRuns}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded border border-border hover:border-border bg-card hover:bg-muted"
          title="Download all completed runs in this suite as CSV"
        >
          <Download className="size-3.5" />
          Export All Runs
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Score</p>
          <p className={`text-2xl font-bold font-mono ${scoreColor(run.score)}`}>
            {scorePct(run.score)}
            <TrendIcon history={history} />
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Passed</p>
          <p className="text-2xl font-bold text-foreground/60">
            {run.passedCases}<span className="text-sm text-muted-foreground font-normal">/{run.totalCases}</span>
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Failed</p>
          <p className={`text-2xl font-bold ${run.failedCases > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {run.failedCases}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Duration</p>
          <p className="text-2xl font-bold text-foreground/80 font-mono">{durationLabel(run.durationMs)}</p>
        </div>
      </div>

      {/* Pass rate bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Pass rate</span>
          <span>{(passRate * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${passRate >= 0.8 ? "bg-foreground/60" : passRate >= 0.5 ? "bg-muted-foreground" : "bg-destructive"}`}
            style={{ width: `${passRate * 100}%` }}
          />
        </div>
      </div>

      {/* Trend chart */}
      {history.length >= 2 && <TrendChart history={history} />}

      {/* Per-case results */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground/80">Test Results</p>
        {run.results.map((result) => (
          <CaseResultRow key={result.id} result={result} />
        ))}
      </div>

      {/* Run history table */}
      {history.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground/80">Run History</p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-right px-3 py-2">Passed</th>
                  <th className="text-right px-3 py-2">Duration</th>
                  <th className="text-left px-3 py-2">Triggered by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {history.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onSelectRun(r.id)}
                    className={`cursor-pointer transition-colors hover:bg-muted/60 ${r.id === run.id ? "bg-muted/40" : ""}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${scoreColor(r.score)}`}>
                      {scorePct(r.score)}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-xs">
                      {r.passedCases}/{r.totalCases}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground text-xs font-mono">
                      {durationLabel(r.durationMs)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <TriggeredByBadge triggeredBy={r.triggeredBy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
