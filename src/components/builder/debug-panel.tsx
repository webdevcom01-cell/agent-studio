"use client";

import { useState, useCallback } from "react";
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Wrench,
  Layers,
  ArrowRight,
  AlertTriangle,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NodeDebugState, NodeExecution, ToolCallTrace } from "@/lib/runtime/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusIcon(status: NodeDebugState["aggregateStatus"], size = "size-4") {
  switch (status) {
    case "success":
      return <CheckCircle2 className={cn(size, "text-emerald-400")} />;
    case "error":
      return <XCircle className={cn(size, "text-red-400")} />;
    case "running":
      return <Loader2 className={cn(size, "text-violet-400 animate-spin")} />;
    case "skipped":
      return <SkipForward className={cn(size, "text-muted-foreground")} />;
    case "waiting":
      return <AlertTriangle className={cn(size, "text-amber-400")} />;
    default:
      return <Clock className={cn(size, "text-muted-foreground")} />;
  }
}

function statusLabel(status: NodeDebugState["aggregateStatus"]): string {
  const map: Record<string, string> = {
    success: "Success",
    error: "Failed",
    running: "Running",
    skipped: "Skipped",
    waiting: "Waiting",
    pending: "Pending",
  };
  return map[status] ?? status;
}

function statusColor(status: NodeDebugState["aggregateStatus"]): string {
  const map: Record<string, string> = {
    success: "text-emerald-400",
    error: "text-red-400",
    running: "text-violet-400",
    skipped: "text-muted-foreground",
    waiting: "text-amber-400",
    pending: "text-muted-foreground",
  };
  return map[status] ?? "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// JSON viewer with copy button
// ---------------------------------------------------------------------------
interface JsonBlockProps {
  value: unknown;
  label?: string;
}

function JsonBlock({ value, label }: JsonBlockProps) {
  const [copied, setCopied] = useState(false);

  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  if (!value && value !== 0 && value !== false) return null;

  return (
    <div className="group relative">
      {label && <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">{label}</div>}
      <div className="relative rounded-md border border-border/50 bg-muted/30 overflow-hidden">
        <pre className="overflow-x-auto p-2.5 text-[11px] leading-relaxed text-foreground/80 max-h-40 font-mono">
          {text}
        </pre>
        <button
          onClick={copy}
          aria-label="Copy"
          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call row
// ---------------------------------------------------------------------------
function ToolCallRow({ call }: { call: ToolCallTrace }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 overflow-hidden text-xs">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Wrench className="size-3 text-amber-400 shrink-0" />
        <span className="flex-1 font-mono text-foreground/80 truncate">{call.toolName}</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            call.status === "success" ? "text-emerald-400" : "text-red-400"
          )}
        >
          {call.status === "success" ? "✓" : "✗"}
        </span>
        <span className="text-muted-foreground text-[10px]">
          {formatDuration(call.durationMs)}
        </span>
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-1.5 border-t border-border/40">
          {call.input !== undefined && <JsonBlock value={call.input} label="Input" />}
          {call.result !== undefined && <JsonBlock value={call.result} label="Result" />}
          {call.error && (
            <div className="rounded bg-red-950/30 border border-red-900/30 px-2 py-1.5 text-[11px] text-red-300">
              {call.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iteration tab — shows execution details for a single loop iteration
// ---------------------------------------------------------------------------
interface IterationViewProps {
  execution: NodeExecution;
}

function IterationView({ execution }: IterationViewProps) {
  return (
    <div className="space-y-3">
      {/* Status + timing header */}
      <div className="flex items-center gap-3 text-xs">
        <span
          className={cn(
            "flex items-center gap-1 font-medium",
            execution.status === "success" && "text-emerald-400",
            execution.status === "error" && "text-red-400",
            execution.status === "skipped" && "text-muted-foreground"
          )}
        >
          {execution.status === "success" && <CheckCircle2 className="size-3" />}
          {execution.status === "error" && <XCircle className="size-3" />}
          {execution.status === "skipped" && <SkipForward className="size-3" />}
          {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
        </span>
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="size-3" />
          {formatDuration(execution.durationMs)}
        </span>
      </div>

      {/* Error message */}
      {execution.error && (
        <div className="rounded-md border border-red-900/40 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          <div className="font-medium mb-1 flex items-center gap-1.5">
            <XCircle className="size-3" /> Error
          </div>
          <div className="font-mono leading-relaxed">{execution.error}</div>
        </div>
      )}

      {/* Output */}
      {execution.output !== undefined && execution.output !== null && (
        <JsonBlock value={execution.output} label="Output" />
      )}

      {/* Variables snapshot */}
      {execution.variables && Object.keys(execution.variables).length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">Variables</div>
          <div className="rounded-md border border-border/50 bg-muted/20 divide-y divide-border/30 overflow-hidden">
            {Object.entries(execution.variables).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
                <span className="font-mono text-violet-300 shrink-0">{k}</span>
                <ArrowRight className="size-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                <span className="font-mono text-foreground/70 break-all min-w-0">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tool calls */}
      {execution.toolCalls && execution.toolCalls.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Tool Calls ({execution.toolCalls.length})
          </div>
          {execution.toolCalls.map((call, i) => (
            <ToolCallRow key={i} call={call} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Debug Panel
// ---------------------------------------------------------------------------
interface DebugPanelProps {
  nodeState: NodeDebugState;
  nodeName?: string;
  onClose: () => void;
}

export function DebugPanel({ nodeState, nodeName, onClose }: DebugPanelProps) {
  const [selectedIteration, setSelectedIteration] = useState(
    nodeState.executions.length > 0 ? nodeState.executions.length - 1 : 0
  );
  const [copied, setCopied] = useState(false);

  const hasMultipleIterations = nodeState.executions.length > 1;
  const currentExecution = nodeState.executions[selectedIteration];

  // Copy full trace as JSON
  const copyTrace = useCallback(() => {
    const trace = JSON.stringify(nodeState, null, 2);
    navigator.clipboard.writeText(trace).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [nodeState]);

  const displayName = nodeName ?? nodeState.nodeName ?? nodeState.nodeId;

  return (
    <div className="flex w-80 flex-col border-l bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b bg-muted/20 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {statusIcon(nodeState.aggregateStatus, "size-3.5")}
            <span className={cn("text-xs font-semibold", statusColor(nodeState.aggregateStatus))}>
              {statusLabel(nodeState.aggregateStatus)}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground font-mono">
              {nodeState.nodeType}
            </span>
          </div>
          <div className="text-sm font-medium truncate">{displayName}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Close debug panel"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-3 px-4 py-2 border-b text-xs text-muted-foreground bg-muted/10">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {formatDuration(nodeState.totalDurationMs)}
        </span>
        <span className="flex items-center gap-1">
          <Layers className="size-3" />
          {nodeState.executions.length} run{nodeState.executions.length !== 1 ? "s" : ""}
        </span>
        {nodeState.executions.some((e) => e.toolCalls && e.toolCalls.length > 0) && (
          <span className="flex items-center gap-1">
            <Wrench className="size-3" />
            {nodeState.executions.reduce((acc, e) => acc + (e.toolCalls?.length ?? 0), 0)} tool calls
          </span>
        )}
      </div>

      {/* Iteration tabs (only for loop nodes that ran multiple times) */}
      {hasMultipleIterations && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto">
          {nodeState.executions.map((exec, i) => (
            <button
              key={i}
              onClick={() => setSelectedIteration(i)}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium shrink-0 transition-colors",
                selectedIteration === i
                  ? "bg-violet-600 text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {exec.status === "success" ? (
                <CheckCircle2 className="size-2.5 text-emerald-400" />
              ) : exec.status === "error" ? (
                <XCircle className="size-2.5 text-red-400" />
              ) : null}
              #{i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Content area — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {nodeState.executions.length === 0 ? (
          // Node started but not yet finished
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-violet-400" />
            Executing…
          </div>
        ) : currentExecution ? (
          <div className="px-4 py-3">
            <IterationView execution={currentExecution} />
          </div>
        ) : null}
      </div>

      {/* Footer actions */}
      <div className="border-t px-4 py-2.5 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs h-7"
          onClick={copyTrace}
        >
          {copied ? (
            <>
              <Check className="mr-1.5 size-3" /> Copied!
            </>
          ) : (
            <>
              <Copy className="mr-1.5 size-3" /> Copy trace
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
