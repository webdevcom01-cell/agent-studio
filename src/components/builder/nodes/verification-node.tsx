"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";

function VerificationNodeComponent({ data, selected }: NodeProps) {
  const checks = Array.isArray(data.checks) ? (data.checks as Record<string, unknown>[]) : [];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <CircleCheckBig className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Verification")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Checks: <span className="text-foreground">{checks.length}</span></p>
        {checks.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {checks.slice(0, 3).map((c, i) => (
              <span
                key={i}
                className="rounded bg-green-900/20 px-1 py-0.5 text-[10px] text-green-400"
              >
                {String(c.label || c.type || "check")}
              </span>
            ))}
            {checks.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{checks.length - 3}</span>
            )}
          </div>
        )}
        <p className="text-[10px]">
          <span className="text-green-500">Passed</span>{" / "}
          <span className="text-red-400">Failed</span>
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

export const VerificationNode = memo(VerificationNodeComponent);
