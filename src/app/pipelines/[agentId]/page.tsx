"use client";

import { useState, use } from "react";
import Link from "next/link";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
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
  BarChart3,
  Cpu,
  Timer,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StepMetric {
  phase: string;
  stepId: string;
  modelId: string;
  outcome: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  feedbackAttempts: number;
}

interface PipelineRun {
  id: string;
  status: string;
  taskDescription: string;
  taskType: string;
  complexity: string;
  pipeline: string[];
  currentStep: number;
  stepMetrics: Record<string, StepMetric>;
  finalOutput: string | null;
  error: string | null;
  prUrl: string | null;
  repoUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PipelineListResponse {
  success: boolean;
  data: PipelineRun[];
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    COMPLETED: { label: "Completed", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="size-3" /> },
    RUNNING: { label: "Running", className: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: <Loader2 className="size-3 animate-spin" /> },
    PENDING: { label: "Pending", className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: <Clock className="size-3" /> },
    FAILED: { label: "Failed", className: "bg-red-500/20 text-red-400 border-red-500/30", icon: <XCircle className="size-3" /> },
    AWAITING_APPROVAL: { label: "Awaiting Approval", className: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: <Clock className="size-3" /> },
  };
  const cfg = map[status] ?? { label: status, className: "bg-zinc-500/20 text-zinc-400", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sr-RS", { dateStyle: "medium", timeStyle: "short" });
}

function RunCard({ run, agentId }: { run: PipelineRun; agentId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useSWR<{ success: boolean; data: PipelineRun }>(
    expanded ? `/api/agents/${agentId}/pipelines/${run.id}` : null,
    fetcher
  );
  const detail = data?.data;
  const metrics = detail?.stepMetrics ?? {};
  const metricEntries = Object.entries(metrics) as [string, StepMetric][];
  const totalTokens = metricEntries.reduce((sum, [, m]) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={run.status} />
              <Badge variant="outline" className="text-xs capitalize text-zinc-400 border-zinc-700">
                {run.taskType?.replace(/-/g, " ") ?? "task"}
              </Badge>
              <Badge variant="outline" className="text-xs capitalize text-zinc-400 border-zinc-700">
                {run.complexity ?? "moderate"}
              </Badge>
            </div>
            <p className="text-sm text-zinc-200 font-medium leading-snug line-clamp-2">
              {run.taskDescription}
            </p>
            <p className="text-xs text-zinc-500 mt-1">{formatDate(run.createdAt)}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-zinc-400 hover:text-zinc-200"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>

        {/* Pipeline steps summary */}
        <div className="flex flex-wrap gap-1 mt-2">
          {run.pipeline.map((step, i) => (
            <span
              key={step}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border",
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
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
          >
            <GitBranch className="size-3" />
            View Pull Request
          </a>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 border-t border-zinc-800">
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-zinc-500 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading details...
            </div>
          ) : detail ? (
            <div className="space-y-4 pt-3">
              {/* Step Metrics */}
              {metricEntries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <BarChart3 className="size-3" /> Step Metrics
                  </h4>
                  <div className="space-y-1.5">
                    {metricEntries.map(([idx, m]) => (
                      <div key={idx} className="flex items-center gap-3 text-xs bg-zinc-800/50 rounded-lg px-3 py-2">
                        <span className="text-zinc-300 font-mono w-36 truncate">{m.stepId}</span>
                        <span className="text-zinc-500">{m.phase}</span>
                        <span className="ml-auto flex items-center gap-3 text-zinc-400">
                          <span className="flex items-center gap-1"><Cpu className="size-3" />{m.modelId}</span>
                          <span className="flex items-center gap-1"><Timer className="size-3" />{formatDuration(m.durationMs)}</span>
                          <span>{(m.inputTokens + m.outputTokens).toLocaleString()} tok</span>
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
                  {totalTokens > 0 && (
                    <p className="text-xs text-zinc-500 mt-1.5 text-right">
                      Total: {totalTokens.toLocaleString()} tokens
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {detail.error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                  <p className="text-xs text-red-400 font-semibold mb-1">Error</p>
                  <p className="text-xs text-red-300 font-mono">{detail.error}</p>
                </div>
              )}

              {/* Final Output */}
              {detail.finalOutput && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Final Output
                  </h4>
                  <div className="prose prose-invert prose-sm max-w-none bg-zinc-800/30 rounded-lg p-4 text-zinc-300 overflow-auto max-h-96">
                    <ReactMarkdown>{detail.finalOutput}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

export default function PipelinesPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}): React.ReactElement {
  const { agentId } = use(params);
  const { data, isLoading, mutate } = useSWR<PipelineListResponse>(
    `/api/agents/${agentId}/pipelines`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const runs = data?.data ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="text-zinc-400 hover:text-zinc-200">
            <Link href={`/chat/${agentId}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-blue-400" />
            <h1 className="font-semibold text-sm">SDLC Pipelines</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-zinc-200"
              onClick={() => mutate()}
            >
              <RefreshCw className="size-4" />
            </Button>
            <span className="text-xs text-zinc-500">{runs.length} runs</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="size-5 animate-spin mr-2" />
            Loading pipelines...
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Play className="size-10 text-zinc-700 mb-3" />
            <p className="text-zinc-400 font-medium">No pipeline runs yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              Trigger a pipeline run via the API to see results here
            </p>
          </div>
        ) : (
          runs.map((run) => <RunCard key={run.id} run={run} agentId={agentId} />)
        )}
      </div>
    </div>
  );
}
