"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const CHECK_LABELS: Record<string, string> = {
  forbidden_patterns: "patterns",
  typecheck: "tsc",
  lint: "eslint",
};

function SandboxVerifyNodeComponent({ data, selected }: NodeProps) {
  const checks = Array.isArray(data.checks) ? (data.checks as string[]) : ["forbidden_patterns"];
  const inputVar = (data.inputVariable as string) || "generatedCode";

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
          <ShieldCheck className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Sandbox Verify")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Input:{" "}
          <span className="font-mono text-foreground/60">{"{{" + inputVar + "}}"}</span>
        </p>
        {checks.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {checks.map((c) => (
              <span
                key={c}
                className="rounded bg-muted/20 px-1 py-0.5 text-[10px] text-foreground/60"
              >
                {CHECK_LABELS[c] ?? c}
              </span>
            ))}
          </div>
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

export const SandboxVerifyNode = memo(SandboxVerifyNodeComponent);
