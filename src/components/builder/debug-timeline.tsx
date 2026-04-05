"use client";

import { useMemo, useRef, useEffect } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  SkipForward,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NodeDebugState, DebugFlowSummary } from "@/lib/runtime/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineRow {
  kind: "node" | "tool";
  // Node rows
  nodeId?: string;
  nodeType?: string;
  nodeName?: string;
  status?: NodeDebugState["aggregateStatus"];
  // Tool rows (nested under a node)
  toolName?: string;
  toolStatus?: "success" | "error";
  // Timing (relative ms from flow start)
  startMs: number;
  durationMs: number;
  // Interaction
  selectable: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function nodeColor(
  status: NodeDebugState["aggregateStatus"],
  nodeType: string
): { bar: string; text: string } {
  if (status === "error") return { bar: "bg-destructive", text: "text-destructive" };
  if (status === "running")
    return { bar: "bg-muted-foreground animate-pulse", text: "text-muted-foreground" };
  if (status === "skipped")
    return { bar: "bg-muted-foreground/30", text: "text-muted-foreground/50" };
  if (status === "waiting")
    return { bar: "bg-muted-foreground/60", text: "text-muted-foreground" };
  // success — colour by node type
  if (
    nodeType === "ai_response" ||
    nodeType === "ai_classify" ||
    nodeType === "ai_extract" ||
    nodeType === "ai_summarize"
  )
    return { bar: "bg-foreground/40", text: "text-foreground/60" };
  if (nodeType === "mcp_tool" || nodeType === "web_fetch" || nodeType === "browser_action")
    return { bar: "bg-foreground/30", text: "text-foreground/50" };
  if (nodeType === "kb_search")
    return { bar: "bg-foreground/35", text: "text-foreground/55" };
  if (nodeType === "call_agent")
    return { bar: "bg-foreground/25", text: "text-foreground/45" };
  return { bar: "bg-foreground/20", text: "text-foreground/60" };
}

function statusIcon(status: NodeDebugState["aggregateStatus"]) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="size-3 text-foreground/60 shrink-0" />;
    case "error":
      return <XCircle className="size-3 text-destructive shrink-0" />;
    case "running":
      return <Loader2 className="size-3 text-muted-foreground animate-spin shrink-0" />;
    case "skipped":
      return <SkipForward className="size-3 text-muted-foreground/50 shrink-0" />;
    case "waiting":
      return <AlertTriangle className="size-3 text-muted-foreground shrink-0" />;
    default:
      return <Clock className="size-3 text-muted-foreground/40 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Build timeline rows from debug state
// ---------------------------------------------------------------------------

function buildTimelineRows(
  nodeStates: Map<string, NodeDebugState>,
  executionPath: string[]
): { rows: TimelineRow[]; flowStartMs: number; totalDurationMs: number } {
  if (nodeStates.size === 0) {
    return { rows: [], flowStartMs: 0, totalDurationMs: 1 };
  }

  // Use executionPath if available, otherwise fall back to insertion order
  const orderedIds =
    executionPath.length > 0
      ? executionPath.filter((id) => nodeStates.has(id))
      : Array.from(nodeStates.keys());

  // Find flow start = minimum timestamp across all executions
  let flowStartMs = Infinity;
  for (const id of orderedIds) {
    const ns = nodeStates.get(id)!;
    for (const exec of ns.executions) {
      if (exec.timestamp < flowStartMs) flowStartMs = exec.timestamp;
    }
  }
  if (flowStartMs === Infinity) flowStartMs = 0;

  // Find flow end = max of (timestamp + durationMs)
  let flowEndMs = 0;
  for (const id of orderedIds) {
    const ns = nodeStates.get(id)!;
    for (const exec of ns.executions) {
      const end = exec.timestamp + exec.durationMs;
      if (end > flowEndMs) flowEndMs = end;
    }
  }

  const totalDurationMs = Math.max(flowEndMs - flowStartMs, 1);

  const rows: TimelineRow[] = [];

  for (const nodeId of orderedIds) {
    const ns = nodeStates.get(nodeId)!;
    // For repeated nodes (loops), show ALL iterations
    for (const exec of ns.executions) {
      const startMs = exec.timestamp - flowStartMs;

      rows.push({
        kind: "node",
        nodeId,
        nodeType: ns.nodeType,
        nodeName: ns.nodeName || ns.nodeType,
        status: exec.status === "success" ? "success" : exec.status === "error" ? "error" : "skipped",
        startMs,
        durationMs: exec.durationMs,
        selectable: true,
      });

      // Nested tool call rows
      if (exec.toolCalls && exec.toolCalls.length > 0) {
        // Tool calls are shown relative to the parent node's start
        // We don't have individual tool start times, so lay them out sequentially
        let toolOffset = 0;
        for (const call of exec.toolCalls) {
          rows.push({
            kind: "tool",
            toolName: call.toolName,
            toolStatus: call.status,
            startMs: startMs + toolOffset,
            durationMs: call.durationMs,
            selectable: false,
          });
          toolOffset += call.durationMs;
        }
      }
    }
  }

  return { rows, flowStartMs, totalDurationMs };
}

// ---------------------------------------------------------------------------
// Axis tick marks
// ---------------------------------------------------------------------------

