"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

const OP_LABELS: Record<string, string> = {
  get: "Get",
  set: "Set",
  delete: "Delete",
};

function CacheNodeComponent({ data, selected }: NodeProps) {
  const operation = (data.operation as string) || "get";
  const cacheKey = (data.cacheKey as string) || "";
  const isGet = operation === "get";

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
          <Database className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Cache")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="truncate">
          <span className="font-semibold">{OP_LABELS[operation] ?? operation}</span>{" "}
          {cacheKey ? (
            <span className="font-mono text-foreground">{cacheKey}</span>
          ) : (
            <span className="italic">no key</span>
          )}
        </p>
        {isGet && (
          <p className="text-[10px]">
            <span className="text-foreground/60">Hit</span>{" / "}
            <span className="text-destructive">Miss</span>
          </p>
        )}
      </div>

      {isGet ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="hit"
            style={{ left: "33%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="miss"
            style={{ left: "66%" }}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} />
      )}
    </div>
  );
}

export const CacheNode = memo(CacheNodeComponent);
