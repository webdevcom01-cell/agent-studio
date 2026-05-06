"use client";

import { useState, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  RefreshCw,
  BarChart3,
  Cpu,
  Timer,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PipelineListData {
  runs: PipelineRun[];
  total: number;
}

interface MetricsData {
  modelStats: ModelStatRow[];
  pipelineSummary: PipelineSummary;
}

interface ModelStatRow {
  modelId: string;
  phase: string;
  runCount: number;
  successCount: number;
  retryCount: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgDurationMs: number;
  successRate: number;
}

interface PipelineSummary {
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number;
  successRate: number;
}

interface PipelineRun {
  id: string;
  status: string;
  taskDescription: string;
  taskType: string | null;
  complexity: string | null;
  pipeline: string[];
  currentStep: number;
  stepMetrics: Record<string, {
    phase: string;
    stepId: string;
    modelId: string;
    outcome: string;
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
    feedbackAttempts: number;
  }>;
  finalOutput: string | null;
  error: string | null;
  prUrl: string | null;
  createdAt: string;
  stepResults: Record<string, string>;
  approvalFeedback: string | null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === "FAILED") return <XCircle className="size-4 text-red-400" />;
  if (status === "RUNNING") return <Loader2 className="size-4 text-blue-400 animate-spin" />;
  if (status === "AWAITING_APPROVAL") return <AlertCircle className="size-4 text-amber-400" />;
  return <Clock className="size-4 text-zinc-400" />;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    COMPLETED: "Završeno",
    FAILED: "Greška",
    RUNNING: "U toku",
    PENDING: "Čeka",
    AWAITING_APPROVAL: "Čeka odobrenje",
  };
  return map[status] ?? status;
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function MetricsSummaryCard({
  agentId,
  refreshKey,
}: {
  agentId: string;
  refreshKey: number;
}) {
  const { data, isLoading } = useSWR<{ success: boolean; data: MetricsData }>(
    `/api/sdlc/metrics?agentId=${agentId}&_k=${refreshKey}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading || !data?.success) return null;

  const { pipelineSummary: ps, modelStats } = data.data;
  if (ps.total === 0) return null;

  const successColor =
    ps.successRate >= 0.8 ? "emerald" :
    ps.successRate >= 0.5 ? "amber" : "red";

  function fmtDur(ms: number): string {
    if (ms <= 0) return "—";
    if (ms >= 60_000)
      return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
    return `${Math.round(ms / 1000)}s`;
  }

  return (
    <div className="border border-zinc-700 rounded-xl bg-zinc-900/60 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-zinc-400" />
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Pipeline Statistike
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatPill label="Ukupno" value={String(ps.total)} color="zinc" />
        <StatPill label="Uspešno" value={String(ps.completed)} color="emerald" />
        <StatPill label="Greška" value={String(ps.failed)} color="red" />
        <StatPill
          label="Success rate"
          value={`${Math.round(ps.successRate * 100)}%`}
          color={successColor as "emerald" | "amber" | "red"}
        />
        <StatPill label="Avg trajanje" value={fmtDur(ps.avgDurationMs)} color="blue" />
      </div>

      {modelStats.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Model Performanse (po koraku)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-1.5 pr-3 text-zinc-500 font-medium">Model</th>
                  <th className="text-left py-1.5 pr-3 text-zinc-500 font-medium">Faza</th>
                  <th className="text-right py-1.5 pr-3 text-zinc-500 font-medium">Koraka</th>
                  <th className="text-right py-1.5 pr-3 text-zinc-500 font-medium">Uspeh</th>
                  <th className="text-right py-1.5 pr-3 text-zinc-500 font-medium">Avg/korak</th>
                  <th className="text-right py-1.5 text-zinc-500 font-medium">Avg tokeni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {modelStats.map((s) => (
                  <tr key={`${s.modelId}-${s.phase}`} className="hover:bg-zinc-800/20">
                    <td className="py-1.5 pr-3 text-zinc-300 font-mono truncate max-w-[140px]">
                      {s.modelId}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500 capitalize">{s.phase}</td>
                    <td className="py-1.5 pr-3 text-right text-zinc-400 tabular-nums">
                      {s.runCount}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums font-medium",
                        s.successRate >= 0.9
                          ? "text-emerald-400"
                          : s.successRate >= 0.7
                          ? "text-amber-400"
                          : "text-red-400",
                      )}
                    >
                      {Math.round(s.successRate * 100)}%
                    </td>
                    <td className="py-1.5 pr-3 text-right text-zinc-400 tabular-nums">
                      {s.avgDurationMs >= 1000
                        ? `${(s.avgDurationMs / 1000).toFixed(1)}s`
                        : `${s.avgDurationMs}ms`}
                    </td>
                    <td className="py-1.5 text-right text-zinc-500 tabular-nums">
                      {(
                        ((s.avgInputTokens ?? 0) + (s.avgOutputTokens ?? 0)) /
                        1000
                      ).toFixed(1)}
                      k
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

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "zinc" | "emerald" | "red" | "amber" | "blue";
}) {
  const colors = {
    zinc:    "bg-zinc-800/50 text-zinc-300",
    emerald: "bg-emerald-500/10 text-emerald-400",
    red:     "bg-red-500/10 text-red-400",
    amber:   "bg-amber-500/10 text-amber-400",
    blue:    "bg-blue-500/10 text-blue-400",
  };
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center", colors[color])}>
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </div>
  );
}

function ApproveCard({
  run,
  agentId,
  onApproved,
}: {
  run: PipelineRun;
  agentId: string;
  onApproved: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planningOutputs = run.pipeline
    .map((stepId, i) => ({ stepId, output: run.stepResults?.[String(i)] ?? "" }))
    .filter(({ output }) => output.length > 0);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/pipelines/${run.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Greška pri odobravanju");
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepoznata greška");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
        <AlertCircle className="size-4" /> Čeka vaše odobrenje
      </h4>

      {planningOutputs.length > 0 ? (
        <div className="space-y-3">
          {planningOutputs.map(({ stepId, output }) => (
            <div key={stepId}>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                {stepId}
              </p>
              <pre className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
                {output.length > 4000 ? output.slice(0, 4000) + "\n\n[... skraćeno ...]" : output}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Nema planiranja outputa za prikaz.</p>
      )}

      <div>
        <label className="text-xs text-zinc-400 mb-1 block">
          Feedback za implementaciju (opciono)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="npr. Fokusiraj se na TypeScript tipove, koristi Zod za validaciju..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-200 placeholder:text-zinc-600 resize-none h-20 focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        onClick={handleApprove}
        disabled={approving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-900 text-sm font-semibold transition-colors"
      >
        {approving ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {approving ? "Odobravanjem..." : "Odobri i nastavi"}
      </button>
    </div>
  );
}

function RunRow({ run, agentId, onMutate }: { run: PipelineRun; agentId: string; onMutate: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSWR<{ success: boolean; data: PipelineRun }>(
    open ? `/api/agents/${agentId}/pipelines/${run.id}` : null,
    fetcher
  );
  const detail = data?.data;
  const metrics = detail?.stepMetrics ?? {};
  const entries = Object.entries(metrics);

  return (
    <div className="border border-zinc-800 rounded-xl bg-zinc-900/40 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <StatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-100 font-medium leading-snug line-clamp-2">
            {run.taskDescription}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn(
              "text-xs font-medium",
              run.status === "COMPLETED" ? "text-emerald-400" :
              run.status === "FAILED" ? "text-red-400" :
              run.status === "RUNNING" ? "text-blue-400" :
              run.status === "AWAITING_APPROVAL" ? "text-amber-400" : "text-zinc-400"
            )}>
              {statusLabel(run.status)}
            </span>
            {run.taskType && (
              <span className="text-xs text-zinc-500 capitalize">{run.taskType.replace(/-/g, " ")}</span>
            )}
            <span className="text-xs text-zinc-600">
              {new Date(run.createdAt).toLocaleString("sr-RS")}
            </span>
          </div>
          {/* Pipeline steps */}
          <div className="flex flex-wrap gap-1 mt-2">
            {run.pipeline.map((step, i) => (
              <span
                key={`${step}-${i}`}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded border",
                  i < run.currentStep
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : i === run.currentStep && run.status === "RUNNING"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-zinc-800 text-zinc-500 border-zinc-700"
                )}
              >
                {step}
              </span>
            ))}
          </div>
          {run.prUrl && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1.5"
            >
              <GitBranch className="size-3" />
              View PR
            </a>
          )}
        </div>
        {open ? (
          <ChevronDown className="size-4 text-zinc-500 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="size-4 text-zinc-500 shrink-0 mt-0.5" />
        )}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Učitavam detalje...
            </div>
          )}

          {detail && (
            <>
              {detail.status === "AWAITING_APPROVAL" && (
                <ApproveCard
                  run={detail}
                  agentId={agentId}
                  onApproved={() => onMutate()}
                />
              )}

              {/* Step metrics */}
              {entries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BarChart3 className="size-3" /> Step Metrikes
                  </h4>
                  <div className="space-y-1.5">
                    {entries.map(([idx, m]) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs bg-zinc-800/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-zinc-300 font-mono w-40 truncate">{m.stepId}</span>
                        <span className="text-zinc-600">{m.phase}</span>
                        <span className="ml-auto flex items-center gap-3 text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Cpu className="size-3" />{m.modelId}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="size-3" />{formatMs(m.durationMs)}
                          </span>
                          <span>{((m.inputTokens ?? 0) + (m.outputTokens ?? 0)).toLocaleString()} tok</span>
                          {m.feedbackAttempts > 0 && (
                            <span className="text-amber-400">↺{m.feedbackAttempts}</span>
                          )}
                          <span className={m.outcome === "success" ? "text-emerald-400" : "text-red-400"}>
                            {m.outcome === "success" ? "✓" : "✗"}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {detail.error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-xs font-semibold text-red-400 mb-1">Greška</p>
                  <p className="text-xs text-red-300 font-mono">{detail.error}</p>
                </div>
              )}

              {/* Final output */}
              {detail.finalOutput && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Rezultat
                  </h4>
                  <pre className="bg-zinc-800/30 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-80 whitespace-pre-wrap leading-relaxed">
                    {detail.finalOutput}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PipelinesPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}): React.ReactElement {
  const { agentId } = use(params);
  const { data, isLoading, mutate } = useSWR<{ success: boolean; data: PipelineListData }>(
    `/api/agents/${agentId}/pipelines`,
    fetcher
  );

  const runs: PipelineRun[] = data?.data?.runs ?? [];
  const [metricsKey, setMetricsKey] = useState(0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild className="text-zinc-400">
            <Link href={`/chat/${agentId}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <GitBranch className="size-4 text-blue-400" />
          <h1 className="font-semibold text-sm">SDLC Pipelines</h1>
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-zinc-400"
              onClick={() => {
                mutate();
                setMetricsKey((k) => k + 1);
              }}
            >
              <RefreshCw className="size-4" />
            </Button>
            <span className="text-xs text-zinc-500">{runs.length} runova</span>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500 gap-2">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Učitavam pipeline runove...</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Play className="size-10 text-zinc-700" />
            <p className="text-zinc-400 font-medium text-sm">Nema pipeline runova</p>
            <p className="text-zinc-600 text-xs">Pokrenite pipeline run via API</p>
          </div>
        ) : (
          <>
            {runs.length > 0 && (
              <MetricsSummaryCard agentId={agentId} refreshKey={metricsKey} />
            )}
            {runs.map((run) => <RunRow key={run.id} run={run} agentId={agentId} onMutate={mutate} />)}
          </>
        )}
      </div>
    </div>
  );
}
