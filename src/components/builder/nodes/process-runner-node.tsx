"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

function ProcessRunnerNodeComponent({ data, selected }: NodeProps) {
  const command = (data.command as string) || "";

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
          <Terminal className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Process Runner")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {command && (
          <p className="truncate font-mono text-foreground/60 text-[10px]" title={command}>
            {command}
          </p>
        )}
        <p className="text-[10px]">
          <span className="text-foreground/60">Passed</span>{" / "}
          <span className="text-destructive">Failed</span>
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="passed"
        style={{ left: "33%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="failed"
        style={{ left: "66%" }}
      />
    </div>
  );
}

export const ProcessRunnerNode = memo(ProcessRunnerNodeComponent);
