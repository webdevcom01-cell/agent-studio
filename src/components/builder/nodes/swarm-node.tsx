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
        <div className="flex size-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
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
        <span className="text-green-600 dark:text-green-400">Done</span>
        <span className="text-red-600 dark:text-red-400">Failed</span>
      </div>
    </div>
  );
}
