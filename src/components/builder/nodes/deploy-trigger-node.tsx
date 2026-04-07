"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

function DeployTriggerNodeComponent({ data, selected }: NodeProps) {
  const target = (data.target as string) || "staging";

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
          <Rocket className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Deploy")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Target:{" "}
          <span
            className={cn(
              "font-mono text-[10px]",
              target === "production" ? "text-orange-400" : "text-blue-400",
            )}
          >
            {target}
          </span>
        </p>
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

export const DeployTriggerNode = memo(DeployTriggerNodeComponent);
