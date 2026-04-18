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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
}

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-4 text-emerald-400" />;
  if (status === "FAILED") return <XCircle className="size-4 text-red-400" />;
  if (status === "RUNNING") return <Loader2 className="size-4 text-blue-400 animate-spin" />;
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

function RunRow({ run, agentId }: { run: PipelineRun; agentId: string }) {
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
              run.status === "RUNNING" ? "text-blue-400" : "text-zinc-400"
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
  const { data, isLoading, mutate } = useSWR<{ success: boolean; data: PipelineRun[] }>(
    `/api/agents/${agentId}/pipelines`,
    fetcher,
    { refreshInterval: 8000 }
  );

  const runs: PipelineRun[] = data?.data ?? [];

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
              onClick={() => mutate()}
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
          runs.map((run) => <RunRow key={run.id} run={run} agentId={agentId} />)
        )}
      </div>
    </div>
  );
}
