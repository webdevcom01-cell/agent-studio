"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

export function LearnNode({ data, selected }: NodeProps) {
  const patternName = (data.patternName as string) || "—";
  const outputVariable = (data.outputVariable as string) || "learn_result";

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
          <Lightbulb className="size-4" />
        </div>
        <span className="text-sm font-medium">{(data.label as string) || "Learn"}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Pattern: <span className="font-mono text-foreground">{patternName}</span>
        </p>
        <p>
          Output: <span className="font-mono text-foreground">{outputVariable}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
