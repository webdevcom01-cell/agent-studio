"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HardDriveUpload } from "lucide-react";
import { cn } from "@/lib/utils";

export function MemoryWriteNode({ data, selected }: NodeProps) {
  const key = (data.key as string) || "—";
  const category = (data.category as string) || "general";
  const hasEmbedding = (data.generateEmbedding as boolean) ?? false;

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <HardDriveUpload className="size-4" />
        </div>
        <span className="text-sm font-medium">{(data.label as string) || "Memory Write"}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Key: <span className="font-mono text-foreground">{key}</span>
        </p>
        <p>
          Category: <span className="text-foreground">{category}</span>
        </p>
        {hasEmbedding && (
          <p className="text-emerald-600 dark:text-emerald-400">+ embedding</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
