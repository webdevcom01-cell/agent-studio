"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScheduleTriggerNode({ data, selected }: NodeProps) {
  const scheduleType = (data.scheduleType as string) || "manual";
  const cronExpression = (data.cronExpression as string) || "";
  const intervalMinutes = Number(data.intervalMinutes) || 60;

  const typeLabels: Record<string, string> = {
    cron: "Cron Schedule",
    interval: "Interval",
    manual: "Manual Trigger",
  };

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
          <Timer className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {(data.label as string) || "Schedule Trigger"}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Type: <span className="text-foreground">{typeLabels[scheduleType] ?? scheduleType}</span>
        </p>
        {scheduleType === "cron" && cronExpression && (
          <p className="font-mono text-foreground">{cronExpression}</p>
        )}
        {scheduleType === "interval" && (
          <p>
            Every <span className="text-foreground">{intervalMinutes}min</span>
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
