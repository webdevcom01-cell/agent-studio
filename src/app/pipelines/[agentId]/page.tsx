"use client";

import { useState, useMemo, use, type FormEvent } from "react";
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
  AlertTriangle,
  Plus,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  cancelled: number;
  running: number;
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
  startedAt: string | null;
  updatedAt: string;
  createdAt: string;
  stepResults: Record<string, string>;
  approvalFeedback: string | null;
  modelId: string | null;
  useSmartRouting: boolean;
  requireApproval: boolean;
  triggerSource: string | null;
  triggerBranch: string | null;
  triggerPrNumber: number | null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "FAILED") return <XCircle className="size-4 text-destructive" />;
  if (status === "RUNNING") return <Loader2 className="size-4 text-info animate-spin" />;
  if (status === "AWAITING_APPROVAL") return <AlertCircle className="size-4 text-warning" />;
  return <Clock className="size-4 text-muted-foreground" />;
}

/** Badge showing how a pipeline run was triggered (GitHub PR, GitLab MR, Manual, API). */
function TriggerBadge({ run }: { run: Pick<PipelineRun, "triggerSource" | "triggerBranch" | "triggerPrNumber" | "prUrl"> }) {
  const src = run.triggerSource;
  if (!src || src === "manual") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        🎮 Manual
      </span>
    );
  }
  if (src === "api") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        ⚙️ API
      </span>
    );
  }
  if (src === "github") {
    const label = run.triggerPrNumber ? `PR #${run.triggerPrNumber}` : "GitHub";
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        🐙{" "}
        {run.prUrl ? (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {label}
          </a>
        ) : (
          label
        )}
        {run.triggerBranch && (
          <span className="text-muted-foreground font-mono">{run.triggerBranch}</span>
        )}
      </span>
    );
  }
  if (src === "gitlab") {
    const label = run.triggerPrNumber ? `MR !${run.triggerPrNumber}` : "GitLab";
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        🦊{" "}
        {run.prUrl ? (
          <a
            href={run.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {label}
          </a>
        ) : (
          label
        )}
        {run.triggerBranch && (
          <span className="text-muted-foreground font-mono">{run.triggerBranch}</span>
        )}
      </span>
    );
  }
  return null;
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
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const phaseParam = selectedPhase !== "all" ? `&phase=${selectedPhase}` : "";

  const { data, isLoading } = useSWR<{ success: boolean; data: MetricsData }>(
    `/api/sdlc/metrics?agentId=${agentId}&_k=${refreshKey}${phaseParam}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5000 },
  );

  // Must be before any early returns — Rules of Hooks
  const phases = useMemo(
    () => ["all", ...Array.from(new Set((data?.data.modelStats ?? []).map((s) => s.phase)))],
    [data?.data.modelStats],
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
    <div className="border border-border rounded-xl bg-card/60 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pipeline Statistike
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <StatPill label="Ukupno"    value={String(ps.total)}     color="zinc"    />
        <StatPill label="Uspešno"   value={String(ps.completed)} color="emerald" />
        <StatPill label="Greška"    value={String(ps.failed)}    color="red"     />
        {(ps.cancelled ?? 0) > 0 && (
          <StatPill label="Otkazano" value={String(ps.cancelled)} color="amber" />
        )}
        <StatPill
          label="Success rate"
          value={`${Math.round(ps.successRate * 100)}%`}
          color={successColor as "emerald" | "amber" | "red"}
        />
        <StatPill label="Avg trajanje" value={fmtDur(ps.avgDurationMs)} color="blue" />
      </div>

      {modelStats.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Model Performanse (po koraku)
          </p>
          {phases.length > 2 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {phases.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPhase(p)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded border transition-colors",
                    selectedPhase === p
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {p === "all" ? "Sve faze" : p}
                </button>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Model</th>
                  <th className="text-left py-1.5 pr-3 text-muted-foreground font-medium">Faza</th>
                  <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Koraka</th>
                  <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Uspeh</th>
                  <th className="text-right py-1.5 pr-3 text-muted-foreground font-medium">Avg/korak</th>
                  <th className="text-right py-1.5 text-muted-foreground font-medium">Avg tokeni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {modelStats.map((s) => (
                  <tr key={`${s.modelId}-${s.phase}`} className="hover:bg-muted/20">
                    <td className="py-1.5 pr-3 text-foreground font-mono truncate max-w-[140px]">
                      {s.modelId}
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground capitalize">{s.phase}</td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground tabular-nums">
                      {s.runCount}
                    </td>
                    <td
                      className={cn(
                        "py-1.5 pr-3 text-right tabular-nums font-medium",
                        s.successRate >= 0.9
                          ? "text-success"
                          : s.successRate >= 0.7
                          ? "text-warning"
                          : "text-destructive",
                      )}
                    >
                      {Math.round(s.successRate * 100)}%
                    </td>
                    <td className="py-1.5 pr-3 text-right text-muted-foreground tabular-nums">
                      {s.avgDurationMs >= 1000
                        ? `${(s.avgDurationMs / 1000).toFixed(1)}s`
                        : `${s.avgDurationMs}ms`}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground tabular-nums">
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
    zinc:    "bg-muted/50 text-foreground",
    emerald: "bg-success/10 text-success",
    red:     "bg-destructive/10 text-destructive",
    amber:   "bg-warning/10 text-warning",
    blue:    "bg-info/10 text-info",
  };
  return (
    <div className={cn("rounded-lg px-3 py-2 text-center", colors[color])}>
      <p className="text-sm font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function RunPipelineDialog({
  agentId,
  open,
  onOpenChange,
  onSuccess,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [taskDescription, setTaskDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [sourceRepoUrl, setSourceRepoUrl] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [useSmartRouting, setUseSmartRouting] = useState(false);
  const [modelId, setModelId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!taskDescription.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/pipelines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskDescription: taskDescription.trim(),
          ...(repoUrl.trim()       ? { repoUrl: repoUrl.trim() }             : {}),
          ...(sourceRepoUrl.trim() ? { sourceRepoUrl: sourceRepoUrl.trim() } : {}),
          ...(requireApproval      ? { requireApproval: true }               : {}),
          ...(useSmartRouting      ? { useSmartRouting: true }               : {}),
          ...(modelId.trim()       ? { modelId: modelId.trim() }             : {}),
        }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Greška pri pokretanju pipeline-a");
        return;
      }
      setTaskDescription("");
      setRepoUrl("");
      setSourceRepoUrl("");
      setRequireApproval(false);
      setUseSmartRouting(false);
      setModelId("");
      setShowAdvanced(false);
      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Greška pri slanju zahteva");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Pokreni Pipeline Run</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Task opis <span className="text-destructive">*</span>
            </label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Npr: Dodaj rate limiting u src/lib/auth.ts..."
              rows={3}
              required
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Target repo URL{" "}
              <span className="text-muted-foreground">(optional — gde se kreira PR)</span>
            </label>
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/target-repo"
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Source repo URL{" "}
              <span className="text-muted-foreground">(optional — za RAG kontekst)</span>
            </label>
            <input
              type="url"
              value={sourceRepoUrl}
              onChange={(e) => setSourceRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/source-repo"
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {/* Advanced Options — collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showAdvanced
                ? <ChevronDown className="size-3" />
                : <ChevronRight className="size-3" />}
              Napredne opcije
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2 pl-2 border-l border-border">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requireApproval}
                    onChange={(e) => setRequireApproval(e.target.checked)}
                    className="rounded border-border bg-muted"
                  />
                  Pauziraj za odobrenje (HITL)
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useSmartRouting}
                    onChange={(e) => setUseSmartRouting(e.target.checked)}
                    className="rounded border-border bg-muted"
                  />
                  Pametni model routing
                </label>
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="Model ID (npr. gpt-4o-mini)"
                  className="w-full bg-muted border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={running}
              className="text-muted-foreground"
            >
              Odustani
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={running || !taskDescription.trim()}
              className="bg-info hover:bg-info text-white"
            >
              {running ? (
                <>
                  <Loader2 className="size-3 mr-1 animate-spin" />
                  Pokretanje...
                </>
              ) : (
                <>
                  <Play className="size-3 mr-1" />
                  Pokreni
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-warning flex items-center gap-2">
        <AlertCircle className="size-4" /> Čeka vaše odobrenje
      </h4>

      {planningOutputs.length > 0 ? (
        <div className="space-y-3">
          {planningOutputs.map(({ stepId, output }) => (
            <div key={stepId}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                {stepId}
              </p>
              <pre className="bg-muted/50 rounded-lg p-3 text-xs text-foreground overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
                {output.length > 4000 ? output.slice(0, 4000) + "\n\n[... skraćeno ...]" : output}
              </pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nema planiranja outputa za prikaz.</p>
      )}

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          Feedback za implementaciju (opciono)
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="npr. Fokusiraj se na TypeScript tipove, koristi Zod za validaciju..."
          className="w-full bg-muted border border-border rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground resize-none h-20 focus:outline-none focus:border-warning/50"
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <button
        onClick={handleApprove}
        disabled={approving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning hover:bg-warning disabled:opacity-50 text-foreground text-sm font-semibold transition-colors"
      >
        {approving ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {approving ? "Odobravanjem..." : "Odobri i nastavi"}
      </button>
    </div>
  );
}

function RunRow({ run, agentId, onMutate }: { run: PipelineRun; agentId: string; onMutate: () => void }) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // must match backend PIPELINE_STUCK_THRESHOLD_MS
  const isStuck =
    run.status === "RUNNING" &&
    !!run.updatedAt &&
    Date.now() - new Date(run.updatedAt).getTime() > STUCK_THRESHOLD_MS;

  const isActive =
    run.status === "RUNNING" ||
    run.status === "PENDING" ||
    run.status === "AWAITING_APPROVAL";

  const { data, isLoading } = useSWR<{ success: boolean; data: PipelineRun }>(
    open ? `/api/agents/${agentId}/pipelines/${run.id}` : null,
    fetcher,
    { refreshInterval: open && isActive ? 2000 : 0 },
  );

  async function handleCancel() {
    setCancelling(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/pipelines/${run.id}/cancel`, {
        method: "POST",
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) setActionError(json.error ?? "Greška pri otkazivanju");
      else onMutate();
    } catch { setActionError("Greška pri slanju zahteva"); }
    finally { setCancelling(false); }
  }

  async function handleRetry() {
    setRetrying(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/pipelines/${run.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) setActionError(json.error ?? "Greška pri retry-u");
      else onMutate();
    } catch { setActionError("Greška pri slanju zahteva"); }
    finally { setRetrying(false); }
  }

  async function handleForceResume() {
    setResuming(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/pipelines/${run.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceResume: true }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) setActionError(json.error ?? "Greška pri nastavku runa");
      else onMutate();
    } catch { setActionError("Greška pri slanju zahteva"); }
    finally { setResuming(false); }
  }

  const detail = data?.data;
  const metrics = detail?.stepMetrics ?? {};
  const entries = Object.entries(metrics);

  return (
    <div className="border border-border rounded-xl bg-card/40 overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <StatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium leading-snug line-clamp-2">
            {run.taskDescription}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn(
              "text-xs font-medium",
              run.status === "COMPLETED" ? "text-success" :
              run.status === "FAILED" ? "text-destructive" :
              run.status === "RUNNING" ? "text-info" :
              run.status === "AWAITING_APPROVAL" ? "text-warning" : "text-muted-foreground"
            )}>
              {statusLabel(run.status)}
            </span>
            {isStuck && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded">
                <AlertTriangle className="size-3" />
                Zaglavljen
              </span>
            )}
            {run.taskType && (
              <span className="text-xs text-muted-foreground capitalize">{run.taskType.replace(/-/g, " ")}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(run.createdAt).toLocaleString("sr-RS")}
            </span>
            <TriggerBadge run={run} />
          </div>
          {/* Pipeline steps */}
          <div className="flex flex-wrap gap-1 mt-2">
            {run.pipeline.map((step, i) => (
              <span
                key={`${step}-${i}`}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded border",
                  i < run.currentStep
                    ? "bg-success/10 text-success border-success/20"
                    : i === run.currentStep && run.status === "RUNNING"
                    ? "bg-info/10 text-info border-info/20"
                    : "bg-muted text-muted-foreground border-border"
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
              className="inline-flex items-center gap-1 text-xs text-info hover:text-info mt-1.5"
            >
              <GitBranch className="size-3" />
              View PR
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Cancel — for RUNNING, PENDING, AWAITING_APPROVAL (not stuck) */}
          {!isStuck && (run.status === "RUNNING" || run.status === "PENDING" || run.status === "AWAITING_APPROVAL") && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleCancel(); }}
              disabled={cancelling}
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Otkaži run"
            >
              {cancelling ? <Loader2 className="size-3 animate-spin" /> : <Ban className="size-3" />}
            </button>
          )}
          {/* Nastavi — for stuck RUNNING runs */}
          {isStuck && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleForceResume(); }}
              disabled={resuming}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Nastavi zaglavljen run od poslednjeg koraka"
            >
              {resuming ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            </button>
          )}
          {/* Retry — for FAILED or CANCELLED */}
          {(run.status === "FAILED" || run.status === "CANCELLED") && (
            <button
              onClick={(e) => { e.stopPropagation(); void handleRetry(); }}
              disabled={retrying}
              className="p-1 rounded text-muted-foreground hover:text-info hover:bg-info/10 transition-colors"
              title="Ponovi run od poslednjeg koraka"
            >
              {retrying ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
            </button>
          )}
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground mt-0.5" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground mt-0.5" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {actionError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2">
              <p className="text-xs text-destructive">{actionError}</p>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BarChart3 className="size-3" /> Step Metrikes
                  </h4>
                  <div className="space-y-1.5">
                    {entries.map(([idx, m]) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-3 py-2"
                      >
                        <span className="text-foreground font-mono w-40 truncate">{m.stepId}</span>
                        <span className="text-muted-foreground">{m.phase}</span>
                        <span className="ml-auto flex items-center gap-3 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Cpu className="size-3" />{m.modelId}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="size-3" />{formatMs(m.durationMs)}
                          </span>
                          <span>{((m.inputTokens ?? 0) + (m.outputTokens ?? 0)).toLocaleString()} tok</span>
                          {m.feedbackAttempts > 0 && (
                            <span className="text-warning">↺{m.feedbackAttempts}</span>
                          )}
                          <span className={m.outcome === "success" ? "text-success" : "text-destructive"}>
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
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-xs font-semibold text-destructive mb-1">Greška</p>
                  <p className="text-xs text-destructive font-mono">{detail.error}</p>
                </div>
              )}

              {/* Step outputs for FAILED runs — shows gate reviewer details on BLOCK */}
              {detail.status === "FAILED" &&
                detail.stepResults &&
                Object.keys(detail.stepResults as Record<string, string>).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="size-3" /> Outputi koraka
                    </h4>
                    {(detail.pipeline as string[]).map((stepId: string, i: number) => {
                      const output = (detail.stepResults as Record<string, string>)?.[String(i)];
                      if (!output) return null;
                      const isGate =
                        stepId.includes("reviewer") || stepId.includes("security");
                      return (
                        <div key={`${stepId}-${i}`} className="space-y-1">
                          <p
                            className={cn(
                              "text-xs font-semibold uppercase tracking-wider",
                              isGate ? "text-warning" : "text-muted-foreground",
                            )}
                          >
                            {stepId}
                            {isGate && (
                              <span className="ml-2 normal-case font-normal text-warning/70">
                                (reviewer output)
                              </span>
                            )}
                          </p>
                          <pre className="bg-muted/50 rounded-lg p-3 text-xs text-foreground overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
                            {output.length > 4000
                              ? output.slice(0, 4000) + "\n\n[... skraćeno ...]"
                              : output}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* Final output */}
              {detail.finalOutput && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Rezultat
                  </h4>
                  <pre className="bg-muted/30 rounded-lg p-3 text-xs text-foreground overflow-auto max-h-80 whitespace-pre-wrap leading-relaxed">
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
    fetcher,
    { refreshInterval: 3000, revalidateOnFocus: true },
  );

  const runs: PipelineRun[] = data?.data?.runs ?? [];
  const [metricsKey, setMetricsKey] = useState(0);
  const [showRunDialog, setShowRunDialog] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/60 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground">
            <Link href={`/chat/${agentId}`}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <GitBranch className="size-4 text-info" />
          <h1 className="font-semibold text-sm">SDLC Pipelines</h1>
          <div className="ml-auto flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => {
                mutate();
                setMetricsKey((k) => k + 1);
              }}
              title="Osveži"
            >
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => setShowRunDialog(true)}
              title="Pokreni novi pipeline run"
            >
              <Plus className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{runs.length} runova</span>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Učitavam pipeline runove...</span>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Play className="size-10 text-foreground" />
            <p className="text-muted-foreground font-medium text-sm">Nema pipeline runova</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRunDialog(true)}
              className="border-border text-muted-foreground hover:text-foreground mt-1"
            >
              <Plus className="size-3 mr-1.5" />
              Pokreni prvi pipeline run
            </Button>
          </div>
        ) : (
          <>
            {runs.length > 0 && (
              <MetricsSummaryCard agentId={agentId} refreshKey={metricsKey} />
            )}
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                agentId={agentId}
                onMutate={() => {
                  void mutate();
                  setMetricsKey((k) => k + 1);
                }}
              />
            ))}
          </>
        )}
      </div>

      <RunPipelineDialog
        agentId={agentId}
        open={showRunDialog}
        onOpenChange={setShowRunDialog}
        onSuccess={() => {
          mutate();
          setMetricsKey((k) => k + 1);
        }}
      />
    </div>
  );
}
