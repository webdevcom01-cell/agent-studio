"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Braces } from "lucide-react";
import { cn } from "@/lib/utils";

function AstTransformNodeComponent({ data, selected }: NodeProps) {
  const pattern = (data.pattern as string) ?? "";
  const language = (data.language as string) ?? "typescript";
  const hasReplacement = Boolean(data.replacement);

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted/20 text-foreground dark:bg-muted/20 dark:text-muted-foreground">
          <Braces className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "AST Transform")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="rounded bg-muted/20 px-1 py-0.5 text-[10px] text-muted-foreground">
            {language}
          </span>
          {hasReplacement && (
            <span className="rounded bg-muted/20 px-1 py-0.5 text-[10px] text-muted-foreground">
              refactor
            </span>
          )}
        </div>
        {pattern && (
          <p className="truncate font-mono text-[10px]">
            {pattern.length > 30 ? pattern.slice(0, 27) + "…" : pattern}
          </p>
        )}
        {!pattern && (
          <p className="italic text-[10px]">No pattern set</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const AstTransformNode = memo(AstTransformNodeComponent);
