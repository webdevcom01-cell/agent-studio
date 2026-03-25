"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HardDriveDownload } from "lucide-react";
import { cn } from "@/lib/utils";

export function MemoryReadNode({ data, selected }: NodeProps) {
  const mode = (data.mode as string) || "key";
  const outputVariable = (data.outputVariable as string) || "memory_result";

  const modeLabels: Record<string, string> = {
    key: "By Key",
    category: "By Category",
    search: "Semantic Search",
  };

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
          <HardDriveDownload className="size-4" />
        </div>
        <span className="text-sm font-medium">{(data.label as string) || "Memory Read"}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Mode: <span className="text-foreground">{modeLabels[mode] ?? mode}</span>
        </p>
        {mode === "key" && data.key ? (
          <p>
            Key: <span className="font-mono text-foreground">{String(data.key)}</span>
          </p>
        ) : null}
        {mode === "category" && data.category ? (
          <p>
            Category: <span className="text-foreground">{String(data.category)}</span>
          </p>
        ) : null}
        {mode === "search" && (
          <p className="text-cyan-600 dark:text-cyan-400">vector search</p>
        )}
        <p>
          → <span className="font-mono text-foreground">{outputVariable}</span>
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