function AxisTicks({ totalMs }: { totalMs: number }) {
  const ticks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => ({
      pct: (i / count) * 100,
      label: formatDuration((totalMs * i) / count),
    }));
  }, [totalMs]);

  return (
    <div className="relative h-5 mt-1 border-t border-border/40">
      {ticks.map((t) => (
        <div
          key={t.pct}
          className="absolute flex flex-col items-center"
          style={{ left: `calc(${t.pct}% - 0px)` }}
        >
          <div className="w-px h-1.5 bg-border/40" />
          <span className="text-[9px] text-muted-foreground/50 mt-0.5 whitespace-nowrap">
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single timeline row
// ---------------------------------------------------------------------------

const LABEL_WIDTH = 200; // px — fixed left column for labels

interface RowProps {
  row: TimelineRow;
  totalDurationMs: number;
  isSelected: boolean;
  onClick?: () => void;
}

function TimelineRowItem({ row, totalDurationMs, isSelected, onClick }: RowProps) {
  const isNode = row.kind === "node";
  const isTool = row.kind === "tool";

  const offsetPct = (row.startMs / totalDurationMs) * 100;
  const widthPct = Math.max((row.durationMs / totalDurationMs) * 100, 0.3);

  const colors = isNode
    ? nodeColor(row.status!, row.nodeType!)
    : { bar: "bg-muted-foreground/50", text: "text-muted-foreground" };

  return (
    <div
      className={cn(
        "flex items-center h-7 group transition-colors",
        row.selectable && "cursor-pointer",
        row.selectable && !isSelected && "hover:bg-muted/30",
        isSelected && "bg-muted/30"
      )}
      onClick={row.selectable ? onClick : undefined}
    >
      {/* Label column */}
      <div
        className="shrink-0 flex items-center gap-1.5 pr-2 overflow-hidden"
        style={{ width: LABEL_WIDTH }}
      >
        {isTool && (
          <span className="w-3 shrink-0" aria-hidden="true" />
        )}
        {isTool && (
          <span className="shrink-0 text-muted-foreground/40 text-[10px]">└─</span>
        )}
        {isNode && (
          <span className="shrink-0">{statusIcon(row.status!)}</span>
        )}
        {isTool && (
          <Wrench className="size-3 text-muted-foreground/60 shrink-0" />
        )}
        <span
          className={cn(
            "truncate text-[11px] font-mono leading-none",
            isTool ? "text-muted-foreground/70" : colors.text
          )}
          title={isNode ? row.nodeName : row.toolName}
        >
          {isNode ? row.nodeName : row.toolName}
        </span>
      </div>

      {/* Bar area */}
      <div className="flex-1 relative h-full flex items-center">
        {/* Horizontal grid line */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-border/10" />

        {/* The bar itself */}
        <div
          className="absolute h-3.5 rounded-sm"
          style={{
            left: `${Math.min(offsetPct, 99)}%`,
            width: `${Math.min(widthPct, 100 - Math.min(offsetPct, 99))}%`,
          }}
        >
          <div className={cn("h-full w-full rounded-sm", colors.bar)} />
        </div>

        {/* Duration label — shown to the right of the bar when hovered or always */}
        <span
          className="absolute text-[9px] text-muted-foreground/60 whitespace-nowrap pointer-events-none"
          style={{
            left: `calc(${Math.min(offsetPct + widthPct, 99)}% + 4px)`,
          }}
        >
          {formatDuration(row.durationMs)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DebugTimeline component
// ---------------------------------------------------------------------------

export interface DebugTimelineProps {
  nodeStates: Map<string, NodeDebugState>;
  flowSummary: DebugFlowSummary | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

export function DebugTimeline({
  nodeStates,
  flowSummary,
  selectedNodeId,
  onSelectNode,
  onClose,
}: DebugTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const executionPath = flowSummary?.executionPath ?? [];
  const { rows, totalDurationMs } = useMemo(
    () => buildTimelineRows(nodeStates, executionPath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeStates, flowSummary]
  );

  // Scroll selected node into view
  useEffect(() => {
    if (!selectedNodeId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-node-id="${selectedNodeId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedNodeId]);

  const displayTotal = flowSummary?.totalDurationMs ?? totalDurationMs;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10 flex flex-col border-t bg-background shadow-lg"
      style={{ height: 220 }}
      aria-label="Execution Timeline"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/20 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold">Execution Timeline</span>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {rows.filter((r) => r.kind === "node").length} nodes
              {flowSummary && flowSummary.nodesFailed > 0 && (
                <span className="text-destructive ml-1.5">
                  · {flowSummary.nodesFailed} failed
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {displayTotal > 0 && (
            <span className="text-xs text-muted-foreground">
              Total: <span className="font-mono text-foreground">{formatDuration(displayTotal)}</span>
            </span>
          )}
          {flowSummary?.otelTraceId && (
            <span className="text-[10px] text-muted-foreground/50 font-mono hidden sm:inline">
              trace: {flowSummary.otelTraceId.slice(0, 12)}…
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Close timeline"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Rows + Axis */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          {rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/50">
              Run a debug session to see the execution timeline
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div className="flex items-center border-b border-border/30 shrink-0">
                <div
                  className="shrink-0 px-3 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide"
                  style={{ width: LABEL_WIDTH }}
                >
                  Node
                </div>
                <div className="flex-1 px-1 text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide">
                  Duration
                </div>
              </div>

              {/* Scrollable row list */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    data-node-id={row.nodeId}
                    className="px-3"
                  >
                    <TimelineRowItem
                      row={row}
                      totalDurationMs={Math.max(displayTotal, totalDurationMs)}
                      isSelected={!!row.nodeId && row.nodeId === selectedNodeId}
                      onClick={
                        row.selectable && row.nodeId
                          ? () => onSelectNode(row.nodeId!)
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>

              {/* Time axis */}
              <div className="px-3 shrink-0">
                <div style={{ marginLeft: LABEL_WIDTH - 12 }}>
                  <AxisTicks totalMs={Math.max(displayTotal, totalDurationMs)} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
