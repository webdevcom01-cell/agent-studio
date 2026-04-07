"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

function GitNodeNodeComponent({ data, selected }: NodeProps) {
  const branch = (data.branch as string) || "feat/autonomous-{{timestamp}}";
  const operations: string[] = Array.isArray(data.operations)
    ? (data.operations as string[])
    : ["checkout_branch", "add", "commit", "push"];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-muted-foreground">
          <GitBranch className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Git")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="truncate" title={branch}>
          Branch:{" "}
          <span className="font-mono text-foreground/60 text-[10px]">{branch}</span>
        </p>
        <div className="flex flex-wrap gap-1">
          {operations.map((op) => (
            <span
              key={op}
              className="rounded bg-muted/20 px-1 py-0.5 text-[10px] text-foreground/60"
            >
              {op}
            </span>
          ))}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const GitNodeNode = memo(GitNodeNodeComponent);
