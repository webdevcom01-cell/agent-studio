"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Route } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwitchCase {
  value: string;
  label?: string;
}

export function SwitchNode({ data, selected }: NodeProps) {
  const cases = (data.cases as SwitchCase[]) || [];
  const variable = String(data.variable || "");

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary"
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-fuchsia-700 dark:bg-muted/20 dark:text-muted-foreground">
          <Route className="size-4" />
        </div>
        <span className="text-sm font-medium">{String(data.label || "Switch")}</span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {variable ? (
          <p className="truncate">
            Variable: <span className="font-mono text-foreground">{variable}</span>
          </p>
        ) : (
          <p className="italic">No variable set</p>
        )}
        <p>
          Cases: <span className="text-foreground">{cases.length}</span>
          {" + default"}
        </p>
      </div>

      {/* One output handle per case + default */}
      {cases.map((_c, i) => (
        <Handle
          key={`case_${i}`}
          type="source"
          position={Position.Bottom}
          id={`case_${i}`}
          style={{ left: `${((i + 1) / (cases.length + 2)) * 100}%` }}
        />
      ))}
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        style={{ left: `${((cases.length + 1) / (cases.length + 2)) * 100}%` }}
      />
    </div>
  );
}
