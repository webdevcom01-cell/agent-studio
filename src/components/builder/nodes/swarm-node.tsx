"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

export function SwarmNode({ data, selected }: NodeProps) {
  const workerCount = Number(data.workerCount) || 3;
  const mergeStrategy = (data.mergeStrategy as string) || "concat";
  const tasks = (data.tasks as string[]) ?? [];
  const tasksVariable = (data.tasksVariable as string) ?? "";

  const taskCount = tasksVariable
    ? `var: ${tasksVariable}`
    : `${tasks.length} task${tasks.length !== 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-foreground dark:bg-muted/20 dark:text-muted-foreground">
          <Boxes className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {(data.label as string) || "Swarm"}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Workers: <span className="text-foreground">{workerCount}</span> | {taskCount}
        </p>
        <p>
          Merge: <span className="text-foreground">{mergeStrategy}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} id="done" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="failed" style={{ left: "70%" }} />

      <div className="mt-2 flex justify-between px-1 text-[10px] text-muted-foreground">
        <span className="text-foreground/70 dark:text-foreground/60">Done</span>
        <span className="text-destructive dark:text-destructive">Failed</span>
      </div>
    </div>
  );
}
