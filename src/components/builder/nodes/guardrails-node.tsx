"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function GuardrailsNodeComponent({ data, selected }: NodeProps) {
  const checks = Array.isArray(data.checks) ? (data.checks as string[]) : [];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <ShieldCheck className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Guardrails")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Checks: <span className="text-foreground">{checks.length}</span></p>
        <p className="text-[10px]">
          <span className="text-green-500">Pass</span>{" / "}
          <span className="text-red-400">Fail</span>
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="pass"
        style={{ left: "33%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="fail"
        style={{ left: "66%" }}
      />
    </div>
  );
}

export const GuardrailsNode = memo(GuardrailsNodeComponent);
