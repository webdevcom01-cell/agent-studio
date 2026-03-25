"use client";

import { memo, useEffect, useState } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Timer, AlertTriangle, CheckCircle, PauseCircle } from "lucide-react";
import { BaseNode } from "./base-node";

interface LiveStats {
  enabled: number;
  circuitBroken: number;
  nextDueAt: string | null;
  totalRuns: number;
  successRate: number | null;
}

function formatRelative(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return "overdue";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `in ${hr}h`;
  return `in ${Math.floor(hr / 24)}d`;
}

function ScheduleTriggerNodeComponent({ data, selected }: NodeProps) {
  const scheduleType = (data.scheduleType as string) || "manual";
  const cronExpression = (data.cronExpression as string) || "";
  const intervalMinutes = Number(data.intervalMinutes) || 60;

  const [stats, setStats] = useState<LiveStats | null>(null);

  const flow = useReactFlow();
  const agentId = (flow as unknown as { agentId?: string }).agentId;

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/schedules/stats`)
      .then((r) => r.json())
      .then((res) => { if (res.success) setStats(res.data as LiveStats); })
      .catch(() => {});
  }, [agentId]);

  const typeLabels: Record<string, string> = {
    cron: "Cron",
    interval: "Interval",
    manual: "Manual",
  };

  const isCircuitBroken = (stats?.circuitBroken ?? 0) > 0;
  const hasActive = (stats?.enabled ?? 0) > 0;

  return (
    <BaseNode
      icon={<Timer className="size-4" />}
      label={(data.label as string) || "Schedule Trigger"}
      color="red"
      selected={selected}
      hasInput={false}
    >
      <div className="space-y-1.5">
        {/* Schedule type + expression */}
        <p className="text-[10px]">
          <span className="text-muted-foreground">{typeLabels[scheduleType] ?? scheduleType}</span>
          {scheduleType === "cron" && cronExpression && (
            <span className="ml-1.5 font-mono text-foreground">{cronExpression}</span>
          )}
          {scheduleType === "interval" && intervalMinutes > 0 && (
            <span className="ml-1.5 text-foreground">every {intervalMinutes}m</span>
          )}
        </p>

        {/* Status badges row */}
        <div className="flex items-center gap-1 flex-wrap">
          {isCircuitBroken ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              <AlertTriangle className="size-2.5" />
              Circuit broken
            </span>
          ) : hasActive ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <CheckCircle className="size-2.5" />
              Active
            </span>
          ) : stats !== null ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <PauseCircle className="size-2.5" />
              {stats.enabled === 0 && stats.circuitBroken === 0 ? "No schedules" : "Disabled"}
            </span>
          ) : null}

          {stats?.nextDueAt && !isCircuitBroken && hasActive && (
            <span className="text-[10px] text-muted-foreground">
              {formatRelative(stats.nextDueAt)}
            </span>
          )}
        </div>

        {/* Run stats — only shown when there's history */}
        {stats !== null && stats.totalRuns > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {stats.successRate !== null ? `${stats.successRate}% ok` : "—"}
            {" · "}
            {stats.totalRuns} run{stats.totalRuns !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </BaseNode>
  );
}

export const ScheduleTriggerNode = memo(ScheduleTriggerNodeComponent);
