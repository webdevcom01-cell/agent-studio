"use client";

import { createContext, useContext, type ComponentType } from "react";
import { Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeDebugState } from "./use-debug-session";

// ---------------------------------------------------------------------------
// Context — holds the live nodeStates map from useDebugSession
// ---------------------------------------------------------------------------
export const DebugContext = createContext<Map<string, NodeDebugState>>(new Map());

// ---------------------------------------------------------------------------
// Helper — format a duration value nicely
// ---------------------------------------------------------------------------
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// DebugNodeBadge — rendered on top-right corner of a node when in debug mode
// ---------------------------------------------------------------------------
interface DebugNodeBadgeProps {
  nodeState: NodeDebugState;
}

function DebugNodeBadge({ nodeState }: DebugNodeBadgeProps) {
  const { aggregateStatus, totalDurationMs, executions } = nodeState;
  const lastExec = executions[executions.length - 1];
  const toolCount = lastExec?.toolCalls?.length ?? 0;

  return (
    <div
      className="absolute -top-2.5 -right-2 z-50 flex items-center gap-1 pointer-events-none"
      aria-hidden="true"
    >
      {/* Tool calls pill */}
      {toolCount > 0 && (
        <span className="flex items-center gap-0.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
          <Wrench className="size-2.5" />
          {toolCount}
        </span>
      )}

      {/* Status + duration pill */}
      <span
        className={cn(
          "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm",
          aggregateStatus === "running" && "bg-violet-500/90",
          aggregateStatus === "success" && "bg-emerald-500/90",
          aggregateStatus === "error" && "bg-red-500/90",
          aggregateStatus === "skipped" && "bg-muted-foreground/70",
          aggregateStatus === "pending" && "bg-slate-600/80"
        )}
      >
        {aggregateStatus === "running" && (
          <Loader2 className="size-2.5 animate-spin" />
        )}
        {aggregateStatus === "success" && (
          <CheckCircle2 className="size-2.5" />
        )}
        {aggregateStatus === "error" && (
          <XCircle className="size-2.5" />
        )}

        {totalDurationMs > 0 && formatDuration(totalDurationMs)}
        {executions.length > 1 && (
          <span className="opacity-75">×{executions.length}</span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ring glow that replaces/augments the node's border in debug mode
// ---------------------------------------------------------------------------
function DebugRing({ status }: { status: NodeDebugState["aggregateStatus"] }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-lg ring-2 ring-offset-0",
        status === "running" && "ring-violet-500 animate-pulse",
        status === "success" && "ring-emerald-500",
        status === "error" && "ring-red-500",
        status === "skipped" && "ring-muted-foreground/30",
        status === "pending" && "ring-transparent"
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// withDebugOverlay — HOC that wraps a node component with debug UI
//
// Usage:
//   const DebugAIResponseNode = withDebugOverlay(AIResponseNode);
//
// The wrapped component renders identically to the original, with an
// absolutely-positioned badge and ring overlay added on top.
// ---------------------------------------------------------------------------
export function withDebugOverlay<T extends { id: string }>(
  WrappedComponent: ComponentType<T>
): ComponentType<T> {
  function DebugWrappedNode(props: T) {
    const nodeStates = useContext(DebugContext);
    const nodeState = nodeStates.get(props.id);

    if (!nodeState) {
      // No debug state for this node — render plain
      return <WrappedComponent {...props} />;
    }

    return (
      <div className="relative">
        <WrappedComponent {...props} />
        <DebugRing status={nodeState.aggregateStatus} />
        <DebugNodeBadge nodeState={nodeState} />
      </div>
    );
  }

  const name =
    (WrappedComponent as { displayName?: string }).displayName ??
    WrappedComponent.name ??
    "Node";
  DebugWrappedNode.displayName = `DebugOverlay(${name})`;

  return DebugWrappedNode;
}

// ---------------------------------------------------------------------------
// buildDebugNodeTypes — wraps every entry in a nodeTypes map with the HOC.
// Call once outside the component (or memoize) to keep references stable.
// ---------------------------------------------------------------------------
export function buildDebugNodeTypes<
  T extends Record<string, ComponentType<{ id: string }>>
>(nodeTypes: T): T {
  const result = {} as T;
  for (const key in nodeTypes) {
    // Cast needed because TS can't narrow ComponentType<{id:string}> to ComponentType<T[key] props>
    (result as Record<string, ComponentType<{ id: string }>>)[key] = withDebugOverlay(
      nodeTypes[key]
    );
  }
  return result;
}
