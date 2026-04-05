"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlanAndExecuteNode({ data, selected }: NodeProps) {
  const maxSubtasks = Number(data.maxSubtasks) || 8;
  const strategy = (data.executionStrategy as string) || "auto";
  const plannerModel = (data.plannerModel as string) || "deepseek-reasoner";

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-muted-foreground">
          <Compass className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {(data.label as string) || "Plan & Execute"}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Planner: <span className="text-foreground">{plannerModel.split("-").slice(0, 2).join("-")}</span>
        </p>
        <p>
          Max tasks: <span className="text-foreground">{maxSubtasks}</span> | Strategy: <span className="text-foreground">{strategy}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} id="done" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="failed" style={{ left: "70%" }} />

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground px-1">
        <span className="text-foreground/70 dark:text-foreground/60">Done</span>
        <span className="text-destructive dark:text-destructive">Failed</span>
      </div>
    </div>
  );
}
