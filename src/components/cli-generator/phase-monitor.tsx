"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { PIPELINE_PHASES } from "@/lib/cli-generator/types";
import type { PhaseResult } from "@/lib/cli-generator/types";
import { cn } from "@/lib/utils";

interface PhaseMonitorProps {
  phases: PhaseResult[];
  currentPhase: number;
  status: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="size-4 text-muted-foreground" />,
  running: <Loader2 className="size-4 text-primary animate-spin" />,
  completed: <CheckCircle2 className="size-4 text-green-500" />,
  failed: <XCircle className="size-4 text-red-500" />,
};

export function PhaseMonitor({
  phases,
  currentPhase,
  status,
}: PhaseMonitorProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Pipeline Progress</h3>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            status === "COMPLETED"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : status === "FAILED"
                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
          )}
        >
          {status}
        </span>
      </div>

      <div className="relative">
        {PIPELINE_PHASES.map(({ phase, label }) => {
          const phaseData = phases[phase];
          const phaseStatus = phaseData?.status ?? "pending";

          return (
            <div
              key={phase}
              className={cn(
                "flex items-center gap-3 py-2 px-3 rounded-md transition-colors",
                phase === currentPhase && phaseStatus === "running"
                  ? "bg-primary/5"
                  : "",
              )}
            >
              <div className="shrink-0">
                {STATUS_ICON[phaseStatus] ?? STATUS_ICON.pending}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm",
                      phaseStatus === "completed"
                        ? "text-foreground"
                        : phaseStatus === "running"
                          ? "text-foreground font-medium"
                          : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                  {phaseData?.completedAt && phaseData.startedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDuration(phaseData.startedAt, phaseData.completedAt)}
                    </span>
                  )}
                </div>
                {phaseData?.error && (
                  <p className="text-xs text-red-500 mt-0.5 truncate">
                    {phaseData.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              status === "COMPLETED"
                ? "bg-green-500"
                : status === "FAILED"
                  ? "bg-red-500"
                  : "bg-primary",
            )}
            style={{
              width: `${getProgressPercent(phases, status)}%`,
            }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-right">
          {getCompletedCount(phases)} / {PIPELINE_PHASES.length} phases
        </p>
      </div>
    </div>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getCompletedCount(phases: PhaseResult[]): number {
  return phases.filter((p) => p.status === "completed").length;
}

function getProgressPercent(phases: PhaseResult[], status: string): number {
  if (status === "COMPLETED") return 100;
  const completed = getCompletedCount(phases);
  return Math.round((completed / PIPELINE_PHASES.length) * 100);
}
