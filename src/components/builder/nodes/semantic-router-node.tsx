"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface RouteConfig {
  id: string;
  label: string;
}

function SemanticRouterNodeComponent({ data, selected }: NodeProps) {
  const routes = Array.isArray(data.routes)
    ? (data.routes as RouteConfig[])
    : [];
  const fallbackRoute = (data.fallbackRoute as string) || "fallback";

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-lg border bg-card p-3 shadow-sm transition-shadow",
        selected && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} />

      <div className="flex items-center gap-2 mb-2">
        <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          <Compass className="size-4" />
        </div>
        <span className="text-sm font-medium">
          {String(data.label || "Semantic Router")}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          Routes: <span className="text-foreground">{routes.length}</span>
          {" + "}
          <span className="text-foreground">{fallbackRoute}</span>
        </p>
        {routes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {routes.map((r) => (
              <span
                key={r.id}
                className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              >
                {r.label || r.id}
              </span>
            ))}
          </div>
        )}
      </div>

      {routes.map((r, i) => (
        <Handle
          key={r.id}
          type="source"
          position={Position.Bottom}
          id={r.id}
          style={{ left: `${((i + 1) / (routes.length + 2)) * 100}%` }}
        />
      ))}
      <Handle
        type="source"
        position={Position.Bottom}
        id={fallbackRoute}
        style={{ left: `${((routes.length + 1) / (routes.length + 2)) * 100}%` }}
      />
    </div>
  );
}

export const SemanticRouterNode = memo(SemanticRouterNodeComponent);
