"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface EvalCriterion {
  name: string;
  weight: number;
}

export function ReflexiveLoopNode({ data, selected }: NodeProps) {
  const maxIterations = Number(data.maxIterations) || 3;
  const passingScore = Number(data.passingScore) || 7;
  const criteria = (data.criteria as EvalCriterion[]) ?? [];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">
          <RefreshCcw className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {(data.label as string) || "Reflexive Loop"}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {criteria.length} {criteria.length === 1 ? "criterion" : "criteria"}
        </p>
        <p>
          Pass: <span className="text-foreground">{"\u2265"} {passingScore}/10</span> | Max: <span className="text-foreground">{maxIterations} iter</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} id="passed" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="failed" style={{ left: "70%" }} />

      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground px-1">
        <span className="text-green-600 dark:text-green-400">Pass</span>
        <span className="text-red-600 dark:text-red-400">Fail</span>
      </div>
    </div>
  );
}
